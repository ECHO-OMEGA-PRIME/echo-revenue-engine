# Echo Revenue Engine

**Autonomous Revenue Generation Pipeline v1.0.0**

Cloudflare Worker that autonomously generates digital products from 619K+ engine doctrines, lists them on Gumroad and Shopify, promotes via the bot fleet, and tracks revenue. Runs on cron schedules to continuously produce and sell domain-expert PDF guides.

## Features

- **8-Step Revenue Pipeline** -- End-to-end automation from doctrine selection to product listing to promotion:
  1. Select engine domain and matching doctrine blocks
  2. Generate multi-chapter PDF from real doctrine content (via `pdf-lib`)
  3. Upload PDF to R2 storage
  4. Generate cover art via Grok/xAI Aurora image API
  5. Insert product record into D1
  6. List on Gumroad (digital product with attached PDF)
  7. List on Shopify (Admin API, digital product with cover image)
  8. Promote via bot fleet (X, LinkedIn, Telegram, Reddit) through Swarm Brain
- **PDF Generation** -- Builds structured PDF documents with cover page, table of contents, and chapters derived from engine doctrine blocks with professional formatting
- **Cover Art Generation** -- Creates product cover images using xAI Grok image generation API
- **Gumroad Integration** -- Creates digital products with pricing, description, tags, and attached PDF file via Gumroad API
- **Shopify Integration** -- Creates products via Shopify Admin API with images, variants, and inventory tracking
- **Bot Fleet Promotion** -- Distributes promotional content across social media bots via Swarm Brain service binding
- **Product Catalog** -- Pre-defined product templates mapping engine domains to sellable PDF guides across tax, oil & gas, legal, cybersecurity, and other domains
- **Revenue Tracking** -- Stores generation stats, product records, and revenue metrics in D1
- **Shared Brain Reporting** -- Reports product launches and revenue snapshots to the Shared Brain for cross-system visibility
- **Public Catalog Endpoint** -- Unauthenticated `/catalog` endpoint for displaying available products on websites

## Product Catalog

| Product | Price | Pages | Domain |
|---------|-------|-------|--------|
| Tax Optimization Strategies 2026 | $29.99 | 80 | Tax |
| IRC 1031 Exchange Mastery | $19.99 | 45 | Tax |
| Business Entity Tax Guide | $24.99 | 60 | Tax |
| Oilfield Operations Handbook | $34.99 | 90 | Oil & Gas |
| Cybersecurity Defense Playbook | $29.99 | 70 | Cybersecurity |
| Legal Compliance Guide | $24.99 | 55 | Legal |

*Additional products defined in `src/product-catalog.ts`.*

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | No | Health check with version and stats |
| `GET` | `/catalog` | No | Public product catalog for website display |
| `GET` | `/stats` | Yes | Revenue statistics and generation metrics |
| `GET` | `/products` | Yes | List all generated products |
| `GET` | `/products/:id` | Yes | Get specific product details |
| `POST` | `/generate` | Yes | Trigger product generation for a specific domain |
| `POST` | `/generate/next` | Yes | Generate the next product from the catalog queue |

## Configuration

### Bindings

| Type | Binding | Resource |
|------|---------|----------|
| D1 | `DB` | `echo-revenue-engine` |
| KV | `CACHE` | Product cache, generation state |
| R2 | `PRODUCTS` | `echo-prime-products` (PDF and cover art storage) |
| Service | `ECHO_CHAT` | `echo-chat` |
| Service | `SHARED_BRAIN` | `echo-shared-brain` |
| Service | `ENGINE_RUNTIME` | `echo-engine-runtime` |
| Service | `KNOWLEDGE` | `echo-knowledge-forge` |
| Service | `SWARM` | `echo-swarm-brain` |

### Secrets

| Name | Description |
|------|-------------|
| `ECHO_API_KEY` | Echo Prime API key |
| `XAI_API_KEY` | xAI Grok API key for cover art generation |
| `GUMROAD_ACCESS_TOKEN` | Gumroad API access token |
| `SHOPIFY_ADMIN_TOKEN` | Shopify Admin API token |
| `SHOPIFY_STORE_DOMAIN` | Shopify store domain (e.g., `store.myshopify.com`) |

### Cron Triggers

| Schedule | Description |
|----------|-------------|
| `0 6 * * 1` | Weekly product generation (Monday 6am UTC) |
| `0 14 * * 3` | Mid-week promotion push (Wednesday 2pm UTC) |
| `0 10 1 * *` | Monthly product launch (1st of month 10am UTC) |
| `0 18 * * 5` | Revenue snapshot and weekend promotion (Friday 6pm UTC) |

## Deployment

```bash
cd WORKERS/echo-revenue-engine
npx wrangler deploy
```

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Language**: TypeScript
- **Framework**: Hono
- **Database**: Cloudflare D1
- **Cache**: Cloudflare KV
- **Storage**: Cloudflare R2
- **PDF**: pdf-lib
- **AI**: xAI Grok (cover art generation)
- **Marketplaces**: Gumroad API, Shopify Admin API
- **Source**: `src/index.ts` (901 lines), `src/types.ts` (163 lines), `src/product-catalog.ts`
