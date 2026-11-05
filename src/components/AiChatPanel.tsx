'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Plus,
  Trash2,
  X,
  ArrowUp,
  Square,
  Bot,
  User,
  Settings,
  AlertTriangle,
  ChevronDown,
  MessageSquare,
} from 'lucide-react';
import { useThemeSafe } from '../context/ThemeContext';
import { AiDiffCard } from './AiDiffCard';
import type { AIProviderConfig, ChatMessage, ChatSession } from '../types/ai';
import type { FileDiffResult } from '../ai/diffUtils';

export interface AiChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  workspace?: {
    files?: Record<string, any>;
    activeFilePath?: string | null;
    activeFileContent?: string;
    updateFileContent?: (path: string, content: string) => void;
    createFile?: (path: string, content: string) => void;
    compileProject?: (engine?: string) => Promise<any>;
    diagnostics?: any[];
  };
  activeProvider?: AIProviderConfig | null;
  onOpenSettings: () => void;
  initialSessions?: ChatSession[];
  onSendMessage?: (message: string, session: ChatSession) => Promise<void> | void;
}

function renderInlineTokens(text: string, keyPrefix: string, isDark: boolean) {
  const tokenRegex = /(\$\$[\s\S]*?\$\$|\$[^$\n]+\$|`[^`\n]+`)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('$$') && token.endsWith('$$')) {
      const formula = token.slice(2, -2);
      parts.push(
        <span
          key={`${keyPrefix}-math-block-${match.index}`}
          className={`block my-1.5 px-2 py-1 rounded text-center font-mono text-xs border ${
            isDark ? 'bg-[#2b2d30] border-[#3e4247] text-[#98c379]' : 'bg-[#eef2ff] border-[#c7d2fe] text-[#3730a3]'
          }`}
        >
          {formula}
        </span>
      );
    } else if (token.startsWith('$') && token.endsWith('$')) {
      const formula = token.slice(1, -1);
      parts.push(
        <span
          key={`${keyPrefix}-math-inline-${match.index}`}
          className={`inline-block mx-0.5 px-1 py-0.2 rounded font-mono text-xs ${
            isDark ? 'bg-[#2b2d30] text-[#98c379]' : 'bg-[#eef2ff] text-[#3730a3]'
          }`}
        >
          {formula}
        </span>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      const code = token.slice(1, -1);
      parts.push(
        <code
          key={`${keyPrefix}-code-${match.index}`}
          className={`px-1 py-0.5 rounded font-mono text-xs ${
            isDark ? 'bg-[#2b2d30] text-[#e5c07b]' : 'bg-[#e9ecef] text-[#b45309]'
          }`}
        >
          {code}
        </code>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function renderTextWithMathAndInline(text: string, keyPrefix: string, isDark: boolean) {
  const paragraphs = text.split(/\n\n+/);
  return (
    <React.Fragment key={keyPrefix}>
      {paragraphs.map((para, pIdx) => {
        const lines = para.split('\n');
        return (
          <p key={`${keyPrefix}-p-${pIdx}`} className="leading-relaxed">
            {lines.map((line, lIdx) => (
              <React.Fragment key={`${keyPrefix}-p-${pIdx}-l-${lIdx}`}>
                {lIdx > 0 && <br />}
                {renderInlineTokens(line, `${keyPrefix}-p-${pIdx}-l-${lIdx}`, isDark)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </React.Fragment>
  );
}

function FormattedAssistantMessage({ content, isDark }: { content: string; isDark: boolean }) {
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index);
      parts.push(renderTextWithMathAndInline(textBefore, `text-${lastIndex}`, isDark));
    }
    const lang = match[1];
    const code = match[2];
    parts.push(
      <div
        key={`code-${match.index}`}
        className={`my-2 rounded border font-mono text-xs overflow-x-auto ${
          isDark ? 'bg-[#18191b] border-[#323232] text-[#e6edf3]' : 'bg-[#f6f8fa] border-[#d0d7de] text-[#1f2328]'
        }`}
      >
        {lang && (
          <div
            className={`px-2.5 py-1 text-[10px] uppercase font-semibold border-b ${
              isDark ? 'border-[#323232] text-[#8b949e]' : 'border-[#d0d7de] text-[#656d76]'
            }`}
          >
            {lang}
          </div>
        )}
        <pre className="p-2.5 leading-relaxed">
          <code>{code}</code>
        </pre>
      </div>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(renderTextWithMathAndInline(content.slice(lastIndex), `text-${lastIndex}`, isDark));
  }

  return <div className="space-y-2 text-xs leading-relaxed">{parts}</div>;
}

export const AiChatPanel: React.FC<AiChatPanelProps> = ({
  isOpen,
  onClose,
  workspace,
  activeProvider,
  onOpenSettings,
  initialSessions,
  onSendMessage,
}) => {
  const { theme } = useThemeSafe();
  const isDark = theme === 'dark';

  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    if (initialSessions && initialSessions.length > 0) {
      return initialSessions;
    }
    return [
      {
        id: 'session-default',
        title: 'New Chat',
        messages: [],
        createdAt: Date.now(),
      },
    ];
  });

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    if (initialSessions && initialSessions.length > 0) {
      return initialSessions[0].id;
    }
    return 'session-default';
  });

  const [inputValue, setInputValue] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Synchronize active session if sessions list changes
  useEffect(() => {
    if (sessions.length > 0 && !sessions.some((s) => s.id === activeSessionId)) {
      setActiveSessionId(sessions[0].id);
    }
  }, [sessions, activeSessionId]);

  // If initialSessions prop updates, update state
  useEffect(() => {
    if (initialSessions && initialSessions.length > 0) {
      setSessions(initialSessions);
    }
  }, [initialSessions]);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [isOpen, activeSession?.messages]);

  if (!isOpen) {
    return null;
  }

  // Check if provider is valid
  const isProviderConfigured = Boolean(
    activeProvider &&
      (Boolean(activeProvider.apiKey) ||
        (activeProvider.baseUrl && activeProvider.baseUrl.includes('localhost')))
  );

  const handleCreateNewChat = () => {
    const newSessionId = `session-${Date.now()}`;
    const newSession: ChatSession = {
      id: newSessionId,
      title: `Chat ${sessions.length + 1}`,
      messages: [],
      createdAt: Date.now(),
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSessionId);
  };

  const handleDeleteSession = (sessionIdToDelete: string) => {
    setSessions((prev) => {
      const remaining = prev.filter((s) => s.id !== sessionIdToDelete);
      if (remaining.length === 0) {
        const fresh: ChatSession = {
          id: `session-${Date.now()}`,
          title: 'New Chat',
          messages: [],
          createdAt: Date.now(),
        };
        setActiveSessionId(fresh.id);
        return [fresh];
      }
      if (sessionIdToDelete === activeSessionId) {
        setActiveSessionId(remaining[0].id);
      }
      return remaining;
    });
  };

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || isGenerating) return;

    setInputValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    const targetSession = activeSession;
    const updatedMessages = [...(targetSession?.messages || []), userMessage];

    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== targetSession.id) return s;
        return {
          ...s,
          messages: updatedMessages,
          title: s.messages.length === 0 ? (text.length > 25 ? text.slice(0, 25) + '...' : text) : s.title,
        };
      })
    );

    if (onSendMessage) {
      setIsGenerating(true);
      try {
        await onSendMessage(text, { ...targetSession, messages: updatedMessages });
      } finally {
        setIsGenerating(false);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAcceptToolCall = (messageId: string, toolCallId: string, diff: FileDiffResult) => {
    if (workspace) {
      const isNewFile = !diff.originalContent;
      if (isNewFile && workspace.createFile) {
        workspace.createFile(diff.path, diff.newContent);
      } else if (workspace.updateFileContent) {
        workspace.updateFileContent(diff.path, diff.newContent);
      } else if (workspace.createFile) {
        workspace.createFile(diff.path, diff.newContent);
      }
    }

    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== activeSessionId) return s;
        return {
          ...s,
          messages: s.messages.map((m) => {
            if (m.id !== messageId) return m;
            return {
              ...m,
              toolCalls: m.toolCalls?.map((tc) => {
                if (tc.id !== toolCallId) return tc;
                return { ...tc, status: 'accepted' as const };
              }),
            };
          }),
        };
      })
    );
  };

  const handleRejectToolCall = (messageId: string, toolCallId: string) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== activeSessionId) return s;
        return {
          ...s,
          messages: s.messages.map((m) => {
            if (m.id !== messageId) return m;
            return {
              ...m,
              toolCalls: m.toolCalls?.map((tc) => {
                if (tc.id !== toolCallId) return tc;
                return { ...tc, status: 'rejected' as const };
              }),
            };
          }),
        };
      })
    );
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    // Auto-adjust height
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
  };

  return (
    <div
      className={`flex flex-col h-full w-full overflow-hidden select-none transition-colors ${
        isDark ? 'bg-[#1e1f22] text-[#dfe1e5]' : 'bg-[#ffffff] text-[#1f2328]'
      }`}
      data-testid="ai-chat-panel"
    >
      {/* Header Bar */}
      <div
        className={`h-8 px-2 border-b flex items-center justify-between text-xs shrink-0 ${
          isDark ? 'border-[#1e1f22] bg-[#2b2d30]' : 'border-[#d1d5db] bg-[#ebecf0]'
        }`}
        data-testid="ai-chat-header"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Sparkles size={14} className="text-[#3574f0] shrink-0" />
          <span className="font-semibold text-xs tracking-tight truncate">AI Assistant</span>

          {/* Active Model Pill */}
          <span
            data-testid="active-model-pill"
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium truncate max-w-[90px] ${
              isDark ? 'bg-[#1e1f22] text-[#868a91] border border-[#393b40]' : 'bg-[#ffffff] text-[#5c6066] border border-[#d1d5db]'
            }`}
            title={activeProvider?.selectedModel || 'No Model'}
          >
            {activeProvider?.selectedModel || 'No Model'}
          </span>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {/* New Chat Button */}
          <button
            type="button"
            data-testid="new-chat-button"
            onClick={handleCreateNewChat}
            title="New Chat"
            className={`p-1 rounded transition ${
              isDark ? 'hover:bg-[#393b40] text-[#868a91] hover:text-[#dfe1e5]' : 'hover:bg-[#dfe1e5] text-[#6c707e] hover:text-[#1f2328]'
            }`}
          >
            <Plus size={14} />
          </button>

          {/* Delete Session Button */}
          <button
            type="button"
            data-testid="delete-session-button"
            onClick={() => handleDeleteSession(activeSessionId)}
            title="Delete Chat Session"
            className={`p-1 rounded transition ${
              isDark ? 'hover:bg-[#393b40] text-[#868a91] hover:text-[#e05555]' : 'hover:bg-[#dfe1e5] text-[#6c707e] hover:text-[#e05555]'
            }`}
          >
            <Trash2 size={13} />
          </button>

          {/* Close Button */}
          <button
            type="button"
            data-testid="close-chat-button"
            onClick={onClose}
            title="Close Assistant"
            className={`p-1 rounded transition ${
              isDark ? 'hover:bg-[#393b40] text-[#868a91] hover:text-[#dfe1e5]' : 'hover:bg-[#dfe1e5] text-[#6c707e] hover:text-[#1f2328]'
            }`}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Sessions Bar */}
      <div
        className={`h-7 px-2 border-b flex items-center justify-between text-xs shrink-0 ${
          isDark ? 'bg-[#1e1f22] border-[#2b2d30]' : 'bg-[#f7f8fa] border-[#e5e7eb]'
        }`}
      >
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <MessageSquare size={12} className={`shrink-0 ${isDark ? 'text-[#868a91]' : 'text-[#6c707e]'}`} />
          <div className="relative flex-1 min-w-0">
            <select
              data-testid="session-select"
              aria-label="Select Chat Session"
              value={activeSessionId}
              onChange={(e) => setActiveSessionId(e.target.value)}
              className={`w-full text-[11px] h-5 pl-1.5 pr-5 rounded border outline-none font-sans truncate appearance-none cursor-pointer ${
                isDark
                  ? 'bg-[#2b2d30] border-[#393b40] text-[#dfe1e5] focus:border-[#3574f0]'
                  : 'bg-white border-[#d1d5db] text-[#1f2328] focus:border-[#3574f0]'
              }`}
            >
              {sessions.map((s) => (
                <option
                  key={s.id}
                  value={s.id}
                  className={isDark ? 'bg-[#2b2d30] text-[#dfe1e5]' : 'bg-white text-[#1f2328]'}
                >
                  {s.title}
                </option>
              ))}
            </select>
            <ChevronDown
              size={11}
              className={`absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none ${
                isDark ? 'text-[#868a91]' : 'text-[#6c707e]'
              }`}
            />
          </div>
        </div>
      </div>

      {/* Unconfigured Provider Banner */}
      {!isProviderConfigured && (
        <div
          data-testid="unconfigured-provider-banner"
          className={`px-2.5 py-1.5 text-[11px] border-b flex items-center justify-between shrink-0 ${
            isDark
              ? 'bg-[#2b2518] border-[#433519] text-[#e5c07b]'
              : 'bg-[#fffbeb] border-[#fde68a] text-[#b45309]'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0 mr-2 truncate">
            <AlertTriangle size={13} className="shrink-0 text-amber-500" />
            <span className="truncate">No AI provider configured</span>
          </div>
          <button
            type="button"
            data-testid="banner-open-settings-button"
            onClick={onOpenSettings}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-white shrink-0 hover:opacity-90 active:opacity-80 transition-opacity"
            style={{ backgroundColor: '#3574f0' }}
          >
            <Settings size={11} />
            <span>Settings</span>
          </button>
        </div>
      )}

      {/* Message Feed */}
      <div
        className="flex-1 overflow-y-auto p-3 space-y-3 select-text min-h-0"
        data-testid="chat-message-feed"
      >
        {(!activeSession || activeSession.messages.length === 0) ? (
          <div
            data-testid="chat-empty-state"
            className="flex flex-col items-center justify-center h-full text-center px-3 py-6 select-none my-auto"
          >
            <div className="w-9 h-9 rounded-full flex items-center justify-center mb-2.5 bg-[#3574f0]/15 text-[#3574f0]">
              <Sparkles size={18} />
            </div>
            <h3 className="font-semibold text-xs mb-1">Torque AI Assistant</h3>
            <p className={`text-[11px] max-w-[220px] mb-4 ${isDark ? 'text-[#868a91]' : 'text-[#6c707e]'}`}>
              Ask AI co-author to edit, format LaTeX, fix errors, or generate boilerplate code.
            </p>
            <div className="flex flex-col gap-1.5 w-full max-w-[240px]">
              {[
                'Summarize active document',
                'Fix LaTeX compilation errors',
                'Add abstract section',
              ].map((promptText) => (
                <button
                  key={promptText}
                  type="button"
                  onClick={() => setInputValue(promptText)}
                  className={`text-[11px] px-2.5 py-1.5 rounded border text-left truncate transition ${
                    isDark
                      ? 'border-[#323232] bg-[#2b2d30] hover:bg-[#32353a] hover:border-[#3574f0] text-[#dfe1e5]'
                      : 'border-[#d1d5db] bg-[#f7f8fa] hover:bg-[#ebedf0] hover:border-[#3574f0] text-[#1f2328]'
                  }`}
                >
                  {promptText}
                </button>
              ))}
            </div>
          </div>
        ) : (
          activeSession.messages.map((message) => {
            const isUser = message.role === 'user';
            return (
              <div
                key={message.id}
                data-testid={`chat-message-${message.role}`}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-1.5 mb-1 px-1">
                  {isUser ? (
                    <>
                      <span className="text-[10px] font-medium opacity-60">You</span>
                      <User size={12} className="opacity-60" />
                    </>
                  ) : (
                    <>
                      <Bot size={12} className="text-[#3574f0]" />
                      <span className="text-[10px] font-medium text-[#3574f0]">Assistant</span>
                    </>
                  )}
                </div>

                <div
                  className={`rounded-lg px-3 py-2 text-xs max-w-[95%] shadow-sm ${
                    isUser
                      ? isDark
                        ? 'bg-[#263750] border border-[#3574f0]/30 text-[#e6edf3]'
                        : 'bg-[#e0edff] border border-[#b6d4fe] text-[#0c2d6b]'
                      : isDark
                      ? 'bg-[#2b2d30] border border-[#323232] text-[#dfe1e5]'
                      : 'bg-[#f7f8fa] border border-[#d1d5db] text-[#1f2328]'
                  }`}
                >
                  {isUser ? (
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  ) : (
                    <FormattedAssistantMessage content={message.content} isDark={isDark} />
                  )}

                  {/* Tool Calls */}
                  {message.toolCalls && message.toolCalls.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {message.toolCalls.map((tc) => {
                        if (tc.diff) {
                          return (
                            <AiDiffCard
                              key={tc.id}
                              diff={tc.diff}
                              status={
                                tc.status === 'accepted' || tc.status === 'rejected'
                                  ? tc.status
                                  : 'pending_approval'
                              }
                              onAccept={() => handleAcceptToolCall(message.id, tc.id, tc.diff!)}
                              onReject={() => handleRejectToolCall(message.id, tc.id)}
                            />
                          );
                        }
                        return null;
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div
        className={`p-2 border-t shrink-0 ${
          isDark ? 'bg-[#2b2d30] border-[#1e1f22]' : 'bg-[#ebecf0] border-[#d1d5db]'
        }`}
        data-testid="chat-input-bar"
      >
        <div
          className={`flex flex-col rounded border transition-colors ${
            isDark
              ? 'bg-[#1e1f22] border-[#323232] focus-within:border-[#3574f0]'
              : 'bg-white border-[#d1d5db] focus-within:border-[#3574f0]'
          }`}
        >
          <textarea
            ref={textareaRef}
            rows={2}
            value={inputValue}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask AI co-author to edit, format LaTeX, fix errors..."
            data-testid="chat-textarea"
            className="w-full bg-transparent border-0 outline-none resize-none text-[12px] leading-relaxed max-h-32 overflow-y-auto px-2 py-1.5 placeholder:text-[11px] placeholder:opacity-50"
          />

          <div className="flex items-center justify-between px-2 pb-1.5 pt-0.5">
            <span className={`text-[10px] ${isDark ? 'text-[#868a91]' : 'text-[#6c707e]'}`}>
              ↵ send • ⇧↵ newline
            </span>

            {isGenerating ? (
              <button
                type="button"
                data-testid="stop-generate-button"
                onClick={() => setIsGenerating(false)}
                className="p-1 rounded text-white bg-[#c75450] hover:bg-[#b0433f] transition-colors shrink-0"
                title="Stop Generation"
              >
                <Square size={12} fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                data-testid="send-message-button"
                onClick={handleSend}
                disabled={!inputValue.trim()}
                className="p-1 rounded-full text-white transition-opacity disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                style={{ backgroundColor: '#3574f0' }}
                title="Send Message (Enter)"
              >
                <ArrowUp size={12} className="stroke-[2.5]" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
