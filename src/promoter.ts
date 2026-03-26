/**
 * Bot Fleet Promoter — Triggers social media promotion through our 8 bot Workers.
 *
 * Generates platform-specific promotional content and posts through:
 * - X/Twitter (echo-x-bot)
 * - LinkedIn (echo-linkedin)
 * - Telegram (echo-telegram)
 * - Discord (echo-discord-bot via Shared Brain broadcast)
 * - Reddit (echo-reddit-bot)
 */

import type { ProductDefinition, PromotionResult, Env } from './types';
import { log } from './types';

interface PromotionContext {
  product: ProductDefinition;
  gumroadUrl: string | null;
  shopifyUrl: string | null;
  pageCount: number;
  chapterCount: number;
}

// ─── Content Templates ────────────────────────────────────────────────

function generateXPost(ctx: PromotionContext): string {
  const url = ctx.gumroadUrl || ctx.shopifyUrl || 'https://echo-ept.com';
  const templates = [
    `New expert guide: "${ctx.product.title}" — ${ctx.pageCount} pages of domain-specific intelligence backed by real doctrine blocks. Not generic AI content. Real expertise.\n\n$${ctx.product.priceUsd} ${url}`,
    `Just published: ${ctx.product.title}\n\n${ctx.product.subtitle}\n\nBuilt from 5,400+ intelligence engines. Every page backed by expert knowledge.\n\n${url}`,
    `${ctx.product.category} professionals: "${ctx.product.title}" is live. ${ctx.pageCount} pages, ${ctx.chapterCount} chapters of actionable expertise.\n\nNo fluff. No filler. Pure domain knowledge.\n\n$${ctx.product.priceUsd} ${url}`,
  ];
  const text = templates[Math.floor(Math.random() * templates.length)]!;
  return text.length > 280 ? text.slice(0, 277) + '...' : text;
}

function generateLinkedInPost(ctx: PromotionContext): string {
  const url = ctx.gumroadUrl || ctx.shopifyUrl || 'https://echo-ept.com';
  return `New Publication: ${ctx.product.title}

${ctx.product.subtitle}

${ctx.product.description.slice(0, 300)}

Key highlights:
- ${ctx.pageCount} pages of expert-level content
- ${ctx.chapterCount} in-depth chapters
- Real authority citations and references
- Built from specialized AI intelligence engines

This isn't generic AI-generated content. Every section is backed by doctrine blocks from our fleet of 5,400+ intelligence engines spanning 210+ professional domains.

$${ctx.product.priceUsd} — Available now: ${url}

#${ctx.product.tags.slice(0, 3).join(' #')}`;
}

function generateTelegramPost(ctx: PromotionContext): string {
  const url = ctx.gumroadUrl || ctx.shopifyUrl || 'https://echo-ept.com';
  return `*New Expert Guide Published*

*${ctx.product.title}*
_${ctx.product.subtitle}_

${ctx.product.description.slice(0, 200)}...

${ctx.pageCount} pages | ${ctx.chapterCount} chapters | $${ctx.product.priceUsd}

[Get it here](${url})`;
}

function generateRedditPost(ctx: PromotionContext): { title: string; body: string } {
  const url = ctx.gumroadUrl || ctx.shopifyUrl || 'https://echo-ept.com';
  return {
    title: `${ctx.product.title} — Expert guide built from AI intelligence engines`,
    body: `${ctx.product.description}

This guide was built by synthesizing knowledge from specialized AI intelligence engines — not just prompting a chatbot, but pulling from curated doctrine blocks with real authority citations and expert reasoning frameworks.

**What's inside:**
- ${ctx.pageCount} pages of focused content
- ${ctx.chapterCount} chapters covering key topics
- Real citations and authority references
- Practical, actionable frameworks

**Price:** $${ctx.product.priceUsd}

**Link:** ${url}

Built by Echo Prime Technologies (echo-ept.com) — 5,400+ intelligence engines, 619,000+ doctrine blocks.`,
  };
}

// ─── Post to Platforms ────────────────────────────────────────────────

