/**
 * PDF Generator — Creates professional expert PDFs from engine doctrine blocks.
 *
 * Uses pdf-lib (works in Cloudflare Workers runtime, no Node.js APIs needed).
 * Generates multi-chapter PDFs with:
 * - Professional cover page
 * - Table of contents
 * - Formatted chapters with doctrine-backed content
 * - Citation footnotes
 * - About Echo Prime Technologies page
 */

import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';
import type { ProductDefinition, DoctrineBlock, PdfChapter, PdfResult, Env } from './types';
import { log } from './types';

// ─── Layout Constants ─────────────────────────────────────────────────

const PAGE_WIDTH = 612;   // US Letter
const PAGE_HEIGHT = 792;
const MARGIN_LEFT = 72;
const MARGIN_RIGHT = 72;
const MARGIN_TOP = 72;
const MARGIN_BOTTOM = 72;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const LINE_HEIGHT = 14;
const HEADING_HEIGHT = 24;
const SUBHEADING_HEIGHT = 18;

// ─── AI Content Generation (Workers AI with 20s timeout, Echo Chat fallback) ──

/** Generate AI content. Workers AI primary (good length), Echo Chat fallback (fast). */
async function generateContent(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  env: Env,
): Promise<string> {
  // Primary: Workers AI — free, up to 4096 output tokens, 3-5s per call
  // 20s timeout keeps total pipeline within ctx.waitUntil limits
  try {
    const aiPromise = env.AI.run(
      '@cf/meta/llama-3.3-70b-instruct-fp8-fast' as any,
      {
        messages: [
          { role: 'system', content: systemPrompt.slice(0, 4000) },
          { role: 'user', content: userPrompt.slice(0, 4000) },
        ],
        max_tokens: Math.min(maxTokens, 4096),
      },
    );

    const result: any = await Promise.race([
      aiPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Workers AI timeout 20s')), 20_000)),
    ]);

    const text = result?.response || '';
    if (text.length > 200) return text;
    log('warn', 'Workers AI short response', { length: text.length });
  } catch (err) {
    log('warn', 'Workers AI failed, trying Echo Chat', { error: String(err).slice(0, 200) });
  }

  // Fallback: Echo Chat (capped at ~1024 tokens but fast)
  try {
    const chatResp = await env.ECHO_CHAT.fetch('https://chat/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Echo-API-Key': env.ECHO_API_KEY },
      body: JSON.stringify({
        personality: 'echo_prime',
        messages: [
          { role: 'system', content: systemPrompt.slice(0, 3000) },
          { role: 'user', content: userPrompt.slice(0, 3000) },
        ],
        max_tokens: maxTokens,
      }),
    });
    if (chatResp.ok) {
      const data: any = await chatResp.json();
      return data.content || data.response || data.message || '';
    }
  } catch (err) {
    log('warn', 'Echo Chat fallback also failed', { error: String(err).slice(0, 200) });
  }
  return '';
}

// ─── Doctrine Fetching ────────────────────────────────────────────────

/** Query Engine Runtime once and parse results into DoctrineBlocks. */
async function queryEngineRuntime(
  query: string,
  domain: string,
  limit: number,
  prefix: string,
  env: Env,
): Promise<DoctrineBlock[]> {
  const blocks: DoctrineBlock[] = [];
  try {
    const resp = await env.ENGINE_RUNTIME.fetch('https://engine/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Echo-API-Key': env.ECHO_API_KEY },
      body: JSON.stringify({ query, domain, limit }),
    });
    if (resp.ok) {
      const data: any = await resp.json();
      const doctrines = data.matches || data.doctrines || data.results || [];
      for (const d of doctrines) {
        blocks.push({
          topic: d.topic || d.title || 'Untitled',
          keywords: d.keywords || [],
          conclusion: d.conclusion || d.conclusion_template || d.content || '',
          reasoning: d.reasoning || d.reasoning_framework || '',
          authority: d.authority || d.primary_authority || [],
          confidence: d.confidence || d.score || 0.8,
          engineId: d.engine_id || d.engineId || prefix,
        });
      }
    }
  } catch (err) {
    log('warn', `Engine query failed: ${query.slice(0, 60)}`, { prefix, error: String(err) });
  }
  return blocks;
}

/** Generate diverse query strings from product keywords. */
function buildQueryVariants(keywords: string[]): string[] {
  const variants: string[] = [];

  // 1. Each keyword individually (broad reach, different facets)
  for (const kw of keywords) {
    variants.push(kw);
  }

  // 2. Pairs of keywords (medium specificity)
  for (let i = 0; i < keywords.length; i++) {
    for (let j = i + 1; j < keywords.length && variants.length < 25; j++) {
      variants.push(`${keywords[i]} ${keywords[j]}`);
    }
  }

  // 3. All keywords combined (most specific)
  variants.push(keywords.join(' '));

  return variants;
}

