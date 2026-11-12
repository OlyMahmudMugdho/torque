import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentClient, buildWorkspaceSystemPrompt, type ChatMessage, type WorkspaceToolContext } from '../agentClient';
import * as searchService from '../searchService';
import type { AIProviderConfig, AcademicSearchResult, WebSearchResult } from '../../types/ai';

const mockConfig: AIProviderConfig = {
  id: 'test-openai',
  name: 'OpenAI Test',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'sk-test-key-12345',
  selectedModel: 'gpt-4o',
  availableModels: ['gpt-4o'],
};

const sampleAcademicResults: AcademicSearchResult[] = [
  {
    title: 'Attention Is All You Need',
    authors: ['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar'],
    year: 2017,
    abstract: 'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks...',
    url: 'https://arxiv.org/abs/1706.03762',
    citationKey: 'vaswani2017attention',
    bibtex: `@article{vaswani2017attention,\n  title = {Attention Is All You Need},\n  author = {Ashish Vaswani and Noam Shazeer and Niki Parmar},\n  journal = {arXiv preprint arXiv:1706.03762},\n  year = {2017}\n}`,
    source: 'arxiv',
  },
];

const sampleWebResults: WebSearchResult[] = [
  {
    title: 'LaTeX/Bibliography Management - Wikibooks',
    snippet: 'For larger projects with many references, BibTeX or BibLaTeX is recommended.',
    url: 'https://en.wikibooks.org/wiki/LaTeX/Bibliography_Management',
    source: 'wikipedia',
  },
];

