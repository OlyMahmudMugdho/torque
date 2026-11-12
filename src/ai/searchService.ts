import type {
  AcademicSearchResult,
  WebSearchResult,
  SearchSettings,
} from '../types/ai';

/**
 * Escapes characters that break LaTeX syntax (% & _ #) unless already preceded by a backslash.
 */
export function sanitizeLatexText(text: string): string {
  if (!text) return '';
  return text
    .replace(/(?<!\\)&/g, '\\&')
    .replace(/(?<!\\)%/g, '\\%')
    .replace(/(?<!\\)_/g, '\\_')
    .replace(/(?<!\\)#/g, '\\#');
}

/**
 * Generates a clean, sanitized citation key following the scheme:
 * lowercase last name of first author + year + first alphanumeric word of title (e.g. vaswani2017attention).
 */
export function sanitizeBibtexKey(
  firstAuthor: string,
  year: number | string,
  title: string
): string {
  let lastName = '';
  if (firstAuthor && firstAuthor.trim()) {
    const trimmed = firstAuthor.trim();
    if (trimmed.includes(',')) {
      lastName = trimmed.split(',')[0].trim();
    } else {
      const parts = trimmed.split(/\s+/);
      lastName = parts[parts.length - 1];
    }
  }
  lastName = lastName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'author';

  const cleanYear = String(year).match(/\d{4}/)?.[0] || 'nodate';

  const titleWords = title ? title.match(/[a-zA-Z0-9]+/g) : null;
  const firstWord = titleWords && titleWords.length > 0 ? titleWords[0].toLowerCase() : 'paper';

  return `${lastName}${cleanYear}${firstWord}`;
}

/**
 * Decodes XML entity references commonly encountered in arXiv feed payloads.
 */
function decodeXmlEntities(text: string): string {
  if (!text) return '';
  return text
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, '&');
}

/**
 * Strips HTML tags and unescapes basic HTML entities in web snippets.
 */