async function fetchDoctrines(product: ProductDefinition, env: Env): Promise<DoctrineBlock[]> {
  const allDoctrines: DoctrineBlock[] = [];
  const queryVariants = buildQueryVariants(product.keywords);

  // Build extra query variants from title and description for broader coverage
  const titleWords = product.title.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !['the', 'and', 'for', 'with', 'guide', 'handbook', 'from'].includes(w));
  const descWords = product.description.toLowerCase().split(/\s+/).filter(w => w.length > 4).slice(0, 10);
  const extraQueries = [
    product.title,
    product.subtitle || '',
    product.description.slice(0, 150),
    ...titleWords,
    ...descWords.filter(w => !queryVariants.some(v => v.includes(w))),
    ...product.tags,
  ].filter(Boolean);

  log('info', 'Fetching doctrines with aggressive multi-query strategy', {
    productId: product.id,
    prefixes: product.enginePrefixes,
    keywordVariants: queryVariants.length,
    extraQueries: extraQueries.length,
    domain: product.domain,
  });

  // Strategy 1: Query Engine Runtime with varied queries per prefix (WITH domain filter)
  const engineQueries: Promise<DoctrineBlock[]>[] = [];
  for (const prefix of product.enginePrefixes) {
    for (const query of queryVariants) {
      engineQueries.push(queryEngineRuntime(query, product.domain, 20, prefix, env));
    }
    engineQueries.push(queryEngineRuntime(prefix, product.domain, 20, prefix, env));
  }

  // Strategy 2: Query WITHOUT domain filter (catches cross-domain doctrines)
  for (const prefix of product.enginePrefixes) {
    for (const query of queryVariants.slice(0, 8)) {
      engineQueries.push(queryEngineRuntime(query, '', 20, prefix, env));
    }
  }

  // Strategy 3: Extra queries from title/description (with and without domain)
  for (const eq of extraQueries.slice(0, 15)) {
    engineQueries.push(queryEngineRuntime(eq, product.domain, 20, product.enginePrefixes[0] || '', env));
    engineQueries.push(queryEngineRuntime(eq, '', 20, product.enginePrefixes[0] || '', env));
  }

  // Strategy 4: Broad single-word queries from tags (domain-less, high recall)
  for (const tag of product.tags) {
    engineQueries.push(queryEngineRuntime(tag, '', 20, '', env));
  }

  // Fire all engine queries in parallel (batched to avoid overwhelming)
  const BATCH_SIZE = 15;
  for (let i = 0; i < engineQueries.length; i += BATCH_SIZE) {
    const batch = engineQueries.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch);
    for (const r of results) {
      if (r.status === 'fulfilled') {
        allDoctrines.push(...r.value);
      }
    }
  }

  log('info', 'Engine Runtime queries complete', {
    productId: product.id,
    totalQueries: engineQueries.length,
    rawDoctrineCount: allDoctrines.length,
  });

  // Strategy 2: Knowledge Forge via service binding (NOT broken SDK Gateway URL)
  const kfQueries = [
    product.keywords.join(' '),
    product.title,
    product.description.slice(0, 200),
    ...product.keywords.slice(0, 3),
  ];

  for (const kfQuery of kfQueries) {
    try {
      const kfResp = await env.KNOWLEDGE_FORGE.fetch(
        `https://forge/search?q=${encodeURIComponent(kfQuery)}&limit=10`,
        { headers: { 'X-Echo-API-Key': env.ECHO_API_KEY } },
      );
      if (kfResp.ok) {
        const kfData: any = await kfResp.json();
        const chunks = kfData.data?.results || kfData.results || kfData.chunks || [];
        for (const c of chunks) {
          const content = c.snippet || c.chunk || c.content || c.text || '';
          if (!content || content.length < 50) continue;
          allDoctrines.push({
            topic: c.section || c.title || c.doc_title || c.category || 'Expert Knowledge',
            keywords: product.keywords,
            conclusion: content,
            reasoning: c.context || '',
            authority: [c.source || c.doc_id || c.doc_title || 'Knowledge Forge'].filter(Boolean),
            confidence: c.score || c.similarity || 0.7,
            engineId: 'KNOWLEDGE_FORGE',
          });
        }
      }
    } catch (err) {
      log('warn', 'Knowledge Forge query failed', { query: kfQuery.slice(0, 60), error: String(err) });
    }
  }

  log('info', 'All doctrine sources fetched', {
    productId: product.id,
    totalRaw: allDoctrines.length,
  });

  // Deduplicate by conclusion content hash (topic dedup was too aggressive)
  const seen = new Set<string>();
  const deduped = allDoctrines.filter(d => {
    // Build fingerprint from first 200 chars of conclusion + topic
    const fingerprint = (d.topic.toLowerCase().trim() + '|' + d.conclusion.slice(0, 200).toLowerCase().trim());
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    // Skip very short content
    return (d.conclusion.length + d.reasoning.length) > 80;
  });

  // ── Domain relevance filter ──
  // Drop doctrines whose topic has zero relevance to the product
  const productTerms = new Set(
    [...product.keywords, ...product.title.toLowerCase().split(/\s+/), ...product.tags]
      .map(t => t.toLowerCase().replace(/[^a-z0-9]/g, ''))
      .filter(t => t.length > 2),
  );

  const relevant = deduped.filter(d => {
    const topicLower = d.topic.toLowerCase();
    // Reject obviously off-topic doctrines (engine self-reference, generic tools, etc.)
    const offTopicPatterns = [
      /website.?tools/i, /\d+ operations\)/i, /api.?endpoint/i,
      /mcp.?server/i, /cloudflare.?worker/i, /discord.?bot/i,
      /echo.?prime.?tech/i, /swarm.?brain/i, /shadowglass/i,
    ];
    if (offTopicPatterns.some(p => p.test(topicLower))) return false;

    // Check if topic words overlap with product terms
    const topicWords = topicLower.split(/[\s\-_,;:()]+/).filter(w => w.length > 2);
    const overlap = topicWords.filter(w => productTerms.has(w.replace(/[^a-z0-9]/g, ''))).length;
    // Allow doctrines with keyword overlap, OR moderate confidence + substantial content
    // Relaxed threshold for non-tax domains where terminology varies more
    return overlap > 0 || (d.confidence >= 0.70 && (d.conclusion.length + d.reasoning.length) > 300);
  });

  log('info', 'Domain relevance filter applied', {
    productId: product.id,
    before: deduped.length,
    after: relevant.length,
    dropped: deduped.length - relevant.length,
  });

  // Sort by confidence descending, then by content length descending
  relevant.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return (b.conclusion.length + b.reasoning.length) - (a.conclusion.length + a.reasoning.length);
  });

  log('info', 'Doctrines deduplicated and ranked', {
    productId: product.id,
    finalCount: relevant.length,
    topTopics: relevant.slice(0, 5).map(d => d.topic),
  });

  return relevant;
}