describe('AgentClient Search Integration', () => {
  let client: AgentClient;
  let mockContext: WorkspaceToolContext;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = new AgentClient(mockConfig);

    mockContext = {
      readFile: vi.fn(async () => 'mock content'),
      writeFile: vi.fn(async () => {}),
      compile: vi.fn(async () => ({ success: true, log: '' })),
      getDiagnostics: vi.fn(async () => []),
    };
  });

  describe('torque_search_academic', () => {
    it('executes torque_search_academic via context handler when provided', async () => {
      const contextSearchAcademic = vi.fn().mockResolvedValue(sampleAcademicResults);
      mockContext.searchAcademic = contextSearchAcademic;

      const mockApiResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call_acad_1',
                  type: 'function',
                  function: {
                    name: 'torque_search_academic',
                    arguments: JSON.stringify({
                      query: 'attention transformers',
                      source: 'arxiv',
                      maxResults: 3,
                    }),
                  },
                },
              ],
            },
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockApiResponse,
      } as any);

      const res = await client.sendMessage(
        [{ id: '1', role: 'user', content: 'Find attention papers', timestamp: 1 }],
        mockContext
      );

      expect(contextSearchAcademic).toHaveBeenCalledWith('attention transformers', {
        source: 'arxiv',
        maxResults: 3,
      });

      expect(res.toolCalls).toHaveLength(1);
      const tc = res.toolCalls![0];
      expect(tc.name).toBe('torque_search_academic');
      expect(tc.status).toBe('done');
      expect(tc.result).toEqual(sampleAcademicResults);
      expect(tc.result[0].citationKey).toBe('vaswani2017attention');
      expect(tc.result[0].bibtex).toContain('@article{vaswani2017attention');
    });

    it('falls back to searchService.searchAcademic when context handler is omitted', async () => {
      delete mockContext.searchAcademic;

      const searchServiceSpy = vi
        .spyOn(searchService, 'searchAcademic')
        .mockResolvedValue(sampleAcademicResults);

      const mockApiResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call_acad_fallback',
                  type: 'function',
                  function: {
                    name: 'torque_search_academic',
                    arguments: JSON.stringify({
                      query: 'quantum computing',
                    }),
                  },
                },
              ],
            },
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockApiResponse,
      } as any);

      const res = await client.sendMessage(
        [{ id: '1', role: 'user', content: 'Search quantum papers', timestamp: 1 }],
        mockContext
      );

      expect(searchServiceSpy).toHaveBeenCalledWith('quantum computing', {
        source: undefined,
        maxResults: undefined,
      });

      expect(res.toolCalls).toHaveLength(1);
      const tc = res.toolCalls![0];
      expect(tc.status).toBe('done');
      expect(tc.result).toEqual(sampleAcademicResults);
    });

    it('fails when query is missing or whitespace', async () => {
      const mockApiResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call_acad_no_query',
                  type: 'function',
                  function: {
                    name: 'torque_search_academic',
                    arguments: JSON.stringify({ query: '   ' }),
                  },
                },
              ],
            },
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockApiResponse,
      } as any);

      const res = await client.sendMessage(
        [{ id: '1', role: 'user', content: 'Search', timestamp: 1 }],
        mockContext
      );

      expect(res.toolCalls).toHaveLength(1);
      const tc = res.toolCalls![0];
      expect(tc.status).toBe('failed');
      expect(tc.error).toMatch(/query is required/i);
    });

    it('handles errors thrown by searchAcademic gracefully', async () => {
      mockContext.searchAcademic = vi.fn().mockRejectedValue(new Error('Network offline'));

      const mockApiResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call_acad_err',
                  type: 'function',
                  function: {
                    name: 'torque_search_academic',
                    arguments: JSON.stringify({ query: 'machine learning' }),
                  },
                },
              ],
            },
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockApiResponse,
      } as any);

      const res = await client.sendMessage(
        [{ id: '1', role: 'user', content: 'Search ML', timestamp: 1 }],
        mockContext
      );

      const tc = res.toolCalls![0];
      expect(tc.status).toBe('failed');
      expect(tc.error).toBe('Network offline');
    });
  });

  describe('torque_search_web', () => {
    it('executes torque_search_web via context handler when provided', async () => {
      const contextSearchWeb = vi.fn().mockResolvedValue(sampleWebResults);
      mockContext.searchWeb = contextSearchWeb;

      const mockApiResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call_web_1',
                  type: 'function',
                  function: {
                    name: 'torque_search_web',
                    arguments: JSON.stringify({
                      query: 'latex biblatex documentation',
                      maxResults: 5,
                    }),
                  },
                },
              ],
            },
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockApiResponse,
      } as any);

      const res = await client.sendMessage(
        [{ id: '1', role: 'user', content: 'Search documentation', timestamp: 1 }],
        mockContext
      );

      expect(contextSearchWeb).toHaveBeenCalledWith('latex biblatex documentation', 5);

      expect(res.toolCalls).toHaveLength(1);
      const tc = res.toolCalls![0];
      expect(tc.name).toBe('torque_search_web');
      expect(tc.status).toBe('done');
      expect(tc.result).toEqual(sampleWebResults);
    });

    it('falls back to searchService.searchWeb when context handler is omitted', async () => {
      delete mockContext.searchWeb;

      const searchServiceSpy = vi
        .spyOn(searchService, 'searchWeb')
        .mockResolvedValue(sampleWebResults);

      const mockApiResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call_web_fallback',
                  type: 'function',
                  function: {
                    name: 'torque_search_web',
                    arguments: JSON.stringify({
                      query: 'tikz package docs',
                    }),
                  },
                },
              ],
            },
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockApiResponse,
      } as any);

      const res = await client.sendMessage(
        [{ id: '1', role: 'user', content: 'Search tikz', timestamp: 1 }],
        mockContext
      );

      expect(searchServiceSpy).toHaveBeenCalledWith('tikz package docs', undefined, undefined);

      expect(res.toolCalls).toHaveLength(1);
      const tc = res.toolCalls![0];
      expect(tc.status).toBe('done');
      expect(tc.result).toEqual(sampleWebResults);
    });

    it('fails when web query is missing or whitespace', async () => {
      const mockApiResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call_web_no_query',
                  type: 'function',
                  function: {
                    name: 'torque_search_web',
                    arguments: JSON.stringify({}),
                  },
                },
              ],
            },
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockApiResponse,
      } as any);

      const res = await client.sendMessage(
        [{ id: '1', role: 'user', content: 'Web search', timestamp: 1 }],
        mockContext
      );

      expect(res.toolCalls).toHaveLength(1);
      const tc = res.toolCalls![0];
      expect(tc.status).toBe('failed');
      expect(tc.error).toMatch(/query is required/i);
    });

    it('handles errors thrown by searchWeb gracefully', async () => {
      mockContext.searchWeb = vi.fn().mockRejectedValue(new Error('Rate limit exceeded'));

      const mockApiResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call_web_err',
                  type: 'function',
                  function: {
                    name: 'torque_search_web',
                    arguments: JSON.stringify({ query: 'latex fontspec' }),
                  },
                },
              ],
            },
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockApiResponse,
      } as any);

      const res = await client.sendMessage(
        [{ id: '1', role: 'user', content: 'Search fontspec', timestamp: 1 }],
        mockContext
      );

      const tc = res.toolCalls![0];
      expect(tc.status).toBe('failed');
      expect(tc.error).toBe('Rate limit exceeded');
    });
  });

  describe('buildWorkspaceSystemPrompt instructions for search', () => {
    it('includes descriptions and instructions for academic and web search tools', () => {
      const prompt = buildWorkspaceSystemPrompt({
        files: { 'main.tex': '', 'references.bib': '' },
        activeFilePath: 'main.tex',
      });

      expect(prompt).toContain('torque_search_academic');
      expect(prompt).toContain('torque_search_web');
      expect(prompt).toContain('arXiv and Semantic Scholar');
      expect(prompt).toContain('\\cite{');
      expect(prompt).toContain('.bib');
    });
  });

  describe('runTurn with search tools', () => {
    it('executes search tools automatically in multi-turn loop and supplies results to subsequent turn', async () => {
      mockContext.searchAcademic = vi.fn().mockResolvedValue(sampleAcademicResults);

      const turn1Response = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call_turn_acad',
                  type: 'function',
                  function: {
                    name: 'torque_search_academic',
                    arguments: JSON.stringify({ query: 'transformers' }),
                  },
                },
              ],
            },
          },
        ],
      };

      const turn2Response = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'I found "Attention Is All You Need". You can cite it with \\cite{vaswani2017attention}.',
            },
          },
        ],
      };

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => turn1Response,
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => turn2Response,
        } as any);

      const conversation: ChatMessage[] = [
        {
          id: 'user-search',
          role: 'user',
          content: 'Find attention paper',
          timestamp: Date.now(),
        },
      ];

      const result = await client.runTurn(conversation, mockContext);

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(mockContext.searchAcademic).toHaveBeenCalledWith('transformers', {
        source: undefined,
        maxResults: undefined,
      });

      // The second turn request should contain the tool result message
      const [, secondCallReq] = fetchSpy.mock.calls[1];
      const secondBody = JSON.parse(secondCallReq?.body as string);
      const toolMsg = secondBody.messages.find((m: any) => m.role === 'tool');
      expect(toolMsg).toBeDefined();
      expect(toolMsg.tool_call_id).toBe('call_turn_acad');
      expect(toolMsg.content).toContain('Attention Is All You Need');

      const lastMsg = result[result.length - 1];
      expect(lastMsg.role).toBe('assistant');
      expect(lastMsg.content).toContain('vaswani2017attention');
    });
  });
});
