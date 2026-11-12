export interface AIProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  selectedModel: string;
  availableModels: string[];
}

export interface SearchSettings {
  provider: 'free' | 'tavily' | 'brave';
  apiKey?: string;
  academicSource?: 'all' | 'arxiv' | 'semanticscholar';
}

export interface AISettings {
  providers: AIProviderConfig[];
  activeProviderId: string | null;
  search?: SearchSettings;
}

export interface AcademicSearchResult {
  title: string;
  authors: string[];
  year: number | string;
  abstract: string;
  url: string;
  citationKey: string;
  bibtex: string;
  source: 'arxiv' | 'semanticscholar';
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export type { DiffHunkItem, FileDiffResult } from '../ai/diffUtils';

export interface ToolCallItem {
  id: string;
  name: string;
  args?: Record<string, any>;
  status: 'pending_approval' | 'accepted' | 'rejected' | 'executing' | 'done' | 'failed';
  diff?: import('../ai/diffUtils').FileDiffResult;
  result?: any;
  error?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCallItem[];
  toolCallId?: string;
  timestamp: number;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
}

export interface AgentLoopOptions {
  maxTurns?: number;
  systemPrompt?: string;
  onChunk?: (token: string) => void;
  onMessagesChange?: (messages: ChatMessage[]) => void;
  onStatusChange?: (status: { type: 'thinking' | 'executing_tool'; toolName?: string; detail?: string } | null) => void;
  signal?: AbortSignal;
  autoApply?: boolean;
  autoEdit?: boolean;
}


