import type { AIProviderConfig } from '../types/ai';
import { WORKSPACE_TOOLS_SCHEMA, validateToolPath } from './tools';
import { computeFileDiff, applyFilePatch, type FileDiffResult } from './diffUtils';

export interface ToolCallState {
  id: string;
  name: string;
  args: Record<string, any>;
  status: 'pending_approval' | 'accepted' | 'rejected' | 'executing' | 'done' | 'failed';
  diff?: FileDiffResult;
  result?: any;
  error?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCallState[];
  toolCallId?: string; // For role: 'tool'
  timestamp: number;
}

export interface WorkspaceToolContext {
  readFile: (path: string) => Promise<string | null> | (string | null);
  writeFile: (path: string, content: string) => Promise<void> | void;
  compile?: (engine?: string) => Promise<{ success: boolean; log: string }> | { success: boolean; log: string };
  getDiagnostics?: () => Promise<any> | any;
}

export class AgentClient {
  constructor(public config: AIProviderConfig) {}

  async sendMessage(
    messages: ChatMessage[],
    context: WorkspaceToolContext,
    options?: {
      onChunk?: (token: string) => void;
      signal?: AbortSignal;
    }
  ): Promise<ChatMessage> {
    const isStreaming = Boolean(options?.onChunk);
    const url = `${this.config.baseUrl.replace(/\/+$/, '')}/chat/completions`;

    const formattedMessages = messages.map((m) => {
      if (m.role === 'tool') {
        return {
          role: 'tool',
          tool_call_id: m.toolCallId,
          content: m.content,
        };
      }
      if (m.role === 'assistant') {
        const payload: Record<string, any> = {
          role: 'assistant',
          content: m.content || null,
        };
        if (m.toolCalls && m.toolCalls.length > 0) {
          payload.tool_calls = m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args),
            },
          }));
        }
        return payload;
      }
      return {
        role: m.role,
        content: m.content,
      };
    });

    const requestBody = {
      model: this.config.selectedModel,
      messages: formattedMessages,
      tools: WORKSPACE_TOOLS_SCHEMA,
      stream: isStreaming,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: options?.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`AI request failed (${res.status}): ${errText}`);
    }

    let content = '';
    interface RawToolCall {
      id: string;
      name: string;
      arguments: string;
    }
    const rawToolCallsMap: Record<number, RawToolCall> = {};

    if (isStreaming && res.body) {
      const reader = res.body.getReader ? res.body.getReader() : null;
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      const handleChunkText = (chunkText: string) => {
        buffer += chunkText;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          if (trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6).trim();
            try {
              const parsed = JSON.parse(jsonStr);
              const choice = parsed.choices?.[0];
              const delta = choice?.delta;
              if (delta?.content) {
                content += delta.content;
                options?.onChunk?.(delta.content);
              }
              if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? 0;
                  if (!rawToolCallsMap[idx]) {
                    rawToolCallsMap[idx] = {
                      id: tc.id || '',
                      name: tc.function?.name || '',
                      arguments: '',
                    };
                  }
                  if (tc.id) rawToolCallsMap[idx].id = tc.id;
                  if (tc.function?.name) rawToolCallsMap[idx].name += tc.function.name;
                  if (tc.function?.arguments) rawToolCallsMap[idx].arguments += tc.function.arguments;
                }
              }
            } catch {
              // ignore malformed SSE line
            }
          }
        }
      };

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          handleChunkText(decoder.decode(value, { stream: true }));
        }
        if (buffer) {
          handleChunkText('\n');
        }
      } else if (typeof (res.body as any)[Symbol.asyncIterator] === 'function') {
        for await (const chunk of res.body as any) {
          const str = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
          handleChunkText(str);
        }
        if (buffer) {
          handleChunkText('\n');
        }
      }
    } else {
      const data = await res.json();
      const message = data.choices?.[0]?.message;
      content = message?.content || '';
      if (message?.tool_calls && Array.isArray(message.tool_calls)) {
        message.tool_calls.forEach((tc: any, idx: number) => {
          rawToolCallsMap[idx] = {
            id: tc.id || `call_${idx}`,
            name: tc.function?.name || '',
            arguments:
              typeof tc.function?.arguments === 'string'
                ? tc.function.arguments
                : JSON.stringify(tc.function?.arguments ?? {}),
          };
        });
      }
    }

    const rawToolCalls = Object.values(rawToolCallsMap);
    const toolCalls: ToolCallState[] = [];

    for (const raw of rawToolCalls) {
      let parsedArgs: Record<string, any> = {};
      try {
        parsedArgs = raw.arguments ? JSON.parse(raw.arguments) : {};
      } catch {
        parsedArgs = {};
      }

      const tcState: ToolCallState = {
        id: raw.id,
        name: raw.name,
        args: parsedArgs,
        status: 'pending_approval',
      };

      switch (raw.name) {
        case 'torque_edit_file': {
          try {
            const normPath = validateToolPath(parsedArgs.path);
            const original = await context.readFile(normPath);
            if (original === null) {
              tcState.status = 'failed';
              tcState.error = `File not found: ${normPath}`;
            } else {
              const patchResult = applyFilePatch(original, parsedArgs.target, parsedArgs.replacement);
              if (!patchResult.success) {
                tcState.status = 'failed';
                tcState.error = patchResult.error || 'Failed to apply file patch';
              } else {
                const diff = computeFileDiff(normPath, original, patchResult.content);
                tcState.diff = diff;
                tcState.status = 'pending_approval';
              }
            }
          } catch (err: any) {
            tcState.status = 'failed';
            tcState.error = err.message || 'Error processing torque_edit_file';
          }
          break;
        }

        case 'torque_write_file': {
          try {
            const normPath = validateToolPath(parsedArgs.path);
            const original = (await context.readFile(normPath)) ?? '';
            const diff = computeFileDiff(normPath, original, parsedArgs.content ?? '');
            tcState.diff = diff;
            tcState.status = 'pending_approval';
          } catch (err: any) {
            tcState.status = 'failed';
            tcState.error = err.message || 'Error processing torque_write_file';
          }
          break;
        }

        case 'torque_read_file': {
          try {
            const normPath = validateToolPath(parsedArgs.path);
            const original = await context.readFile(normPath);
            if (original === null) {
              tcState.status = 'failed';
              tcState.error = `File not found: ${normPath}`;
            } else {
              let result = original;
              if (typeof parsedArgs.startLine === 'number' || typeof parsedArgs.endLine === 'number') {
                const lines = original.split('\n');
                const start = Math.max(1, parsedArgs.startLine ?? 1) - 1;
                const end =
                  parsedArgs.endLine !== undefined ? Math.min(lines.length, parsedArgs.endLine) : lines.length;
                result = lines.slice(start, end).join('\n');
              }
              tcState.status = 'done';
              tcState.result = result;
            }
          } catch (err: any) {
            tcState.status = 'failed';
            tcState.error = err.message || 'Error processing torque_read_file';
          }
          break;
        }

        case 'torque_compile': {
          if (!context.compile) {
            tcState.status = 'failed';
            tcState.error = 'Compilation is not supported in this workspace context';
          } else {
            try {
              const res = await context.compile(parsedArgs.engine);
              tcState.status = 'done';
              tcState.result = res;
            } catch (err: any) {
              tcState.status = 'failed';
              tcState.error = err.message || 'Compilation failed';
            }
          }
          break;
        }

        case 'torque_get_diagnostics': {
          if (!context.getDiagnostics) {
            tcState.status = 'failed';
            tcState.error = 'Diagnostics are not supported in this workspace context';
          } else {
            try {
              const res = await context.getDiagnostics();
              tcState.status = 'done';
              tcState.result = res;
            } catch (err: any) {
              tcState.status = 'failed';
              tcState.error = err.message || 'Failed to get diagnostics';
            }
          }
          break;
        }

        default: {
          tcState.status = 'failed';
          tcState.error = `Unknown tool: ${raw.name}`;
          break;
        }
      }

      toolCalls.push(tcState);
    }

    return {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      role: 'assistant',
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      timestamp: Date.now(),
    };
  }

  async approveToolCall(
    message: ChatMessage,
    toolCallId: string,
    context: WorkspaceToolContext
  ): Promise<{ updatedMessage: ChatMessage; toolMessage: ChatMessage }> {
    const targetToolCall = message.toolCalls?.find((tc) => tc.id === toolCallId);
    if (!targetToolCall) {
      throw new Error(`Tool call with ID "${toolCallId}" not found in message.`);
    }

    if (
      (targetToolCall.name === 'torque_edit_file' || targetToolCall.name === 'torque_write_file') &&
      targetToolCall.diff
    ) {
      await context.writeFile(targetToolCall.diff.path, targetToolCall.diff.newContent);
    }

    const updatedToolCalls = message.toolCalls?.map((tc) => {
      if (tc.id === toolCallId) {
        return {
          ...tc,
          status: 'accepted' as const,
        };
      }
      return { ...tc };
    });

    const updatedMessage: ChatMessage = {
      ...message,
      toolCalls: updatedToolCalls,
    };

    const toolMessage: ChatMessage = {
      id: `tool-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      role: 'tool',
      toolCallId,
      content: JSON.stringify({ status: 'success', message: 'Changes applied.' }),
      timestamp: Date.now(),
    };

    return { updatedMessage, toolMessage };
  }

  async rejectToolCall(
    message: ChatMessage,
    toolCallId: string,
    reason?: string
  ): Promise<{ updatedMessage: ChatMessage; toolMessage: ChatMessage }> {
    const targetToolCall = message.toolCalls?.find((tc) => tc.id === toolCallId);
    if (!targetToolCall) {
      throw new Error(`Tool call with ID "${toolCallId}" not found in message.`);
    }

    const updatedToolCalls = message.toolCalls?.map((tc) => {
      if (tc.id === toolCallId) {
        return {
          ...tc,
          status: 'rejected' as const,
        };
      }
      return { ...tc };
    });

    const updatedMessage: ChatMessage = {
      ...message,
      toolCalls: updatedToolCalls,
    };

    const toolMessage: ChatMessage = {
      id: `tool-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      role: 'tool',
      toolCallId,
      content: JSON.stringify({
        status: 'rejected',
        message: reason || 'User rejected the proposed changes.',
      }),
      timestamp: Date.now(),
    };

    return { updatedMessage, toolMessage };
  }
}
