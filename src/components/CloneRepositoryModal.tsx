import React, { useState, useEffect, useRef } from 'react';
import { useThemeSafe } from '../context/ThemeContext';
import { X, GitBranch, Folder, AlertCircle, Loader2 } from 'lucide-react';

export interface CloneRepositoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClone: (repoUrl: string, projectName: string) => Promise<void> | void;
}

export function inferRepoName(url: string): string {
  const clean = url.trim().replace(/\.git\/?$/, '').replace(/\/+$/, '');
  if (!clean) return '';
  const segs = clean.split(/[/:]/);
  const last = segs[segs.length - 1];
  return last ? last.replace(/[^a-zA-Z0-9._-]/g, '') : '';
}

export const CloneRepositoryModal: React.FC<CloneRepositoryModalProps> = ({
  isOpen,
  onClose,
  onClone,
}) => {
  const { theme } = useThemeSafe();
  const isDark = theme === 'dark';

  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasManuallyEditedName, setHasManuallyEditedName] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setUrl('');
      setName('');
      setError(null);
      setIsSubmitting(false);
      setHasManuallyEditedName(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

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

  const handleUrlChange = (newUrl: string) => {
    setUrl(newUrl);
    setError(null);
    if (!hasManuallyEditedName) {
      const inferred = inferRepoName(newUrl);
      if (inferred) setName(inferred);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setError('Please enter a Git repository URL.');
      return;
    }

    const finalName = (name.trim() || inferRepoName(trimmedUrl) || 'Cloned Repository').trim();

    try {
      setIsSubmitting(true);
      setError(null);
      await onClone(trimmedUrl, finalName);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to clone repository.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="clone-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        className={`w-[540px] max-w-[95vw] rounded-lg shadow-2xl border flex flex-col overflow-hidden font-sans ${
          isDark
            ? 'bg-[#2b2d30] border-[#43454a] text-[#dfe1e5]'
            : 'bg-white border-[#d1d5db] text-[#1f2328]'
        }`}
        style={{ colorScheme: isDark ? 'dark' : 'light' }}
      >
        {/* IntelliJ Dialog Header */}
        <div
          className={`flex items-center justify-between px-4 py-2.5 border-b shrink-0 ${
            isDark ? 'border-[#393b40] bg-[#26282b]' : 'border-[#ebecf0] bg-[#f7f8fa]'
          }`}
        >
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded flex items-center justify-center bg-[#3574f0]/15 text-[#3574f0]">
              <GitBranch className="w-3.5 h-3.5" />
            </div>
            <h2 id="clone-dialog-title" className="text-xs font-semibold tracking-wide">
              Get from Version Control
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close"
            className={`p-1 rounded transition cursor-pointer ${
              isDark
                ? 'text-[#c2c5cc] hover:text-white hover:bg-[#393b40]'
                : 'text-[#6c707e] hover:text-[#1f2328] hover:bg-[#dfe1e5]'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          {/* Repository URL Input */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="clone-url-input" className="text-xs font-medium">
              URL
            </label>
            <div className="relative">
              <input
                id="clone-url-input"
                ref={inputRef}
                type="text"
                value={url}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://github.com/username/repository.git"
                disabled={isSubmitting}
                className={`w-full px-3 py-2 text-xs rounded border outline-none transition ${
                  error
                    ? 'border-[#e05555]'
                    : isDark
                      ? 'bg-[#1e1f22] border-[#393b40] text-[#dfe1e5] focus:border-[#3574f0]'
                      : 'bg-white border-[#d1d5db] text-[#1f2328] focus:border-[#3574f0]'
                }`}
              />
            </div>
            <p className="text-[11px] opacity-60">
              HTTPS, SSH, or Git protocol repository URL.
            </p>
          </div>

          {/* Directory / Project Name Input */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="clone-name-input" className="text-xs font-medium">
              Directory Name
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none opacity-50">
                <Folder className="w-3.5 h-3.5" />
              </div>
              <input
                id="clone-name-input"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setHasManuallyEditedName(true);
                }}
                placeholder="project-name"
                disabled={isSubmitting}
                className={`w-full pl-8 pr-3 py-2 text-xs rounded border outline-none transition ${
                  isDark
                    ? 'bg-[#1e1f22] border-[#393b40] text-[#dfe1e5] focus:border-[#3574f0]'
                    : 'bg-white border-[#d1d5db] text-[#1f2328] focus:border-[#3574f0]'
                }`}
              />
            </div>
            <p className="text-[11px] opacity-60">
              Local project workspace name created for the cloned LaTeX document.
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 p-2.5 rounded text-xs bg-[#e05555]/15 text-[#e05555] border border-[#e05555]/30"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div
            className={`mt-2 pt-3 border-t flex items-center justify-end gap-2.5 ${
              isDark ? 'border-[#393b40]' : 'border-[#ebecf0]'
            }`}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className={`px-3 py-1.5 rounded text-xs font-medium border transition cursor-pointer ${
                isDark
                  ? 'border-[#4e5157] text-[#dfe1e5] hover:bg-[#393b40]'
                  : 'border-[#c9ccd6] text-[#1f2328] hover:bg-[#ebecf0]'
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !url.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-semibold bg-[#3574f0] text-white hover:bg-[#3068d9] disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Cloning...</span>
                </>
              ) : (
                <>
                  <GitBranch className="w-3.5 h-3.5" />
                  <span>Clone</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
