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

export function normalizeBaseUrl(url: string): string {
  if (!url) return '';
  let clean = url.trim().replace(/\/+$/, '');
  clean = clean.replace(/\/chat\/completions\/?$/i, '');
  clean = clean.replace(/\/chat\/?$/i, '');
  return clean;
}

export function getDefaultAISettings(): AISettings {
  return {
    providers: [],
    activeProviderId: null,
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
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const url = `${normalizedBase}/models`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (apiKey && apiKey.trim().length > 0) {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers,
    });
  } catch (err: any) {
    // If browser CORS or network error occurs (e.g. 'Failed to fetch', 'Load failed', TypeError),
    // fallback to server-side AI proxy.
    try {
      res = await fetch('/api/ai-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          url,
          method: 'GET',
          headers,
        }),
      });
    } catch {
      throw err;
    }
  }

  if (!res.ok) {
    // If direct fetch failed with non-200 (like 404 or CORS proxy rejection), also attempt /api/ai-proxy once
    try {
      const proxyRes = await fetch('/api/ai-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          url,
          method: 'GET',
          headers,
        }),
      });
      if (proxyRes.ok) {
        const data = await proxyRes.json();
        if (Array.isArray(data?.data)) {
          return data.data.map((m: any) => m.id || m.name || String(m));
        }
        if (Array.isArray(data?.models)) {
          return data.models.map((m: any) => m.id || m.name || String(m));
        }
      }
    } catch {
      // ignore retry error
    }

    const errText = await res.text().catch(() => '');
    const cleanErr = cleanErrorMessage(res.status, res.statusText, errText);
    throw new Error(`Failed to fetch models (${cleanErr})`);
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

function cleanErrorMessage(status: number, statusText: string, raw: string): string {
  if (!raw) return `${status} ${statusText}`;
  const preMatch = raw.match(/<pre>([\s\S]*?)<\/pre>/i);
  if (preMatch && preMatch[1]) {
    return `${status} ${statusText}: ${preMatch[1].trim()}`;
  }
  if (raw.includes('<html') || raw.includes('<!DOCTYPE')) {
    return `${status} ${statusText}`;
  }
  try {
    const json = JSON.parse(raw);
    if (json.error?.message) return json.error.message;
    if (json.message) return json.message;
  } catch {
    // raw text
  }
  return `${status} ${statusText}: ${raw.slice(0, 100)}`;
}
