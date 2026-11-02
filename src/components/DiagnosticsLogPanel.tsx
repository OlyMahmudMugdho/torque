import React, { useState } from 'react';
import type { Diagnostic } from '../types/workspace';
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Terminal } from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<'problems' | 'build'>('problems');

  const errors = diagnostics.filter((d) => d.severity === 'error');
  const warnings = diagnostics.filter((d) => d.severity === 'warning');

  return (
    <div className="w-full bg-[#1e1f22] border-t border-[#393b40] flex flex-col text-xs text-[#dfe1e5] font-sans">
      {/* IntelliJ Tool Window Tab Header */}
      <div className="h-8 px-2 flex items-center justify-between border-b border-[#2b2d30] bg-[#2b2d30] select-none">
        <div className="flex items-center h-full">
          {/* Problems Tab */}
          <button
            onClick={() => setActiveTab('problems')}
            className={`h-full px-3 flex items-center gap-1.5 text-xs font-medium border-b-2 transition ${
              activeTab === 'problems'
                ? 'border-[#3574f0] text-white bg-[#1e1f22]'
                : 'border-transparent text-[#868a91] hover:text-[#dfe1e5] hover:bg-[#313438]'
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
                ? 'border-[#3574f0] text-white bg-[#1e1f22]'
                : 'border-transparent text-[#868a91] hover:text-[#dfe1e5] hover:bg-[#313438]'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Build</span>
          </button>
        </div>

        {/* Toggle Hide/Show */}
        <div className="flex items-center gap-1 text-[#868a91]">
          <button
            onClick={onToggle}
            className="p-1 hover:text-white hover:bg-[#393b40] rounded text-xs"
            title={isOpen ? 'Hide' : 'Show'}
          >
            {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="max-h-44 min-h-24 overflow-y-auto font-mono text-[11px] p-2 bg-[#1e1f22]">
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
                  return (
                    <div
                      key={index}
                      onClick={() => onSelectDiagnostic?.(d)}
                      className={`flex items-start gap-2 px-2 py-1 rounded cursor-pointer transition ${
                        isErr
                          ? 'hover:bg-[#e05555]/10 text-[#dfe1e5]'
                          : 'hover:bg-[#e2a53b]/10 text-[#dfe1e5]'
                      }`}
                    >
                      {isErr ? (
                        <AlertCircle className="w-3.5 h-3.5 text-[#e05555] shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-[#e2a53b] shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <span className="text-[#3574f0] font-semibold">
                          {d.file ?? 'TeX'}:{d.line ?? 1}
                        </span>{' '}
                        <span>{d.message}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'build' && (
            <div className="text-[#868a91] space-y-1">
              <div className="text-[#59a869] font-bold">TeX compilation output:</div>
              {diagnostics.length > 0 ? (
                diagnostics.map((d, idx) => (
                  <div key={idx} className="pl-2 border-l border-[#393b40]">
                    [{d.severity.toUpperCase()}] {d.file ? `${d.file}:${d.line}` : ''} {d.message}
                  </div>
                ))
              ) : (
                <div className="pl-2 italic text-[#6c707e]">Ready. Click Compile to run.</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
