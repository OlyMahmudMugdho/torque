import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type http from 'node:http';
import * as academicRoute from '../../app/api/search/academic/route';
import * as webRoute from '../../app/api/search/web/route';
import * as serverModule from '../../../scripts/compiler-server.js';
import * as searchService from '../../ai/searchService';

describe('Search Endpoints', () => {
  describe('Next.js App Router - /api/search/academic', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('handles OPTIONS preflight with 204 and CORS headers', async () => {
      const res = await academicRoute.OPTIONS();
      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
      expect(res.headers.get('access-control-allow-methods')).toContain('GET');
      expect(res.headers.get('access-control-allow-methods')).toContain('POST');
      expect(res.headers.get('access-control-allow-methods')).toContain('OPTIONS');
    });

    it('handles GET with valid query returning 200 and search results', async () => {
      vi.spyOn(searchService, 'searchAcademic').mockResolvedValueOnce([
        {
          title: 'Attention Is All You Need',
          authors: ['Ashish Vaswani'],
          year: 2017,
          abstract: 'Transformer architecture',
          url: 'https://arxiv.org/abs/1706.03762',
          citationKey: 'vaswani2017attention',
          bibtex: '@article{vaswani2017attention,\n  title = {Attention Is All You Need}\n}',
          source: 'arxiv',
        },
      ]);

      const req = new Request('http://localhost:3000/api/search/academic?query=attention&source=arxiv&maxResults=1');
      const res = await academicRoute.GET(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');

      const data = await res.json();
      expect(data.results).toHaveLength(1);
      expect(data.results[0].title).toBe('Attention Is All You Need');
      expect(searchService.searchAcademic).toHaveBeenCalledWith('attention', {
        source: 'arxiv',
        maxResults: 1,
      });
    });

    it('handles GET missing query returning 400', async () => {
      const req = new Request('http://localhost:3000/api/search/academic');
      const res = await academicRoute.GET(req);
      expect(res.status).toBe(400);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');

      const data = await res.json();
      expect(data.error).toBe('Missing required parameter: query');
    });

    it('handles POST with valid body returning 200 and search results', async () => {
      vi.spyOn(searchService, 'searchAcademic').mockResolvedValueOnce([
        {
          title: 'Deep Residual Learning',
          authors: ['Kaiming He'],
          year: 2016,
          abstract: 'ResNet',
          url: 'https://arxiv.org/abs/1512.03385',
          citationKey: 'he2016deep',
          bibtex: '@article{he2016deep,\n  title = {Deep Residual Learning}\n}',
          source: 'arxiv',
        },
      ]);

      const req = new Request('http://localhost:3000/api/search/academic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'resnet',
          source: 'arxiv',
          maxResults: 3,
        }),
      });

      const res = await academicRoute.POST(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');

      const data = await res.json();
      expect(data.results).toHaveLength(1);
      expect(data.results[0].title).toBe('Deep Residual Learning');
      expect(searchService.searchAcademic).toHaveBeenCalledWith('resnet', {
        source: 'arxiv',
        maxResults: 3,
      });
    });

    it('handles POST missing query returning 400', async () => {
      const req = new Request('http://localhost:3000/api/search/academic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'arxiv' }),
      });

      const res = await academicRoute.POST(req);
      expect(res.status).toBe(400);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');

      const data = await res.json();
      expect(data.error).toBe('Missing required parameter: query');
    });
  });

  describe('Next.js App Router - /api/search/web', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('handles OPTIONS preflight with 204 and CORS headers', async () => {
      const res = await webRoute.OPTIONS();
      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
      expect(res.headers.get('access-control-allow-methods')).toContain('GET');
      expect(res.headers.get('access-control-allow-methods')).toContain('POST');
      expect(res.headers.get('access-control-allow-methods')).toContain('OPTIONS');
    });

    it('handles GET with valid query returning 200 and search results', async () => {
      vi.spyOn(searchService, 'searchWeb').mockResolvedValueOnce([
        {
          title: 'LaTeX Wikibook',
          url: 'https://en.wikibooks.org/wiki/LaTeX',
          snippet: 'Comprehensive guide to LaTeX.',
          source: 'wikipedia',
        },
      ]);

      const req = new Request('http://localhost:3000/api/search/web?query=latex%20guide&maxResults=2');
      const res = await webRoute.GET(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');

      const data = await res.json();
      expect(data.results).toHaveLength(1);
      expect(data.results[0].title).toBe('LaTeX Wikibook');
      expect(searchService.searchWeb).toHaveBeenCalledWith('latex guide', undefined, 2);
    });

    it('handles GET missing query returning 400', async () => {
      const req = new Request('http://localhost:3000/api/search/web');
      const res = await webRoute.GET(req);
      expect(res.status).toBe(400);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');

      const data = await res.json();
      expect(data.error).toBe('Missing required parameter: query');
    });

    it('handles POST with valid body returning 200 and search results', async () => {
      vi.spyOn(searchService, 'searchWeb').mockResolvedValueOnce([
        {
          title: 'TikZ and PGF',
          url: 'https://ctan.org/pkg/pgf',
          snippet: 'Graphics package for TeX and LaTeX.',
          source: 'duckduckgo',
        },
      ]);

      const req = new Request('http://localhost:3000/api/search/web', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'tikz graphics',
          settings: { provider: 'free' },
          maxResults: 5,
        }),
      });

      const res = await webRoute.POST(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');

      const data = await res.json();
      expect(data.results).toHaveLength(1);
      expect(data.results[0].title).toBe('TikZ and PGF');
      expect(searchService.searchWeb).toHaveBeenCalledWith('tikz graphics', { provider: 'free' }, 5);
    });

    it('handles POST missing query returning 400', async () => {
      const req = new Request('http://localhost:3000/api/search/web', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const res = await webRoute.POST(req);
      expect(res.status).toBe(400);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');

      const data = await res.json();
      expect(data.error).toBe('Missing required parameter: query');
    });
  });

  describe('Standalone compiler-server.js Search Endpoints', () => {
    let server: http.Server;
    let baseUrl: string;

    beforeAll(async () => {
      server = serverModule.createCompilerServer();
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const addr = server.address() as any;
      baseUrl = `http://127.0.0.1:${addr.port}`;
    });

    afterAll(async () => {
      if (server) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('OPTIONS /api/search/academic returns 204 with CORS headers', async () => {
      const res = await fetch(`${baseUrl}/api/search/academic`, { method: 'OPTIONS' });
      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
    });

    it('GET /api/search/academic without query returns 400', async () => {
      const res = await fetch(`${baseUrl}/api/search/academic`);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('query');
    });

    it('POST /api/search/academic without query returns 400', async () => {
      const res = await fetch(`${baseUrl}/api/search/academic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('query');
    });

    it('GET /api/search/academic with query returns 200 and results', async () => {
      vi.spyOn(searchService, 'searchAcademic').mockResolvedValueOnce([
        {
          title: 'Quantum Computing in TeX',
          authors: ['Richard Feynman'],
          year: 1982,
          abstract: 'Simulating physics with computers.',
          url: 'https://arxiv.org/abs/quant-ph/9909001',
          citationKey: 'feynman1982simulating',
          bibtex: '@article{feynman1982simulating,\n  title = {Quantum Computing}\n}',
          source: 'arxiv',
        },
      ]);

      const res = await fetch(`${baseUrl}/api/search/academic?query=quantum&source=arxiv`);
      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
      const data = await res.json();
      expect(Array.isArray(data.results)).toBe(true);
      expect(data.results[0].title).toBe('Quantum Computing in TeX');
    });

    it('POST /api/search/academic with query returns 200 and results', async () => {
      vi.spyOn(searchService, 'searchAcademic').mockResolvedValueOnce([
        {
          title: 'Neural Networks and Deep Learning',
          authors: ['Yann LeCun'],
          year: 2015,
          abstract: 'Deep learning review.',
          url: 'https://arxiv.org/abs/1502.01852',
          citationKey: 'lecun2015deep',
          bibtex: '@article{lecun2015deep,\n  title = {Deep Learning}\n}',
          source: 'arxiv',
        },
      ]);

      const res = await fetch(`${baseUrl}/api/search/academic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'deep learning', maxResults: 2 }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.results)).toBe(true);
      expect(data.results[0].title).toBe('Neural Networks and Deep Learning');
    });

    it('OPTIONS /api/search/web returns 204 with CORS headers', async () => {
      const res = await fetch(`${baseUrl}/api/search/web`, { method: 'OPTIONS' });
      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
    });

    it('GET /api/search/web without query returns 400', async () => {
      const res = await fetch(`${baseUrl}/api/search/web`);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('query');
    });

    it('POST /api/search/web without query returns 400', async () => {
      const res = await fetch(`${baseUrl}/api/search/web`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('query');
    });

    it('GET /api/search/web with query returns 200 and results', async () => {
      vi.spyOn(searchService, 'searchWeb').mockResolvedValueOnce([
        {
          title: 'TeX Live Distribution',
          url: 'https://tug.org/texlive/',
          snippet: 'Comprehensive TeX system for Unix and Windows.',
          source: 'wikipedia',
        },
      ]);

      const res = await fetch(`${baseUrl}/api/search/web?query=texlive`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.results)).toBe(true);
      expect(data.results[0].title).toBe('TeX Live Distribution');
    });

    it('POST /api/search/web with query returns 200 and results', async () => {
      vi.spyOn(searchService, 'searchWeb').mockResolvedValueOnce([
        {
          title: 'BibLaTeX Guide',
          url: 'https://ctan.org/pkg/biblatex',
          snippet: 'Modern bibliography management.',
          source: 'duckduckgo',
        },
      ]);

      const res = await fetch(`${baseUrl}/api/search/web`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'biblatex', settings: { provider: 'free' } }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.results)).toBe(true);
      expect(data.results[0].title).toBe('BibLaTeX Guide');
    });
  });
});