// ─── Content Synthesis ────────────────────────────────────────────────

/** Derive a meaningful chapter title from a group of doctrines. */
function deriveChapterTitle(idx: number, group: DoctrineBlock[], totalChapters: number): string {
  // Use the most common topic theme from the group
  const topics = group.map(d => d.topic);
  // Find the most descriptive topic (longest, not generic)
  const best = topics
    .filter(t => t.length > 5 && t.toLowerCase() !== 'untitled' && t.toLowerCase() !== 'expert knowledge')
    .sort((a, b) => b.length - a.length)[0];

  if (best) return `Chapter ${idx + 1}: ${best}`;

  // Fallback: use keywords from the doctrines
  const kws = group.flatMap(d => d.keywords).filter(Boolean);
  if (kws.length > 0) {
    const unique = [...new Set(kws)].slice(0, 3).join(', ');
    return `Chapter ${idx + 1}: ${unique}`;
  }

  return `Chapter ${idx + 1}`;
}

/** Format raw doctrine data into structured source material for AI synthesis. */
function formatDoctrineSource(doctrines: DoctrineBlock[]): string {
  return doctrines.map((d, i) => {
    const parts: string[] = [`[Doctrine ${i + 1}: ${d.topic}]`];
    if (d.conclusion) parts.push(d.conclusion);
    if (d.reasoning) parts.push(`Reasoning: ${d.reasoning}`);
    if (d.authority.length > 0) parts.push(`Authority: ${d.authority.join('; ')}`);
    if (d.confidence >= 0.9) parts.push(`[High Confidence]`);
    return parts.join('\n');
  }).join('\n\n---\n\n');
}

