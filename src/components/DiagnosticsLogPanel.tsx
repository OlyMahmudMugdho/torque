import React from 'react';
import type { Diagnostic } from '../types/workspace';
import { AlertCircle, AlertTriangle, Info, Terminal } from 'lucide-react';

interface DiagnosticsLogPanelProps {
  diagnostics: Diagnostic[];
  isOpen?: boolean;
  onToggle?: () => void;
  onSelectDiagnostic?: (diagnostic: Diagnostic) => void;
}

export const DiagnosticsLogPanel: React.FC<DiagnosticsLogPanelProps> = ({
  diagnostics,
  isOpen = true,
  onToggle,
  onSelectDiagnostic,
}) => {
  const errors = diagnostics.filter((d) => d.severity === 'error');
  const warnings = diagnostics.filter((d) => d.severity === 'warning');

  return (
    <div className="w-full bg-zinc-950 border-t border-zinc-800 flex flex-col text-xs text-zinc-300">
      <div
        onClick={onToggle}
        className="h-8 px-4 flex items-center justify-between border-b border-zinc-900 bg-zinc-900/60 cursor-pointer select-none"
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-semibold text-zinc-200">
            <Terminal className="w-3.5 h-3.5 text-zinc-400" />
            <span>TeX Logs & Diagnostics</span>
          </span>

          <div className="flex items-center gap-2">
            {errors.length > 0 && (
              <span className="flex items-center gap-1 text-red-400 bg-red-950/60 px-1.5 py-0.5 rounded border border-red-800/60">
                <AlertCircle className="w-3 h-3" />
                <span>{errors.length} {errors.length === 1 ? 'error' : 'errors'}</span>
              </span>
            )}

            {warnings.length > 0 && (
              <span className="flex items-center gap-1 text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/60">
                <AlertTriangle className="w-3 h-3" />
                <span>{warnings.length} {warnings.length === 1 ? 'warning' : 'warnings'}</span>
              </span>
            )}

            {diagnostics.length === 0 && (
              <span className="text-zinc-500">No issues</span>
            )}
          </div>
        </div>

        <span className="text-zinc-500 hover:text-zinc-300 font-mono text-[11px]">
          {isOpen ? 'Hide Console' : 'Show Console'}
        </span>
      </div>

      {isOpen && (
        <div className="max-h-44 min-h-24 overflow-y-auto font-mono text-[11px] p-2 space-y-1">
          {diagnostics.length === 0 ? (
            <div className="text-zinc-600 italic px-2 py-1">Compile output and logs will appear here.</div>
          ) : (
            diagnostics.map((d, index) => {
              const isErr = d.severity === 'error';
              const isWarn = d.severity === 'warning';

              return (
                <div
                  key={index}
                  onClick={() => onSelectDiagnostic?.(d)}
                  className={`flex items-start gap-2 px-2 py-1 rounded cursor-pointer transition ${
                    isErr
                      ? 'bg-red-950/20 hover:bg-red-950/40 text-red-300'
                      : isWarn
                      ? 'bg-amber-950/20 hover:bg-amber-950/40 text-amber-300'
                      : 'hover:bg-zinc-900 text-zinc-300'
                  }`}
                >
                  {isErr ? (
                    <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                  ) : isWarn ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                  ) : (
                    <Info className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
                  )}

                  <div className="flex-1">
                    <span className="font-semibold text-zinc-200">
                      {d.file ?? 'TeX'}{d.line ? `:${d.line}` : ''}:
                    </span>{' '}
                    <span>{d.message}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
