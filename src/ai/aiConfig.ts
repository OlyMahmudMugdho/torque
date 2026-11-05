import { isTauri } from '../storage/tauriStorage';
import type { AIProviderConfig, AISettings } from '../types/ai';

export type { AIProviderConfig, AISettings };

type TauriInvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

async function getInvoke(): Promise<TauriInvokeFn> {
  const g = typeof globalThis !== 'undefined' ? (globalThis as any) : null;
  if (g?.__TAURI_INTERNALS__?.invoke) {
    return g.__TAURI_INTERNALS__.invoke;
  }
  if (g?.window?.__TAURI_INTERNALS__?.invoke) {
    return g.window.__TAURI_INTERNALS__.invoke;
  }
  const core = await import('@tauri-apps/api/core');
  return core.invoke;
}

export function getDefaultAISettings(): AISettings {
  return {
    providers: [
      {
        id: 'openai-default',
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        selectedModel: 'gpt-4o',
        availableModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
      },
      {
        id: 'ollama-default',
        name: 'Ollama Local',
        baseUrl: 'http://localhost:11434/v1',
        apiKey: '',
        selectedModel: 'llama3:latest',
        availableModels: ['llama3:latest'],
      },
    ],
    activeProviderId: 'openai-default',
  };
}

export async function loadAISettings(): Promise<AISettings> {
  if (isTauri()) {
    try {
      const invoke = await getInvoke();
      const raw = await invoke<string>('tauri_get_ai_config');
      if (raw && typeof raw === 'string') {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.providers)) {
          return parsed;
        }
      }
    } catch {
      // Fall through to default if file doesn't exist yet or parsing fails
    }
    return getDefaultAISettings();
  }

  // Web mode: load from backend API endpoint (~/.torque/ai_config.json on disk)
  try {
    const res = await fetch('/api/ai-config', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
    if (res.ok) {
      const parsed = await res.json();
      if (parsed && Array.isArray(parsed.providers)) {
        return parsed;
      }
    }
  } catch {
    // Fall through to default if server endpoint is unreachable or 404
  }

  return getDefaultAISettings();
}

export async function saveAISettings(settings: AISettings): Promise<void> {
  const json = JSON.stringify(settings, null, 2);

  if (isTauri()) {
    const invoke = await getInvoke();
    await invoke('tauri_save_ai_config', { configJson: json });
    return;
  }

  // Web mode: save to backend API endpoint (~/.torque/ai_config.json on disk)
  const res = await fetch('/api/ai-config', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: json,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Failed to save AI settings (${res.status} ${res.statusText}): ${errText}`);
  }
}

export async function fetchProviderModels(
  baseUrl: string,
  apiKey?: string
): Promise<string[]> {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const url = `${normalizedBase}/models`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (apiKey && apiKey.trim().length > 0) {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
  }

  const res = await fetch(url, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Failed to fetch models (${res.status} ${res.statusText}): ${errText}`);
  }

  const data = await res.json();

  if (Array.isArray(data?.data)) {
    return data.data.map((m: any) => m.id || m.name || String(m));
  }

  if (Array.isArray(data?.models)) {
    return data.models.map((m: any) => m.id || m.name || String(m));
  }

  if (Array.isArray(data)) {
    return data.map((m: any) => (typeof m === 'string' ? m : m.id || m.name || String(m)));
  }

  return [];
}