async function postToXBot(ctx: PromotionContext, env: Env): Promise<PromotionResult> {
  try {
    const content = generateXPost(ctx);
    const resp = await fetch('https://echo-x-bot.bmcii1976.workers.dev/api/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Echo-API-Key': env.ECHO_API_KEY },
      body: JSON.stringify({ content, category: 'product' }),
    });
    const data: any = await resp.json();
    return { platform: 'x', success: resp.ok, postId: data.tweet_id || data.id };
  } catch (err) {
    return { platform: 'x', success: false, error: String(err) };
  }
}

async function postToLinkedIn(ctx: PromotionContext, env: Env): Promise<PromotionResult> {
  try {
    const content = generateLinkedInPost(ctx);
    const resp = await fetch('https://echo-linkedin.bmcii1976.workers.dev/api/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Echo-API-Key': env.ECHO_API_KEY },
      body: JSON.stringify({ content, category: 'product' }),
    });
    return { platform: 'linkedin', success: resp.ok };
  } catch (err) {
    return { platform: 'linkedin', success: false, error: String(err) };
  }
}

async function postToTelegram(ctx: PromotionContext, env: Env): Promise<PromotionResult> {
  try {
    const content = generateTelegramPost(ctx);
    const resp = await fetch('https://echo-telegram.bmcii1976.workers.dev/api/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Echo-API-Key': env.ECHO_API_KEY },
      body: JSON.stringify({ content, parse_mode: 'Markdown' }),
    });
    return { platform: 'telegram', success: resp.ok };
  } catch (err) {
    return { platform: 'telegram', success: false, error: String(err) };
  }
}

async function postToReddit(ctx: PromotionContext, env: Env): Promise<PromotionResult> {
  try {
    const { title, body } = generateRedditPost(ctx);
    const resp = await fetch('https://echo-reddit-bot.bmcii1976.workers.dev/api/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Echo-API-Key': env.ECHO_API_KEY },
      body: JSON.stringify({ title, content: body, category: 'product' }),
    });
    return { platform: 'reddit', success: resp.ok };
  } catch (err) {
    return { platform: 'reddit', success: false, error: String(err) };
  }
}

async function postToMoltBook(ctx: PromotionContext, env: Env): Promise<PromotionResult> {
  try {
    const url = ctx.gumroadUrl || ctx.shopifyUrl || 'echo-ept.com';
    const resp = await env.SWARM_BRAIN.fetch('https://swarm/moltbook/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author_id: 'revenue-engine',
        author_name: 'Revenue Engine',
        author_type: 'agent',
        content: `REVENUE ENGINE: New product published — "${ctx.product.title}" ($${ctx.product.priceUsd}). ${ctx.pageCount} pages, ${ctx.chapterCount} chapters. Listed on ${ctx.gumroadUrl ? 'Gumroad' : ''}${ctx.shopifyUrl ? ' + Shopify' : ''}. ${url}`,
        mood: 'celebrating',
        tags: ['revenue', 'product', 'launch', ...ctx.product.tags.slice(0, 3)],
      }),
    });
    return { platform: 'moltbook', success: resp.ok };
  } catch (err) {
    return { platform: 'moltbook', success: false, error: String(err) };
  }
}

// ─── Main Promotion Function ──────────────────────────────────────────

export async function promoteProduct(
  product: ProductDefinition,
  gumroadUrl: string | null,
  shopifyUrl: string | null,
  pageCount: number,
  chapterCount: number,
  env: Env,
): Promise<PromotionResult[]> {
  const ctx: PromotionContext = { product, gumroadUrl, shopifyUrl, pageCount, chapterCount };

  log('info', 'Starting product promotion', { productId: product.id, platforms: ['x', 'linkedin', 'telegram', 'reddit', 'moltbook'] });

  // Promote on all platforms in parallel
  const results = await Promise.allSettled([
    postToXBot(ctx, env),
    postToLinkedIn(ctx, env),
    postToTelegram(ctx, env),
    postToReddit(ctx, env),
    postToMoltBook(ctx, env),
  ]);

  const promotionResults: PromotionResult[] = results.map(r =>
    r.status === 'fulfilled' ? r.value : { platform: 'unknown', success: false, error: String((r as PromiseRejectedResult).reason) },
  );

  const successCount = promotionResults.filter(r => r.success).length;
  log('info', 'Promotion complete', { productId: product.id, successCount, totalPlatforms: promotionResults.length });

  return promotionResults;
}
