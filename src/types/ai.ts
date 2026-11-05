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