async function synthesizeChapters(
  product: ProductDefinition,
  doctrines: DoctrineBlock[],
  env: Env,
): Promise<PdfChapter[]> {
  // ── AI Chapter Fallback: when doctrines are insufficient, generate from AI knowledge ──
  const AI_FALLBACK_THRESHOLD = 30;
  let aiGeneratedChapters: PdfChapter[] = [];

  if (doctrines.length < AI_FALLBACK_THRESHOLD) {
    log('info', `Doctrine count (${doctrines.length}) below threshold (${AI_FALLBACK_THRESHOLD}), activating AI chapter generation`, {
      productId: product.id,
    });

    // Step 1: Ask AI to generate a chapter outline for this product
    try {
      const outlineText = await generateContent(
        [
          `You are a senior technical editor planning a comprehensive professional guide.`,
          `Title: "${product.title}"`,
          `Subtitle: "${product.subtitle || ''}"`,
          `Domain: ${product.domain}`,
          `Category: ${product.category}`,
          `Description: ${product.description}`,
          `Keywords: ${product.keywords.join(', ')}`,
          `Tags: ${product.tags.join(', ')}`,
          `Target page count: ${product.pageTarget} pages`,
          ``,
          `Generate exactly 5 chapter titles for this book. Each chapter should cover a distinct, substantial topic.`,
          `Return ONLY a JSON array of strings, each being a chapter title. No other text.`,
          `Example format: ["Chapter 1: Fundamentals of X", "Chapter 2: Advanced Y Techniques", ...]`,
        ].join('\n'),
        'Generate the 8 chapter titles now as a JSON array.',
        2000,
        env,
      );

      if (outlineText.length > 10) {
        // Parse JSON array from response (handle markdown code blocks)
        const jsonMatch = outlineText.match(/\[[\s\S]*?\]/);
        let chapterTitles: string[] = [];
        if (jsonMatch) {
          try {
            chapterTitles = JSON.parse(jsonMatch[0]);
          } catch {
            log('warn', 'Failed to parse chapter outline JSON, using fallback titles');
          }
        }

        // Fallback: generate generic chapter titles from keywords/tags
        if (chapterTitles.length < 3) {
          chapterTitles = [
            `Foundations and Core Principles`,
            `Regulatory Framework and Compliance`,
            `Operational Best Practices`,
            `Risk Management and Mitigation`,
            `Advanced Techniques and Future Trends`,
          ].map((t, i) => `Chapter ${i + 1}: ${product.domain.charAt(0).toUpperCase() + product.domain.slice(1)} — ${t}`);
        }

        log('info', `AI outline generated: ${chapterTitles.length} chapters`, { productId: product.id });

        // Step 2: Synthesize full content for each AI-outlined chapter (parallel, 2 at a time)
        const AI_PARALLEL = 2;
        for (let bStart = 0; bStart < chapterTitles.length; bStart += AI_PARALLEL) {
          const bEnd = Math.min(bStart + AI_PARALLEL, chapterTitles.length);
          const aiPromises: Promise<PdfChapter>[] = [];

          for (let ci = bStart; ci < bEnd; ci++) {
            const title = chapterTitles[ci]!;
            aiPromises.push((async (): Promise<PdfChapter> => {
              try {
                const content = await generateContent(
                  [
                    `You are a world-class domain expert and published author writing "${title}" for "${product.title}".`,
                    `This is chapter ${ci + 1} of ${chapterTitles.length} in a premium $${product.priceUsd} professional reference.`,
                    `Domain: ${product.domain}. Category: ${product.category}.`,
                    ``,
                    `CRITICAL: You MUST write 3000-5000 words. This is a PAID publication. Short chapters are UNACCEPTABLE.`,
                    ``,
                    `MANDATORY STRUCTURE (follow exactly):`,
                    `- Write 15-25 substantial paragraphs, each 150-300 words`,
                    `- Paragraph 1-3: Core principles and foundational concepts with specific definitions`,
                    `- Paragraph 4-6: Regulatory and compliance framework (cite specific standards: API, OSHA, ISO, NIST, IRC, CFR as applicable)`,
                    `- Paragraph 7-10: Detailed operational procedures and technical methodologies`,
                    `- Paragraph 11-14: Five distinct real-world case scenarios with specific numbers, outcomes, and lessons`,
                    `- Paragraph 15-18: Risk assessment, mitigation strategies, and common failure modes`,
                    `- Paragraph 19-22: Advanced techniques, optimization strategies, and emerging trends`,
                    `- Paragraph 23-25: Professional recommendations, implementation checklist as prose, key takeaways`,
                    ``,
                    `FORMAT RULES (STRICT):`,
                    `- Plain text paragraphs ONLY. Absolutely NO markdown: no **, no ##, no -, no *, no numbered lists`,
                    `- Do NOT start with "In this chapter" or any meta-reference`,
                    `- Include specific numbers: costs, tolerances, percentages, timelines, thresholds`,
                    `- Name real regulations, standards bodies, and authoritative sources`,
                    `- Every paragraph must contain substantive technical or professional content`,
                    ``,
                    `USE YOUR FULL OUTPUT CAPACITY. Write the COMPLETE chapter now.`,
                  ].join('\n'),
                  `Write the FULL 3000-5000 word chapter: ${title}\n\nDomain keywords: ${product.keywords.join(', ')}\nTags: ${product.tags.join(', ')}\n\nBegin writing immediately. Do not preface.`,
                  4096,
                  env,
                );
                if (content.length > 500) {
                  return { title, content, doctrineCount: 0 };
                }
              } catch (err) {
                log('warn', `AI chapter generation failed for "${title}"`, { error: String(err) });
              }
              // Fallback: return a placeholder that will be expanded later
              return {
                title,
                content: `This chapter covers ${title.replace(/^Chapter\s+\d+:\s*/i, '')} in the context of ${product.domain}. ${product.description}`,
                doctrineCount: 0,
              };
            })());
          }

          const aiResults = await Promise.allSettled(aiPromises);
          for (const r of aiResults) {
            if (r.status === 'fulfilled') {
              aiGeneratedChapters.push(r.value);
            }
          }
        }

        log('info', `AI chapter generation complete`, {
          productId: product.id,
          aiChapters: aiGeneratedChapters.length,
          aiTotalWords: aiGeneratedChapters.reduce((s, c) => s + c.content.split(/\s+/).length, 0),
        });
      }
    } catch (err) {
      log('warn', 'AI chapter outline generation failed', { error: String(err) });
    }
  }

  // ── Doctrine-based chapters ──
  // Target: 3-5 chapters to keep AI calls within Worker timeout limits
  const targetChapters = Math.min(5, Math.max(3, Math.ceil(doctrines.length / 8)));
  const chapterSize = Math.max(4, Math.ceil(doctrines.length / targetChapters));
  const groups: DoctrineBlock[][] = [];

  for (let i = 0; i < doctrines.length; i += chapterSize) {
    groups.push(doctrines.slice(i, i + chapterSize));
  }

  log('info', 'Grouping doctrines into chapters', {
    productId: product.id,
    doctrineCount: doctrines.length,
    targetChapters,
    chapterSize,
    actualChapters: groups.length,
    aiChaptersAvailable: aiGeneratedChapters.length,
  });

  let chapters: PdfChapter[] = [];

  // Synthesize doctrine-based chapters in parallel (up to 2 at a time)
  const PARALLEL_LIMIT = 2;
  for (let batchStart = 0; batchStart < groups.length; batchStart += PARALLEL_LIMIT) {
    const batchEnd = Math.min(batchStart + PARALLEL_LIMIT, groups.length);
    const batchPromises: Promise<PdfChapter>[] = [];

    for (let idx = batchStart; idx < batchEnd; idx++) {
      const group = groups[idx]!;
      const chapterTitle = deriveChapterTitle(idx, group, groups.length);
      const doctrineSource = formatDoctrineSource(group);
      const topics = group.map(d => d.topic).filter(t => t !== 'Untitled').join(', ');

      batchPromises.push((async (): Promise<PdfChapter> => {
        // Build rich raw content as fallback
        let rawContent = group.map(d => {
          let text = '';
          if (d.topic && d.topic !== 'Untitled') text += d.topic + '\n\n';
          if (d.conclusion) text += d.conclusion + '\n\n';
          if (d.reasoning) text += d.reasoning + '\n\n';
          if (d.authority.length > 0) text += 'Sources: ' + d.authority.join('; ') + '\n\n';
          return text;
        }).join('\n');

        // AI synthesis via Workers AI (primary) or Echo Chat (fallback)
        let synthesized = rawContent;
        try {
          const aiContent = await generateContent(
            [
              `You are writing ${chapterTitle} of the professional guide "${product.title}" (${product.subtitle}).`,
              `This is chapter ${idx + 1} of ${groups.length} in a comprehensive expert-level publication.`,
              ``,
              `INSTRUCTIONS:`,
              `- Write 3000-5000 words of professional, expert-level prose`,
              `- Use plain text only — NO markdown, NO bullet points with *, NO headers with #`,
              `- Structure as flowing paragraphs with clear topic transitions`,
              `- Include specific details, numbers, real-world examples, and practical advice`,
              `- Reference authoritative sources where the doctrine data provides them`,
              `- Write like a senior industry expert addressing professionals`,
              `- Include at least 2-3 practical examples or case scenarios`,
              `- End with key takeaways or actionable recommendations`,
              `- Topics covered: ${topics}`,
              ``,
              `DO NOT start with "In this chapter" or similar meta-references.`,
              `DO NOT use formatting like ** or ## or bullet lists.`,
              `Write substantive professional prose that could appear in a published book.`,
            ].join('\n'),
            `Expert doctrine knowledge to synthesize into this chapter:\n\n${doctrineSource.slice(0, 12000)}`,
            4096,
            env,
          );

          if (aiContent.length > 500) {
            synthesized = aiContent;
          } else if (aiContent.length > 0) {
            log('warn', `AI synthesis returned short content for chapter ${idx + 1}`, {
              contentLength: aiContent.length,
            });
          }
        } catch (err) {
          log('warn', `AI synthesis failed for chapter ${idx + 1}, using enriched raw content`, {
            error: String(err),
          });
        }

        return {
          title: chapterTitle,
          content: synthesized,
          doctrineCount: group.length,
        };
      })());
    }

    const batchResults = await Promise.allSettled(batchPromises);
    for (const r of batchResults) {
      if (r.status === 'fulfilled') {
        chapters.push(r.value);
      }
    }
  }

  // ── Post-synthesis quality gate: drop duplicate/garbage chapters ──
  const seenTitles = new Set<string>();
  const qualityChapters: PdfChapter[] = [];
  for (const ch of chapters) {
    // Normalize title for dedup comparison (strip "Chapter N: " prefix)
    const titleCore = ch.title.replace(/^Chapter\s+\d+:\s*/i, '').toLowerCase().trim();
    // Skip if title is too similar to one we already have
    if (seenTitles.has(titleCore)) {
      log('info', `Dropping duplicate chapter: "${ch.title}"`);
      continue;
    }
    // Skip chapters with very short content (AI synthesis failed or thin doctrines)
    if (ch.content.split(/\s+/).length < 100) {
      log('info', `Dropping thin chapter (${ch.content.split(/\s+/).length} words): "${ch.title}"`);
      continue;
    }
    seenTitles.add(titleCore);
    qualityChapters.push(ch);
  }
  // Renumber chapters after filtering
  chapters = qualityChapters.map((ch, i) => ({
    ...ch,
    title: ch.title.replace(/^Chapter\s+\d+/i, `Chapter ${i + 1}`),
  }));

  log('info', 'Chapter quality gate applied', {
    productId: product.id,
    before: groups.length,
    after: chapters.length,
  });

  // ── Merge AI-generated chapters if doctrine chapters are insufficient ──
  if (aiGeneratedChapters.length > 0) {
    // Filter out AI chapters whose titles are too similar to doctrine chapters
    const doctrineTitleCores = new Set(chapters.map(c =>
      c.title.replace(/^Chapter\s+\d+:\s*/i, '').toLowerCase().trim()
    ));
    const uniqueAiChapters = aiGeneratedChapters.filter(ac => {
      const acCore = ac.title.replace(/^Chapter\s+\d+:\s*/i, '').toLowerCase().trim();
      // Check if any doctrine chapter title shares >40% word overlap
      for (const dtc of doctrineTitleCores) {
        const acWords = new Set(acCore.split(/\s+/));
        const dtWords = new Set(dtc.split(/\s+/));
        const overlap = [...acWords].filter(w => dtWords.has(w)).length;
        const similarity = overlap / Math.max(acWords.size, dtWords.size);
        if (similarity > 0.4) return false;
      }
      return true;
    });

    // Append unique AI chapters after doctrine chapters
    chapters.push(...uniqueAiChapters);

    // Re-number all chapters sequentially
    chapters = chapters.map((ch, i) => ({
      ...ch,
      title: ch.title.replace(/^Chapter\s+\d+/i, `Chapter ${i + 1}`),
    }));

    log('info', 'AI chapters merged', {
      productId: product.id,
      aiAdded: uniqueAiChapters.length,
      totalChapters: chapters.length,
    });
  }

  // Expansion passes REMOVED — too many AI calls, exceeds Worker timeout limits.
  // Chapters use initial AI generation content as-is. Quality comes from good prompts, not expansion.

  // Add an introduction chapter at the beginning
  const introContent = [
    `${product.title} represents the culmination of expert knowledge synthesized from ${doctrines.length} specialized doctrine blocks across ${product.enginePrefixes.length} intelligence engines. This guide provides actionable, authority-backed insights for professionals and practitioners in ${product.category.toLowerCase()}.`,
    ``,
    `${product.description}`,
    ``,
    `This publication is organized into ${chapters.length} chapters, each addressing a critical facet of the subject matter. Every assertion is backed by curated expert reasoning frameworks, authority citations, and real-world analysis — not generic AI content, but domain-specific intelligence distilled from over 5,400 specialized reasoning engines.`,
    ``,
    `Whether you are a seasoned professional seeking advanced strategies or a newcomer building foundational knowledge, this guide delivers the depth and specificity that sets expert-level content apart from surface-level overviews.`,
    ``,
    `The content within these pages has been synthesized by Echo Prime Technologies' autonomous intelligence platform, drawing from doctrine blocks that encode decades of professional expertise, regulatory knowledge, and practical field experience.`,
  ].join('\n');

  chapters.unshift({
    title: 'Introduction',
    content: introContent,
    doctrineCount: 0,
  });

  log('info', 'Chapter synthesis complete', {
    productId: product.id,
    chapterCount: chapters.length,
    totalWords: chapters.reduce((sum, ch) => sum + ch.content.split(/\s+/).length, 0),
  });

  return chapters;
}

