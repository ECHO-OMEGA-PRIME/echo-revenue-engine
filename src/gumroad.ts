/**
 * Gumroad API Client — Lists digital products for sale on Gumroad.
 */

import type { ProductDefinition, GumroadListResult, Env } from './types';
import { log } from './types';

const GUMROAD_API = 'https://api.gumroad.com/v2';

/**
 * Create a product on Gumroad.
 */
export async function listOnGumroad(
  product: ProductDefinition,
  pdfR2Key: string,
  coverR2Key: string,
  env: Env,
): Promise<GumroadListResult> {
  log('info', 'Listing product on Gumroad', { productId: product.id, title: product.title });

  // Build product data
  const formData = new FormData();
  formData.append('access_token', env.GUMROAD_ACCESS_TOKEN);
  formData.append('name', product.title);
  formData.append('description', buildGumroadDescription(product));
  formData.append('price', Math.round(product.priceUsd * 100).toString()); // cents
  formData.append('currency', 'usd');
  formData.append('published', 'true');
  formData.append('tags', product.tags.join(','));

  // Attach PDF file from R2
  try {
    const pdfObj = await env.PRODUCTS.get(pdfR2Key);
    if (pdfObj) {
      const pdfBytes = await pdfObj.arrayBuffer();
      const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
      formData.append('file', pdfBlob, `${product.id}.pdf`);
    }
  } catch (err) {
    log('warn', 'Could not attach PDF to Gumroad listing', { error: String(err) });
  }

  // Attach cover image from R2
  try {
    const coverObj = await env.PRODUCTS.get(coverR2Key);
    if (coverObj) {
      const coverBytes = await coverObj.arrayBuffer();
      const coverBlob = new Blob([coverBytes], { type: 'image/png' });
      formData.append('preview', coverBlob, `${product.id}-cover.png`);
    }
  } catch (err) {
    log('warn', 'Could not attach cover to Gumroad listing', { error: String(err) });
  }

  const resp = await fetch(`${GUMROAD_API}/products`, {
    method: 'POST',
    body: formData,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    log('error', 'Gumroad product creation failed', { status: resp.status, error: errText.slice(0, 500) });
    throw new Error(`Gumroad API error: ${resp.status} — ${errText.slice(0, 200)}`);
  }

  const data: any = await resp.json();
  const gumroadProduct = data.product;

  log('info', 'Product listed on Gumroad', {
    productId: product.id,
    gumroadId: gumroadProduct.id,
    url: gumroadProduct.short_url,
    price: product.priceUsd,
  });

  return {
    productId: gumroadProduct.id,
    url: gumroadProduct.url || `https://gumroad.com/l/${gumroadProduct.custom_permalink}`,
    shortUrl: gumroadProduct.short_url,
  };
}

/**
 * Get sales stats from Gumroad.
 */
export async function getGumroadSales(env: Env): Promise<{ totalSales: number; totalRevenue: number }> {
  try {
    const resp = await fetch(`${GUMROAD_API}/products?access_token=${env.GUMROAD_ACCESS_TOKEN}`);
    if (!resp.ok) return { totalSales: 0, totalRevenue: 0 };

    const data: any = await resp.json();
    const products = data.products || [];

    let totalSales = 0;
    let totalRevenue = 0;

    for (const p of products) {
      totalSales += p.sales_count || 0;
      totalRevenue += (p.sales_usd_cents || 0) / 100;
    }

    return { totalSales, totalRevenue };
  } catch (err) {
    log('warn', 'Failed to fetch Gumroad sales', { error: String(err) });
    return { totalSales: 0, totalRevenue: 0 };
  }
}

function buildGumroadDescription(product: ProductDefinition): string {
  return `${product.description}

---

This expert guide is powered by Echo Prime Technologies' intelligence engine fleet — 5,400+ specialized AI reasoning engines spanning 210+ domains with 619,000+ doctrine blocks.

Every section is backed by real expert knowledge with authority citations. This is NOT generic AI-generated content — it's doctrine-backed analysis built from months of deep domain knowledge engineering.

What's inside:
- Expert-level analysis with specific, actionable advice
- Real authority citations and legal/regulatory references
- Practical frameworks you can apply immediately
- ${product.pageTarget}+ pages of focused, expert content

Built by Echo Prime Technologies — the most advanced autonomous AI platform.
Learn more at echo-ept.com

Category: ${product.category}
Tags: ${product.tags.join(', ')}`;
}
