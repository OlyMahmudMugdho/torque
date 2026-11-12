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
  MessageSquare,
  History,
  FileText,
  Terminal,
  Activity,
  Check,
  AlertCircle,
  Loader2,
  BookOpen,
  Globe,
  Copy,
} from 'lucide-react';
import { useThemeSafe } from '../context/ThemeContext';
import { AiDiffCard } from './AiDiffCard';
import { AgentClient, buildWorkspaceSystemPrompt, type WorkspaceToolContext } from '../ai/agentClient';
import { loadAISettings } from '../ai/aiConfig';
import { isTauri } from '../storage/tauriStorage';
import { searchAcademic, searchWeb } from '../ai/searchService';
import type { AIProviderConfig, ChatMessage, ChatSession, SearchSettings } from '../types/ai';
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

function renderInlineTokens(text: string, keyPrefix: string, isDark: boolean): React.ReactNode[] {
  // Matches:
  // 1. Math block: $$...$$
  // 2. Math inline: $...$
  // 3. Inline code: `...`
  // 4. Link: [text](url)
  // 5. Bold: **text** or __text__
  // 6. Italic: *text* or _text_
  const tokenRegex =
    /(\$\$[\s\S]*?\$\$|\$[^$\n]+\$|`[^`\n]+`|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g;

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
    } else if (token.startsWith('[') && token.includes('](') && token.endsWith(')')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        const linkText = linkMatch[1];
        const linkUrl = linkMatch[2];
        parts.push(
          <a
            key={`${keyPrefix}-link-${match.index}`}
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#3574f0] underline hover:opacity-80 inline-flex items-center gap-0.5 font-medium"
          >
            {linkText}
          </a>
        );
      } else {
        parts.push(token);
      }
    } else if (
      (token.startsWith('**') && token.endsWith('**')) ||
      (token.startsWith('__') && token.endsWith('__'))
    ) {
      const boldText = token.slice(2, -2);
      parts.push(
        <strong key={`${keyPrefix}-bold-${match.index}`} className="font-semibold text-current">
          {renderInlineTokens(boldText, `${keyPrefix}-bold-${match.index}`, isDark)}
        </strong>
      );
    } else if (
      (token.startsWith('*') && token.endsWith('*')) ||
      (token.startsWith('_') && token.endsWith('_'))
    ) {
      const italicText = token.slice(1, -1);
      parts.push(
        <em key={`${keyPrefix}-italic-${match.index}`} className="italic">
          {renderInlineTokens(italicText, `${keyPrefix}-italic-${match.index}`, isDark)}
        </em>
      );
    } else {
      parts.push(token);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function renderMarkdownBlocks(text: string, keyPrefix: string, isDark: boolean): React.ReactNode {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 1. Empty lines
    if (!trimmed) {
      i++;
      continue;
    }

    // 2. Headings (# , ## , ### , #### )
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = headingMatch[2];
      const inline = renderInlineTokens(content, `${keyPrefix}-h${level}-${i}`, isDark);

      if (level === 1) {
        nodes.push(
          <h1 key={`${keyPrefix}-h1-${i}`} className="text-sm font-bold my-2 text-current border-b pb-1 opacity-95">
            {inline}
          </h1>
        );
      } else if (level === 2) {
        nodes.push(
          <h2 key={`${keyPrefix}-h2-${i}`} className="text-xs font-bold my-1.5 text-current border-b pb-0.5 opacity-90">
            {inline}
          </h2>
        );
      } else if (level === 3) {
        nodes.push(
          <h3 key={`${keyPrefix}-h3-${i}`} className="text-xs font-semibold my-1 text-current opacity-90">
            {inline}
          </h3>
        );
      } else {
        nodes.push(
          <h4 key={`${keyPrefix}-h4-${i}`} className="text-xs font-medium my-0.5 text-current opacity-85">
            {inline}
          </h4>
        );
      }
      i++;
      continue;
    }

    // 3. Horizontal rules (---, ***, ___)
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
      nodes.push(
        <hr key={`${keyPrefix}-hr-${i}`} className="my-2 border-t border-current opacity-20" />
      );
      i++;
      continue;
    }

    // 4. Blockquotes (> ...)
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      nodes.push(
        <blockquote
          key={`${keyPrefix}-quote-${i}`}
          className={`border-l-2 pl-2.5 my-1.5 opacity-85 italic ${
            isDark ? 'border-[#3574f0] text-[#c9d1d9]' : 'border-[#3574f0] text-[#4a5568]'
          }`}
        >
          {quoteLines.map((ql, qIdx) => (
            <React.Fragment key={`${keyPrefix}-ql-${qIdx}`}>
              {qIdx > 0 && <br />}
              {renderInlineTokens(ql, `${keyPrefix}-ql-${qIdx}`, isDark)}
            </React.Fragment>
          ))}
        </blockquote>
      );
      continue;
    }

    // 5. Unordered List (- item, * item)
    if (/^[-*+]\s+/.test(trimmed)) {
      const listItems: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^[-*+]\s+/, ''));
        i++;
      }
      nodes.push(
        <ul key={`${keyPrefix}-ul-${i}`} className="list-disc list-inside space-y-1 my-1.5 pl-1 leading-relaxed">
          {listItems.map((item, idx) => (
            <li key={`${keyPrefix}-li-${idx}`} className="text-xs">
              {renderInlineTokens(item, `${keyPrefix}-ul-item-${idx}`, isDark)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // 6. Ordered List (1. item)
    if (/^\d+\.\s+/.test(trimmed)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      nodes.push(
        <ol key={`${keyPrefix}-ol-${i}`} className="list-decimal list-inside space-y-1 my-1.5 pl-1 leading-relaxed">
          {listItems.map((item, idx) => (
            <li key={`${keyPrefix}-oli-${idx}`} className="text-xs">
              {renderInlineTokens(item, `${keyPrefix}-ol-item-${idx}`, isDark)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // 7. Regular paragraph (collect contiguous non-block lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('>') &&
      !/^[-*+]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !/^(\*{3,}|-{3,}|_{3,})$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }

    if (paraLines.length > 0) {
      nodes.push(
        <p key={`${keyPrefix}-p-${i}`} className="leading-relaxed my-1">
          {paraLines.map((pl, lIdx) => (
            <React.Fragment key={`${keyPrefix}-pl-${lIdx}`}>
              {lIdx > 0 && <br />}
              {renderInlineTokens(pl, `${keyPrefix}-pl-${lIdx}`, isDark)}
            </React.Fragment>
          ))}
        </p>
      );
    }
  }

  return <div key={keyPrefix} className="space-y-1">{nodes}</div>;
}

function CopyCodeButton({ code, isDark }: { code: string; isDark: boolean }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`flex items-center gap-1 text-[10px] font-sans font-medium px-1.5 py-0.5 rounded transition ${
        copied
          ? 'text-emerald-400 bg-emerald-500/15'
          : isDark
            ? 'text-[#c2c5cc] hover:text-[#dfe1e5] hover:bg-[#2b2d30]'
            : 'text-[#5c6066] hover:text-[#1f2328] hover:bg-[#e1e4e8]'
      }`}
      title="Copy code"
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
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
      parts.push(renderMarkdownBlocks(textBefore, `text-${lastIndex}`, isDark));
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
        <div
          className={`px-2.5 py-1 text-[10px] font-semibold border-b flex items-center justify-between ${
            isDark ? 'border-[#323232] bg-[#222326] text-[#c2c5cc]' : 'border-[#d0d7de] bg-[#f0f2f5] text-[#656d76]'
          }`}
        >
          <span className="uppercase font-mono">{lang || 'code'}</span>
          <CopyCodeButton code={code} isDark={isDark} />
        </div>
        <pre className="p-2.5 leading-relaxed">
          <code>{code}</code>
        </pre>
      </div>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(renderMarkdownBlocks(content.slice(lastIndex), `text-${lastIndex}`, isDark));
  }

  return <div className="space-y-2 text-xs leading-relaxed">{parts}</div>;
}

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return '';
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const historyButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isHistoryOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        historyRef.current &&
        !historyRef.current.contains(e.target as Node) &&
        historyButtonRef.current &&
        !historyButtonRef.current.contains(e.target as Node)
      ) {
        setIsHistoryOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isHistoryOpen]);

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

  const [loadedProvider, setLoadedProvider] = useState<AIProviderConfig | null>(activeProvider ?? null);
  const [searchSettings, setSearchSettings] = useState<SearchSettings | undefined>(undefined);

  useEffect(() => {
    loadAISettings()
      .then((s) => {
        if (!activeProvider) {
          const active = s.providers.find((p) => p.id === s.activeProviderId) || s.providers[0] || null;
          setLoadedProvider(active);
        }
        if (s.search) {
          setSearchSettings(s.search);
        }
      })
      .catch(() => {});

    if (activeProvider) {
      setLoadedProvider(activeProvider);
    }
  }, [activeProvider, isOpen]);

  const effectiveProvider = activeProvider || loadedProvider;

  // Check if provider is valid
  const isProviderConfigured = Boolean(
    effectiveProvider &&
      (Boolean(effectiveProvider.apiKey) ||
        (effectiveProvider.baseUrl && effectiveProvider.baseUrl.includes('localhost')))
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
    } else if (effectiveProvider) {
      setIsGenerating(true);
      const systemPrompt = buildWorkspaceSystemPrompt({
        files: workspace?.files,
        activeFilePath: workspace?.activeFilePath,
      });

      try {
        const agent = new AgentClient(effectiveProvider);
        const toolContext: WorkspaceToolContext = {
          readFile: async (path: string) => {
            const raw = workspace?.files?.[path] ?? workspace?.files?.[path.replace(/^\.\//, '')];
            if (raw === undefined || raw === null) return null;
            return typeof raw === 'string' ? raw : raw.content ?? null;
          },
          writeFile: async (path: string, content: string) => {
            if (workspace?.updateFileContent) {
              await workspace.updateFileContent(path, content);
            }
          },
          compile: async (engine?: string) => {
            if (workspace?.compileProject) {
              const res = await workspace.compileProject(engine);
              return { success: res?.status === 'success' || res?.success || true, log: res?.log || '' };
            }
            return { success: true, log: '' };
          },
          getDiagnostics: () => {
            return workspace?.diagnostics ?? [];
          },
          searchAcademic: async (query: string, options?: { source?: 'all' | 'arxiv' | 'semanticscholar'; maxResults?: number }) => {
            if (!isTauri() && typeof window !== 'undefined') {
              try {
                const params = new URLSearchParams();
                params.set('query', query.trim());
                if (options?.source) params.set('source', options.source);
                if (options?.maxResults) params.set('maxResults', String(options.maxResults));
                const res = await fetch(`/api/search/academic?${params.toString()}`);
                if (res.ok) {
                  const data = await res.json();
                  if (Array.isArray(data?.results)) {
                    return data.results;
                  }
                }
              } catch {
                // fall through to direct search
              }
            }
            return searchAcademic(query, options);
          },
          searchWeb: async (query: string, maxResults?: number) => {
            if (!isTauri() && typeof window !== 'undefined') {
              try {
                const params = new URLSearchParams();
                params.set('query', query.trim());
                if (maxResults) params.set('maxResults', String(maxResults));
                const res = await fetch(`/api/search/web?${params.toString()}`);
                if (res.ok) {
                  const data = await res.json();
                  if (Array.isArray(data?.results)) {
                    return data.results;
                  }
                }
              } catch {
                // fall through to direct search
              }
            }
            return searchWeb(query, searchSettings, maxResults);
          },
        };

        const finalSessionMessages = await agent.runTurn(
          updatedMessages as ChatMessage[],
          toolContext,
          {
            systemPrompt,
            onMessagesChange: (msgs) => {
              setSessions((prev) =>
                prev.map((s) => {
                  if (s.id !== targetSession.id) return s;
                  return { ...s, messages: msgs };
                })
              );
            },
          }
        );

        setSessions((prev) =>
          prev.map((s) => {
            if (s.id !== targetSession.id) return s;
            return { ...s, messages: finalSessionMessages };
          })
        );
      } catch (err: any) {
        setSessions((prev) =>
          prev.map((s) => {
            if (s.id !== targetSession.id) return s;
            const errMsg: ChatMessage = {
              id: `err-${Date.now()}`,
              role: 'assistant',
              content: `⚠️ Failed to get AI response: ${err?.message || String(err)}`,
              timestamp: Date.now(),
            };
            return {
              ...s,
              messages: [...s.messages, errMsg],
            };
          })
        );
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
              isDark ? 'bg-[#1e1f22] text-[#c2c5cc] border border-[#393b40]' : 'bg-[#ffffff] text-[#5c6066] border border-[#d1d5db]'
            }`}
            title={effectiveProvider?.selectedModel || 'No Model'}
          >
            {effectiveProvider?.selectedModel || 'No Model'}
          </span>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {/* History Button */}
          <button
            ref={historyButtonRef}
            type="button"
            data-testid="history-button"
            onClick={() => setIsHistoryOpen((prev) => !prev)}
            title="Chat History"
            className={`p-1 rounded transition flex items-center justify-center ${
              isHistoryOpen
                ? isDark
                  ? 'bg-[#3574f0]/25 text-[#3574f0]'
                  : 'bg-[#3574f0]/15 text-[#3574f0]'
                : isDark
                ? 'hover:bg-[#393b40] text-[#c2c5cc] hover:text-[#dfe1e5]'
                : 'hover:bg-[#dfe1e5] text-[#6c707e] hover:text-[#1f2328]'
            }`}
          >
            <History size={13} />
          </button>

          {/* New Chat Button */}
          <button
            type="button"
            data-testid="new-chat-button"
            onClick={handleCreateNewChat}
            title="New Chat"
            className={`p-1 rounded transition ${
              isDark ? 'hover:bg-[#393b40] text-[#c2c5cc] hover:text-[#dfe1e5]' : 'hover:bg-[#dfe1e5] text-[#6c707e] hover:text-[#1f2328]'
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
              isDark ? 'hover:bg-[#393b40] text-[#c2c5cc] hover:text-[#e05555]' : 'hover:bg-[#dfe1e5] text-[#6c707e] hover:text-[#e05555]'
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
              isDark ? 'hover:bg-[#393b40] text-[#c2c5cc] hover:text-[#dfe1e5]' : 'hover:bg-[#dfe1e5] text-[#6c707e] hover:text-[#1f2328]'
            }`}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Hidden select for accessibility and programmatic testing */}
      <select
        data-testid="session-select"
        aria-label="Select Chat Session"
        value={activeSessionId}
        onChange={(e) => setActiveSessionId(e.target.value)}
        className="sr-only"
        tabIndex={-1}
      >
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title}
          </option>
        ))}
      </select>

      {/* History Popover / Drawer (shown by clicking History button) */}
      {isHistoryOpen && (
        <div
          ref={historyRef}
          data-testid="history-popover"
          className={`border-b shadow-lg z-20 flex flex-col max-h-72 shrink-0 ${
            isDark ? 'bg-[#2b2d30] border-[#393b40]' : 'bg-[#ffffff] border-[#d1d5db]'
          }`}
        >
          {/* History Header */}
          <div
            className={`px-3 py-1.5 border-b flex items-center justify-between text-[11px] font-semibold shrink-0 ${
              isDark ? 'bg-[#1e1f22] border-[#323232] text-[#dfe1e5]' : 'bg-[#f7f8fa] border-[#e5e7eb] text-[#1f2328]'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <History size={12} className="text-[#3574f0]" />
              <span>Chat History</span>
              <span className={`text-[10px] font-normal ${isDark ? 'text-[#868a91]' : 'text-[#6c707e]'}`}>
                ({sessions.length})
              </span>
            </div>

            <button
              type="button"
              data-testid="history-new-chat-button"
              onClick={() => {
                handleCreateNewChat();
                setIsHistoryOpen(false);
              }}
              className="flex items-center gap-1 text-[11px] text-[#3574f0] hover:underline"
            >
              <Plus size={11} />
              <span>New Chat</span>
            </button>
          </div>

          {/* Sessions List */}
          <div className="overflow-y-auto p-1.5 space-y-1 max-h-60">
            {sessions.map((s) => {
              const isActive = s.id === activeSessionId;
              const visibleMessages = s.messages.filter(
                (m) => m.role !== 'tool' && m.role !== 'system'
              );
              const messageCount = visibleMessages.length;
              const lastMsg = visibleMessages[visibleMessages.length - 1];

              return (
                <div
                  key={s.id}
                  data-testid={`history-session-item-${s.id}`}
                  onClick={() => {
                    setActiveSessionId(s.id);
                    setIsHistoryOpen(false);
                  }}
                  className={`group flex items-center justify-between p-2 rounded cursor-pointer transition select-none ${
                    isActive
                      ? isDark
                        ? 'bg-[#3574f0]/20 border border-[#3574f0]/40 text-[#ffffff]'
                        : 'bg-[#e0edff] border border-[#b6d4fe] text-[#0c2d6b]'
                      : isDark
                      ? 'hover:bg-[#393b40] text-[#dfe1e5] border border-transparent'
                      : 'hover:bg-[#f2f3f5] text-[#1f2328] border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                    <MessageSquare
                      size={13}
                      className={`shrink-0 ${
                        isActive ? 'text-[#3574f0]' : isDark ? 'text-[#868a91]' : 'text-[#6c707e]'
                      }`}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-[11px] font-medium truncate leading-tight">
                        {s.title}
                      </span>
                      <span
                        className={`text-[10px] truncate ${
                          isActive
                            ? isDark
                              ? 'text-[#a5c0f7]'
                              : 'text-[#3574f0]'
                            : isDark
                            ? 'text-[#868a91]'
                            : 'text-[#6c707e]'
                        }`}
                      >
                        {lastMsg ? lastMsg.content.slice(0, 35) : `${messageCount} messages`}
                        {s.createdAt ? ` • ${formatRelativeTime(s.createdAt)}` : ''}
                      </span>
                    </div>
                  </div>

                  {sessions.length > 1 && (
                    <button
                      type="button"
                      data-testid={`delete-session-${s.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSession(s.id);
                      }}
                      title="Delete Chat"
                      className={`p-1 rounded opacity-0 group-hover:opacity-100 transition shrink-0 ${
                        isDark
                          ? 'hover:bg-[#2b2d30] text-[#c2c5cc] hover:text-[#e05555]'
                          : 'hover:bg-[#e5e7eb] text-[#6c707e] hover:text-[#e05555]'
                      }`}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

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
            if (message.role === 'tool' || message.role === 'system') {
              return null;
            }
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
                  ) : message.content ? (
                    <FormattedAssistantMessage content={message.content} isDark={isDark} />
                  ) : isGenerating && (!message.toolCalls || message.toolCalls.length === 0) ? (
                    <div className="flex items-center gap-1.5 text-xs opacity-60 py-0.5">
                      <Loader2 size={12} className="animate-spin text-[#3574f0]" />
                      <span>Thinking...</span>
                    </div>
                  ) : null}

                  {/* Tool Calls */}
                  {message.toolCalls && message.toolCalls.length > 0 && (
                    <div className={message.content ? 'mt-2 space-y-1.5' : 'space-y-1.5'}>
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

                        if (tc.name === 'torque_read_file') {
                          return (
                            <div
                              key={tc.id}
                              data-testid="tool-badge-read-file"
                              className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono border ${
                                isDark
                                  ? 'bg-[#1e1f22] border-[#393b40] text-[#c2c5cc]'
                                  : 'bg-[#ffffff] border-[#d1d5db] text-[#5c6066]'
                              }`}
                            >
                              <FileText size={12} className="text-[#3574f0] shrink-0" />
                              <span className="truncate">
                                read <span className={isDark ? 'text-[#dfe1e5] font-semibold' : 'text-[#1f2328] font-semibold'}>{tc.args?.path || 'file'}</span>
                                {tc.args?.startLine ? ` (L${tc.args.startLine}-${tc.args.endLine || ''})` : ''}
                              </span>
                              {tc.status === 'done' ? (
                                <span className="ml-auto text-[10px] text-green-500 font-sans flex items-center gap-0.5 shrink-0">
                                  <Check size={11} /> Read
                                </span>
                              ) : tc.status === 'failed' ? (
                                <span className="ml-auto text-[10px] text-[#e05555] font-sans flex items-center gap-0.5 shrink-0">
                                  <AlertCircle size={11} /> Failed
                                </span>
                              ) : (
                                <span className="ml-auto text-[10px] text-amber-500 font-sans flex items-center gap-0.5 shrink-0">
                                  <Loader2 size={10} className="animate-spin" /> Reading...
                                </span>
                              )}
                            </div>
                          );
                        }

                        if (tc.name === 'torque_compile') {
                          return (
                            <div
                              key={tc.id}
                              data-testid="tool-badge-compile"
                              className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono border ${
                                isDark
                                  ? 'bg-[#1e1f22] border-[#393b40] text-[#c2c5cc]'
                                  : 'bg-[#ffffff] border-[#d1d5db] text-[#5c6066]'
                              }`}
                            >
                              <Terminal size={12} className="text-[#3574f0] shrink-0" />
                              <span className="truncate">
                                compile project ({tc.args?.engine || 'default'})
                              </span>
                              {tc.status === 'done' ? (
                                <span className="ml-auto text-[10px] text-green-500 font-sans flex items-center gap-0.5 shrink-0">
                                  <Check size={11} /> Done
                                </span>
                              ) : tc.status === 'failed' ? (
                                <span className="ml-auto text-[10px] text-[#e05555] font-sans flex items-center gap-0.5 shrink-0">
                                  <AlertCircle size={11} /> Failed
                                </span>
                              ) : (
                                <span className="ml-auto text-[10px] text-amber-500 font-sans flex items-center gap-0.5 shrink-0">
                                  <Loader2 size={10} className="animate-spin" /> Compiling...
                                </span>
                              )}
                            </div>
                          );
                        }

                        if (tc.name === 'torque_get_diagnostics') {
                          return (
                            <div
                              key={tc.id}
                              data-testid="tool-badge-diagnostics"
                              className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono border ${
                                isDark
                                  ? 'bg-[#1e1f22] border-[#393b40] text-[#c2c5cc]'
                                  : 'bg-[#ffffff] border-[#d1d5db] text-[#5c6066]'
                              }`}
                            >
                              <Activity size={12} className="text-[#3574f0] shrink-0" />
                              <span className="truncate">inspect compiler diagnostics</span>
                              <span className="ml-auto text-[10px] text-green-500 font-sans flex items-center gap-0.5 shrink-0">
                                <Check size={11} /> Done
                              </span>
                            </div>
                          );
                        }

                        if (tc.name === 'torque_search_academic') {
                          return (
                            <div
                              key={tc.id}
                              data-testid="tool-badge-search-academic"
                              className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono border ${
                                isDark
                                  ? 'bg-[#1e1f22] border-[#393b40] text-[#c2c5cc]'
                                  : 'bg-[#ffffff] border-[#d1d5db] text-[#5c6066]'
                              }`}
                            >
                              <BookOpen size={12} className="text-[#3574f0] shrink-0" />
                              <span className="truncate">
                                academic search{' '}
                                <span className={isDark ? 'text-[#dfe1e5] font-semibold' : 'text-[#1f2328] font-semibold'}>
                                   &quot;{tc.args?.query || ''}&quot;
                                </span>
                              </span>
                              {tc.status === 'done' ? (
                                <span className="ml-auto text-[10px] text-green-500 font-sans flex items-center gap-0.5 shrink-0">
                                  <Check size={11} /> {Array.isArray(tc.result) ? `${tc.result.length} papers` : 'Done'}
                                </span>
                              ) : tc.status === 'failed' ? (
                                <span className="ml-auto text-[10px] text-[#e05555] font-sans flex items-center gap-0.5 shrink-0">
                                  <AlertCircle size={11} /> Failed
                                </span>
                              ) : (
                                <span className="ml-auto text-[10px] text-amber-500 font-sans flex items-center gap-0.5 shrink-0">
                                  <Loader2 size={10} className="animate-spin" /> Searching...
                                </span>
                              )}
                            </div>
                          );
                        }

                        if (tc.name === 'torque_search_web') {
                          return (
                            <div
                              key={tc.id}
                              data-testid="tool-badge-search-web"
                              className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono border ${
                                isDark
                                  ? 'bg-[#1e1f22] border-[#393b40] text-[#c2c5cc]'
                                  : 'bg-[#ffffff] border-[#d1d5db] text-[#5c6066]'
                              }`}
                            >
                              <Globe size={12} className="text-[#3574f0] shrink-0" />
                              <span className="truncate">
                                web search{' '}
                                <span className={isDark ? 'text-[#dfe1e5] font-semibold' : 'text-[#1f2328] font-semibold'}>
                                  &quot;{tc.args?.query || ''}&quot;
                                </span>
                              </span>
                              {tc.status === 'done' ? (
                                <span className="ml-auto text-[10px] text-green-500 font-sans flex items-center gap-0.5 shrink-0">
                                  <Check size={11} /> {Array.isArray(tc.result) ? `${tc.result.length} results` : 'Done'}
                                </span>
                              ) : tc.status === 'failed' ? (
                                <span className="ml-auto text-[10px] text-[#e05555] font-sans flex items-center gap-0.5 shrink-0">
                                  <AlertCircle size={11} /> Failed
                                </span>
                              ) : (
                                <span className="ml-auto text-[10px] text-amber-500 font-sans flex items-center gap-0.5 shrink-0">
                                  <Loader2 size={10} className="animate-spin" /> Searching...
                                </span>
                              )}
                            </div>
                          );
                        }

                        return (
                          <div
                            key={tc.id}
                            data-testid="tool-badge-fallback"
                            className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono border border-red-500/30 bg-red-500/10 text-red-400"
                          >
                            <AlertCircle size={12} className="shrink-0" />
                            <span className="truncate">{tc.name}: {tc.error || 'Execution failed'}</span>
                          </div>
                        );
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
