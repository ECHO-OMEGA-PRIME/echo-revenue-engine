/**
 * Echo Revenue Engine — Type Definitions
 */

// ─── Cloudflare Bindings ──────────────────────────────────────────────

export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  PRODUCTS: R2Bucket;
  AI: Ai;
  ENGINE_RUNTIME: Fetcher;
  ECHO_CHAT: Fetcher;
  SHARED_BRAIN: Fetcher;
  SWARM_BRAIN: Fetcher;
  KNOWLEDGE_FORGE: Fetcher;

  // Secrets
  ECHO_API_KEY: string;
  XAI_API_KEY: string;
  GUMROAD_ACCESS_TOKEN: string;
  SHOPIFY_ADMIN_TOKEN: string;
  SHOPIFY_STORE_DOMAIN: string;
  ENVIRONMENT: string;
  VERSION: string;
}

// ─── Product Catalog ──────────────────────────────────────────────────

export interface ProductDefinition {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  domain: string;
  enginePrefixes: string[];
  keywords: string[];
  priceUsd: number;
  pageTarget: number;
  category: string;
  tags: string[];
}

export interface GeneratedProduct {
  id: string;
  definitionId: string;
  title: string;
  pdfR2Key: string;
  coverR2Key: string;
  pdfSizeBytes: number;
  pageCount: number;
  gumroadProductId: string | null;
  gumroadUrl: string | null;
  shopifyProductId: string | null;
  shopifyUrl: string | null;
  eptUrl: string | null;
  status: 'generating' | 'generated' | 'listed' | 'promoted' | 'failed';
  salesCount: number;
  revenueUsd: number;
  createdAt: string;
  listedAt: string | null;
  promotedAt: string | null;
}

// ─── Doctrine Blocks ──────────────────────────────────────────────────

export interface DoctrineBlock {
  topic: string;
  keywords: string[];
  conclusion: string;
  reasoning: string;
  authority: string[];
  confidence: number;
  engineId: string;
}

// ─── PDF Generation ───────────────────────────────────────────────────

export interface PdfChapter {
  title: string;
  content: string;
  doctrineCount: number;
}

export interface PdfResult {
  pdfBytes: Uint8Array;
  pageCount: number;
  chapterCount: number;
  wordCount: number;
}

// ─── Cover Art ────────────────────────────────────────────────────────

export interface CoverArtResult {
  imageBytes: Uint8Array;
  contentType: string;
  prompt: string;
}

// ─── Gumroad ──────────────────────────────────────────────────────────

export interface GumroadProduct {
  id: string;
  name: string;
  url: string;
  short_url: string;
  price: number;
  published: boolean;
}

export interface GumroadListResult {
  productId: string;
  url: string;
  shortUrl: string;
}

// ─── Shopify ──────────────────────────────────────────────────────────

export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  status: string;
  variants: { id: number; price: string }[];
}

export interface ShopifyListResult {
  productId: number;
  handle: string;
  url: string;
}

// ─── Promotion ────────────────────────────────────────────────────────

export interface PromotionResult {
  platform: string;
  success: boolean;
  postId?: string;
  error?: string;
}

// ─── Analytics ────────────────────────────────────────────────────────

export interface RevenueStats {
  totalProducts: number;
  totalSales: number;
  totalRevenueUsd: number;
  productsByStatus: Record<string, number>;
  topProducts: { title: string; sales: number; revenue: number }[];
  last30DaysRevenue: number;
}

// ─── Logging ──────────────────────────────────────────────────────────

export function log(level: string, message: string, data?: Record<string, unknown>): void {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    level,
    component: 'echo-revenue-engine',
    message,
    ...data,
  }));
}
