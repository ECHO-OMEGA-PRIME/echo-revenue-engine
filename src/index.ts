/**
 * Echo Revenue Engine — Autonomous Money-Making Pipeline
 *
 * Cloudflare Worker that autonomously:
 * 1. Generates expert PDF products from 619K+ engine doctrines
 * 2. Creates cover art via Grok Imagine (xAI Aurora)
 * 3. Lists on Gumroad + Shopify
 * 4. Promotes via 8-bot social media fleet
 * 5. Tracks revenue and optimizes
 *
 * Cron-driven: runs while Commander sleeps.
 */

import type { Env, GeneratedProduct, RevenueStats } from './types';
import { log } from './types';
import { PRODUCT_CATALOG, getProductById, selectNextProduct, getCategories } from './product-catalog';
import { generatePdf } from './pdf-generator';
import { generateCoverArt, debugCoverArt } from './cover-art';
import { listOnGumroad, getGumroadSales } from './gumroad';
import { listOnShopify, getShopifySales } from './shopify';
import { promoteProduct } from './promoter';

// ─── D1 Schema ───────────────────────────────────────────────────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  definition_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  pdf_r2_key TEXT,
  cover_r2_key TEXT,
  pdf_size_bytes INTEGER DEFAULT 0,
  page_count INTEGER DEFAULT 0,
  chapter_count INTEGER DEFAULT 0,
  word_count INTEGER DEFAULT 0,
  gumroad_product_id TEXT,
  gumroad_url TEXT,
  shopify_product_id TEXT,
  shopify_url TEXT,
  ept_url TEXT,
  status TEXT DEFAULT 'pending',
  sales_count INTEGER DEFAULT 0,
  revenue_usd REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  listed_at TEXT,
  promoted_at TEXT
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger_type TEXT NOT NULL,
  definition_id TEXT,
  status TEXT DEFAULT 'running',
  steps_completed TEXT DEFAULT '[]',
  error TEXT,
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS promotion_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  platform TEXT NOT NULL,
  success INTEGER DEFAULT 0,
  post_id TEXT,
  error TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS revenue_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gumroad_sales INTEGER DEFAULT 0,
  gumroad_revenue REAL DEFAULT 0,
  shopify_sales INTEGER DEFAULT 0,
  shopify_revenue REAL DEFAULT 0,
  total_sales INTEGER DEFAULT 0,
  total_revenue REAL DEFAULT 0,
  snapshot_date TEXT DEFAULT (date('now')),
  created_at TEXT DEFAULT (datetime('now'))
);
`;

// ─── Helpers ─────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function cors(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Echo-API-Key',
    },
  });
}

function requireAuth(request: Request, env: Env): boolean {
  const key = request.headers.get('X-Echo-API-Key');
  return key === env.ECHO_API_KEY;
}

async function initSchema(env: Env): Promise<void> {
  const statements = SCHEMA_SQL.split(';').filter(s => s.trim());
  for (const sql of statements) {
    try {
      await env.DB.prepare(sql).run();
    } catch {
      // Table already exists — fine
    }
  }
}

// ─── Full Pipeline ───────────────────────────────────────────────────

async function runFullPipeline(
  definitionId: string,
  triggerType: string,
  env: Env,
): Promise<{ success: boolean; product?: GeneratedProduct; error?: string }> {
  const product = getProductById(definitionId);
  if (!product) return { success: false, error: `Product definition not found: ${definitionId}` };

  // Check if already generated
  const existing = await env.DB.prepare('SELECT * FROM products WHERE definition_id = ?').bind(definitionId).first();
  if (existing && existing.status === 'promoted') {
    log('info', 'Product already fully processed', { definitionId });
    return { success: true, product: existing as unknown as GeneratedProduct };
  }

  // Track pipeline run
  const run = await env.DB.prepare(
    'INSERT INTO pipeline_runs (trigger_type, definition_id) VALUES (?, ?)',
  ).bind(triggerType, definitionId).run();
  const runId = run.meta.last_row_id;
  const steps: string[] = [];

  try {
    // ── Step 1: Generate PDF ─────────────────────────────────────
    log('info', 'PIPELINE Step 1: Generating PDF', { definitionId });
    const pdfResult = await generatePdf(product, env);
    steps.push('pdf_generated');

    // ── Step 2: Upload PDF to R2 ─────────────────────────────────
    const pdfR2Key = `products/${definitionId}/${definitionId}.pdf`;
    const pdfBytesToUpload = pdfResult.pdfBytes;
    log('info', 'PIPELINE Step 2a: About to upload PDF to R2', {
      pdfR2Key,
      bytesLength: pdfBytesToUpload.length,
      bytesType: typeof pdfBytesToUpload,
      isUint8Array: pdfBytesToUpload instanceof Uint8Array,
      first4Bytes: Array.from(pdfBytesToUpload.slice(0, 4)).map(b => b.toString(16)).join(' '),
    });
    await env.PRODUCTS.put(pdfR2Key, pdfBytesToUpload, {
      httpMetadata: { contentType: 'application/pdf' },
      customMetadata: { title: product.title, pages: String(pdfResult.pageCount) },
    });
    steps.push('pdf_uploaded');

    // ── Verify R2 write by reading back ──
    const verifyObj = await env.PRODUCTS.head(pdfR2Key);
    const verifySize = verifyObj?.size ?? -1;
    const sizeMatch = verifySize === pdfBytesToUpload.length;
    log(sizeMatch ? 'info' : 'error', 'PIPELINE Step 2b: R2 write verification', {
      pdfR2Key,
      uploadedBytes: pdfBytesToUpload.length,
      r2HeadSize: verifySize,
      sizeMatch,
      r2Etag: verifyObj?.etag,
      r2Uploaded: verifyObj?.uploaded?.toISOString(),
    });

    // ── Step 3: Generate Cover Art ───────────────────────────────
    let coverR2Key = `products/${definitionId}/${definitionId}-cover.png`;
    try {
      const coverResult = await generateCoverArt(product, env);
      await env.PRODUCTS.put(coverR2Key, coverResult.imageBytes, {
        httpMetadata: { contentType: coverResult.contentType },
        customMetadata: { prompt: coverResult.prompt.slice(0, 200) },
      });
      steps.push('cover_generated');
      log('info', 'PIPELINE Step 3: Cover art uploaded', { coverR2Key, sizeBytes: coverResult.imageBytes.length });
    } catch (err) {
      log('warn', 'Cover art generation failed, continuing without cover', { error: String(err) });
      coverR2Key = '';
      steps.push('cover_skipped');
    }

    // ── Step 4: Insert/Update product record ─────────────────────
    if (existing) {
      await env.DB.prepare(`
        UPDATE products SET pdf_r2_key=?, cover_r2_key=?, pdf_size_bytes=?, page_count=?, chapter_count=?, word_count=?, status='generated'
        WHERE definition_id=?
      `).bind(pdfR2Key, coverR2Key, pdfResult.pdfBytes.length, pdfResult.pageCount, pdfResult.chapterCount, pdfResult.wordCount, definitionId).run();
    } else {
      await env.DB.prepare(`
        INSERT INTO products (definition_id, title, pdf_r2_key, cover_r2_key, pdf_size_bytes, page_count, chapter_count, word_count, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'generated')
      `).bind(definitionId, product.title, pdfR2Key, coverR2Key, pdfResult.pdfBytes.length, pdfResult.pageCount, pdfResult.chapterCount, pdfResult.wordCount).run();
    }
    steps.push('db_recorded');

    // ── Step 5: List on Gumroad ──────────────────────────────────
    let gumroadUrl: string | null = null;
    let gumroadProductId: string | null = null;
    try {
      if (env.GUMROAD_ACCESS_TOKEN) {
        const gumResult = await listOnGumroad(product, pdfR2Key, coverR2Key, env);
        gumroadUrl = gumResult.url;
        gumroadProductId = gumResult.productId;
        await env.DB.prepare('UPDATE products SET gumroad_product_id=?, gumroad_url=? WHERE definition_id=?')
          .bind(gumroadProductId, gumroadUrl, definitionId).run();
        steps.push('gumroad_listed');
        log('info', 'PIPELINE Step 5: Listed on Gumroad', { gumroadUrl });
      } else {
        steps.push('gumroad_skipped');
        log('info', 'PIPELINE Step 5: Gumroad skipped (no access token)');
      }
    } catch (err) {
      log('warn', 'Gumroad listing failed', { error: String(err) });
      steps.push('gumroad_failed');
    }

    // ── Step 6: List on Shopify ──────────────────────────────────
    let shopifyUrl: string | null = null;
    let shopifyProductId: string | null = null;
    try {
      if (env.SHOPIFY_ADMIN_TOKEN) {
        const shopResult = await listOnShopify(product, pdfR2Key, coverR2Key, gumroadUrl, env);
        shopifyUrl = shopResult.url;
        shopifyProductId = String(shopResult.productId);
        await env.DB.prepare('UPDATE products SET shopify_product_id=?, shopify_url=? WHERE definition_id=?')
          .bind(shopifyProductId, shopifyUrl, definitionId).run();
        steps.push('shopify_listed');
        log('info', 'PIPELINE Step 6: Listed on Shopify', { shopifyUrl });
      } else {
        steps.push('shopify_skipped');
        log('info', 'PIPELINE Step 6: Shopify skipped (no admin token)');
      }
    } catch (err) {
      log('warn', 'Shopify listing failed', { error: String(err) });
      steps.push('shopify_failed');
    }

    // Update status to listed
    await env.DB.prepare("UPDATE products SET status='listed', listed_at=datetime('now') WHERE definition_id=?")
      .bind(definitionId).run();

    // ── Step 7: Promote via Bot Fleet ────────────────────────────
    try {
      const promoResults = await promoteProduct(
        product, gumroadUrl, shopifyUrl, pdfResult.pageCount, pdfResult.chapterCount, env,
      );

      // Record promotion results
      const productRow = await env.DB.prepare('SELECT id FROM products WHERE definition_id=?').bind(definitionId).first();
      if (productRow) {
        for (const r of promoResults) {
          await env.DB.prepare(
            'INSERT INTO promotion_results (product_id, platform, success, post_id, error) VALUES (?, ?, ?, ?, ?)',
          ).bind(productRow.id, r.platform, r.success ? 1 : 0, r.postId || null, r.error || null).run();
        }
      }

      steps.push('promoted');
      log('info', 'PIPELINE Step 7: Promotion complete', {
        platforms: promoResults.length,
        successful: promoResults.filter(r => r.success).length,
      });
    } catch (err) {
      log('warn', 'Promotion failed', { error: String(err) });
      steps.push('promotion_failed');
    }

    // Update status to promoted
    await env.DB.prepare("UPDATE products SET status='promoted', promoted_at=datetime('now') WHERE definition_id=?")
      .bind(definitionId).run();

    // ── Step 8: Report to Shared Brain ───────────────────────────
    try {
      await env.SHARED_BRAIN.fetch('https://brain/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instance_id: 'echo-revenue-engine',
          role: 'assistant',
          content: `REVENUE ENGINE: Published "${product.title}" ($${product.priceUsd}). ${pdfResult.pageCount} pages, ${pdfResult.chapterCount} chapters. ${gumroadUrl ? 'Gumroad: ' + gumroadUrl : ''} ${shopifyUrl ? 'Shopify: ' + shopifyUrl : ''}`,
          importance: 8,
          tags: ['revenue', 'product', 'launch', product.category],
        }),
      });
    } catch {
      // Non-critical
    }

    // Complete pipeline run
    await env.DB.prepare("UPDATE pipeline_runs SET status='completed', steps_completed=?, completed_at=datetime('now') WHERE id=?")
      .bind(JSON.stringify(steps), runId).run();

    log('info', 'PIPELINE COMPLETE', { definitionId, steps, pageCount: pdfResult.pageCount });

    return {
      success: true,
      product: {
        id: String(existing?.id || 0),
        definitionId,
        title: product.title,
        pdfR2Key,
        coverR2Key,
        pdfSizeBytes: pdfResult.pdfBytes.length,
        pageCount: pdfResult.pageCount,
        gumroadProductId,
        gumroadUrl,
        shopifyProductId,
        shopifyUrl,
        eptUrl: null,
        status: 'promoted',
        salesCount: 0,
        revenueUsd: 0,
        createdAt: new Date().toISOString(),
        listedAt: new Date().toISOString(),
        promotedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    const error = String(err);
    log('error', 'PIPELINE FAILED', { definitionId, steps, error });

    await env.DB.prepare("UPDATE pipeline_runs SET status='failed', steps_completed=?, error=?, completed_at=datetime('now') WHERE id=?")
      .bind(JSON.stringify(steps), error.slice(0, 500), runId).run();

    return { success: false, error };
  }
}

// ─── Stats ───────────────────────────────────────────────────────────

async function getRevenueStats(env: Env): Promise<RevenueStats> {
  const productsResult = await env.DB.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
  const products = productsResult.results || [];

  const statusCounts: Record<string, number> = {};
  let totalSales = 0;
  let totalRevenue = 0;
  const topProducts: { title: string; sales: number; revenue: number }[] = [];

  for (const p of products) {
    const status = (p.status as string) || 'unknown';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    totalSales += (p.sales_count as number) || 0;
    totalRevenue += (p.revenue_usd as number) || 0;
    topProducts.push({
      title: p.title as string,
      sales: (p.sales_count as number) || 0,
      revenue: (p.revenue_usd as number) || 0,
    });
  }

  topProducts.sort((a, b) => b.revenue - a.revenue);

  // Also fetch from Gumroad + Shopify
  try {
    const [gumSales, shopSales] = await Promise.allSettled([
      getGumroadSales(env),
      getShopifySales(env),
    ]);

    if (gumSales.status === 'fulfilled') {
      totalSales += gumSales.value.totalSales;
      totalRevenue += gumSales.value.totalRevenue;
    }
    if (shopSales.status === 'fulfilled') {
      totalSales += shopSales.value.totalSales;
      totalRevenue += shopSales.value.totalRevenue;
    }
  } catch {
    // Non-critical
  }

  return {
    totalProducts: products.length,
    totalSales,
    totalRevenueUsd: Math.round(totalRevenue * 100) / 100,
    productsByStatus: statusCounts,
    topProducts: topProducts.slice(0, 10),
    last30DaysRevenue: await getLast30DaysRevenue(env),
  };
}

/** Query revenue snapshots for the last 30 days */
async function getLast30DaysRevenue(env: Env): Promise<number> {
  try {
    const row = await env.DB.prepare(
      "SELECT COALESCE(SUM(total_revenue), 0) as total FROM revenue_snapshots WHERE snapshot_date >= date('now', '-30 days')"
    ).first<{ total: number }>();
    return Math.round((row?.total ?? 0) * 100) / 100;
  } catch {
    return 0;
  }
}

// ─── Revenue Snapshot Cron ───────────────────────────────────────────

async function snapshotRevenue(env: Env): Promise<void> {
  try {
    const [gumSales, shopSales] = await Promise.allSettled([
      getGumroadSales(env),
      getShopifySales(env),
    ]);

    const gum = gumSales.status === 'fulfilled' ? gumSales.value : { totalSales: 0, totalRevenue: 0 };
    const shop = shopSales.status === 'fulfilled' ? shopSales.value : { totalSales: 0, totalRevenue: 0 };

    await env.DB.prepare(`
      INSERT INTO revenue_snapshots (gumroad_sales, gumroad_revenue, shopify_sales, shopify_revenue, total_sales, total_revenue)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      gum.totalSales, gum.totalRevenue,
      shop.totalSales, shop.totalRevenue,
      gum.totalSales + shop.totalSales,
      gum.totalRevenue + shop.totalRevenue,
    ).run();

    log('info', 'Revenue snapshot saved', { gumroad: gum, shopify: shop });
  } catch (err) {
    log('warn', 'Revenue snapshot failed', { error: String(err) });
  }
}

