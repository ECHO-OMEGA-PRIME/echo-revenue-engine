/**
 * Product Catalog — Maps engine domains to sellable digital products.
 *
 * Each product definition pulls doctrine blocks from specific engine prefixes,
 * synthesizes them into expert-level content, and packages as a premium PDF.
 */

import type { ProductDefinition } from './types';

export const PRODUCT_CATALOG: ProductDefinition[] = [
  // ─── Tax & Finance ────────────────────────────────────────────────
  {
    id: 'tax-optimization-2026',
    title: 'The Complete Tax Optimization Guide 2026',
    subtitle: 'Expert Strategies for Individuals & Businesses',
    description: 'Comprehensive tax optimization strategies covering deductions, credits, entity structuring, retirement planning, and advanced techniques. Built from 14 specialized tax intelligence engines with real IRC authority citations.',
    domain: 'tax',
    enginePrefixes: ['TX', 'TAX'],
    keywords: ['tax optimization', 'deductions', 'credits', 'IRC', 'entity structuring', 'depreciation', 'MACRS'],
    priceUsd: 29.99,
    pageTarget: 80,
    category: 'Finance & Tax',
    tags: ['tax', 'finance', 'business', 'deductions', '2026'],
  },
  {
    id: 'irc-1031-exchange-mastery',
    title: 'IRC Section 1031 Exchange Mastery',
    subtitle: 'Like-Kind Exchanges for Real Estate Investors',
    description: 'Deep-dive into 1031 exchanges: qualification rules, timelines, reverse exchanges, construction exchanges, and case law analysis. Expert-level guidance backed by IRC citations and precedent.',
    domain: 'tax',
    enginePrefixes: ['TX', 'TAX', 'RE'],
    keywords: ['1031 exchange', 'like-kind', 'real estate', 'tax deferral', 'qualified intermediary'],
    priceUsd: 19.99,
    pageTarget: 45,
    category: 'Finance & Tax',
    tags: ['tax', 'real estate', '1031', 'exchange', 'investment'],
  },
  {
    id: 'business-entity-tax-guide',
    title: 'Business Entity Tax Structure Guide',
    subtitle: 'LLC, S-Corp, C-Corp, Partnership — Which Structure Saves You the Most?',
    description: 'Complete analysis of business entity tax implications. Self-employment tax strategies, qualified business income deduction, reasonable compensation, and entity conversion planning.',
    domain: 'tax',
    enginePrefixes: ['TX', 'TAX', 'BUS'],
    keywords: ['LLC', 'S-Corp', 'C-Corp', 'partnership', 'entity selection', 'QBI', 'self-employment tax'],
    priceUsd: 24.99,
    pageTarget: 60,
    category: 'Finance & Tax',
    tags: ['tax', 'business', 'LLC', 'corporation', 'entity'],
  },

  // ─── Oil & Gas ────────────────────────────────────────────────────
  {
    id: 'oilfield-operations-handbook',
    title: 'The Oilfield Operations Handbook',
    subtitle: '30 Years of Drilling, Completions & Production Knowledge',
    description: 'Expert operational knowledge from drilling to production. Covers rig operations, completion techniques, production optimization, equipment maintenance, safety protocols, and regulatory compliance.',
    domain: 'oilfield',
    enginePrefixes: ['DRL', 'FRAC', 'PROD', 'OFE', 'WELL'],
    keywords: ['drilling', 'completions', 'production', 'oilfield', 'rig operations', 'well intervention'],
    priceUsd: 39.99,
    pageTarget: 120,
    category: 'Oil & Gas',
    tags: ['oilfield', 'drilling', 'production', 'petroleum', 'engineering'],
  },
  {
    id: 'mineral-rights-analysis',
    title: 'Mineral Rights & Royalty Analysis Guide',
    subtitle: 'Title Examination, Lease Analysis & Royalty Calculations',
    description: 'Complete mineral rights guide: chain of title examination, lease interpretation, royalty calculation methodologies, pooling & unitization, and common title defects with resolution strategies.',
    domain: 'landman',
    enginePrefixes: ['LM', 'LAND'],
    keywords: ['mineral rights', 'royalties', 'title examination', 'lease analysis', 'chain of title', 'pooling'],
    priceUsd: 34.99,
    pageTarget: 90,
    category: 'Oil & Gas',
    tags: ['mineral rights', 'royalties', 'landman', 'title', 'lease'],
  },

  // ─── Legal ────────────────────────────────────────────────────────
  {
    id: 'contract-analysis-masterclass',
    title: 'Contract Analysis Masterclass',
    subtitle: 'Identify Risks, Negotiate Better, Protect Your Interests',
    description: 'Expert contract analysis methodology: clause identification, risk scoring, common pitfalls, negotiation strategies, and industry-specific contract patterns.',
    domain: 'legal',
    enginePrefixes: ['LG', 'LAW', 'LEGAL'],
    keywords: ['contract analysis', 'risk assessment', 'negotiation', 'legal review', 'clause analysis'],
    priceUsd: 24.99,
    pageTarget: 65,
    category: 'Legal',
    tags: ['legal', 'contracts', 'risk', 'negotiation', 'business'],
  },
  {
    id: 'regulatory-compliance-handbook',
    title: 'Regulatory Compliance Handbook',
    subtitle: 'Navigate Federal & State Regulations with Confidence',
    description: 'Comprehensive regulatory compliance guide covering OSHA, EPA, SEC, FINRA, HIPAA, and state-specific requirements. Risk-based approach with practical implementation checklists.',
    domain: 'legal',
    enginePrefixes: ['LG', 'LAW', 'REG', 'COMP'],
    keywords: ['compliance', 'regulatory', 'OSHA', 'EPA', 'HIPAA', 'SEC', 'risk management'],
    priceUsd: 29.99,
    pageTarget: 75,
    category: 'Legal',
    tags: ['legal', 'compliance', 'regulatory', 'risk', 'business'],
  },

  // ─── Cybersecurity ────────────────────────────────────────────────
  {
    id: 'cybersecurity-defense-playbook',
    title: 'The Cybersecurity Defense Playbook',
    subtitle: 'Threat Detection, Incident Response & Hardening Strategies',
    description: 'Practical cybersecurity guide: threat modeling, vulnerability assessment, incident response procedures, network hardening, endpoint protection, and SIEM/SOC operations.',
    domain: 'security',
    enginePrefixes: ['SEC', 'CYB', 'CYBER'],
    keywords: ['cybersecurity', 'threat detection', 'incident response', 'penetration testing', 'network security'],
    priceUsd: 34.99,
    pageTarget: 85,
    category: 'Technology',
    tags: ['cybersecurity', 'security', 'threat', 'defense', 'hacking'],
  },
  {
    id: 'pentesting-methodology',
    title: 'Penetration Testing Methodology Guide',
    subtitle: 'Professional Pentesting from Reconnaissance to Reporting',
    description: 'Complete penetration testing methodology: reconnaissance, scanning, exploitation, privilege escalation, lateral movement, and professional reporting. Covers OWASP Top 10, network, and web application testing.',
    domain: 'security',
    enginePrefixes: ['SEC', 'CYB', 'PENT'],
    keywords: ['penetration testing', 'OWASP', 'web security', 'exploitation', 'reconnaissance', 'vulnerability'],
    priceUsd: 29.99,
    pageTarget: 70,
    category: 'Technology',
    tags: ['pentesting', 'hacking', 'security', 'OWASP', 'ethical hacking'],
  },

  // ─── AI & Technology ──────────────────────────────────────────────
  {
    id: 'building-ai-systems',
    title: 'Building Production AI Systems',
    subtitle: 'From Fine-Tuning to Deployment — A Practitioner\'s Guide',
    description: 'Practical guide to building production AI: model selection, fine-tuning (LoRA/QLoRA), dataset preparation, inference optimization, edge deployment, monitoring, and cost management.',
    domain: 'ai',
    enginePrefixes: ['AI', 'ML', 'AIML'],
    keywords: ['AI', 'machine learning', 'fine-tuning', 'LoRA', 'deployment', 'inference', 'LLM'],
    priceUsd: 29.99,
    pageTarget: 75,
    category: 'Technology',
    tags: ['AI', 'machine learning', 'LLM', 'deployment', 'fine-tuning'],
  },
  {
    id: 'autonomous-agent-architecture',
    title: 'Autonomous AI Agent Architecture',
    subtitle: 'Design Multi-Agent Systems That Think, Act & Learn',
    description: 'Architecture guide for autonomous AI agents: multi-agent coordination, tool use, memory systems, planning loops, self-improvement, and production deployment patterns.',
    domain: 'ai',
    enginePrefixes: ['AI', 'AGI', 'AGENT'],
    keywords: ['AI agents', 'autonomous', 'multi-agent', 'orchestration', 'tool use', 'memory systems'],
    priceUsd: 24.99,
    pageTarget: 60,
    category: 'Technology',
    tags: ['AI', 'agents', 'autonomous', 'architecture', 'multi-agent'],
  },
  {
    id: 'cloudflare-workers-mastery',
    title: 'Cloudflare Workers Mastery',
    subtitle: 'Build & Deploy Edge Applications at Global Scale',
    description: 'Complete Cloudflare Workers guide: D1 databases, R2 storage, KV namespaces, Vectorize, Durable Objects, service bindings, cron triggers, and production deployment patterns.',
    domain: 'cloud',
    enginePrefixes: ['CF', 'CLOUD', 'WORK'],
    keywords: ['Cloudflare', 'Workers', 'edge computing', 'D1', 'R2', 'KV', 'serverless'],
    priceUsd: 24.99,
    pageTarget: 65,
    category: 'Technology',
    tags: ['Cloudflare', 'Workers', 'serverless', 'edge', 'deployment'],
  },

  // ─── Real Estate ──────────────────────────────────────────────────
  {
    id: 'real-estate-investment-analysis',
    title: 'Real Estate Investment Analysis Guide',
    subtitle: 'Due Diligence, Valuation & Deal Structuring',
    description: 'Expert real estate investment analysis: property valuation methods, cap rate analysis, cash flow modeling, due diligence checklists, deal structuring, and 1031 exchange strategies.',
    domain: 'real_estate',
    enginePrefixes: ['RE', 'REAL'],
    keywords: ['real estate', 'investment', 'valuation', 'cap rate', 'due diligence', 'deal structuring'],
    priceUsd: 29.99,
    pageTarget: 70,
    category: 'Real Estate',
    tags: ['real estate', 'investment', 'analysis', 'valuation', 'property'],
  },

  // ─── Medical ──────────────────────────────────────────────────────
  {
    id: 'clinical-decision-support',
    title: 'Clinical Decision Support Systems Guide',
    subtitle: 'Evidence-Based Diagnostic & Treatment Protocols',
    description: 'Comprehensive clinical decision support: diagnostic algorithms, treatment protocols, drug interaction analysis, differential diagnosis methodology, and evidence-based medicine integration.',
    domain: 'medical',
    enginePrefixes: ['MED', 'CLIN', 'HEALTH'],
    keywords: ['clinical', 'diagnosis', 'treatment', 'medical', 'evidence-based', 'protocols'],
    priceUsd: 39.99,
    pageTarget: 90,
    category: 'Healthcare',
    tags: ['medical', 'clinical', 'healthcare', 'diagnosis', 'treatment'],
  },

  // ─── Engineering ──────────────────────────────────────────────────
  {
    id: 'mechanical-engineering-principles',
    title: 'Mechanical Engineering Design Principles',
    subtitle: 'Stress Analysis, Material Selection & Manufacturing',
    description: 'Expert mechanical engineering reference: stress analysis, fatigue calculations, material selection, manufacturing processes (CNC, 3D printing, injection molding), thermal analysis, and tolerance design.',
    domain: 'engineering',
    enginePrefixes: ['MECH', 'ENG', 'MFG'],
    keywords: ['mechanical engineering', 'stress analysis', 'material science', 'CNC', 'manufacturing', 'design'],
    priceUsd: 34.99,
    pageTarget: 85,
    category: 'Engineering',
    tags: ['engineering', 'mechanical', 'manufacturing', 'design', 'materials'],
  },

  // ─── Cryptocurrency ───────────────────────────────────────────────
  {
    id: 'defi-crypto-analysis',
    title: 'DeFi & Cryptocurrency Analysis Guide',
    subtitle: 'On-Chain Analysis, Smart Money Tracking & Strategy',
    description: 'Complete cryptocurrency analysis: on-chain metrics, smart money tracking, DeFi protocol evaluation, yield farming strategies, risk assessment, tokenomics analysis, and market psychology.',
    domain: 'crypto',
    enginePrefixes: ['CRYPTO', 'DEFI', 'BLOCK'],
    keywords: ['cryptocurrency', 'DeFi', 'blockchain', 'on-chain', 'smart money', 'yield farming'],
    priceUsd: 24.99,
    pageTarget: 60,
    category: 'Finance & Tax',
    tags: ['crypto', 'DeFi', 'blockchain', 'trading', 'analysis'],
  },
];

/**
 * Get products by category.
 */
export function getProductsByCategory(category: string): ProductDefinition[] {
  return PRODUCT_CATALOG.filter(p => p.category === category);
}

/**
 * Get a product definition by ID.
 */
export function getProductById(id: string): ProductDefinition | undefined {
  return PRODUCT_CATALOG.find(p => p.id === id);
}

/**
 * Get all unique categories.
 */
export function getCategories(): string[] {
  return [...new Set(PRODUCT_CATALOG.map(p => p.category))];
}

/**
 * Select the next product to generate based on what hasn't been generated yet.
 */
export function selectNextProduct(generatedIds: Set<string>): ProductDefinition | null {
  for (const product of PRODUCT_CATALOG) {
    if (!generatedIds.has(product.id)) {
      return product;
    }
  }
  return null;
}
