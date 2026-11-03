import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { useThemeSafe } from '../context/ThemeContext';
import type { CompileStatus } from '../types/workspace';
import { ZoomIn, ZoomOut, Maximize2, Download, FileQuestion, FileText, Monitor, Layers } from 'lucide-react';

if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

export interface PdfPreviewPaneProps {
  pdfBytes: Uint8Array | null;
  compiling: boolean;
  projectName?: string;
  compileStatus?: CompileStatus;
}

import { isTauri } from '../storage/projectStore';

export type PdfViewMode = 'canvas' | 'native';

export const PdfPreviewPane: React.FC<PdfPreviewPaneProps> = ({
  pdfBytes,
  compiling,
  projectName = 'document',
  compileStatus,
}) => {
  const { theme } = useThemeSafe();
  const isDark = theme === 'dark';
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.1);
  const [viewMode, setViewMode] = useState<PdfViewMode>('canvas');
  const [renderError, setRenderError] = useState<boolean>(false);
  const pdfDocRef = useRef<any>(null);

  const hasPdf = Boolean(pdfBytes && pdfBytes.length > 0);

  // Generate reactive Blob object URL for native iframe preview and download fallback
  const pdfUrl = useMemo(() => {
    if (!pdfBytes || pdfBytes.length === 0 || typeof URL === 'undefined' || !URL.createObjectURL) {
      return null;
    }
    const blob = new Blob([pdfBytes.slice()], { type: 'application/pdf' });
    return URL.createObjectURL(blob);
  }, [pdfBytes]);

  // Clean up object URL when unmounting or when pdfBytes changes
  useEffect(() => {
    return () => {
      if (pdfUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  // Auto fallback to native iframe viewer if PDF.js encounters parsing or rendering error
  const effectiveMode: PdfViewMode = viewMode === 'native' || renderError ? 'native' : 'canvas';

  useEffect(() => {
    let active = true;

    async function loadPdf() {
      if (!pdfBytes || pdfBytes.length === 0) {
        setNumPages(0);
        pdfDocRef.current = null;
        setRenderError(false);
        return;
      }

      try {
        setRenderError(false);
        const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice() });
        const doc = await loadingTask.promise;
        if (!active) return;
        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
      } catch (err) {
        console.error('Failed to parse PDF bytes with PDF.js:', err);
        if (active) {
          setRenderError(true);
        }
      }
    }

    loadPdf();

    return () => {
      active = false;
    };
  }, [pdfBytes]);

  useEffect(() => {
    let canceled = false;

    async function renderPages() {
      if (effectiveMode !== 'canvas') return;
      const doc = pdfDocRef.current;
      const container = containerRef.current;
      if (!doc || !container) return;

      container.innerHTML = '';

      for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
        if (canceled) break;
        try {
          const page = await doc.getPage(pageNum);
          const viewport = page.getViewport({ scale });

          const pageWrapper = document.createElement('div');
          pageWrapper.className = 'mb-4 shadow-2xl bg-white rounded-sm overflow-hidden flex justify-center';

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;

          const ctx = canvas.getContext('2d');
          if (ctx) {
            await page.render({
              canvasContext: ctx,
              viewport,
            }).promise;
          }

          pageWrapper.appendChild(canvas);
          container.appendChild(pageWrapper);
        } catch (e) {
          console.error(`Error rendering page ${pageNum}:`, e);
          if (!canceled) {
            setRenderError(true);
          }
          break;
        }
      }
    }

    if (numPages > 0 && effectiveMode === 'canvas') {
      renderPages();
    }

    return () => {
      canceled = true;
    };
  }, [numPages, scale, effectiveMode]);

  const handleDownload = async () => {
    if (!pdfBytes || pdfBytes.length === 0) return;

    // If running inside Tauri desktop, use the native save dialog
    // so the file goes to the user's chosen location instead of the
    // browser's download directory (which can be silently suppressed in WebViews).
    if (typeof window !== 'undefined' && isTauri()) {
      const base64 = typeof btoa !== 'undefined'
        ? btoa(String.fromCharCode(...new Uint8Array(pdfBytes)))
        : '';
      try {
        const result = await (window as any).__TAURI_INTERNALS?.invoke(
          'storage::save_file',
          { filename: `${projectName?.toLowerCase().replace(/\s+/g, '-')}.pdf`, data: base64 }
        );
        if (result && result !== 'Failed to write') {
          return;
        }
      } catch (e) {
        console.warn('[PdfPreviewPane] Tauri save dialog failed, falling back to Blob:', e);
      }
    }

    // Browser fallback: Blob URL download
    const blob = new Blob([pdfBytes.slice()], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName?.toLowerCase().replace(/\s+/g, '-')}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  return (
    <div
      className={`w-full h-full flex flex-col border-l select-none font-sans ${
        isDark ? 'bg-[#1e1f22] border-[#2b2d30]' : 'bg-[#ffffff] border-[#d1d5db]'
      }`}
    >
      {/* IntelliJ Style Header */}
      <div
        className={`h-8 px-3 border-b flex items-center justify-between text-xs ${
          isDark
            ? 'bg-[#2b2d30] border-[#1e1f22] text-[#dfe1e5]'
            : 'bg-[#ebecf0] border-[#d1d5db] text-[#1f2328]'
        }`}
      >
        <div className="flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-[#e2a53b]" />
          <span className="font-semibold text-xs">PDF Preview</span>
          {numPages > 0 && effectiveMode === 'canvas' && (
            <span
              className={`font-mono text-[11px] ${
                isDark ? 'text-[#868a91]' : 'text-[#6c707e]'
              }`}
            >
              {numPages} {numPages === 1 ? 'page' : 'pages'}
            </span>
          )}
          {compileStatus === 'warnings' && hasPdf && (
            <span className="font-sans text-[11px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500 font-medium">
              Warnings
            </span>
          )}
          {compileStatus === 'errors' && hasPdf && (
            <span className="font-sans text-[11px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500 font-medium">
              Built with Warnings
            </span>
          )}
          {renderError && hasPdf && (
            <span
              className="font-sans text-[11px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500 font-medium"
            >
              Native (Fallback)
            </span>
          )}
          {compiling && (
            <span className="text-[#3574f0] font-medium text-[11px] animate-pulse">
              Compiling...
            </span>
          )}
        </div>

        <div className={`flex items-center gap-1 ${isDark ? 'text-[#868a91]' : 'text-[#6c707e]'}`}>
          {/* View Mode Toggle Button */}
          <button
            onClick={() => {
              if (effectiveMode === 'canvas') {
                setViewMode('native');
              } else {
                setViewMode('canvas');
                setRenderError(false);
              }
            }}
            disabled={!hasPdf}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition ${
              !hasPdf
                ? isDark
                  ? 'text-[#5a5d63] cursor-not-allowed'
                  : 'text-[#a1a3a8] cursor-not-allowed'
                : isDark
                  ? 'hover:bg-[#393b40] text-[#dfe1e5]'
                  : 'hover:bg-[#dfe1e5] text-[#1f2328]'
            } ${
              effectiveMode === 'native' && hasPdf
                ? isDark
                  ? 'bg-[#3574f0]/20 text-[#3574f0]'
                  : 'bg-[#3574f0]/10 text-[#3574f0]'
                : ''
            }`}
            title={
              effectiveMode === 'canvas'
                ? 'Switch to Native PDF viewer'
                : 'Switch to Canvas viewer'
            }
            aria-label="Toggle PDF view mode"
          >
            {effectiveMode === 'native' ? (
              <>
                <Monitor className="w-3 h-3" />
                <span>Native</span>
              </>
            ) : (
              <>
                <Layers className="w-3 h-3" />
                <span>Canvas</span>
              </>
            )}
          </button>

          <div className={`h-3.5 w-px mx-0.5 ${isDark ? 'bg-[#393b40]' : 'bg-[#d1d5db]'}`} />

          {/* Zoom controls */}
          <button
            onClick={() => setScale((s) => Math.max(0.6, s - 0.2))}
            disabled={effectiveMode === 'native' || !hasPdf}
            className={`p-1 rounded transition ${
              effectiveMode === 'native' || !hasPdf
                ? isDark
                  ? 'text-[#5a5d63] cursor-not-allowed'
                  : 'text-[#a1a3a8] cursor-not-allowed'
                : isDark
                  ? 'hover:bg-[#393b40] hover:text-[#dfe1e5]'
                  : 'hover:bg-[#dfe1e5] hover:text-[#1f2328]'
            }`}
            title="Zoom Out"
          >
            <ZoomOut className="w-3 h-3" />
          </button>
          <span
            className={`font-mono text-[11px] w-10 text-center ${
              effectiveMode === 'native' || !hasPdf ? 'opacity-40' : ''
            }`}
          >
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((s) => Math.min(2.5, s + 0.2))}
            disabled={effectiveMode === 'native' || !hasPdf}
            className={`p-1 rounded transition ${
              effectiveMode === 'native' || !hasPdf
                ? isDark
                  ? 'text-[#5a5d63] cursor-not-allowed'
                  : 'text-[#a1a3a8] cursor-not-allowed'
                : isDark
                  ? 'hover:bg-[#393b40] hover:text-[#dfe1e5]'
                  : 'hover:bg-[#dfe1e5] hover:text-[#1f2328]'
            }`}
            title="Zoom In"
          >
            <ZoomIn className="w-3 h-3" />
          </button>
          <button
            onClick={() => setScale(1.0)}
            disabled={effectiveMode === 'native' || !hasPdf}
            className={`p-1 rounded transition ${
              effectiveMode === 'native' || !hasPdf
                ? isDark
                  ? 'text-[#5a5d63] cursor-not-allowed'
                  : 'text-[#a1a3a8] cursor-not-allowed'
                : isDark
                  ? 'hover:bg-[#393b40] hover:text-[#dfe1e5]'
                  : 'hover:bg-[#dfe1e5] hover:text-[#1f2328]'
            }`}
            title="Actual Size"
          >
            <Maximize2 className="w-3 h-3" />
          </button>

          <div className={`h-3.5 w-px mx-0.5 ${isDark ? 'bg-[#393b40]' : 'bg-[#d1d5db]'}`} />

          <button
            onClick={handleDownload}
            disabled={!hasPdf}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition ${
              hasPdf
                ? isDark
                  ? 'hover:bg-[#393b40] text-[#dfe1e5]'
                  : 'hover:bg-[#dfe1e5] text-[#1f2328]'
                : isDark
                  ? 'text-[#5a5d63] cursor-not-allowed'
                  : 'text-[#a1a3a8] cursor-not-allowed'
            }`}
            title="Export / Download PDF"
            aria-label="Export / Download PDF"
          >
            <Download className="w-3 h-3" />
            <span>PDF</span>
          </button>
        </div>
      </div>

      {/* Preview Content */}
      <div
        className={`flex-1 overflow-auto flex flex-col items-center justify-start ${
          effectiveMode === 'native' && hasPdf ? 'p-0 w-full h-full' : 'p-4'
        } ${isDark ? 'bg-[#141517]' : 'bg-[#e5e7eb]'}`}
      >
        {!hasPdf ? (
          <div
            className={`my-auto flex flex-col items-center gap-2 ${
              isDark ? 'text-[#868a91]' : 'text-[#6c707e]'
            }`}
          >
            <FileQuestion
              className={`w-10 h-10 ${isDark ? 'text-[#5a5d63]' : 'text-[#a1a3a8]'}`}
            />
            <p
              className={`text-xs font-medium ${
                isDark ? 'text-[#dfe1e5]' : 'text-[#1f2328]'
              }`}
            >
              {compileStatus === 'failed' ? 'Build Failed' : 'No PDF compiled'}
            </p>
            <p className="text-[11px]">
              {compileStatus === 'failed' ? (
                'Check the Problems panel for compiler errors'
              ) : (
                <>
                  Press{' '}
                  <kbd
                    className={`border px-1 py-0.5 rounded ${
                      isDark
                        ? 'bg-[#2b2d30] border-[#393b40] text-[#dfe1e5]'
                        : 'bg-[#ffffff] border-[#d1d5db] text-[#1f2328]'
                    }`}
                  >
                    Ctrl+Enter
                  </kbd>{' '}
                  or click ▶ to build
                </>
              )}
            </p>
          </div>
        ) : effectiveMode === 'native' ? (
          pdfUrl ? (
            <iframe
              src={pdfUrl}
              className="w-full h-full border-0 bg-white"
              title="PDF Preview"
            />
          ) : null
        ) : (
          <div ref={containerRef} className="flex flex-col items-center" />
        )}
      </div>
    </div>
  );
};