function cleanHtmlSnippet(html: string): string {
  if (!html) return '';
  return decodeXmlEntities(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

/**
 * Formats a clean, standard BibTeX record.
 */
export function generateBibTeX(paper: {
  title: string;
  authors: string[];
  year: number | string;
  url?: string;
  arxivId?: string;
}): { citationKey: string; bibtex: string } {
  const firstAuthor = paper.authors[0] || '';
  const citationKey = sanitizeBibtexKey(firstAuthor, paper.year, paper.title);

  const escapedTitle = sanitizeLatexText(paper.title);
  const escapedAuthors = paper.authors.map((a) => sanitizeLatexText(a)).join(' and ');

  let bibtex: string;
  if (paper.arxivId) {
    bibtex = `@article{${citationKey},
  title = {${escapedTitle}},
  author = {${escapedAuthors || 'Unknown'}},
  journal = {arXiv preprint arXiv:${paper.arxivId}},
  year = {${paper.year}},
  eprint = {${paper.arxivId}},
  archivePrefix = {arXiv},
  url = {${paper.url || `https://arxiv.org/abs/${paper.arxivId}`}}
}`;
  } else {
    bibtex = `@article{${citationKey},
  title = {${escapedTitle}},
  author = {${escapedAuthors || 'Unknown'}},
  year = {${paper.year}},
  url = {${paper.url || ''}}
}`;
  }

  return { citationKey, bibtex };
}

/**
 * Searches the arXiv API using the Atom XML feed.
 * Parses entry metadata, formats BibTeX, and sanitizes characters for LaTeX compatibility.
 */
export async function searchArxiv(
  query: string,
  maxResults?: number
): Promise<AcademicSearchResult[]> {
  if (!query || !query.trim()) {
    return [];
  }

  const limit = Math.max(1, Math.min(maxResults ?? 5, 20));

  const clean = query
    .replace(/\bet\s+al\.?\b/gi, '')
    .replace(/\bpaper\b/gi, '')
    .replace(/["'\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Build high-precision multi-clause query:
  // 1. Exact title phrase
  // 2. Exact summary/text phrase
  // 3. Conjunction of significant keywords across all fields
  const subQueries: string[] = [];
  if (clean) {
    subQueries.push(`ti:"${clean}"`);
    subQueries.push(`all:"${clean}"`);

    const words = clean
      .split(/\s+/)
      .filter((w) => w.length > 2 && !['and', 'the', 'for', 'with', 'from', 'about'].includes(w.toLowerCase()));

    if (words.length > 1) {
      const wordQuery = words.map((w) => `all:${w}`).join(' AND ');
      subQueries.push(`(${wordQuery})`);
    }
  } else {
    subQueries.push(`all:${query.trim()}`);
  }

  const arxivQuery = subQueries.join(' OR ');
  const fetchLimit = Math.max(limit * 2, 10);
  const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(
    arxivQuery
  )}&start=0&max_results=${fetchLimit}&sortBy=relevance&sortOrder=descending`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return [];
    }

    const xml = await res.text();
    const results: AcademicSearchResult[] = [];

    // Match all <entry> blocks in the Atom XML feed
    const entryRegex = /<entry[\s\S]*?>([\s\S]*?)<\/entry>/gi;
    let entryMatch: RegExpExecArray | null;

    while ((entryMatch = entryRegex.exec(xml)) !== null) {
      const entryContent = entryMatch[1];

      // Extract ID / arXiv identifier
      const idMatch = entryContent.match(/<id[^>]*>([\s\S]*?)<\/id>/i);
      const rawId = idMatch ? decodeXmlEntities(idMatch[1].trim()) : '';
      const arxivIdMatch = rawId.match(
        /(?:arxiv\.org\/abs\/)?([0-9]+\.[0-9]+|[a-z\-]+(?:\.[a-z]{2})?\/\d{7})(?:v\d+)?/i
      );
      const arxivId = arxivIdMatch ? arxivIdMatch[1] : rawId.replace(/^.*\/([^/]+)$/, '$1');
      const paperUrl = arxivId ? `https://arxiv.org/abs/${arxivId}` : rawId;

      // Extract title
      const titleMatch = entryContent.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const rawTitle = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : 'Untitled';
      const title = decodeXmlEntities(rawTitle);

      // Extract publication date / year
      const pubMatch = entryContent.match(/<published[^>]*>([\s\S]*?)<\/published>/i);
      const publishedStr = pubMatch ? pubMatch[1].trim() : '';
      const yearMatch = publishedStr.match(/^\d{4}/);
      const year = yearMatch ? parseInt(yearMatch[0], 10) : new Date().getFullYear();

      // Extract abstract / summary
      const summaryMatch = entryContent.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i);
      const rawSummary = summaryMatch ? summaryMatch[1].replace(/\s+/g, ' ').trim() : '';
      const abstract = decodeXmlEntities(rawSummary);

      // Extract author names
      const authors: string[] = [];
      const authorRegex = /<author>[\s\S]*?<name[^>]*>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi;
      let aMatch: RegExpExecArray | null;
      while ((aMatch = authorRegex.exec(entryContent)) !== null) {
        const name = decodeXmlEntities(aMatch[1].replace(/\s+/g, ' ').trim());
        if (name) authors.push(name);
      }

      const { citationKey, bibtex } = generateBibTeX({
        title,
        authors,
        year,
        arxivId,
        url: paperUrl,
      });

      results.push({
        title,
        authors,
        year,
        abstract,
        url: paperUrl,
        citationKey,
        bibtex,
        source: 'arxiv',
      });
    }

    // Rank exact/prefix title matches first before truncating to limit
    const scorePaper = (t: string): number => {
      const lowerT = t.toLowerCase().trim();
      const lowerQ = clean.toLowerCase().trim();
      if (lowerT === lowerQ) return 100;
      if (lowerT.startsWith(lowerQ)) return 80;
      if (lowerT.includes(lowerQ)) return 60;
      return 0;
    };

    results.sort((a, b) => scorePaper(b.title) - scorePaper(a.title));
    return results.slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Searches the Semantic Scholar Graph API for academic papers.
 * Extracts title, authors, year, abstract, and bibtex (or generates fallback BibTeX).
 */
export async function searchSemanticScholar(
  query: string,
  maxResults?: number
): Promise<AcademicSearchResult[]> {
  if (!query || !query.trim()) {
    return [];
  }

  const limit = Math.max(1, Math.min(maxResults ?? 5, 20));
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(
    query.trim()
  )}&limit=${limit}&fields=title,authors,year,abstract,citationStyles,url,externalIds`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return [];
    }

    const data = await res.json();
    const papers = Array.isArray(data?.data) ? data.data : [];
    const results: AcademicSearchResult[] = [];

    for (const item of papers) {
      const title = (item.title || 'Untitled').trim();
      const authors: string[] = Array.isArray(item.authors)
        ? item.authors.map((a: { name?: string }) => a?.name?.trim()).filter(Boolean)
        : [];
      const year = item.year || new Date().getFullYear();
      const abstract = (item.abstract || '').trim();
      const paperUrl = item.url || (item.paperId ? `https://www.semanticscholar.org/paper/${item.paperId}` : '');
      const arxivId = item.externalIds?.ArXiv;

      let bibtex = item.citationStyles?.bibtex?.trim();
      let citationKey = '';

      if (bibtex) {
        const keyMatch = bibtex.match(/@\w+\s*\{\s*([^,\s]+)/);
        citationKey = keyMatch ? keyMatch[1].trim() : sanitizeBibtexKey(authors[0] || '', year, title);
      } else {
        const generated = generateBibTeX({
          title,
          authors,
          year,
          arxivId,
          url: paperUrl,
        });
        bibtex = generated.bibtex;
        citationKey = generated.citationKey;
      }

      results.push({
        title,
        authors,
        year,
        abstract,
        url: paperUrl,
        citationKey,
        bibtex,
        source: 'semanticscholar',
      });

      if (results.length >= limit) {
        break;
      }
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Searches academic literature across arXiv and/or Semantic Scholar.
 * Deduplicates results by normalized title and arXiv ID.
 */
export async function searchAcademic(
  query: string,
  options?: { source?: 'all' | 'arxiv' | 'semanticscholar'; maxResults?: number }
): Promise<AcademicSearchResult[]> {
  if (!query || !query.trim()) {
    return [];
  }

  const limit = options?.maxResults ?? 5;
  const source = options?.source ?? 'all';

  if (source === 'arxiv') {
    return searchArxiv(query, limit);
  }

  if (source === 'semanticscholar') {
    return searchSemanticScholar(query, limit);
  }

  // Source === 'all': fetch from both in parallel
  const [arxivSettled, s2Settled] = await Promise.allSettled([
    searchArxiv(query, limit),
    searchSemanticScholar(query, limit),
  ]);

  const arxivList = arxivSettled.status === 'fulfilled' ? arxivSettled.value : [];
  const s2List = s2Settled.status === 'fulfilled' ? s2Settled.value : [];

  const seenTitles = new Set<string>();
  const seenArxivIds = new Set<string>();
  const merged: AcademicSearchResult[] = [];

  const normTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '');

  const extractArxivId = (paper: AcademicSearchResult): string | null => {
    const urlMatch = paper.url.match(/arxiv\.org\/abs\/([0-9]+\.[0-9]+|[a-z\-]+(?:\.[a-z]{2})?\/\d{7})/i);
    if (urlMatch) return urlMatch[1];
    const bibMatch = paper.bibtex.match(/eprint\s*=\s*\{([0-9]+\.[0-9]+|[a-z\-]+(?:\.[a-z]{2})?\/\d{7})\}/i);
    if (bibMatch) return bibMatch[1];
    return null;
  };

  const addPaper = (paper: AcademicSearchResult) => {
    if (merged.length >= limit) return;

    const tNorm = normTitle(paper.title);
    const arxivId = extractArxivId(paper);

    if (tNorm && seenTitles.has(tNorm)) return;
    if (arxivId && seenArxivIds.has(arxivId)) return;

    if (tNorm) seenTitles.add(tNorm);
    if (arxivId) seenArxivIds.add(arxivId);
    merged.push(paper);
  };

  // Prioritize arXiv results first, then merge Semantic Scholar
  for (const paper of arxivList) {
    addPaper(paper);
  }
  for (const paper of s2List) {
    addPaper(paper);
  }

  return merged;
}

/**
 * Searches the web for LaTeX documentation, packages, and technical questions.
 * Supports Tavily, Brave, and free DuckDuckGo / Wikipedia fallbacks.
 */
export async function searchWeb(
  query: string,
  settings?: SearchSettings,
  maxResults?: number
): Promise<WebSearchResult[]> {
  if (!query || !query.trim()) {
    return [];
  }

  const limit = Math.max(1, Math.min(maxResults ?? 5, 20));
  const provider = settings?.provider ?? 'free';

  // 1. Tavily Search Provider
  if (provider === 'tavily' && settings?.apiKey) {
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
          query: query.trim(),
          max_results: limit,
          api_key: settings.apiKey,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const results = Array.isArray(data?.results) ? data.results : [];
        return results.slice(0, limit).map((r: { title?: string; url?: string; content?: string }) => ({
          title: r.title || '',
          url: r.url || '',
          snippet: r.content || '',
          source: 'tavily',
        }));
      }
    } catch {
      return [];
    }
  }

  // 2. Brave Search Provider
  if (provider === 'brave' && settings?.apiKey) {
    try {
      const url = `https://api.brave.com/res/v1/web/search?q=${encodeURIComponent(
        query.trim()
      )}&count=${limit}`;
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'X-Subscription-Token': settings.apiKey,
        },
      });

      if (res.ok) {
        const data = await res.json();
        const results = Array.isArray(data?.web?.results) ? data.web.results : [];
        return results.slice(0, limit).map((r: { title?: string; url?: string; description?: string }) => ({
          title: r.title || '',
          url: r.url || '',
          snippet: r.description || '',
          source: 'brave',
        }));
      }
    } catch {
      return [];
    }
  }

  // 3. Free Provider: DuckDuckGo Instant Answer + Wikipedia Search Fallback
  const results: WebSearchResult[] = [];

  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(
      query.trim()
    )}&format=json&no_html=1&skip_disambig=1`;
    const ddgRes = await fetch(ddgUrl);

    if (ddgRes.ok) {
      const ddgData = await ddgRes.json();
      if (ddgData.Heading && ddgData.AbstractText) {
        results.push({
          title: ddgData.Heading,
          snippet: ddgData.AbstractText,
          url: ddgData.AbstractURL || '',
          source: 'duckduckgo',
        });
      }

      if (Array.isArray(ddgData.RelatedTopics)) {
        for (const topic of ddgData.RelatedTopics) {
          if (results.length >= limit) break;
          if (topic.Text && topic.FirstURL) {
            const topicTitle = topic.Text.split(' - ')[0] || topic.Text.slice(0, 60);
            results.push({
              title: topicTitle.trim(),
              snippet: topic.Text,
              url: topic.FirstURL,
              source: 'duckduckgo',
            });
          }
        }
      }
    }
  } catch {
    // Continue to Wikipedia fallback on network issue
  }

  // If DuckDuckGo returned fewer results than requested, supplement with Wikipedia Search API
  if (results.length < limit) {
    try {
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        query.trim()
      )}&utf8=&format=json&origin=*`;
      const wikiRes = await fetch(wikiUrl);

      if (wikiRes.ok) {
        const wikiData = await wikiRes.json();
        const searchItems = Array.isArray(wikiData?.query?.search) ? wikiData.query.search : [];

        for (const item of searchItems) {
          if (results.length >= limit) break;
          const articleUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(
            (item.title || '').replace(/\s+/g, '_')
          )}`;

          // Avoid duplicate URLs
          if (!results.some((r) => r.url === articleUrl)) {
            results.push({
              title: item.title || '',
              snippet: cleanHtmlSnippet(item.snippet || ''),
              url: articleUrl,
              source: 'wikipedia',
            });
          }
        }
      }
    } catch {
      // Return whatever results collected
    }
  }

  return results.slice(0, limit);
}
