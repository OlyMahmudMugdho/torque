import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  searchArxiv,
  searchSemanticScholar,
  searchAcademic,
  searchWeb,
  generateBibTeX,
  sanitizeLatexText,
  sanitizeBibtexKey,
} from '../searchService';

describe('searchService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('helper functions', () => {
    describe('sanitizeBibtexKey', () => {
      it('generates author + year + titleWord key in lowercase', () => {
        expect(sanitizeBibtexKey('Ashish Vaswani', 2017, 'Attention Is All You Need')).toBe(
          'vaswani2017attention'
        );
      });

      it('handles "Last, First" author format', () => {
        expect(sanitizeBibtexKey('Vaswani, Ashish', '2017', 'Attention Is All You Need')).toBe(
          'vaswani2017attention'
        );
      });

      it('handles missing or single-name author and title with non-alphanumeric chars', () => {
        expect(sanitizeBibtexKey('Plato', 2020, '...The Republic...')).toBe('plato2020the');
        expect(sanitizeBibtexKey('', 2022, 'Sample')).toBe('author2022sample');
      });
    });

    describe('sanitizeLatexText', () => {
      it('escapes &, %, _, # characters cleanly without double-escaping', () => {
        const input = 'Fast & Curious: 100% Guaranteed_Speed #1 \\& already escaped';
        const output = sanitizeLatexText(input);
        expect(output).toBe('Fast \\& Curious: 100\\% Guaranteed\\_Speed \\#1 \\& already escaped');
      });
    });

    describe('generateBibTeX', () => {
      it('generates standard BibTeX entry for arXiv paper', () => {
        const res = generateBibTeX({
          title: 'Attention Is All You Need',
          authors: ['Ashish Vaswani', 'Noam Shazeer'],
          year: 2017,
          arxivId: '1706.03762',
          url: 'https://arxiv.org/abs/1706.03762',
        });

        expect(res.citationKey).toBe('vaswani2017attention');
        expect(res.bibtex).toContain('@article{vaswani2017attention,');
        expect(res.bibtex).toContain('title = {Attention Is All You Need},');
        expect(res.bibtex).toContain('author = {Ashish Vaswani and Noam Shazeer},');
        expect(res.bibtex).toContain('journal = {arXiv preprint arXiv:1706.03762},');
        expect(res.bibtex).toContain('year = {2017},');
        expect(res.bibtex).toContain('eprint = {1706.03762},');
        expect(res.bibtex).toContain('archivePrefix = {arXiv},');
        expect(res.bibtex).toContain('url = {https://arxiv.org/abs/1706.03762}');
      });

      it('generates generic BibTeX entry when arXiv ID is absent', () => {
        const res = generateBibTeX({
          title: 'General Deep Learning',
          authors: ['Jane Doe'],
          year: 2022,
          url: 'https://example.com/paper',
        });

        expect(res.citationKey).toBe('doe2022general');
        expect(res.bibtex).toContain('@article{doe2022general,');
        expect(res.bibtex).toContain('title = {General Deep Learning},');
        expect(res.bibtex).toContain('author = {Jane Doe},');
        expect(res.bibtex).toContain('year = {2022},');
        expect(res.bibtex).toContain('url = {https://example.com/paper}');
      });
    });
  });

  describe('searchArxiv', () => {
    const SAMPLE_ATOM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <link href="http://arxiv.org/api/query?search_query=all:attention" rel="self" type="application/atom+xml"/>
  <title type="html">ArXiv Query: search_query=all:attention</title>
  <id>http://arxiv.org/api/test</id>
  <updated>2026-11-12T00:00:00Z</updated>
  <entry>
    <id>http://arxiv.org/abs/1706.03762v7</id>
    <published>2017-06-12T17:49:50Z</published>
    <updated>2023-08-02T01:52:05Z</updated>
    <title> Attention Is All You Need </title>
    <summary>
      The dominant sequence transduction models are based on complex recurrent or
      convolutional neural networks in an encoder-decoder configuration.
    </summary>
    <author>
      <name>Ashish Vaswani</name>
    </author>
    <author>
      <name>Noam Shazeer</name>
    </author>
    <author>
      <name>Niki Parmar</name>
    </author>
  </entry>
</feed>`;

    it('fetches and parses Atom XML feed with correct attributes and BibTeX', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: async () => SAMPLE_ATOM_XML,
      } as any);

      const results = await searchArxiv('attention', 5);

      expect(results).toHaveLength(1);
      const paper = results[0];
      expect(paper.title).toBe('Attention Is All You Need');
      expect(paper.authors).toEqual(['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar']);
      expect(paper.year).toBe(2017);
      expect(paper.url).toBe('https://arxiv.org/abs/1706.03762');
      expect(paper.citationKey).toBe('vaswani2017attention');
      expect(paper.source).toBe('arxiv');
      expect(paper.abstract).toContain('The dominant sequence transduction models');
      expect(paper.bibtex).toContain('@article{vaswani2017attention,');
      expect(paper.bibtex).toContain('archivePrefix = {arXiv}');
    });

    it('sanitizes XML entities and special characters in title and authors for LaTeX', async () => {
      const xmlWithSpecialChars = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2103.00020v1</id>
    <published>2021-03-01T12:00:00Z</published>
    <title>Deep Learning &amp; AI: 100% Accuracy with ResNet_v2</title>
    <summary>A paper discussing &lt;b&gt;accuracy&lt;/b&gt; &amp; speed.</summary>
    <author>
      <name>Jane &amp; Joe Doe</name>
    </author>
  </entry>
</feed>`;

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: async () => xmlWithSpecialChars,
      } as any);

      const results = await searchArxiv('resnet', 5);

      expect(results).toHaveLength(1);
      const paper = results[0];
      expect(paper.title).toBe('Deep Learning & AI: 100% Accuracy with ResNet_v2');
      expect(paper.bibtex).toContain('Deep Learning \\& AI: 100\\% Accuracy with ResNet\\_v2');
      expect(paper.bibtex).toContain('Jane \\& Joe Doe');
    });

    it('returns empty array when query returns no entries or empty string', async () => {
      const emptyFeed = `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>`;
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: async () => emptyFeed,
      } as any);

      const results = await searchArxiv('nonexistent-query-xyz');
      expect(results).toEqual([]);

      const emptyQuery = await searchArxiv('');
      expect(emptyQuery).toEqual([]);
    });

    it('returns empty array cleanly when fetch fails or response is malformed', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));
      const res1 = await searchArxiv('query');
      expect(res1).toEqual([]);

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      } as any);
      const res2 = await searchArxiv('query');
      expect(res2).toEqual([]);
    });
  });

  describe('searchSemanticScholar', () => {
    it('parses Semantic Scholar API response and uses provided bibtex', async () => {
      const s2Data = {
        total: 1,
        data: [
          {
            paperId: 's2_id_1',
            title: 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding',
            authors: [{ name: 'Jacob Devlin' }, { name: 'Ming-Wei Chang' }],
            year: 2018,
            abstract: 'We introduce a new language representation model called BERT...',
            citationStyles: {
              bibtex:
                '@article{Devlin2018BERT,\n  title={BERT: Pre-training of Deep Bidirectional Transformers},\n  author={Jacob Devlin and Ming-Wei Chang},\n  year={2018}\n}',
            },
            url: 'https://www.semanticscholar.org/paper/s2_id_1',
            externalIds: {
              ArXiv: '1810.04805',
            },
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => s2Data,
      } as any);

      const results = await searchSemanticScholar('bert transformer', 5);
      expect(results).toHaveLength(1);
      const paper = results[0];
      expect(paper.title).toBe(
        'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding'
      );
      expect(paper.authors).toEqual(['Jacob Devlin', 'Ming-Wei Chang']);
      expect(paper.year).toBe(2018);
      expect(paper.citationKey).toBe('Devlin2018BERT');
      expect(paper.bibtex).toBe(s2Data.data[0].citationStyles.bibtex);
      expect(paper.source).toBe('semanticscholar');
    });

    it('generates BibTeX fallback if citationStyles.bibtex is missing', async () => {
      const s2Data = {
        total: 1,
        data: [
          {
            paperId: 's2_id_2',
            title: 'Language Models are Few-Shot Learners',
            authors: [{ name: 'Tom B. Brown' }],
            year: 2020,
            abstract: 'Recent work has demonstrated substantial gains...',
            citationStyles: {},
            url: 'https://www.semanticscholar.org/paper/s2_id_2',
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => s2Data,
      } as any);

      const results = await searchSemanticScholar('gpt-3', 5);
      expect(results).toHaveLength(1);
      const paper = results[0];
      expect(paper.citationKey).toBe('brown2020language');
      expect(paper.bibtex).toContain('@article{brown2020language,');
      expect(paper.bibtex).toContain('title = {Language Models are Few-Shot Learners},');
      expect(paper.bibtex).toContain('author = {Tom B. Brown},');
    });

    it('handles 429 rate limit or network errors gracefully without throwing', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      } as any);

      const res429 = await searchSemanticScholar('rate limited query');
      expect(res429).toEqual([]);

      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Fetch failed'));
      const resError = await searchSemanticScholar('error query');
      expect(resError).toEqual([]);
    });
  });

  describe('searchAcademic', () => {
    it('routes to arXiv when source is arxiv', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <id>http://arxiv.org/abs/1706.03762v7</id>
            <title>Attention Is All You Need</title>
            <published>2017-06-12T00:00:00Z</published>
            <summary>Abstract</summary>
            <author><name>Ashish Vaswani</name></author>
          </entry>
        </feed>`,
      } as any);

      const results = await searchAcademic('attention', { source: 'arxiv', maxResults: 3 });
      expect(results).toHaveLength(1);
      expect(results[0].source).toBe('arxiv');
      expect(results[0].title).toBe('Attention Is All You Need');
    });

    it('routes to Semantic Scholar when source is semanticscholar', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              paperId: 'p1',
              title: 'Deep Residual Learning for Image Recognition',
              authors: [{ name: 'Kaiming He' }],
              year: 2016,
              abstract: 'ResNet abstract',
              citationStyles: {},
              url: 'https://example.com/resnet',
            },
          ],
        }),
      } as any);

      const results = await searchAcademic('resnet', { source: 'semanticscholar', maxResults: 3 });
      expect(results).toHaveLength(1);
      expect(results[0].source).toBe('semanticscholar');
      expect(results[0].title).toBe('Deep Residual Learning for Image Recognition');
    });

    it('queries both sources, merges results, deduplicates by title/arXiv ID, and limits', async () => {
      // First call (arXiv) returns "Attention Is All You Need"
      // Second call (Semantic Scholar) returns "Attention Is All You Need" (duplicate) + "BERT"
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          text: async () => `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom">
            <entry>
              <id>http://arxiv.org/abs/1706.03762v7</id>
              <title>Attention Is All You Need</title>
              <published>2017-06-12T00:00:00Z</published>
              <summary>Abstract</summary>
              <author><name>Ashish Vaswani</name></author>
            </entry>
          </feed>`,
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [
              {
                paperId: 'p1',
                title: 'Attention is All you Need',
                authors: [{ name: 'Ashish Vaswani' }],
                year: 2017,
                abstract: 'Abstract',
                url: 'https://arxiv.org/abs/1706.03762',
                externalIds: { ArXiv: '1706.03762' },
              },
              {
                paperId: 'p2',
                title: 'BERT: Pre-training',
                authors: [{ name: 'Jacob Devlin' }],
                year: 2018,
                abstract: 'BERT abstract',
                url: 'https://example.com/bert',
              },
            ],
          }),
        } as any);

      const results = await searchAcademic('deep learning', { source: 'all', maxResults: 5 });

      // Should deduplicate "Attention Is All You Need", returning 2 distinct papers
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.title)).toContain('Attention Is All You Need');
      expect(results.map((r) => r.title)).toContain('BERT: Pre-training');
    });
  });

  describe('searchWeb', () => {
    it('uses Tavily search when provider is tavily and apiKey is set', async () => {
      const mockTavilyRes = {
        results: [
          {
            title: 'LaTeX Project Documentation',
            url: 'https://www.latex-project.org',
            content: 'The official home of LaTeX project documentation and guides.',
          },
        ],
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockTavilyRes,
      } as any);

      const results = await searchWeb(
        'latex guide',
        { provider: 'tavily', apiKey: 'tvly-secret-123' },
        3
      );

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://api.tavily.com/search');
      expect((init as any).method).toBe('POST');
      expect((init as any).headers['Authorization']).toBe('Bearer tvly-secret-123');
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        title: 'LaTeX Project Documentation',
        url: 'https://www.latex-project.org',
        snippet: 'The official home of LaTeX project documentation and guides.',
        source: 'tavily',
      });
    });

    it('uses Brave search when provider is brave and apiKey is set', async () => {
      const mockBraveRes = {
        web: {
          results: [
            {
              title: 'TikZ and PGF Packages',
              url: 'https://ctan.org/pkg/pgf',
              description: 'Create graphics programmatically in LaTeX with TikZ.',
            },
          ],
        },
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockBraveRes,
      } as any);

      const results = await searchWeb(
        'tikz package',
        { provider: 'brave', apiKey: 'brave-secret-abc' },
        3
      );

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(String(url)).toContain('https://api.brave.com/res/v1/web/search');
      expect((init as any).headers['X-Subscription-Token']).toBe('brave-secret-abc');
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        title: 'TikZ and PGF Packages',
        url: 'https://ctan.org/pkg/pgf',
        snippet: 'Create graphics programmatically in LaTeX with TikZ.',
        source: 'brave',
      });
    });

    it('uses free DuckDuckGo / Wikipedia fallback when provider is free or unconfigured', async () => {
      const mockDDG = {
        Heading: 'LaTeX',
        AbstractText: 'LaTeX is a software system for document preparation.',
        AbstractURL: 'https://en.wikipedia.org/wiki/LaTeX',
        RelatedTopics: [
          {
            Text: 'Overleaf - Cloud LaTeX editor',
            FirstURL: 'https://www.overleaf.com',
          },
        ],
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockDDG,
      } as any);

      const results = await searchWeb('latex', { provider: 'free' }, 5);
      expect(fetchSpy).toHaveBeenCalled();
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].title).toBe('LaTeX');
      expect(results[0].source).toBe('duckduckgo');
      expect(results[0].url).toBe('https://en.wikipedia.org/wiki/LaTeX');
    });

    it('falls back to Wikipedia search when DuckDuckGo yields no results', async () => {
      const emptyDDG = {
        Heading: '',
        AbstractText: '',
        RelatedTopics: [],
      };
      const mockWiki = {
        query: {
          search: [
            {
              title: 'BibTeX',
              snippet: '<span class="searchmatch">BibTeX</span> is reference management software.',
              pageid: 12345,
            },
          ],
        },
      };

      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          json: async () => emptyDDG,
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockWiki,
        } as any);

      const results = await searchWeb('bibtex', undefined, 5);
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('BibTeX');
      expect(results[0].snippet).toBe('BibTeX is reference management software.');
      expect(results[0].source).toBe('wikipedia');
      expect(results[0].url).toBe('https://en.wikipedia.org/wiki/BibTeX');
    });

    it('handles network error cleanly and returns empty array', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network offline'));
      const results = await searchWeb('anything');
      expect(results).toEqual([]);
    });
  });
});
