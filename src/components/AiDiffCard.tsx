'use client';

import React, { useState } from 'react';
import type { FileDiffResult } from '../ai/diffUtils';
import { useThemeSafe } from '../context/ThemeContext';
import { Check, X, ChevronDown, ChevronRight, FileText } from 'lucide-react';

export interface AiDiffCardProps {
  diff: FileDiffResult;
  status: 'pending_approval' | 'accepted' | 'rejected';
  onAccept: () => void;
  onReject: () => void;
  defaultExpanded?: boolean;
}

export const AiDiffCard: React.FC<AiDiffCardProps> = ({
  diff,
  status,
  onAccept,
  onReject,
  defaultExpanded = true,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
  const { theme } = useThemeSafe();
  const isDark = theme === 'dark';

  return (
    <div
      className={`rounded border overflow-hidden my-2 shadow-sm transition-colors ${
        isDark ? 'border-[#323232] bg-[#1e1f22]' : 'border-[#d1d5db] bg-[#ffffff]'
      }`}
      data-testid="ai-diff-card"
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between px-3 py-2 cursor-pointer select-none transition-colors ${
          isDark
            ? 'bg-[#2b2d30] hover:bg-[#32353a]'
            : 'bg-[#f7f8fa] hover:bg-[#ebedf0]'
        }`}
        onClick={() => setIsExpanded(!isExpanded)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
        aria-expanded={isExpanded}
        data-testid="diff-card-header"
      >
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-opacity-70 focus:outline-none"
            aria-label={isExpanded ? 'Collapse diff' : 'Expand diff'}
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
          >
            {isExpanded ? (
              <ChevronDown size={14} className="opacity-75" />
            ) : (
              <ChevronRight size={14} className="opacity-75" />
            )}
          </button>
          <FileText size={14} className="text-[#3574f0] shrink-0" />
          <span
            className={`font-mono text-xs font-semibold truncate ${
              isDark ? 'text-[#dfe1e5]' : 'text-[#1e1f22]'
            }`}
            title={diff.path}
          >
            {diff.path}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span
            data-testid="additions-pill"
            className="px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold"
            style={{ color: '#468a49', backgroundColor: 'rgba(70, 138, 73, 0.15)' }}
          >
            +{diff.additions}
          </span>
          <span
            data-testid="deletions-pill"
            className="px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold"
            style={{ color: '#c75450', backgroundColor: 'rgba(199, 84, 80, 0.15)' }}
          >
            -{diff.deletions}
          </span>
        </div>
      </div>

      {/* Collapsible Diff View */}
      {isExpanded && (
        <div
          className={`overflow-x-auto max-h-96 text-xs font-mono select-text border-t ${
            isDark ? 'border-[#323232] bg-[#1e1f22]' : 'border-[#e5e7eb] bg-[#ffffff]'
          }`}
          data-testid="diff-content"
        >
          {diff.diffHunks && diff.diffHunks.length > 0 ? (
            <div className="font-mono">
              {diff.diffHunks.map((hunk, idx) => {
                const isAdded = hunk.type === 'added';
                const isDeleted = hunk.type === 'deleted';

                let rowBg = '';
                let textClr = '';
                let prefix = ' ';

                if (isAdded) {
                  rowBg = isDark ? 'bg-[#1b3d2f]/50' : 'bg-[#e6ffec]';
                  textClr = isDark ? 'text-[#7ee787]' : 'text-[#1a7f37]';
                  prefix = '+';
                } else if (isDeleted) {
                  rowBg = isDark ? 'bg-[#4c1e24]/50' : 'bg-[#ffebe9]';
                  textClr = isDark ? 'text-[#ffa198]' : 'text-[#cf222e]';
                  prefix = '-';
                } else {
                  rowBg = 'bg-transparent';
                  textClr = isDark ? 'text-[#a9b7c6]' : 'text-[#374151]';
                  prefix = ' ';
                }

                return (
                  <div
                    key={idx}
                    className={`flex items-start px-2 py-0.5 leading-5 ${rowBg} ${textClr} transition-colors`}
                    data-testid={`diff-line-${hunk.type}`}
                  >
                    <span className="w-8 text-right pr-2 opacity-40 select-none shrink-0 text-[10px] leading-5">
                      {hunk.oldLineNo != null ? hunk.oldLineNo : ''}
                    </span>
                    <span className="w-8 text-right pr-2 opacity-40 select-none shrink-0 text-[10px] leading-5">
                      {hunk.newLineNo != null ? hunk.newLineNo : ''}
                    </span>
                    <span
                      className="w-4 text-center font-bold select-none shrink-0 leading-5"
                      style={
                        isAdded
                          ? { color: '#468a49' }
                          : isDeleted
                          ? { color: '#c75450' }
                          : undefined
                      }
                    >
                      {prefix}
                    </span>
                    <span className="flex-1 whitespace-pre-wrap break-all leading-5">
                      {hunk.line}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-3 py-2 text-xs opacity-60 italic">
              No changes to display
            </div>
          )}
        </div>
      )}

      {/* Controls Footer */}
      <div
        className={`flex items-center justify-between px-3 py-2 border-t text-xs ${
          isDark
            ? 'bg-[#26282b] border-[#323232] text-[#dfe1e5]'
            : 'bg-[#f7f8fa] border-[#e5e7eb] text-[#1e1f22]'
        }`}
        data-testid="diff-card-footer"
      >
        <div className="flex items-center gap-2">
          {status === 'accepted' && (
            <span
              data-testid="status-accepted-badge"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
              style={{
                color: '#468a49',
                backgroundColor: 'rgba(70, 138, 73, 0.15)',
                border: '1px solid rgba(70, 138, 73, 0.3)',
              }}
            >
              <Check size={14} className="stroke-[2.5]" />
              <span>Accepted</span>
            </span>
          )}
          {status === 'rejected' && (
            <span
              data-testid="status-rejected-badge"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
              style={{
                color: '#c75450',
                backgroundColor: 'rgba(199, 84, 80, 0.15)',
                border: '1px solid rgba(199, 84, 80, 0.3)',
              }}
            >
              <X size={14} className="stroke-[2.5]" />
              <span>Rejected</span>
            </span>
          )}
          {status === 'pending_approval' && (
            <span className="text-[11px] opacity-60">
              Review proposed changes
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {status === 'pending_approval' && (
            <>
              <button
                type="button"
                onClick={onReject}
                data-testid="diff-reject-btn"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors border border-[#c75450]/40 text-[#c75450] hover:bg-[#c75450]/10 active:bg-[#c75450]/20 focus:outline-none"
              >
                <X size={13} />
                <span>Reject</span>
              </button>
              <button
                type="button"
                onClick={onAccept}
                data-testid="diff-accept-btn"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium text-white transition-colors hover:opacity-90 active:opacity-80 focus:outline-none shadow-sm"
                style={{ backgroundColor: '#3574f0' }}
              >
                <Check size={13} />
                <span>Accept</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
