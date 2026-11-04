'use client';

import React, { useState, useEffect } from 'react';
import { useThemeSafe } from '../context/ThemeContext';
import type { LatexEngine } from '../types/workspace';
import { X, Palette, FileText, Cpu, Check } from 'lucide-react';

export type SettingsCategory = 'appearance' | 'editor' | 'build';

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

  // Sync staged state whenever modal is opened
  useEffect(() => {
    if (isOpen) {
      setStagedTheme(propTheme ?? ctxTheme);
      setStagedAutoSave(propAutoSave);
      setStagedEngine(propEngine);
    }
  }, [isOpen, propTheme, ctxTheme, propAutoSave, propEngine]);

  // Handle keyboard: Escape closes, Enter saves & closes
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
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none"
    >
      <div
        className={`w-[680px] max-w-[95vw] h-[480px] max-h-[90vh] rounded-lg shadow-2xl border flex flex-col overflow-hidden font-sans ${
          isDark
            ? 'bg-[#2b2d30] border-[#393b40] text-[#dfe1e5]'
            : 'bg-[#ffffff] border-[#d1d5db] text-[#1f2328]'
        }`}
      >
        {/* IntelliJ Header */}
        <div
          className={`flex items-center justify-between px-4 py-2.5 border-b shrink-0 ${
            isDark ? 'border-[#393b40] bg-[#26282b]' : 'border-[#d1d5db] bg-[#f7f8fa]'
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
              isDark ? 'border-[#393b40] bg-[#26282b]' : 'border-[#d1d5db] bg-[#f7f8fa]'
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
                      ? isDark
                        ? 'bg-[#3574f0] text-white'
                        : 'bg-[#3574f0] text-white'
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
          </div>
        </div>

        {/* Footer Actions */}
        <div
          className={`flex items-center justify-end gap-2.5 px-4 py-2.5 border-t shrink-0 ${
            isDark ? 'border-[#393b40] bg-[#26282b]' : 'border-[#d1d5db] bg-[#f7f8fa]'
          }`}
        >
          <button
            type="button"
            onClick={handleCancel}
            className={`px-3 py-1.5 rounded text-xs font-medium border transition ${
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
            className={`px-3 py-1.5 rounded text-xs font-medium border transition ${
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
            className="px-4 py-1.5 rounded text-xs font-semibold bg-[#3574f0] text-white hover:bg-[#3068d9] transition shadow-sm"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};