// ─── Cron Handler ────────────────────────────────────────────────────

async function handleScheduled(event: ScheduledEvent, env: Env): Promise<void> {
  await initSchema(env);

  const dt = new Date(event.scheduledTime);
  const day = dt.getUTCDay(); // 0=Sun, 1=Mon, ...
  const hour = dt.getUTCHours();
  const date = dt.getUTCDate();

  log('info', 'Cron triggered', { day, hour, date, cron: event.cron });

  // Monday 06:00 UTC (12am CST) — Generate next product
  if (day === 1 && hour === 6) {
    const generated = await env.DB.prepare('SELECT definition_id FROM products').all();
    const generatedIds = new Set((generated.results || []).map(r => r.definition_id as string));
    const nextProduct = selectNextProduct(generatedIds);

    if (nextProduct) {
      log('info', 'Cron: Generating next product', { productId: nextProduct.id });
      await runFullPipeline(nextProduct.id, 'cron_weekly', env);
    } else {
      log('info', 'Cron: All products have been generated');
    }
  }

  // Wednesday 14:00 UTC (8am CST) — Mid-week promotion push
  if (day === 3 && hour === 14) {
    const unPromoted = await env.DB.prepare("SELECT * FROM products WHERE status = 'listed' LIMIT 1").first();
    if (unPromoted) {
      const product = getProductById(unPromoted.definition_id as string);
      if (product) {
        log('info', 'Cron: Re-promoting product', { productId: product.id });
        await promoteProduct(
          product,
          unPromoted.gumroad_url as string | null,
          unPromoted.shopify_url as string | null,
          (unPromoted.page_count as number) || 0,
          (unPromoted.chapter_count as number) || 0,
          env,
        );
        await env.DB.prepare("UPDATE products SET status='promoted', promoted_at=datetime('now') WHERE definition_id=?")
          .bind(product.id).run();
      }
    }
  }

  // 1st of month 10:00 UTC (4am CST) — Monthly product launch
  if (date === 1 && hour === 10) {
    const generated = await env.DB.prepare('SELECT definition_id FROM products').all();
    const generatedIds = new Set((generated.results || []).map(r => r.definition_id as string));
    const nextProduct = selectNextProduct(generatedIds);

    if (nextProduct) {
      log('info', 'Cron: Monthly product launch', { productId: nextProduct.id });
      await runFullPipeline(nextProduct.id, 'cron_monthly', env);
    }
  }

  // Friday 18:00 UTC (12pm CST) — Revenue snapshot + weekend push
  if (day === 5 && hour === 18) {
    await snapshotRevenue(env);

    // Re-promote a random product for weekend visibility
    const products = await env.DB.prepare("SELECT * FROM products WHERE status = 'promoted' ORDER BY RANDOM() LIMIT 1").first();
    if (products) {
      const product = getProductById(products.definition_id as string);
      if (product) {
        log('info', 'Cron: Weekend promotion push', { productId: product.id });
        await promoteProduct(
          product,
          products.gumroad_url as string | null,
          products.shopify_url as string | null,
          (products.page_count as number) || 0,
          (products.chapter_count as number) || 0,
          env,
        );
      }
    }
  }
}

