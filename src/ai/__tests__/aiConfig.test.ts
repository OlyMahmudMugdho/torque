import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getDefaultAISettings,
  loadAISettings,
  saveAISettings,
  fetchProviderModels,
} from '../aiConfig';
import type { AISettings } from '../../types/ai';

describe('AI Config Subsystem', () => {
  const originalTauri = (globalThis as any).__TAURI_INTERNALS__;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).__TAURI_INTERNALS__;
    if (typeof window !== 'undefined') {
      delete (window as any).__TAURI_INTERNALS__;
    }
  });

  afterEach(() => {
    if (originalTauri !== undefined) {
      (globalThis as any).__TAURI_INTERNALS__ = originalTauri;
    } else {
      delete (globalThis as any).__TAURI_INTERNALS__;
    }
    globalThis.fetch = originalFetch;
  });

  describe('getDefaultAISettings', () => {
    it('returns default AI settings with at least one provider and activeProviderId', () => {
      const defaults = getDefaultAISettings();
      expect(defaults).toBeDefined();
      expect(Array.isArray(defaults.providers)).toBe(true);
      expect(defaults.providers.length).toBeGreaterThan(0);
      expect(defaults.activeProviderId).toBeDefined();

      const active = defaults.providers.find((p) => p.id === defaults.activeProviderId);
      expect(active).toBeDefined();
      expect(active?.baseUrl).toBeTruthy();
      expect(active?.selectedModel).toBeTruthy();
      expect(Array.isArray(active?.availableModels)).toBe(true);
    });

    it('returns a fresh clone each time so modifications do not leak', () => {
      const defaults1 = getDefaultAISettings();
      const defaults2 = getDefaultAISettings();
      expect(defaults1).not.toBe(defaults2);
      defaults1.providers[0].name = 'Modified';
      expect(defaults2.providers[0].name).not.toBe('Modified');
    });
  });

  describe('Desktop Mode (isTauri === true)', () => {
    let mockInvoke: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockInvoke = vi.fn();
      (globalThis as any).__TAURI_INTERNALS__ = { invoke: mockInvoke };
    });

    it('loads AI settings via tauri_get_ai_config IPC', async () => {
      const customSettings: AISettings = {
        providers: [
          {
            id: 'custom-1',
            name: 'Local Ollama',
            baseUrl: 'http://localhost:11434/v1',
            apiKey: '',
            selectedModel: 'llama3:latest',
            availableModels: ['llama3:latest'],
          },
        ],
        activeProviderId: 'custom-1',
      };

      mockInvoke.mockResolvedValueOnce(JSON.stringify(customSettings));

      const loaded = await loadAISettings();
      expect(mockInvoke).toHaveBeenCalledWith('tauri_get_ai_config');
      expect(loaded).toEqual(customSettings);
    });

    it('returns default AI settings if tauri_get_ai_config rejects (e.g. file not created yet)', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Config not found'));

      const loaded = await loadAISettings();
      expect(mockInvoke).toHaveBeenCalledWith('tauri_get_ai_config');
      expect(loaded).toEqual(getDefaultAISettings());
    });

    it('returns default AI settings if tauri_get_ai_config returns empty or malformed JSON', async () => {
      mockInvoke.mockResolvedValueOnce('invalid json content');

      const loaded = await loadAISettings();
      expect(loaded).toEqual(getDefaultAISettings());
    });

    it('saves AI settings via tauri_save_ai_config IPC with formatted JSON', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const settingsToSave: AISettings = {
        providers: [
          {
            id: 'prov-1',
            name: 'OpenAI',
            baseUrl: 'https://api.openai.com/v1',
            apiKey: 'sk-test-key',
            selectedModel: 'gpt-4o',
            availableModels: ['gpt-4o'],
          },
        ],
        activeProviderId: 'prov-1',
      };

      await saveAISettings(settingsToSave);

      expect(mockInvoke).toHaveBeenCalledWith('tauri_save_ai_config', {
        configJson: JSON.stringify(settingsToSave, null, 2),
      });
    });
  });

  describe('Web Mode (isTauri === false)', () => {
    it('loads AI settings from /api/ai-config endpoint without using localStorage', async () => {
      const customSettings: AISettings = {
        providers: [
          {
            id: 'remote-1',
            name: 'OpenRouter',
            baseUrl: 'https://openrouter.ai/api/v1',
            apiKey: 'sk-or-v1',
            selectedModel: 'anthropic/claude-3.5-sonnet',
            availableModels: ['anthropic/claude-3.5-sonnet'],
          },
        ],
        activeProviderId: 'remote-1',
      };

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => customSettings,
      });
      globalThis.fetch = mockFetch;

      const loaded = await loadAISettings();
      expect(mockFetch).toHaveBeenCalledWith('/api/ai-config', expect.objectContaining({
        method: 'GET',
      }));
      expect(loaded).toEqual(customSettings);
    });

    it('returns default settings when /api/ai-config returns 404 or fails', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
      });
      globalThis.fetch = mockFetch;

      const loaded = await loadAISettings();
      expect(loaded).toEqual(getDefaultAISettings());
    });

    it('returns default settings when /api/ai-config fetch rejects with a network error', async () => {
      const mockFetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));
      globalThis.fetch = mockFetch;

      const loaded = await loadAISettings();
      expect(loaded).toEqual(getDefaultAISettings());
    });

    it('saves AI settings to /api/ai-config via POST', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });
      globalThis.fetch = mockFetch;

      const settings: AISettings = getDefaultAISettings();
      await saveAISettings(settings);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/ai-config',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(settings, null, 2),
        })
      );
    });

    it('throws error when saving AI settings to /api/ai-config fails', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Disk write error',
      });
      globalThis.fetch = mockFetch;

      const settings: AISettings = getDefaultAISettings();
      await expect(saveAISettings(settings)).rejects.toThrow();
    });
  });

  describe('fetchProviderModels', () => {
    it('fetches models from {baseUrl}/models and trims trailing slashes', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }, { id: 'o1' }],
        }),
      });
      globalThis.fetch = mockFetch;

      const models = await fetchProviderModels('https://api.openai.com/v1///', 'sk-test');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/models',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer sk-test',
          }),
        })
      );
      expect(models).toEqual(['gpt-4o', 'gpt-4o-mini', 'o1']);
    });

    it('omits Authorization header when apiKey is not provided or empty', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ id: 'local-model' }],
        }),
      });
      globalThis.fetch = mockFetch;

      const models = await fetchProviderModels('http://localhost:11434/v1');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/v1/models',
        expect.objectContaining({
          headers: expect.not.objectContaining({
            Authorization: expect.anything(),
          }),
        })
      );
      expect(models).toEqual(['local-model']);
    });

    it('handles models array format (e.g. Ollama or alternative proxies)', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          models: [{ name: 'llama3:latest' }, { name: 'qwen2.5-coder:7b' }],
        }),
      });
      globalThis.fetch = mockFetch;

      const models = await fetchProviderModels('http://localhost:11434/v1');
      expect(models).toEqual(['llama3:latest', 'qwen2.5-coder:7b']);
    });

    it('throws error when models fetch returns non-200 response', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid API Key',
      });
      globalThis.fetch = mockFetch;

      await expect(
        fetchProviderModels('https://api.openai.com/v1', 'bad-key')
      ).rejects.toThrow(/401/);
    });

    it('falls back to /api/ai-proxy when direct fetch throws a network / CORS error', async () => {
      const mockFetch = vi
        .fn()
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            data: [{ id: 'proxied-model-1' }, { id: 'proxied-model-2' }],
          }),
        });
      globalThis.fetch = mockFetch;

      const models = await fetchProviderModels('http://localhost:3001/v1', 'test-key');
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'http://localhost:3001/v1/models',
        expect.anything()
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        '/api/ai-proxy',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            url: 'http://localhost:3001/v1/models',
            method: 'GET',
            headers: {
              Accept: 'application/json',
              Authorization: 'Bearer test-key',
            },
          }),
        })
      );
      expect(models).toEqual(['proxied-model-1', 'proxied-model-2']);
    });

    it('rethrows error when both direct fetch and /api/ai-proxy fail', async () => {
      const directError = new TypeError('Failed to fetch');
      const mockFetch = vi
        .fn()
        .mockRejectedValueOnce(directError)
        .mockRejectedValueOnce(new Error('Proxy connection refused'));
      globalThis.fetch = mockFetch;

      await expect(
        fetchProviderModels('http://localhost:3001/v1', 'test-key')
      ).rejects.toThrow('Failed to fetch');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
