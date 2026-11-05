'use client';

import React, { useState, useEffect } from 'react';
import { useThemeSafe } from '../context/ThemeContext';
import type { LatexEngine } from '../types/workspace';
import {
  X,
  Palette,
  FileText,
  Cpu,
  Check,
  Sparkles,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react';
import {
  loadAISettings,
  saveAISettings,
  fetchProviderModels,
  getDefaultAISettings,
} from '../ai/aiConfig';
import type { AIProviderConfig, AISettings } from '../types/ai';

export type SettingsCategory = 'appearance' | 'editor' | 'build' | 'ai';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: 'dark' | 'light';
  onThemeChange?: (theme: 'dark' | 'light') => void;
  autoSave?: boolean;
  onAutoSaveChange?: (enabled: boolean) => void;
  selectedEngine?: LatexEngine;
  onEngineChange?: (engine: LatexEngine) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  theme: propTheme,
  onThemeChange,
  autoSave: propAutoSave = true,
  onAutoSaveChange,
  selectedEngine: propEngine = 'pdflatex',
  onEngineChange,
}) => {
  const { theme: ctxTheme, setTheme: ctxSetTheme } = useThemeSafe();
  const activeTheme = propTheme ?? ctxTheme;

  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('appearance');
  const [stagedTheme, setStagedTheme] = useState<'dark' | 'light'>(activeTheme);
  const [stagedAutoSave, setStagedAutoSave] = useState<boolean>(propAutoSave);
  const [stagedEngine, setStagedEngine] = useState<LatexEngine>(propEngine);

  // AI Settings state
  const [stagedAiSettings, setStagedAiSettings] = useState<AISettings>(getDefaultAISettings);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [testStatus, setTestStatus] = useState<{
    loading: boolean;
    success?: boolean;
    message?: string;
  }>({ loading: false });

  // Sync staged state whenever modal is opened
  useEffect(() => {
    if (isOpen) {
      setStagedTheme(propTheme ?? ctxTheme);
      setStagedAutoSave(propAutoSave);
      setStagedEngine(propEngine);
      setTestStatus({ loading: false });

      loadAISettings()
        .then((cfg) => {
          setStagedAiSettings(cfg);
          if (cfg.providers.length > 0) {
            setSelectedProviderId(cfg.activeProviderId || cfg.providers[0].id);
          }
        })
        .catch(() => {
          // Graceful fallback to default settings
        });
    }
  }, [isOpen, propTheme, ctxTheme, propAutoSave, propEngine]);

  // Handle keyboard: Escape closes
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isDark = activeTheme === 'dark';

  const applyChanges = () => {
    if (onThemeChange) {
      onThemeChange(stagedTheme);
    } else {
      ctxSetTheme(stagedTheme);
    }
    onAutoSaveChange?.(stagedAutoSave);
    onEngineChange?.(stagedEngine);
    saveAISettings(stagedAiSettings).catch(() => {
      // Graceful error handling
    });
  };

  const handleApply = () => {
    applyChanges();
  };

  const handleOk = () => {
    applyChanges();
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const categories: { id: SettingsCategory; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'editor', label: 'Editor', icon: FileText },
    { id: 'build', label: 'Build & Execution', icon: Cpu },
    { id: 'ai', label: 'AI Assistant', icon: Sparkles },
  ];

  const currentProvider: AIProviderConfig | undefined =
    stagedAiSettings.providers.find(
      (p) => p.id === (selectedProviderId || stagedAiSettings.activeProviderId)
    ) || stagedAiSettings.providers[0];

  const updateCurrentProvider = (patch: Partial<AIProviderConfig>) => {
    if (!currentProvider) return;
    setStagedAiSettings((prev) => ({
      ...prev,
      providers: prev.providers.map((p) =>
        p.id === currentProvider.id ? { ...p, ...patch } : p
      ),
    }));
  };

  const handleAddProvider = () => {
    const newId = `provider-${Date.now()}`;
    const newProvider: AIProviderConfig = {
      id: newId,
      name: 'Custom Provider',
      baseUrl: 'http://localhost:11434/v1',
      apiKey: '',
      selectedModel: '',
      availableModels: [],
    };
    setStagedAiSettings((prev) => ({
      ...prev,
      providers: [...prev.providers, newProvider],
      activeProviderId: prev.activeProviderId || newId,
    }));
    setSelectedProviderId(newId);
    setTestStatus({ loading: false });
  };

  const handleDeleteProvider = (idToDelete: string) => {
    if (stagedAiSettings.providers.length <= 1) return;
    const updated = stagedAiSettings.providers.filter((p) => p.id !== idToDelete);
    const newActive =
      stagedAiSettings.activeProviderId === idToDelete
        ? updated[0]?.id || null
        : stagedAiSettings.activeProviderId;
    setStagedAiSettings({
      ...stagedAiSettings,
      providers: updated,
      activeProviderId: newActive,
    });
    if (selectedProviderId === idToDelete) {
      setSelectedProviderId(updated[0]?.id || null);
    }
  };

  const handleTestConnection = async () => {
    if (!currentProvider) return;
    setTestStatus({ loading: true, message: undefined });
    try {
      const models = await fetchProviderModels(currentProvider.baseUrl, currentProvider.apiKey);
      updateCurrentProvider({
        availableModels: models,
        selectedModel: currentProvider.selectedModel || models[0] || '',
      });
      setTestStatus({
        loading: false,
        success: true,
        message: `Connected! Found ${models.length} model${models.length === 1 ? '' : 's'}.`,
      });
    } catch (err: any) {
      setTestStatus({
        loading: false,
        success: false,
        message: err?.message || 'Connection failed.',
      });
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none"
    >
      <div
        className={`w-[720px] max-w-[95vw] h-[540px] max-h-[90vh] rounded-lg shadow-2xl border flex flex-col overflow-hidden font-sans ${
          isDark
            ? 'bg-[#2b2d30] border-[#323232] text-[#dfe1e5]'
            : 'bg-[#ffffff] border-[#d1d5db] text-[#1f2328]'
        }`}
      >
        {/* IntelliJ Header */}
        <div
          className={`flex items-center justify-between px-4 py-2.5 border-b shrink-0 ${
            isDark ? 'border-[#323232] bg-[#26282b]' : 'border-[#d1d5db] bg-[#f7f8fa]'
          }`}
        >
          <h2 id="settings-dialog-title" className="text-xs font-semibold tracking-wide">
            Settings
          </h2>
          <button
            onClick={handleCancel}
            aria-label="Close Settings"
            className={`p-1 rounded transition ${
              isDark
                ? 'text-[#868a91] hover:text-[#dfe1e5] hover:bg-[#393b40]'
                : 'text-[#6c707e] hover:text-[#1f2328] hover:bg-[#dfe1e5]'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body: Left Category Sidebar + Right Content Pane */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Left Category Sidebar */}
          <div
            className={`w-48 border-r flex flex-col py-2 shrink-0 ${
              isDark ? 'border-[#323232] bg-[#26282b]' : 'border-[#d1d5db] bg-[#f7f8fa]'
            }`}
          >
            {categories.map((cat) => {
              const Icon = cat.icon;
              const isSelected = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className={`flex items-center gap-2.5 px-3 py-1.5 text-xs font-medium text-left transition ${
                    isSelected
                      ? 'bg-[#3574f0] text-white'
                      : isDark
                        ? 'text-[#dfe1e5] hover:bg-[#323438]'
                        : 'text-[#1f2328] hover:bg-[#ebecf0]'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* Right Content Pane */}
          <div className="flex-1 p-5 overflow-y-auto">
            {activeCategory === 'appearance' && (
              <div className="flex flex-col gap-5">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider mb-1 opacity-70">
                    Appearance
                  </h3>
                  <p className="text-xs opacity-60">
                    Customize the interface theme and visual styling of Torque.
                  </p>
                </div>

                <div className="flex flex-col gap-2.5">
                  <label className="text-xs font-medium">Theme</label>
                  <div className="flex flex-col gap-2">
                    <label
                      className={`flex items-center justify-between p-3 rounded border cursor-pointer transition ${
                        stagedTheme === 'dark'
                          ? isDark
                            ? 'border-[#3574f0] bg-[#2e374d]'
                            : 'border-[#3574f0] bg-[#f0f4ff]'
                          : isDark
                            ? 'border-[#393b40] hover:border-[#4e5157]'
                            : 'border-[#d1d5db] hover:border-[#9ca3af]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="theme-selection"
                          value="dark"
                          checked={stagedTheme === 'dark'}
                          onChange={() => setStagedTheme('dark')}
                          className="accent-[#3574f0]"
                        />
                        <div>
                          <div className="text-xs font-semibold">Darcula (Dark)</div>
                          <div className="text-[11px] opacity-60">
                            Dark background with high readability and IntelliJ Darcula syntax
                          </div>
                        </div>
                      </div>
                      {stagedTheme === 'dark' && <Check className="w-4 h-4 text-[#3574f0]" />}
                    </label>

                    <label
                      className={`flex items-center justify-between p-3 rounded border cursor-pointer transition ${
                        stagedTheme === 'light'
                          ? isDark
                            ? 'border-[#3574f0] bg-[#2e374d]'
                            : 'border-[#3574f0] bg-[#f0f4ff]'
                          : isDark
                            ? 'border-[#393b40] hover:border-[#4e5157]'
                            : 'border-[#d1d5db] hover:border-[#9ca3af]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="theme-selection"
                          value="light"
                          checked={stagedTheme === 'light'}
                          onChange={() => setStagedTheme('light')}
                          className="accent-[#3574f0]"
                        />
                        <div>
                          <div className="text-xs font-semibold">IntelliJ Light</div>
                          <div className="text-[11px] opacity-60">
                            Clean, high-visibility light theme styled after JetBrains New UI
                          </div>
                        </div>
                      </div>
                      {stagedTheme === 'light' && <Check className="w-4 h-4 text-[#3574f0]" />}
                    </label>
                  </div>
                </div>
              </div>
            )}

            {activeCategory === 'editor' && (
              <div className="flex flex-col gap-5">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider mb-1 opacity-70">
                    Editor & Save Options
                  </h3>
                  <p className="text-xs opacity-60">
                    Configure document persistence and automatic saving behavior.
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      data-testid="autosave-checkbox"
                      checked={stagedAutoSave}
                      onChange={(e) => setStagedAutoSave(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded accent-[#3574f0]"
                    />
                    <div>
                      <div className="text-xs font-medium">
                        Enable Auto-save (save files automatically)
                      </div>
                      <div className="text-[11px] opacity-60 mt-0.5">
                        {stagedAutoSave
                          ? 'Changes are automatically persisted to project storage.'
                          : 'Files remain in memory until manual save (Ctrl+S / Cmd+S or File -> Save).'}
                      </div>
                    </div>
                  </label>

                  <div
                    className={`mt-2 p-3 rounded text-xs border ${
                      isDark ? 'bg-[#26282b] border-[#393b40]' : 'bg-[#f7f8fa] border-[#e5e7eb]'
                    }`}
                  >
                    <span className="font-medium">Save Status: </span>
                    <span className="opacity-80">
                      {stagedAutoSave ? 'Automatic saving active' : 'Manual save required (Ctrl+S)'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {activeCategory === 'build' && (
              <div className="flex flex-col gap-5">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider mb-1 opacity-70">
                    Build & Execution
                  </h3>
                  <p className="text-xs opacity-60">
                    Select the default TeX compilation engine used for building LaTeX documents.
                  </p>
                </div>

                <div className="flex flex-col gap-2.5">
                  <label className="text-xs font-medium">TeX Engine</label>
                  <div className="flex flex-col gap-2">
                    {[
                      {
                        id: 'pdflatex' as LatexEngine,
                        name: 'latexmk (pdflatex)',
                        desc: 'Standard pdfLaTeX engine, ideal for general LaTeX and scientific papers.',
                      },
                      {
                        id: 'xelatex' as LatexEngine,
                        name: 'latexmk (xelatex)',
                        desc: 'Modern Unicode engine with native OpenType and system font support.',
                      },
                      {
                        id: 'lualatex' as LatexEngine,
                        name: 'latexmk (lualatex)',
                        desc: 'Next-generation LuaTeX engine supporting Lua scripting and advanced typography.',
                      },
                    ].map((engine) => (
                      <label
                        key={engine.id}
                        className={`flex items-center justify-between p-3 rounded border cursor-pointer transition ${
                          stagedEngine === engine.id
                            ? isDark
                              ? 'border-[#3574f0] bg-[#2e374d]'
                              : 'border-[#3574f0] bg-[#f0f4ff]'
                            : isDark
                              ? 'border-[#393b40] hover:border-[#4e5157]'
                              : 'border-[#d1d5db] hover:border-[#9ca3af]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="radio"
                            name="engine-selection"
                            value={engine.id}
                            checked={stagedEngine === engine.id}
                            onChange={() => setStagedEngine(engine.id)}
                            className="accent-[#3574f0]"
                          />
                          <div>
                            <div className="text-xs font-semibold">{engine.name}</div>
                            <div className="text-[11px] opacity-60">{engine.desc}</div>
                          </div>
                        </div>
                        {stagedEngine === engine.id && (
                          <Check className="w-4 h-4 text-[#3574f0]" />
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeCategory === 'ai' && (
              <div className="flex flex-col gap-5">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider mb-1 opacity-70">
                    AI Assistant Configuration
                  </h3>
                  <p className="text-xs opacity-60">
                    Configure LLM endpoints (OpenAI, Ollama, LM Studio, or local compatible models).
                  </p>
                </div>

                {/* AI Providers Section */}
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium">Configured Providers</label>
                    <button
                      type="button"
                      onClick={handleAddProvider}
                      className="flex items-center gap-1 text-xs text-[#3574f0] hover:underline font-medium cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Provider</span>
                    </button>
                  </div>

                  <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto">
                    {stagedAiSettings.providers.map((p) => {
                      const isEditing = p.id === currentProvider?.id;
                      const isActive = p.id === stagedAiSettings.activeProviderId;
                      return (
                        <div
                          key={p.id}
                          onClick={() => {
                            setSelectedProviderId(p.id);
                            setTestStatus({ loading: false });
                          }}
                          className={`flex items-center justify-between px-3 py-2 rounded border cursor-pointer transition text-xs ${
                            isEditing
                              ? isDark
                                ? 'border-[#3574f0] bg-[#2e374d]'
                                : 'border-[#3574f0] bg-[#f0f4ff]'
                              : isDark
                                ? 'border-[#393b40] bg-[#1e1f22] hover:border-[#4e5157]'
                                : 'border-[#d1d5db] bg-[#f7f8fa] hover:border-[#9ca3af]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="radio"
                              name="active-provider-radio"
                              aria-label={`Set ${p.name} as active`}
                              checked={isActive}
                              onChange={() => {
                                setStagedAiSettings((prev) => ({
                                  ...prev,
                                  activeProviderId: p.id,
                                }));
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="accent-[#3574f0]"
                            />
                            <span className="font-semibold truncate">{p.name}</span>
                            {isActive && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-[#3574f0] text-white rounded font-medium">
                                Active
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-[11px] opacity-60 truncate max-w-[140px]">
                              {p.selectedModel || 'No model selected'}
                            </span>
                            {stagedAiSettings.providers.length > 1 && (
                              <button
                                type="button"
                                aria-label={`Delete provider ${p.name}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteProvider(p.id);
                                }}
                                className="p-1 rounded text-red-500 hover:bg-red-500/10 transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Selected Provider Form Fields */}
                {currentProvider && (
                  <div
                    className={`p-3.5 rounded border flex flex-col gap-3 ${
                      isDark
                        ? 'border-[#323232] bg-[#1e1f22]'
                        : 'border-[#d1d5db] bg-[#f7f8fa]'
                    }`}
                  >
                    <div className="flex items-center justify-between pb-1 border-b border-inherit">
                      <span className="text-xs font-semibold">
                        Provider Settings: {currentProvider.name}
                      </span>
                      {stagedAiSettings.activeProviderId !== currentProvider.id && (
                        <button
                          type="button"
                          onClick={() =>
                            setStagedAiSettings((prev) => ({
                              ...prev,
                              activeProviderId: currentProvider.id,
                            }))
                          }
                          className="text-xs text-[#3574f0] hover:underline font-medium cursor-pointer"
                        >
                          Set as Active
                        </button>
                      )}
                    </div>

                    {/* Provider Name */}
                    <div className="flex flex-col gap-1">
                      <label
                        className="text-[11px] font-medium opacity-80"
                        htmlFor="ai-provider-name"
                      >
                        Provider Name
                      </label>
                      <input
                        id="ai-provider-name"
                        aria-label="Provider Name"
                        type="text"
                        value={currentProvider.name}
                        onChange={(e) => updateCurrentProvider({ name: e.target.value })}
                        className={`px-2.5 py-1.5 rounded text-xs border outline-none focus:border-[#3574f0] ${
                          isDark
                            ? 'bg-[#2b2d30] border-[#393b40] text-[#dfe1e5]'
                            : 'bg-white border-[#d1d5db] text-[#1f2328]'
                        }`}
                      />
                    </div>

                    {/* Base URL */}
                    <div className="flex flex-col gap-1">
                      <label
                        className="text-[11px] font-medium opacity-80"
                        htmlFor="ai-base-url"
                      >
                        Base URL
                      </label>
                      <input
                        id="ai-base-url"
                        aria-label="Base URL"
                        type="text"
                        value={currentProvider.baseUrl}
                        onChange={(e) => updateCurrentProvider({ baseUrl: e.target.value })}
                        placeholder="https://api.openai.com/v1"
                        className={`px-2.5 py-1.5 rounded text-xs border outline-none focus:border-[#3574f0] ${
                          isDark
                            ? 'bg-[#2b2d30] border-[#393b40] text-[#dfe1e5]'
                            : 'bg-white border-[#d1d5db] text-[#1f2328]'
                        }`}
                      />
                    </div>

                    {/* API Key */}
                    <div className="flex flex-col gap-1">
                      <label
                        className="text-[11px] font-medium opacity-80"
                        htmlFor="ai-api-key"
                      >
                        API Key
                      </label>
                      <div className="relative">
                        <input
                          id="ai-api-key"
                          aria-label="API Key"
                          type={showApiKey ? 'text' : 'password'}
                          value={currentProvider.apiKey}
                          onChange={(e) => updateCurrentProvider({ apiKey: e.target.value })}
                          placeholder="sk-..."
                          className={`w-full px-2.5 py-1.5 pr-8 rounded text-xs border outline-none focus:border-[#3574f0] ${
                            isDark
                              ? 'bg-[#2b2d30] border-[#393b40] text-[#dfe1e5]'
                              : 'bg-white border-[#d1d5db] text-[#1f2328]'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey(!showApiKey)}
                          className={`absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded cursor-pointer ${
                            isDark
                              ? 'text-[#868a91] hover:text-[#dfe1e5]'
                              : 'text-[#6c707e] hover:text-[#1f2328]'
                          }`}
                          title={showApiKey ? 'Hide API Key' : 'Show API Key'}
                          aria-label={showApiKey ? 'Hide API Key' : 'Show API Key'}
                        >
                          {showApiKey ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Model Selection */}
                    <div className="flex flex-col gap-1">
                      <label
                        className="text-[11px] font-medium opacity-80"
                        htmlFor="ai-model-input"
                      >
                        Model Selection
                      </label>
                      {currentProvider.availableModels.length > 0 && (
                        <select
                          id="ai-model-select"
                          aria-label="Available Models"
                          value={
                            currentProvider.availableModels.includes(currentProvider.selectedModel)
                              ? currentProvider.selectedModel
                              : ''
                          }
                          onChange={(e) => updateCurrentProvider({ selectedModel: e.target.value })}
                          className={`px-2.5 py-1.5 mb-1 rounded text-xs border outline-none focus:border-[#3574f0] cursor-pointer ${
                            isDark
                              ? 'bg-[#2b2d30] border-[#393b40] text-[#dfe1e5]'
                              : 'bg-white border-[#d1d5db] text-[#1f2328]'
                          }`}
                        >
                          <option value="" disabled>
                            -- Select from detected models --
                          </option>
                          {currentProvider.availableModels.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      )}
                      <input
                        id="ai-model-input"
                        aria-label="Model Name"
                        type="text"
                        value={currentProvider.selectedModel}
                        onChange={(e) => updateCurrentProvider({ selectedModel: e.target.value })}
                        placeholder="e.g. gpt-4o, llama3.2, qwen2.5-coder"
                        className={`px-2.5 py-1.5 rounded text-xs border outline-none focus:border-[#3574f0] ${
                          isDark
                            ? 'bg-[#2b2d30] border-[#393b40] text-[#dfe1e5]'
                            : 'bg-white border-[#d1d5db] text-[#1f2328]'
                        }`}
                      />
                    </div>

                    {/* Test Connection Button & Status */}
                    <div className="flex items-center gap-3 pt-1">
                      <button
                        type="button"
                        disabled={testStatus.loading}
                        onClick={handleTestConnection}
                        className={`px-3 py-1.5 rounded text-xs font-medium border flex items-center gap-1.5 transition cursor-pointer ${
                          testStatus.loading
                            ? 'opacity-50 cursor-not-allowed'
                            : isDark
                              ? 'border-[#4e5157] text-[#dfe1e5] hover:bg-[#393b40]'
                              : 'border-[#c9ccd6] text-[#1f2328] hover:bg-[#ebecf0]'
                        }`}
                      >
                        {testStatus.loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        <span>{testStatus.loading ? 'Testing...' : 'Test Connection'}</span>
                      </button>

                      {testStatus.message && (
                        <span
                          role="status"
                          className={`text-xs ${
                            testStatus.success
                              ? 'text-green-500 font-medium'
                              : 'text-red-500 font-medium'
                          }`}
                        >
                          {testStatus.message}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div
          className={`flex items-center justify-end gap-2.5 px-4 py-2.5 border-t shrink-0 ${
            isDark ? 'border-[#323232] bg-[#26282b]' : 'border-[#d1d5db] bg-[#f7f8fa]'
          }`}
        >
          <button
            type="button"
            onClick={handleCancel}
            className={`px-3 py-1.5 rounded text-xs font-medium border transition cursor-pointer ${
              isDark
                ? 'border-[#4e5157] text-[#dfe1e5] hover:bg-[#393b40]'
                : 'border-[#c9ccd6] text-[#1f2328] hover:bg-[#ebecf0]'
            }`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className={`px-3 py-1.5 rounded text-xs font-medium border transition cursor-pointer ${
              isDark
                ? 'border-[#4e5157] text-[#dfe1e5] hover:bg-[#393b40]'
                : 'border-[#c9ccd6] text-[#1f2328] hover:bg-[#ebecf0]'
            }`}
          >
            Apply
          </button>
          <button
            type="button"
            onClick={handleOk}
            className="px-4 py-1.5 rounded text-xs font-semibold bg-[#3574f0] text-white hover:bg-[#3068d9] transition shadow-sm cursor-pointer"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};
