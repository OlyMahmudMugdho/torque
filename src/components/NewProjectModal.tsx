import React, { useState, useEffect, useRef } from 'react';
import { useThemeSafe } from '../context/ThemeContext';
import { isTauri } from '../storage/tauriStorage';
import {
  X,
  FileText,
  FileCode,
  Award,
  Presentation,
  Book,
  Folder,
  Check,
  GitBranch,
} from 'lucide-react';
import {
  PROJECT_TEMPLATES,
  type ProjectTemplateId,
  type NewProjectFormValues,
} from '../templates/projectTemplates';

export interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (values: NewProjectFormValues) => Promise<void> | void;
}

const TEMPLATE_ICONS: Record<ProjectTemplateId, React.FC<{ className?: string }>> = {
  empty: FileCode,
  article: FileText,
  ieee: Award,
  beamer: Presentation,
  report: Book,
};

export const NewProjectModal: React.FC<NewProjectModalProps> = ({
  isOpen,
  onClose,
  onCreate,
}) => {
  const { theme } = useThemeSafe();
  const isDark = theme === 'dark';

  const [name, setName] = useState('untitled');
  const [location, setLocation] = useState('~/.torque/projects');
  const [templateId, setTemplateId] = useState<ProjectTemplateId>('article');
  const [fontSize, setFontSize] = useState<'10pt' | '11pt' | '12pt'>('11pt');
  const [paperSize, setPaperSize] = useState<'letterpaper' | 'a4paper'>('letterpaper');
  const [createGitRepo, setCreateGitRepo] = useState(false);
  const [generateSample, setGenerateSample] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const handleBrowseLocation = async () => {
    if (typeof window !== 'undefined' && isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const selected = await invoke<string | null>('select_directory', {
          defaultPath: location.startsWith('~') ? undefined : location,
        });
        if (selected) {
          setLocation(selected);
        }
      } catch (e) {
        console.warn('Failed to open directory dialog via Tauri:', e);
      }
    } else if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
      try {
        const handle = await (window as any).showDirectoryPicker();
        if (handle?.name) {
          setLocation(handle.name);
        }
      } catch {
        // User cancelled picker
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      setIsSubmitting(false);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen]);

  // Keyboard shortcut: Escape closes, Enter submits
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

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onCreate({
        name: name.trim(),
        templateId,
        fontSize,
        paperSize,
        createGitRepo,
        generateSample,
        location: `${location.replace(/\/+$/, '')}/${name.trim()}`,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedTemplate =
    PROJECT_TEMPLATES.find((t) => t.id === templateId) || PROJECT_TEMPLATES[0];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-project-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-2xl rounded-lg border shadow-2xl flex flex-col overflow-hidden font-sans transition-colors ${
          isDark ? 'bg-[#2b2d30] border-[#393b40] text-[#dfe1e5]' : 'bg-[#ffffff] border-[#c9ccd6] text-[#1f2328]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* IntelliJ Title Bar Header */}
        <div
          className={`h-9 px-3.5 border-b flex items-center justify-between shrink-0 ${
            isDark ? 'bg-[#1e1f22] border-[#393b40]' : 'bg-[#ebecf0] border-[#d1d5db]'
          }`}
        >
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-[#1e1f22] border border-[#e5a035] flex items-center justify-center">
              <span className="text-[8px] font-black text-[#e5a035] leading-none">TQ</span>
            </div>
            <h2 id="new-project-title" className="text-xs font-semibold tracking-wide">
              New Project
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="w-6 h-6 flex items-center justify-center rounded text-[#868a91] hover:text-white hover:bg-[#e05555] transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Wizard Body: Left Categories + Right Settings */}
        <div className="flex flex-col sm:flex-row min-h-[380px]">
          {/* Left Sidebar: Generators / Templates */}
          <aside
            className={`w-full sm:w-56 border-b sm:border-b-0 sm:border-r p-3 flex flex-col gap-1 shrink-0 ${
              isDark ? 'bg-[#1e1f22] border-[#393b40]' : 'bg-[#f7f8fa] border-[#d1d5db]'
            }`}
          >
            <span
              className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 ${
                isDark ? 'text-[#868a91]' : 'text-[#6c707e]'
              }`}
            >
              Generators
            </span>

            {PROJECT_TEMPLATES.map((tmpl) => {
              const Icon = TEMPLATE_ICONS[tmpl.id];
              const isSelected = tmpl.id === templateId;
              return (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => setTemplateId(tmpl.id)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium text-left transition ${
                    isSelected
                      ? 'bg-[#3574f0] text-white shadow-xs'
                      : isDark
                        ? 'text-[#dfe1e5] hover:bg-[#2b2d30]'
                        : 'text-[#1f2328] hover:bg-[#ebecf0]'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{tmpl.name}</span>
                </button>
              );
            })}

            <div className="mt-auto pt-3 border-t border-inherit">
              <div
                className={`flex items-center gap-1.5 px-2 text-[11px] ${
                  isDark ? 'text-[#868a91]' : 'text-[#6c707e]'
                }`}
              >
                <Folder className="w-3 h-3 text-[#3574f0] shrink-0" />
                <span>Torque Project</span>
              </div>
            </div>
          </aside>

          {/* Right Main Configuration Form */}
          <form
            onSubmit={handleSubmit}
            className="flex-1 p-5 flex flex-col justify-between overflow-y-auto"
          >
            <div className="flex flex-col gap-4">
              {/* Name Input */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="project-name" className="text-xs font-semibold">
                  Name:
                </label>
                <input
                  ref={inputRef}
                  id="project-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="untitled-project"
                  required
                  className={`h-8 px-2.5 rounded border text-xs outline-none transition ${
                    isDark
                      ? 'bg-[#1e1f22] border-[#4e5157] text-[#dfe1e5] focus:border-[#3574f0] focus:ring-1 focus:ring-[#3574f0]'
                      : 'bg-[#ffffff] border-[#c9ccd6] text-[#1f2328] focus:border-[#3574f0] focus:ring-1 focus:ring-[#3574f0]'
                  }`}
                />
              </div>

              {/* Location Input with Browse button */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="project-location" className="text-xs font-semibold">
                  Location:
                </label>
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1">
                    <input
                      id="project-location"
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="~/.torque/projects"
                      className={`w-full h-8 px-2.5 rounded border text-xs font-mono outline-none transition ${
                        isDark
                          ? 'bg-[#1e1f22] border-[#4e5157] text-[#dfe1e5] focus:border-[#3574f0] focus:ring-1 focus:ring-[#3574f0]'
                          : 'bg-[#ffffff] border-[#c9ccd6] text-[#1f2328] focus:border-[#3574f0] focus:ring-1 focus:ring-[#3574f0]'
                      }`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleBrowseLocation}
                    aria-label="Browse location"
                    title="Select folder"
                    className={`h-8 px-2.5 rounded border text-xs font-medium flex items-center gap-1.5 shrink-0 transition ${
                      isDark
                        ? 'border-[#4e5157] bg-[#1e1f22] text-[#dfe1e5] hover:bg-[#393b40]'
                        : 'border-[#c9ccd6] bg-[#f7f8fa] text-[#1f2328] hover:bg-[#ebecf0]'
                    }`}
                  >
                    <Folder className="w-3.5 h-3.5 text-[#3574f0]" />
                    <span>Browse...</span>
                  </button>
                </div>
                <div
                  className={`text-[10px] font-mono truncate px-0.5 ${
                    isDark ? 'text-[#868a91]' : 'text-[#6c707e]'
                  }`}
                >
                  Full Path: {location.replace(/\/+$/, '')}/{name || 'untitled'}
                </div>
              </div>

              {/* Template Info Card */}
              <div
                className={`p-3 rounded border flex flex-col gap-1 ${
                  isDark ? 'bg-[#1e1f22]/40 border-[#393b40]' : 'bg-[#f7f8fa] border-[#e5e7eb]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">{selectedTemplate.name}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#3574f0]/15 text-[#3574f0] font-mono">
                    \{selectedTemplate.docClass}
                  </span>
                </div>
                <p className="text-[11px] text-[#868a91] leading-relaxed">
                  {selectedTemplate.description}
                </p>
              </div>

              {/* Document Configuration Row */}
              <div className="grid grid-cols-2 gap-3">
                {/* Font Size Selector */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold">Font Size:</span>
                  <div className="flex items-center gap-1">
                    {(['10pt', '11pt', '12pt'] as const).map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => setFontSize(size)}
                        className={`flex-1 py-1 rounded text-xs font-medium border text-center transition ${
                          fontSize === size
                            ? 'border-[#3574f0] bg-[#3574f0] text-white'
                            : isDark
                              ? 'border-[#393b40] hover:border-[#4e5157] text-[#dfe1e5]'
                              : 'border-[#d1d5db] hover:border-[#9ca3af] text-[#1f2328]'
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Paper Size Selector */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold">Paper Size:</span>
                  <div className="flex items-center gap-1">
                    {[
                      { id: 'letterpaper', label: 'Letter' },
                      { id: 'a4paper', label: 'A4' },
                    ].map((paper) => (
                      <button
                        key={paper.id}
                        type="button"
                        onClick={() => setPaperSize(paper.id as any)}
                        className={`flex-1 py-1 rounded text-xs font-medium border text-center transition ${
                          paperSize === paper.id
                            ? 'border-[#3574f0] bg-[#3574f0] text-white'
                            : isDark
                              ? 'border-[#393b40] hover:border-[#4e5157] text-[#dfe1e5]'
                              : 'border-[#d1d5db] hover:border-[#9ca3af] text-[#1f2328]'
                        }`}
                      >
                        {paper.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Checkboxes Row */}
              <div className="flex flex-col gap-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={generateSample}
                    onChange={(e) => setGenerateSample(e.target.checked)}
                    className="w-3.5 h-3.5 rounded accent-[#3574f0]"
                  />
                  <span>Generate sample sections, preamble, and packages</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={createGitRepo}
                    onChange={(e) => setCreateGitRepo(e.target.checked)}
                    className="w-3.5 h-3.5 rounded accent-[#3574f0]"
                  />
                  <span className="flex items-center gap-1">
                    <GitBranch className="w-3 h-3 text-[#3574f0]" />
                    <span>Initialize Git repository with .gitignore</span>
                  </span>
                </label>
              </div>
            </div>

            {/* Bottom Actions Bar */}
            <div
              className={`mt-6 pt-3 border-t flex items-center justify-end gap-2.5 ${
                isDark ? 'border-[#393b40]' : 'border-[#d1d5db]'
              }`}
            >
              <button
                type="button"
                onClick={onClose}
                className={`px-3 py-1.5 rounded text-xs font-medium border transition ${
                  isDark
                    ? 'border-[#4e5157] text-[#dfe1e5] hover:bg-[#393b40]'
                    : 'border-[#c9ccd6] text-[#1f2328] hover:bg-[#ebecf0]'
                }`}
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={!name.trim() || isSubmitting}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-semibold bg-[#3574f0] text-white hover:bg-[#3068d9] disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'Creating...' : 'Create'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
