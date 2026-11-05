import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentClient, buildWorkspaceSystemPrompt, type ChatMessage, type WorkspaceToolContext } from '../agentClient';
import type { AIProviderConfig } from '../../types/ai';

const mockConfig: AIProviderConfig = {
  id: 'test-openai',
  name: 'OpenAI Test',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'sk-test-key-12345',
  selectedModel: 'gpt-4o',
  availableModels: ['gpt-4o'],
};

describe('AgentClient', () => {
  let client: AgentClient;
  let mockContext: WorkspaceToolContext;
  let fileStorage: Record<string, string>;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = new AgentClient(mockConfig);
    fileStorage = {
      'main.tex': '\\documentclass{article}\n\\begin{document}\nHello World\n\\end{document}\n',
    };

    mockContext = {
      readFile: vi.fn(async (path: string) => fileStorage[path] ?? null),
      writeFile: vi.fn(async (path: string, content: string) => {
        fileStorage[path] = content;
      }),
      compile: vi.fn(async (engine?: string) => ({
        success: true,
        log: `Compiled successfully with ${engine || 'pdflatex'}`,
      })),
      getDiagnostics: vi.fn(async () => ({
        errors: [],
        warnings: [],
      })),
    };
  });

  describe('sendMessage', () => {
    it('sends standard text messages and returns assistant response without tools', async () => {
      const mockApiResponse = {
        id: 'chatcmpl-1',
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Hello! How can I assist you with LaTeX today?',
            },
          },
        ],
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockApiResponse,
      } as any);

      const messages: ChatMessage[] = [
        {
          id: 'user-1',
          role: 'user',
          content: 'Hi',
          timestamp: Date.now(),
        },
      ];

      const res = await client.sendMessage(messages, mockContext);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, requestInit] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      expect((requestInit?.headers as any)['Authorization']).toBe('Bearer sk-test-key-12345');
      const body = JSON.parse(requestInit?.body as string);
      expect(body.model).toBe('gpt-4o');
      expect(body.messages).toEqual([{ role: 'user', content: 'Hi' }]);
      expect(body.stream).toBe(false);

      expect(res.role).toBe('assistant');
      expect(res.content).toBe('Hello! How can I assist you with LaTeX today?');
      expect(res.toolCalls).toBeUndefined();
    });

    it('falls back to /api/ai-proxy when direct fetch throws a network / CORS error', async () => {
      const mockApiResponse = {
        id: 'chatcmpl-fallback',
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Fallback response via proxy',
            },
          },
        ],
      };

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockApiResponse,
        } as any);

      const messages: ChatMessage[] = [
        {
          id: 'user-1',
          role: 'user',
          content: 'Hello local LLM',
          timestamp: Date.now(),
        },
      ];

      const res = await client.sendMessage(messages, mockContext);

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
      expect(fetchSpy.mock.calls[1][0]).toBe('/api/ai-proxy');
      const proxyReq = fetchSpy.mock.calls[1][1];
      expect(proxyReq?.method).toBe('POST');
      const proxyBody = JSON.parse(proxyReq?.body as string);
      expect(proxyBody.url).toBe('https://api.openai.com/v1/chat/completions');
      expect(proxyBody.method).toBe('POST');
      expect(proxyBody.stream).toBe(false);
      expect(proxyBody.body.model).toBe('gpt-4o');
      expect(res.content).toBe('Fallback response via proxy');
    });

    it('rethrows abort error without proxying when request is aborted', async () => {
      const abortController = new AbortController();
      abortController.abort();

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValueOnce(new DOMException('The user aborted a request.', 'AbortError'));

      const messages: ChatMessage[] = [
        {
          id: 'user-1',
          role: 'user',
          content: 'Hello',
          timestamp: Date.now(),
        },
      ];

      await expect(
        client.sendMessage(messages, mockContext, { signal: abortController.signal })
      ).rejects.toThrow('The user aborted a request.');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('formats role: tool and previous assistant tool calls properly for OpenAI payload', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'Updated.' } }],
        }),
      } as any);

      const messages: ChatMessage[] = [
        {
          id: '1',
          role: 'assistant',
          content: 'Checking...',
          toolCalls: [
            {
              id: 'call-1',
              name: 'torque_read_file',
              args: { path: 'main.tex' },
              status: 'done',
              result: 'content',
            },
          ],
          timestamp: 1,
        },
        {
          id: '2',
          role: 'tool',
          toolCallId: 'call-1',
          content: 'content',
          timestamp: 2,
        },
      ];

      await client.sendMessage(messages, mockContext);

      const [, req] = (globalThis.fetch as any).mock.calls[0];
      const parsedBody = JSON.parse(req.body);
      expect(parsedBody.messages[0]).toEqual({
        role: 'assistant',
        content: 'Checking...',
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: {
              name: 'torque_read_file',
              arguments: JSON.stringify({ path: 'main.tex' }),
            },
          },
        ],
      });
      expect(parsedBody.messages[1]).toEqual({
        role: 'tool',
        tool_call_id: 'call-1',
        content: 'content',
      });
    });

    it('handles torque_write_file tool call and attaches diff in pending_approval status', async () => {
      const mockApiResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'I will create a new section.',
              tool_calls: [
                {
                  id: 'call_write_1',
                  type: 'function',
                  function: {
                    name: 'torque_write_file',
                    arguments: JSON.stringify({
                      path: 'section.tex',
                      content: '\\section{Introduction}\nContent goes here.\n',
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
        [{ id: '1', role: 'user', content: 'Create section.tex', timestamp: 1 }],
        mockContext
      );

      expect(res.toolCalls).toHaveLength(1);
      const tc = res.toolCalls![0];
      expect(tc.id).toBe('call_write_1');
      expect(tc.name).toBe('torque_write_file');
      expect(tc.status).toBe('pending_approval');
      expect(tc.diff).toBeDefined();
      expect(tc.diff?.path).toBe('section.tex');
      expect(tc.diff?.originalContent).toBe('');
      expect(tc.diff?.newContent).toBe('\\section{Introduction}\nContent goes here.\n');
      expect(tc.diff?.additions).toBeGreaterThan(0);
      expect(mockContext.writeFile).not.toHaveBeenCalled();
    });

    it('handles torque_edit_file tool call and attaches surgical diff in pending_approval status', async () => {
      const mockApiResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Updating document greeting.',
              tool_calls: [
                {
                  id: 'call_edit_1',
                  type: 'function',
                  function: {
                    name: 'torque_edit_file',
                    arguments: JSON.stringify({
                      path: 'main.tex',
                      target: 'Hello World',
                      replacement: 'Hello Torque',
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
        [{ id: '1', role: 'user', content: 'Rename Hello World', timestamp: 1 }],
        mockContext
      );

      expect(res.toolCalls).toHaveLength(1);
      const tc = res.toolCalls![0];
      expect(tc.id).toBe('call_edit_1');
      expect(tc.name).toBe('torque_edit_file');
      expect(tc.status).toBe('pending_approval');
      expect(tc.diff).toBeDefined();
      expect(tc.diff?.path).toBe('main.tex');
      expect(tc.diff?.originalContent).toContain('Hello World');
      expect(tc.diff?.newContent).toContain('Hello Torque');
      expect(mockContext.writeFile).not.toHaveBeenCalled();
    });

    it('marks torque_edit_file as failed if target is not found in file', async () => {
      const mockApiResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              tool_calls: [
                {
                  id: 'call_edit_err',
                  type: 'function',
                  function: {
                    name: 'torque_edit_file',
                    arguments: JSON.stringify({
                      path: 'main.tex',
                      target: 'Non-existent text string',
                      replacement: 'foo',
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
        [{ id: '1', role: 'user', content: 'Edit text', timestamp: 1 }],
        mockContext
      );

      const tc = res.toolCalls![0];
      expect(tc.status).toBe('failed');
      expect(tc.error).toContain('Target string not found');
    });

    it('executes read-only torque_read_file tool immediately without approval', async () => {
      const mockApiResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Reading file...',
              tool_calls: [
                {
                  id: 'call_read_1',
                  type: 'function',
                  function: {
                    name: 'torque_read_file',
                    arguments: JSON.stringify({
                      path: 'main.tex',
                      startLine: 2,
                      endLine: 3,
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
        [{ id: '1', role: 'user', content: 'Read lines 2 to 3', timestamp: 1 }],
        mockContext
      );

      expect(mockContext.readFile).toHaveBeenCalledWith('main.tex');
      expect(res.toolCalls).toHaveLength(1);
      const tc = res.toolCalls![0];
      expect(tc.status).toBe('done');
      expect(tc.result).toBe('\\begin{document}\nHello World');
    });

    it('executes torque_compile and torque_get_diagnostics immediately', async () => {
      const mockApiResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              tool_calls: [
                {
                  id: 'call_cmp',
                  type: 'function',
                  function: {
                    name: 'torque_compile',
                    arguments: JSON.stringify({ engine: 'xelatex' }),
                  },
                },
                {
                  id: 'call_diag',
                  type: 'function',
                  function: {
                    name: 'torque_get_diagnostics',
                    arguments: '{}',
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
        [{ id: '1', role: 'user', content: 'Compile document', timestamp: 1 }],
        mockContext
      );

      expect(mockContext.compile).toHaveBeenCalledWith('xelatex');
      expect(mockContext.getDiagnostics).toHaveBeenCalled();
      expect(res.toolCalls![0].status).toBe('done');
      expect(res.toolCalls![0].result.success).toBe(true);
      expect(res.toolCalls![1].status).toBe('done');
    });

    it('handles streaming responses and invokes onChunk callback', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" World"}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const stream = new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(new TextEncoder().encode(chunk));
          }
          controller.close();
        },
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: stream,
      } as any);

      const chunkTokens: string[] = [];
      const res = await client.sendMessage(
        [{ id: '1', role: 'user', content: 'Stream test', timestamp: 1 }],
        mockContext,
        {
          onChunk: (token) => chunkTokens.push(token),
        }
      );

      expect(chunkTokens).toEqual(['Hello', ' World']);
      expect(res.content).toBe('Hello World');
    });

    it('throws error when API response is not ok', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Invalid API Key',
      } as any);

      await expect(
        client.sendMessage([{ id: '1', role: 'user', content: 'Hi', timestamp: 1 }], mockContext)
      ).rejects.toThrow('AI request failed (401): Invalid API Key');
    });
  });

  describe('approveToolCall', () => {
    it('applies file diff via context.writeFile, updates tool status to accepted, and returns toolMessage', async () => {
      const assistantMessage: ChatMessage = {
        id: 'msg-assistant-1',
        role: 'assistant',
        content: 'Proposed changes',
        toolCalls: [
          {
            id: 'call-write-approved',
            name: 'torque_write_file',
            args: { path: 'notes.tex', content: '% Notes' },
            status: 'pending_approval',
            diff: {
              path: 'notes.tex',
              originalContent: '',
              newContent: '% Notes',
              additions: 1,
              deletions: 0,
              diffHunks: [],
              unifiedDiff: '',
            },
          },
        ],
        timestamp: Date.now(),
      };

      const result = await client.approveToolCall(assistantMessage, 'call-write-approved', mockContext);

      expect(mockContext.writeFile).toHaveBeenCalledWith('notes.tex', '% Notes');
      expect(result.updatedMessage.toolCalls![0].status).toBe('accepted');
      expect(result.toolMessage.role).toBe('tool');
      expect(result.toolMessage.toolCallId).toBe('call-write-approved');
      expect(JSON.parse(result.toolMessage.content)).toEqual({
        status: 'success',
        message: 'Changes applied.',
      });
    });

    it('throws error if toolCallId is not found in message', async () => {
      const assistantMessage: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: 'No tools',
        toolCalls: [],
        timestamp: Date.now(),
      };

      await expect(client.approveToolCall(assistantMessage, 'non-existent', mockContext)).rejects.toThrow(
        'Tool call with ID "non-existent" not found in message.'
      );
    });
  });

  describe('rejectToolCall', () => {
    it('sets tool status to rejected, does not write file, and returns toolMessage with reason', async () => {
      const assistantMessage: ChatMessage = {
        id: 'msg-assistant-2',
        role: 'assistant',
        content: 'Proposed changes',
        toolCalls: [
          {
            id: 'call-reject-1',
            name: 'torque_write_file',
            args: { path: 'notes.tex', content: '% Notes' },
            status: 'pending_approval',
            diff: {
              path: 'notes.tex',
              originalContent: '',
              newContent: '% Notes',
              additions: 1,
              deletions: 0,
              diffHunks: [],
              unifiedDiff: '',
            },
          },
        ],
        timestamp: Date.now(),
      };

      const result = await client.rejectToolCall(
        assistantMessage,
        'call-reject-1',
        'User rejected: not needed'
      );

      expect(mockContext.writeFile).not.toHaveBeenCalled();
      expect(result.updatedMessage.toolCalls![0].status).toBe('rejected');
      expect(result.toolMessage.role).toBe('tool');
      expect(result.toolMessage.toolCallId).toBe('call-reject-1');
      expect(JSON.parse(result.toolMessage.content)).toEqual({
        status: 'rejected',
        message: 'User rejected: not needed',
      });
    });

    it('throws error if toolCallId is not found in message', async () => {
      const assistantMessage: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: 'No tools',
        timestamp: Date.now(),
      };

      await expect(client.rejectToolCall(assistantMessage, 'non-existent')).rejects.toThrow(
        'Tool call with ID "non-existent" not found in message.'
      );
    });
  });

  describe('runTurn & buildWorkspaceSystemPrompt', () => {
    it('builds system prompt with active file and project file list', () => {
      const prompt = buildWorkspaceSystemPrompt({
        files: { 'main.tex': 'content', 'refs.bib': 'refs' },
        activeFilePath: 'main.tex',
      });

      expect(prompt).toContain('Active Document: main.tex');
      expect(prompt).toContain('Project Files: main.tex, refs.bib');
      expect(prompt).toContain('torque_read_file');
      expect(prompt).toContain('torque_edit_file');
    });

    it('executes multi-turn agent loop when read-only tool is called', async () => {
      // Turn 1: Model calls torque_read_file
      const turn1Response = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call_read_1',
                  type: 'function',
                  function: {
                    name: 'torque_read_file',
                    arguments: JSON.stringify({ path: 'main.tex' }),
                  },
                },
              ],
            },
          },
        ],
      };

      // Turn 2: Model receives tool result and provides final summary
      const turn2Response = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Here is the summary of main.tex: It is a LaTeX article.',
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
          id: 'user-1',
          role: 'user',
          content: 'Summarize main.tex',
          timestamp: Date.now(),
        },
      ];

      const messagesChangeSpy = vi.fn();
      const result = await client.runTurn(conversation, mockContext, {
        systemPrompt: 'System instructions',
        onMessagesChange: messagesChangeSpy,
      });

      expect(fetchSpy).toHaveBeenCalledTimes(2);

      // Verify Turn 1 request included system prompt
      const [, firstCallReq] = fetchSpy.mock.calls[0];
      const firstBody = JSON.parse(firstCallReq?.body as string);
      expect(firstBody.messages[0].role).toBe('system');
      expect(firstBody.messages[0].content).toBe('System instructions');
      expect(firstBody.messages[1].content).toBe('Summarize main.tex');

      // Verify Turn 2 request included tool response
      const [, secondCallReq] = fetchSpy.mock.calls[1];
      const secondBody = JSON.parse(secondCallReq?.body as string);
      expect(secondBody.messages).toHaveLength(4); // system, user, assistant(tool_call), tool
      expect(secondBody.messages[2].tool_calls[0].id).toBe('call_read_1');
      expect(secondBody.messages[3].role).toBe('tool');
      expect(secondBody.messages[3].tool_call_id).toBe('call_read_1');
      expect(secondBody.messages[3].content).toContain('\\documentclass{article}');

      // Verify final conversation messages returned
      expect(result.length).toBeGreaterThanOrEqual(4);
      const lastMsg = result[result.length - 1];
      expect(lastMsg.role).toBe('assistant');
      expect(lastMsg.content).toContain('Here is the summary of main.tex');
    });

    it('pauses loop when tool requires user approval (torque_edit_file)', async () => {
      const turn1Response = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Applying title update.',
              tool_calls: [
                {
                  id: 'call_edit_pending',
                  type: 'function',
                  function: {
                    name: 'torque_edit_file',
                    arguments: JSON.stringify({
                      path: 'main.tex',
                      target: 'Hello World',
                      replacement: 'Quantum Simulation',
                    }),
                  },
                },
              ],
            },
          },
        ],
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => turn1Response,
      } as any);

      const conversation: ChatMessage[] = [
        {
          id: 'user-2',
          role: 'user',
          content: 'Update title',
          timestamp: Date.now(),
        },
      ];

      const result = await client.runTurn(conversation, mockContext);

      // Should only call API once because diff requires user approval
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const assistantMsg = result[result.length - 1];
      expect(assistantMsg.role).toBe('assistant');
      expect(assistantMsg.toolCalls).toBeDefined();
      expect(assistantMsg.toolCalls![0].status).toBe('pending_approval');
      expect(assistantMsg.toolCalls![0].diff).toBeDefined();
    });

    it('does not duplicate tool call name in SSE streaming mode', async () => {
      const sseChunks = [
        'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_123","type":"function","function":{"name":"torque_read_file","arguments":""}}]},"finish_reason":null}]}\n\n',
        'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"path\\": \\"main.tex\\"}"}}]},"finish_reason":null}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          for (const chunk of sseChunks) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: stream,
      } as any);

      const res = await client.sendMessage(
        [{ id: '1', role: 'user', content: 'Read main.tex', timestamp: 1 }],
        mockContext,
        { onChunk: () => {} }
      );

      expect(res.toolCalls).toHaveLength(1);
      expect(res.toolCalls![0].name).toBe('torque_read_file');
      expect(res.toolCalls![0].status).toBe('done');
      expect(res.toolCalls![0].result).toContain('\\documentclass{article}');
    });
  });
});