// ─── HTTP Router ─────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') return cors();

    // Init schema on first request
    await initSchema(env);

    try {
      // ── Public Endpoints ─────────────────────────────────────
      if (path === '/health' || path === '/') {
        const productCount = await env.DB.prepare('SELECT COUNT(*) as count FROM products').first();
        return json({
          status: 'ok',
          version: env.VERSION || '1.0.0',
          worker: 'echo-revenue-engine',
          timestamp: new Date().toISOString(),
          products: (productCount?.count as number) || 0,
          catalogSize: PRODUCT_CATALOG.length,
          categories: getCategories(),
          hasGumroad: !!env.GUMROAD_ACCESS_TOKEN,
          hasShopify: !!env.SHOPIFY_ADMIN_TOKEN,
          hasXai: !!env.XAI_API_KEY,
        });
      }

      if (path === '/catalog') {
        return json({
          products: PRODUCT_CATALOG.map(p => ({
            id: p.id,
            title: p.title,
            subtitle: p.subtitle,
            category: p.category,
            priceUsd: p.priceUsd,
            pageTarget: p.pageTarget,
            tags: p.tags,
          })),
          categories: getCategories(),
          totalProducts: PRODUCT_CATALOG.length,
        });
      }

      // ── Authenticated Endpoints ──────────────────────────────
      if (!requireAuth(request, env)) {
        return json({ error: 'Unauthorized — provide X-Echo-API-Key header' }, 401);
      }

      // GET /stats — Revenue statistics
      if (path === '/stats' && request.method === 'GET') {
        const stats = await getRevenueStats(env);
        return json(stats);
      }

      // GET /products — List all generated products
      if (path === '/products' && request.method === 'GET') {
        const results = await env.DB.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
        return json({ products: results.results || [], count: results.results?.length || 0 });
      }

      // GET /products/:id — Single product details
      if (path.startsWith('/products/') && request.method === 'GET') {
        const defId = path.split('/products/')[1];
        const product = await env.DB.prepare('SELECT * FROM products WHERE definition_id = ?').bind(defId).first();
        if (!product) return json({ error: 'Product not found' }, 404);

        const promos = await env.DB.prepare('SELECT * FROM promotion_results WHERE product_id = ?').bind(product.id).all();
        return json({ product, promotions: promos.results || [] });
      }

      // POST /generate — Trigger product generation (synchronous — runFullPipeline tracks its own pipeline_runs)
      if (path === '/generate' && request.method === 'POST') {
        const body: any = await request.json();
        const definitionId = body.product_id || body.definitionId;
        if (!definitionId) {
          return json({ error: 'product_id required' }, 400);
        }
        const result = await runFullPipeline(definitionId, 'manual', env);
        return json(result, result.success ? 200 : 500);
      }

      // POST /generate/next — Generate next ungenerated product
      if (path === '/generate/next' && request.method === 'POST') {
        const generated = await env.DB.prepare('SELECT definition_id FROM products').all();
        const generatedIds = new Set((generated.results || []).map(r => r.definition_id as string));
        const nextProduct = selectNextProduct(generatedIds);
        if (!nextProduct) {
          return json({ status: 'complete', message: 'All products have been generated' });
        }
        const result = await runFullPipeline(nextProduct.id, 'manual_next', env);
        return json({ ...result, remaining: PRODUCT_CATALOG.length - generatedIds.size - 1 }, result.success ? 200 : 500);
      }

      // POST /generate/all — Generate next ungenerated product
      if (path === '/generate/all' && request.method === 'POST') {
        const generated = await env.DB.prepare('SELECT definition_id FROM products').all();
        const generatedIds = new Set((generated.results || []).map(r => r.definition_id as string));
        const remaining = PRODUCT_CATALOG.filter(p => !generatedIds.has(p.id));
        if (remaining.length === 0) {
          return json({ status: 'complete', message: 'All products have been generated', remaining: 0 });
        }
        const nextProduct = remaining[0];
        const result = await runFullPipeline(nextProduct.id, 'manual_all', env);
        return json({ ...result, currentProduct: nextProduct.id, remaining: remaining.length - 1 }, result.success ? 200 : 500);
      }

      // POST /promote/:id — Manually trigger promotion for a product
      if (path.startsWith('/promote/') && request.method === 'POST') {
        const defId = path.split('/promote/')[1];
        const productRow = await env.DB.prepare('SELECT * FROM products WHERE definition_id = ?').bind(defId).first();
        if (!productRow) return json({ error: 'Product not found in DB' }, 404);

        const product = getProductById(defId);
        if (!product) return json({ error: 'Product definition not found' }, 404);

        ctx.waitUntil((async () => {
          const results = await promoteProduct(
            product,
            productRow.gumroad_url as string | null,
            productRow.shopify_url as string | null,
            (productRow.page_count as number) || 0,
            (productRow.chapter_count as number) || 0,
            env,
          );

          for (const r of results) {
            await env.DB.prepare(
              'INSERT INTO promotion_results (product_id, platform, success, post_id, error) VALUES (?, ?, ?, ?, ?)',
            ).bind(productRow.id, r.platform, r.success ? 1 : 0, r.postId || null, r.error || null).run();
          }

          await env.DB.prepare("UPDATE products SET status='promoted', promoted_at=datetime('now') WHERE definition_id=?")
            .bind(defId).run();
        })());

        return json({ status: 'started', message: `Promoting ${product.title}` });
      }

      // GET /pipeline-runs/:id — Poll specific pipeline run status
      if (path.startsWith('/pipeline-runs/') && path.split('/').length === 3 && request.method === 'GET') {
        const runId = path.split('/pipeline-runs/')[1];
        const run = await env.DB.prepare('SELECT * FROM pipeline_runs WHERE id = ?').bind(runId).first();
        if (!run) return json({ error: 'Pipeline run not found' }, 404);

        // If completed, also return the generated product
        let product = null;
        if (run.status === 'completed' && run.definition_id) {
          product = await env.DB.prepare('SELECT * FROM products WHERE definition_id = ?').bind(run.definition_id).first();
        }

        return json({ run, product });
      }

      // GET /pipeline-runs — View pipeline execution history
      if (path === '/pipeline-runs' && request.method === 'GET') {
        const limit = parseInt(url.searchParams.get('limit') || '20');
        const results = await env.DB.prepare('SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT ?').bind(limit).all();
        return json({ runs: results.results || [] });
      }

      // GET /revenue-snapshots — Revenue history
      if (path === '/revenue-snapshots' && request.method === 'GET') {
        const results = await env.DB.prepare('SELECT * FROM revenue_snapshots ORDER BY snapshot_date DESC LIMIT 90').all();
        return json({ snapshots: results.results || [] });
      }

      // POST /snapshot-revenue — Manual revenue snapshot
      if (path === '/snapshot-revenue' && request.method === 'POST') {
        ctx.waitUntil(snapshotRevenue(env));
        return json({ status: 'started', message: 'Revenue snapshot in progress' });
      }

      // GET /debug/engine — Test Engine Runtime service binding
      if (path === '/debug/engine') {
        try {
          const resp = await env.ENGINE_RUNTIME.fetch('https://engine/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Echo-API-Key': env.ECHO_API_KEY },
            body: JSON.stringify({ query: 'tax optimization deductions', domain: 'tax', limit: 3 }),
          });
          const status = resp.status;
          const text = await resp.text();
          let parsed: unknown = null;
          try { parsed = JSON.parse(text); } catch { /* not json */ }
          return json({
            binding_status: status,
            binding_ok: resp.ok,
            response_length: text.length,
            response_preview: text.slice(0, 2000),
            parsed_keys: parsed && typeof parsed === 'object' ? Object.keys(parsed as Record<string, unknown>) : null,
            has_matches: parsed && typeof parsed === 'object' && 'matches' in (parsed as Record<string, unknown>),
            api_key_set: !!env.ECHO_API_KEY,
            api_key_prefix: env.ECHO_API_KEY ? env.ECHO_API_KEY.slice(0, 10) + '...' : 'NOT SET',
          });
        } catch (err) {
          return json({ error: String(err), stack: (err as Error).stack }, 500);
        }
      }

      // GET /debug/doctrines — Simulate fetchDoctrines inline (synchronous)
      if (path === '/debug/doctrines') {
        const product = getProductById('tax-optimization-2026') || PRODUCT_CATALOG[0]!;
        const debugLog: unknown[] = [];
        const allDoctrines: { topic: string; engineId: string; confidence: unknown }[] = [];

        for (const prefix of product.enginePrefixes) {
          try {
            debugLog.push({ step: 'fetch_start', prefix, domain: product.domain, keywords: product.keywords.join(' ') });
            const resp = await env.ENGINE_RUNTIME.fetch('https://engine/query', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Echo-API-Key': env.ECHO_API_KEY },
              body: JSON.stringify({
                query: product.keywords.join(' '),
                domain: product.domain,
                limit: 50,
              }),
            });
            debugLog.push({ step: 'fetch_done', prefix, status: resp.status, ok: resp.ok });

            if (resp.ok) {
              const data: any = await resp.json();
              const doctrines = data.matches || data.doctrines || data.results || [];
              debugLog.push({
                step: 'parsed',
                prefix,
                top_keys: Object.keys(data).slice(0, 10),
                doctrine_count: doctrines.length,
                first_doctrine_keys: doctrines[0] ? Object.keys(doctrines[0]).slice(0, 10) : null,
              });
              for (const d of doctrines) {
                allDoctrines.push({
                  topic: d.topic || d.title || 'Untitled',
                  engineId: d.engine_id || d.engineId || prefix,
                  confidence: d.confidence,
                });
              }
            } else {
              const errText = await resp.text();
              debugLog.push({ step: 'error_response', prefix, status: resp.status, body: errText.slice(0, 500) });
            }
          } catch (err) {
            debugLog.push({ step: 'exception', prefix, error: String(err) });
          }
        }

        // Also try Knowledge Forge via service binding (GET /search?q=...&limit=...)
        try {
          const kfQuery = product.keywords.join(' ');
          const kfResp = await env.KNOWLEDGE_FORGE.fetch(
            `https://forge/search?q=${encodeURIComponent(kfQuery)}&limit=20`,
            { headers: { 'X-Echo-API-Key': env.ECHO_API_KEY } },
          );
          debugLog.push({ step: 'kf_done', status: kfResp.status, ok: kfResp.ok });
          if (kfResp.ok) {
            const kfData: any = await kfResp.json();
            const chunks = kfData.results || kfData.data?.results || [];
            debugLog.push({ step: 'kf_parsed', chunk_count: chunks.length, first_chunk_keys: chunks[0] ? Object.keys(chunks[0]) : null });
          } else {
            const errText = await kfResp.text();
            debugLog.push({ step: 'kf_error', status: kfResp.status, body: errText.slice(0, 300) });
          }
        } catch (err) {
          debugLog.push({ step: 'kf_exception', error: String(err) });
        }

        // Dedup
        const seen = new Set<string>();
        const deduped = allDoctrines.filter(d => {
          const key = d.topic.toLowerCase().trim();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        return json({
          product_id: product.id,
          product_domain: product.domain,
          product_prefixes: product.enginePrefixes,
          product_keywords: product.keywords,
          total_raw: allDoctrines.length,
          total_deduped: deduped.length,
          first_5_topics: deduped.slice(0, 5).map(d => d.topic),
          debug_log: debugLog,
        });
      }

      // GET /download/:id — Serve PDF directly from R2
      if (path.startsWith('/download/') && request.method === 'GET') {
        const defId = path.split('/download/')[1];
        const r2Key = `products/${defId}/${defId}.pdf`;
        const obj = await env.PRODUCTS.get(r2Key);
        if (!obj) return json({ error: 'PDF not found in R2', key: r2Key }, 404);
        return new Response(obj.body, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Length': String(obj.size),
            'X-R2-Size': String(obj.size),
            'X-R2-Etag': obj.etag,
            'X-R2-Uploaded': obj.uploaded.toISOString(),
          },
        });
      }

      // GET /debug/r2/:id — R2 object metadata + verification
      if (path.startsWith('/debug/r2/') && request.method === 'GET') {
        const defId = path.split('/debug/r2/')[1];
        const r2Key = `products/${defId}/${defId}.pdf`;
        const headObj = await env.PRODUCTS.head(r2Key);
        if (!headObj) return json({ error: 'Not found in R2', key: r2Key }, 404);

        // Also fetch the actual object to confirm body size
        const fullObj = await env.PRODUCTS.get(r2Key);
        let bodySize = -1;
        if (fullObj) {
          const buf = await fullObj.arrayBuffer();
          bodySize = buf.byteLength;
        }

        // Get D1 record for comparison
        const dbRow = await env.DB.prepare('SELECT pdf_size_bytes, page_count, chapter_count, word_count, status FROM products WHERE definition_id=?').bind(defId).first<any>();

        return json({
          r2Key,
          r2Head: {
            size: headObj.size,
            etag: headObj.etag,
            uploaded: headObj.uploaded.toISOString(),
            httpMetadata: headObj.httpMetadata,
            customMetadata: headObj.customMetadata,
          },
          r2BodySize: bodySize,
          d1Record: dbRow || null,
          sizeMatch: {
            headVsBody: headObj.size === bodySize,
            headVsD1: dbRow ? headObj.size === dbRow.pdf_size_bytes : null,
            bodyVsD1: dbRow ? bodySize === dbRow.pdf_size_bytes : null,
          },
        });
      }

      // GET /debug/ai — Test Workers AI binding directly
      if (path === '/debug/ai') {
        const start = Date.now();
        try {
          const result: any = await env.AI.run(
            '@cf/meta/llama-3.3-70b-instruct-fp8-fast' as any,
            {
              messages: [
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: 'Write exactly 3 sentences about oilfield drilling operations.' },
              ],
              max_tokens: 500,
            },
          );
          const elapsed = Date.now() - start;
          return json({
            success: true,
            elapsed_ms: elapsed,
            response_length: result?.response?.length || 0,
            response_preview: (result?.response || '').slice(0, 500),
            raw_keys: result ? Object.keys(result) : null,
          });
        } catch (err) {
          const elapsed = Date.now() - start;
          return json({
            success: false,
            elapsed_ms: elapsed,
            error: String(err),
            stack: (err as Error).stack,
          }, 500);
        }
      }

      // GET /debug/cover — Test Grok Imagine cover art generation
      if (path === '/debug/cover') {
        const product = getProductById('tax-optimization-2026') || PRODUCT_CATALOG[0]!;
        const diagnostics = await debugCoverArt(product, env);
        return json(diagnostics);
      }

      return json({ error: 'Not found', endpoints: [
        'GET  /health',
        'GET  /catalog',
        'GET  /stats',
        'GET  /products',
        'GET  /products/:id',
        'POST /generate',
        'POST /generate/next',
        'POST /generate/all',
        'POST /promote/:id',
        'GET  /pipeline-runs',
        'GET  /revenue-snapshots',
        'POST /snapshot-revenue',
        'GET  /debug/engine',
        'GET  /download/:id',
        'GET  /debug/r2/:id',
        'GET  /debug/doctrines',
        'GET  /debug/ai',
        'GET  /debug/cover',
      ]}, 404);

    } catch (err) {
      log('error', 'Request handler error', { path, error: String(err), stack: (err as Error).stack });
      return json({ error: 'Internal server error', message: String(err) }, 500);
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleScheduled(event, env));
  },
};
