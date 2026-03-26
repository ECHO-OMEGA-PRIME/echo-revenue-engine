/**
 * Shopify Admin API Client — Lists digital products on the Shopify store.
 *
 * Store: echo-prime-technologies.myshopify.com
 * Uses Shopify Admin REST API 2024-01.
 */

import type { ProductDefinition, ShopifyListResult, Env } from './types';
import { log } from './types';

function shopifyUrl(env: Env, path: string): string {
  const domain = env.SHOPIFY_STORE_DOMAIN || 'echo-prime-technologies.myshopify.com';
  return `https://${domain}/admin/api/2024-01/${path}`;
}

function shopifyHeaders(env: Env): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': env.SHOPIFY_ADMIN_TOKEN,
  };
}

/**
 * Create a digital product on Shopify.
 */
export async function listOnShopify(
  product: ProductDefinition,
  pdfR2Key: string,
  coverR2Key: string,
  gumroadUrl: string | null,
  env: Env,
): Promise<ShopifyListResult> {
  log('info', 'Listing product on Shopify', { productId: product.id, title: product.title });

  // Build product creation payload
  const productPayload = {
    product: {
      title: product.title,
      body_html: buildShopifyDescription(product, gumroadUrl),
      vendor: 'Echo Prime Technologies',
      product_type: 'Digital Download',
      tags: product.tags.join(', '),
      status: 'active',
      variants: [{
        price: product.priceUsd.toFixed(2),
        requires_shipping: false,
        taxable: true,
        inventory_management: null,
        inventory_policy: 'continue', // digital, always available
        fulfillment_service: 'manual',
      }],
      // Product image from R2
      images: [] as { src?: string; attachment?: string }[],
    },
  };

  // Try to attach cover image as base64
  try {
    const coverObj = await env.PRODUCTS.get(coverR2Key);
    if (coverObj) {
      const coverBytes = new Uint8Array(await coverObj.arrayBuffer());
      // Convert to base64 for Shopify
      let binary = '';
      for (let i = 0; i < coverBytes.length; i++) {
        binary += String.fromCharCode(coverBytes[i]!);
      }
      const b64 = btoa(binary);
      productPayload.product.images.push({ attachment: b64 });
    }
  } catch (err) {
    log('warn', 'Could not attach cover image to Shopify', { error: String(err) });
  }

  const resp = await fetch(shopifyUrl(env, 'products.json'), {
    method: 'POST',
    headers: shopifyHeaders(env),
    body: JSON.stringify(productPayload),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    log('error', 'Shopify product creation failed', { status: resp.status, error: errText.slice(0, 500) });
    throw new Error(`Shopify API error: ${resp.status} — ${errText.slice(0, 200)}`);
  }

  const data: any = await resp.json();
  const shopifyProduct = data.product;
  const domain = env.SHOPIFY_STORE_DOMAIN || 'echo-prime-technologies.myshopify.com';

  log('info', 'Product listed on Shopify', {
    productId: product.id,
    shopifyId: shopifyProduct.id,
    handle: shopifyProduct.handle,
  });

  return {
    productId: shopifyProduct.id,
    handle: shopifyProduct.handle,
    url: `https://${domain}/products/${shopifyProduct.handle}`,
  };
}

/**
 * Get sales count from Shopify orders.
 */
export async function getShopifySales(env: Env): Promise<{ totalSales: number; totalRevenue: number }> {
  try {
    const resp = await fetch(shopifyUrl(env, 'orders.json?status=any&limit=250'), {
      headers: shopifyHeaders(env),
    });
    if (!resp.ok) return { totalSales: 0, totalRevenue: 0 };

    const data: any = await resp.json();
    const orders = data.orders || [];

    let totalRevenue = 0;
    for (const order of orders) {
      totalRevenue += parseFloat(order.total_price || '0');
    }

    return { totalSales: orders.length, totalRevenue };
  } catch (err) {
    log('warn', 'Failed to fetch Shopify sales', { error: String(err) });
    return { totalSales: 0, totalRevenue: 0 };
  }
}

function buildShopifyDescription(product: ProductDefinition, gumroadUrl: string | null): string {
  let html = `<div>
<h2>${product.subtitle}</h2>
<p>${product.description}</p>

<h3>What's Inside</h3>
<ul>
  <li>Expert-level analysis with actionable advice</li>
  <li>Real authority citations and references</li>
  <li>Practical frameworks you can apply immediately</li>
  <li>${product.pageTarget}+ pages of focused expert content</li>
</ul>

<h3>Powered by AI Intelligence Engines</h3>
<p>This guide is built from Echo Prime Technologies' fleet of 5,400+ specialized intelligence engines with 619,000+ expert doctrine blocks. Every section is backed by real domain expertise — not generic AI content.</p>

<p><strong>Category:</strong> ${product.category}</p>
<p><em>Digital download — instant delivery after purchase.</em></p>`;

  if (gumroadUrl) {
    html += `\n<p>Also available on <a href="${gumroadUrl}">Gumroad</a></p>`;
  }

  html += '\n</div>';
  return html;
}
