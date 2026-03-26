/**
 * Cover Art Generator — Uses Grok Imagine (xAI Aurora) for PDF cover images.
 *
 * Uses model "grok-imagine-image" (same as echo-x-bot which is proven working).
 * Auth via XAI_API_KEY secret (same key as GROK_API_KEY on x-bot).
 */

import type { ProductDefinition, CoverArtResult, Env } from './types';
import { log } from './types';

const GROK_IMAGE_URL = 'https://api.x.ai/v1/images/generations';
const GROK_IMAGE_MODEL = 'grok-imagine-image';
const GROK_TIMEOUT_MS = 60_000;

// Category-specific visual themes
const CATEGORY_THEMES: Record<string, string> = {
  'Finance & Tax': 'financial charts, golden coins, calculator, dark blue gradient background with gold accents',
  'Oil & Gas': 'oil derrick silhouette at sunset, industrial machinery, deep orange and black color scheme',
  'Legal': 'scales of justice, law books, courthouse columns, deep navy blue with silver accents',
  'Technology': 'circuit board patterns, glowing neural networks, dark background with cyan and red neon accents',
  'Healthcare': 'DNA helix, medical symbols, clean white and blue color scheme with red accents',
  'Engineering': 'mechanical gears, blueprints, precision instruments, steel gray with blue technical drawings',
  'Real Estate': 'modern building skyline, property blueprints, warm amber and navy color scheme',
  'Cryptocurrency': 'bitcoin and blockchain symbols, digital currency patterns, dark background with gold and green neon',
};

function buildCoverPrompt(product: ProductDefinition): string {
  const theme = CATEGORY_THEMES[product.category] || 'professional dark gradient with geometric patterns';

  return `Professional book cover design for "${product.title}". ${theme}. Clean modern typography layout. The title should be prominently displayed. Subtitle: "${product.subtitle}". Publisher: Echo Prime Technologies. High-quality, premium, professional look. Beautiful background illustration for a digital product cover.`;
}

export async function generateCoverArt(product: ProductDefinition, env: Env): Promise<CoverArtResult> {
  const prompt = buildCoverPrompt(product);
  const apiKey = env.XAI_API_KEY;

  if (!apiKey) {
    throw new Error('XAI_API_KEY not configured — cannot generate cover art');
  }

  log('info', 'Generating cover art via Grok Imagine', {
    productId: product.id,
    model: GROK_IMAGE_MODEL,
    keyPrefix: apiKey.slice(0, 8) + '...',
    prompt: prompt.slice(0, 80) + '...',
  });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GROK_TIMEOUT_MS);

    const resp = await fetch(GROK_IMAGE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROK_IMAGE_MODEL,
        prompt,
        n: 1,
        response_format: 'b64_json',
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!resp.ok) {
      const errText = await resp.text();
      log('error', 'Grok Imagine API error', {
        productId: product.id,
        status: resp.status,
        statusText: resp.statusText,
        error: errText.slice(0, 500),
        model: GROK_IMAGE_MODEL,
      });
      throw new Error(`Grok Imagine API ${resp.status}: ${errText.slice(0, 200)}`);
    }

    const data: any = await resp.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) {
      log('error', 'No b64_json in Grok response', {
        productId: product.id,
        responseKeys: Object.keys(data),
        dataLength: data.data?.length || 0,
        firstItem: data.data?.[0] ? Object.keys(data.data[0]) : null,
      });
      throw new Error('No image data (b64_json) in Grok Imagine response');
    }

    const imageBytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    log('info', 'Cover art generated successfully', {
      productId: product.id,
      sizeBytes: imageBytes.length,
      sizeKb: Math.round(imageBytes.length / 1024),
    });

    return { imageBytes, contentType: 'image/png', prompt };
  } catch (err) {
    log('error', 'Cover art generation failed', {
      productId: product.id,
      error: String(err),
      stack: (err as Error).stack,
    });
    throw err;
  }
}

/**
 * Debug function — test cover art generation and return diagnostic info.
 */
export async function debugCoverArt(product: ProductDefinition, env: Env): Promise<Record<string, unknown>> {
  const prompt = buildCoverPrompt(product);
  const apiKey = env.XAI_API_KEY;
  const diagnostics: Record<string, unknown> = {
    productId: product.id,
    category: product.category,
    model: GROK_IMAGE_MODEL,
    url: GROK_IMAGE_URL,
    hasApiKey: !!apiKey,
    keyPrefix: apiKey ? apiKey.slice(0, 10) + '...' : 'NOT SET',
    keyLength: apiKey?.length || 0,
    prompt: prompt.slice(0, 200),
  };

  if (!apiKey) {
    diagnostics.error = 'XAI_API_KEY not set';
    return diagnostics;
  }

  try {
    const resp = await fetch(GROK_IMAGE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROK_IMAGE_MODEL,
        prompt: 'Simple test: a red circle on white background',
        n: 1,
        response_format: 'b64_json',
      }),
    });

    diagnostics.httpStatus = resp.status;
    diagnostics.httpOk = resp.ok;
    diagnostics.headers = Object.fromEntries(resp.headers.entries());

    if (!resp.ok) {
      diagnostics.errorBody = (await resp.text()).slice(0, 1000);
    } else {
      const data: any = await resp.json();
      diagnostics.responseKeys = Object.keys(data);
      diagnostics.hasData = !!data.data;
      diagnostics.dataLength = data.data?.length || 0;
      diagnostics.hasB64 = !!data.data?.[0]?.b64_json;
      diagnostics.b64Length = data.data?.[0]?.b64_json?.length || 0;
      diagnostics.imageSizeKb = data.data?.[0]?.b64_json ? Math.round(data.data[0].b64_json.length * 0.75 / 1024) : 0;
      diagnostics.success = true;
    }
  } catch (err) {
    diagnostics.exception = String(err);
    diagnostics.stack = (err as Error).stack;
  }

  return diagnostics;
}