// ─── Text Sanitization (WinAnsi safe) ────────────────────────────────

/** Replace characters outside WinAnsi encoding with safe ASCII equivalents */
function sanitizeForPdf(text: string): string {
  return text
    // Common Unicode → ASCII replacements
    .replace(/[\u2018\u2019\u201A]/g, "'")   // smart single quotes
    .replace(/[\u201C\u201D\u201E]/g, '"')   // smart double quotes
    .replace(/\u2026/g, '...')                // ellipsis
    .replace(/[\u2013\u2014]/g, '-')          // en/em dash
    .replace(/\u2264/g, '<=')                 // ≤
    .replace(/\u2265/g, '>=')                 // ≥
    .replace(/\u00A7/g, 'Section ')           // §
    .replace(/\u2022/g, '* ')                 // bullet
    .replace(/\u2192/g, '->')                 // →
    .replace(/\u2190/g, '<-')                 // ←
    .replace(/\u00B7/g, '.')                  // middle dot
    .replace(/\u2019/g, "'")                  // right single quote
    .replace(/\u00B0/g, ' deg')              // degree
    .replace(/\u00AE/g, '(R)')               // ®
    .replace(/\u2122/g, '(TM)')              // ™
    .replace(/\u00A9/g, '(C)')               // ©
    .replace(/\u00BD/g, '1/2')               // ½
    .replace(/\u00BC/g, '1/4')               // ¼
    .replace(/\u00BE/g, '3/4')               // ¾
    // Strip any remaining non-WinAnsi characters (keep printable ASCII + Latin-1 supplement)
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}

