export interface AIProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  selectedModel: string;
  availableModels: string[];
}

export interface AISettings {
  providers: AIProviderConfig[];
  activeProviderId: string | null;
}

export type { DiffHunkItem, FileDiffResult } from '../ai/diffUtils';

export interface ToolCallItem {
  id: string;
  name: string;
  args?: Record<string, any>;
  status: 'pending_approval' | 'accepted' | 'rejected' | 'executing' | 'done' | 'failed';
  diff?: import('../ai/diffUtils').FileDiffResult;
  result?: any;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCallItem[];
  timestamp: number;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
}

