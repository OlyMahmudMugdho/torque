import React, { useState } from 'react';
import type { Diagnostic } from '../types/workspace';
import { useThemeSafe } from '../context/ThemeContext';
import { AlertCircle, AlertTriangle, CheckCircle2, Terminal, X } from 'lucide-react';

/**
 * Extracts a missing package or class name from LaTeX compiler error messages.
 * Examples:
 *   - "LaTeX Error: File 'tcolorbox.sty' not found" -> "tcolorbox"
 *   - "! LaTeX Error: File `tikz-cd.sty' not found." -> "tikz-cd"
 *   - "File 'beamer.cls' not found" -> "beamer"
 */
export function extractMissingPackageName(message: string): string | null {
  if (!message) return null;
  const match =
    message.match(/(?:File|file)\s+[`'"]([a-zA-Z0-9_\-]+)\.(?:sty|cls)[`'"]\s+not\s+found/i) ||
    message.match(/(?:File|file)\s+([a-zA-Z0-9_\-]+)\.(?:sty|cls)\s+not\s+found/i) ||
    message.match(/I\s+can't\s+find\s+file\s+[`'"]([a-zA-Z0-9_\-]+)\.(?:sty|cls)[`'"]/i);
  return match ? match[1] : null;
}

export interface DiagnosticsLogPanelProps {
  diagnostics: Diagnostic[];
  isOpen?: boolean;
  onToggle?: () => void;
  onClose?: () => void;
  onSelectDiagnostic?: (diagnostic: Diagnostic) => void;
}

export const DiagnosticsLogPanel: React.FC<DiagnosticsLogPanelProps> = ({
  diagnostics,
  isOpen = true,
  onToggle,
  onClose,
  onSelectDiagnostic,
}) => {
  const [activeTab, setActiveTab] = useState<'problems' | 'build'>('problems');
  const { theme } = useThemeSafe();
  const isDark = theme === 'dark';

  if (!isOpen) {
    return null;
  }

  const errors = diagnostics.filter((d) => d.severity === 'error');
  const warnings = diagnostics.filter((d) => d.severity === 'warning');

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else if (onToggle) {
      onToggle();
    }
  };

  return (
    <div
      className={`w-full flex flex-col text-xs font-sans border-t ${
        isDark ? 'bg-[#1e1f22] border-[#393b40] text-[#dfe1e5]' : 'bg-[#ffffff] border-[#d1d5db] text-[#1f2328]'
      }`}
    >
      {/* IntelliJ Tool Window Tab Header */}
      <div
        className={`h-8 px-2 flex items-center justify-between border-b select-none shrink-0 ${
          isDark ? 'border-[#2b2d30] bg-[#2b2d30]' : 'border-[#d1d5db] bg-[#ebecf0]'
        }`}
      >
        <div className="flex items-center h-full">
          {/* Problems Tab */}
          <button
            onClick={() => setActiveTab('problems')}
            className={`h-full px-3 flex items-center gap-1.5 text-xs font-medium border-b-2 transition ${
              activeTab === 'problems'
                ? isDark
                  ? 'border-[#3574f0] text-white bg-[#1e1f22]'
                  : 'border-[#3574f0] text-[#1f2328] bg-[#ffffff]'
                : isDark
                  ? 'border-transparent text-[#c2c5cc] hover:text-white hover:bg-[#313438]'
                  : 'border-transparent text-[#6c707e] hover:text-[#1f2328] hover:bg-[#dfe1e5]'
            }`}
          >
            <span>Problems</span>
            {errors.length > 0 && (
              <span className="flex items-center text-[10px] bg-[#e05555]/20 text-[#e05555] px-1 rounded-full font-bold">
                {errors.length}
              </span>
            )}
            {warnings.length > 0 && (
              <span className="flex items-center text-[10px] bg-[#e2a53b]/20 text-[#e2a53b] px-1 rounded-full font-bold">
                {warnings.length}
              </span>
            )}
          </button>

          {/* Build Output Tab */}
          <button
            onClick={() => setActiveTab('build')}
            className={`h-full px-3 flex items-center gap-1.5 text-xs font-medium border-b-2 transition ${
              activeTab === 'build'
                ? isDark
                  ? 'border-[#3574f0] text-white bg-[#1e1f22]'
                  : 'border-[#3574f0] text-[#1f2328] bg-[#ffffff]'
                : isDark
                  ? 'border-transparent text-[#c2c5cc] hover:text-white hover:bg-[#313438]'
                  : 'border-transparent text-[#6c707e] hover:text-[#1f2328] hover:bg-[#dfe1e5]'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Build</span>
          </button>
        </div>

        {/* Close Button */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleClose}
            className={`p-1 rounded text-xs transition ${
              isDark
                ? 'text-[#c2c5cc] hover:text-white hover:bg-[#393b40]'
                : 'text-[#6c707e] hover:text-black hover:bg-[#dfe1e5]'
            }`}
            title="Close Problems Panel"
            aria-label="Close Problems Panel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div
        className={`max-h-48 min-h-24 overflow-y-auto font-mono text-[11px] p-2 ${
          isDark ? 'bg-[#1e1f22]' : 'bg-[#ffffff]'
        }`}
      >
        {activeTab === 'problems' && (
          <div className="space-y-0.5">
            {diagnostics.length === 0 ? (
              <div className="flex items-center gap-1.5 text-[#59a869] px-2 py-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>No problems found in document</span>
              </div>
            ) : (
              diagnostics.map((d, index) => {
                const isErr = d.severity === 'error';
                const displayMessage =
                  d.message === 'unreachable'
                    ? 'Internal TeX engine error (unreachable). The compiler has been automatically reset.'
                    : d.message;
                return (
                  <div
                    key={index}
                    onClick={() => onSelectDiagnostic?.(d)}
                    className={`flex items-start gap-2 px-2 py-1 rounded cursor-pointer transition ${
                      isErr
                        ? 'hover:bg-[#e05555]/10'
                        : 'hover:bg-[#e2a53b]/10'
                    }`}
                  >
                    {isErr ? (
                      <AlertCircle className="w-3.5 h-3.5 text-[#e05555] shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-[#e2a53b] shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div>
                        <span className="text-[#3574f0] font-semibold">
                          {d.file ?? 'TeX'}:{d.line ?? 1}
                        </span>{' '}
                        <span className={isDark ? 'text-[#dfe1e5]' : 'text-[#1f2328]'}>{displayMessage}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'build' && (
          <div className={`space-y-1 ${isDark ? 'text-[#868a91]' : 'text-[#5c6066]'}`}>
            <div className="text-[#59a869] font-bold">TeX compilation output:</div>
            {diagnostics.length > 0 ? (
              diagnostics.map((d, idx) => (
                <div
                  key={idx}
                  className={`pl-2 border-l ${
                    isDark ? 'border-[#393b40]' : 'border-[#d1d5db]'
                  }`}
                >
                  [{d.severity.toUpperCase()}] {d.file ? `${d.file}:${d.line}` : ''} {d.message}
                </div>
              ))
            ) : (
              <div className={`pl-2 italic ${isDark ? 'text-[#6c707e]' : 'text-[#868a91]'}`}>
                Ready. Click Compile to run.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