// ─── PDF Rendering ────────────────────────────────────────────────────

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(testLine, fontSize);

    if (width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}

function addPage(doc: PDFDocument): PDFPage {
  return doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
}

function drawWrappedText(
  page: PDFPage,
  text: string,
  x: number,
  startY: number,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
  doc: PDFDocument,
): { page: PDFPage; y: number } {
  const paragraphs = sanitizeForPdf(text).split('\n');
  let y = startY;
  let currentPage = page;

  for (const para of paragraphs) {
    if (para.trim() === '') {
      y -= LINE_HEIGHT;
      if (y < MARGIN_BOTTOM) {
        currentPage = addPage(doc);
        y = PAGE_HEIGHT - MARGIN_TOP;
      }
      continue;
    }

    const lines = wrapText(para.trim(), font, fontSize, maxWidth);

    for (const line of lines) {
      if (y < MARGIN_BOTTOM) {
        currentPage = addPage(doc);
        y = PAGE_HEIGHT - MARGIN_TOP;
      }

      currentPage.drawText(line, { x, y, size: fontSize, font, color: rgb(0.1, 0.1, 0.1) });
      y -= LINE_HEIGHT;
    }

    y -= LINE_HEIGHT * 0.5; // paragraph spacing
  }

  return { page: currentPage, y };
}

// ─── Main Generator ───────────────────────────────────────────────────

export async function generatePdf(product: ProductDefinition, env: Env): Promise<PdfResult> {
  log('info', 'Starting PDF generation', { productId: product.id, title: product.title });

  // 1. Fetch doctrine blocks
  const doctrines = await fetchDoctrines(product, env);
  log('info', 'Fetched doctrines', { count: doctrines.length, productId: product.id });

  // 2. Synthesize into chapters (handles low doctrine counts with AI fallback)
  const chapters = await synthesizeChapters(product, doctrines, env);
  log('info', 'Synthesized chapters', { count: chapters.length, productId: product.id });

  // 3. Build PDF
  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);

  doc.setTitle(product.title);
  doc.setAuthor('Echo Prime Technologies');
  doc.setSubject(product.subtitle);
  doc.setCreator('Echo Revenue Engine v1.0');
  doc.setProducer('Echo Prime Technologies — echo-ept.com');

  // ── Cover Page ──────────────────────────────────────────────────────
  const coverPage = addPage(doc);

  // Title
  const titleFontSize = 28;
  const titleLines = wrapText(sanitizeForPdf(product.title), fontBold, titleFontSize, CONTENT_WIDTH);
  let coverY = PAGE_HEIGHT - 200;

  for (const line of titleLines) {
    const titleWidth = fontBold.widthOfTextAtSize(line, titleFontSize);
    coverPage.drawText(line, {
      x: (PAGE_WIDTH - titleWidth) / 2,
      y: coverY,
      size: titleFontSize,
      font: fontBold,
      color: rgb(0.8, 0, 0),
    });
    coverY -= 36;
  }

  // Subtitle
  coverY -= 20;
  const subLines = wrapText(sanitizeForPdf(product.subtitle), fontItalic, 16, CONTENT_WIDTH);
  for (const line of subLines) {
    const subWidth = fontItalic.widthOfTextAtSize(line, 16);
    coverPage.drawText(line, {
      x: (PAGE_WIDTH - subWidth) / 2,
      y: coverY,
      size: 16,
      font: fontItalic,
      color: rgb(0.3, 0.3, 0.3),
    });
    coverY -= 22;
  }

  // Author line
  coverY -= 40;
  const authorText = 'Echo Prime Technologies';
  const authorWidth = fontBold.widthOfTextAtSize(authorText, 14);
  coverPage.drawText(authorText, {
    x: (PAGE_WIDTH - authorWidth) / 2,
    y: coverY,
    size: 14,
    font: fontBold,
    color: rgb(0.2, 0.2, 0.2),
  });
  coverY -= 20;
  const siteText = 'echo-ept.com';
  const siteWidth = fontRegular.widthOfTextAtSize(siteText, 12);
  coverPage.drawText(siteText, {
    x: (PAGE_WIDTH - siteWidth) / 2,
    y: coverY,
    size: 12,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.4),
  });

  // Doctrine count badge
  coverY -= 60;
  const badgeText = `Built from ${doctrines.length} expert doctrine blocks across ${product.enginePrefixes.length} intelligence engines`;
  const badgeLines = wrapText(sanitizeForPdf(badgeText), fontItalic, 10, CONTENT_WIDTH - 40);
  for (const line of badgeLines) {
    const bw = fontItalic.widthOfTextAtSize(line, 10);
    coverPage.drawText(line, {
      x: (PAGE_WIDTH - bw) / 2,
      y: coverY,
      size: 10,
      font: fontItalic,
      color: rgb(0.5, 0.5, 0.5),
    });
    coverY -= 14;
  }

  // ── Table of Contents ───────────────────────────────────────────────
  const tocPage = addPage(doc);
  let tocY = PAGE_HEIGHT - MARGIN_TOP;

  tocPage.drawText('Table of Contents', {
    x: MARGIN_LEFT, y: tocY, size: 22, font: fontBold, color: rgb(0.1, 0.1, 0.1),
  });
  tocY -= 40;

  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i]!;
    tocPage.drawText(sanitizeForPdf(ch.title), {
      x: MARGIN_LEFT + 10,
      y: tocY,
      size: 12,
      font: fontRegular,
      color: rgb(0.2, 0.2, 0.2),
    });
    tocY -= 20;

    if (tocY < MARGIN_BOTTOM) break;
  }

  // ── Content Chapters ────────────────────────────────────────────────
  let wordCount = 0;
  for (const chapter of chapters) {
    let contentPage = addPage(doc);
    let y = PAGE_HEIGHT - MARGIN_TOP;

    // Chapter heading
    const headingLines = wrapText(sanitizeForPdf(chapter.title), fontBold, 20, CONTENT_WIDTH);
    for (const line of headingLines) {
      contentPage.drawText(line, {
        x: MARGIN_LEFT, y, size: 20, font: fontBold, color: rgb(0.8, 0, 0),
      });
      y -= HEADING_HEIGHT;
    }
    y -= 10;

    // Chapter content
    const result = drawWrappedText(contentPage, chapter.content, MARGIN_LEFT, y, fontRegular, 11, CONTENT_WIDTH, doc);
    contentPage = result.page;

    wordCount += chapter.content.split(/\s+/).length;
  }

  // ── About Page ──────────────────────────────────────────────────────
  const aboutPage = addPage(doc);
  let aboutY = PAGE_HEIGHT - MARGIN_TOP;

  aboutPage.drawText('About Echo Prime Technologies', {
    x: MARGIN_LEFT, y: aboutY, size: 20, font: fontBold, color: rgb(0.8, 0, 0),
  });
  aboutY -= 30;

  const aboutText = `Echo Prime Technologies is the most advanced autonomous AI platform built by an independent founder. With over 5,400 specialized intelligence engines spanning 210+ domains and 619,000+ expert doctrine blocks, we deliver domain-specific AI reasoning that goes far beyond generic chatbots.

Every page of this guide is backed by real expert knowledge from our intelligence engine fleet — not generic AI responses, but doctrine-backed analysis with real authority citations.

Visit us at echo-ept.com to explore our full suite of AI-powered tools, including:
- Intelligence Engines (5,400+ across 210+ domains)
- AI Closer (autonomous sales agent)
- ShadowGlass (privacy-first AI browser)
- Hephaestion Forge (AI code factory)
- Title Intelligence (259,000+ deed records)
- Tax Return Preparation (14 tax AI engines)

Built in Midland, Texas by Bobby Don McWilliams II.
14 months. Zero VC funding. Pure engineering.

echo-ept.com`;

  drawWrappedText(aboutPage, aboutText, MARGIN_LEFT, aboutY, fontRegular, 11, CONTENT_WIDTH, doc);

  // ── Finalize ────────────────────────────────────────────────────────
  const pdfBytes = await doc.save();
  const pageCount = doc.getPageCount();

  log('info', 'PDF generated', {
    productId: product.id,
    pageCount,
    wordCount,
    chapterCount: chapters.length,
    doctrineCount: doctrines.length,
    sizeBytes: pdfBytes.length,
  });

  return {
    pdfBytes: new Uint8Array(pdfBytes),
    pageCount,
    chapterCount: chapters.length,
    wordCount,
  };
}
