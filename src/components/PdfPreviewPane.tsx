import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { PdfPageView } from './pdf/PdfPageView';
import { useThemeSafe } from '../context/ThemeContext';
import type { CompileStatus, SyncTexIndex } from '../types/workspace';
import { resolveSyncTexPosition } from '../compiler/synctexResolver';
import { ZoomIn, ZoomOut, Maximize2, Download, FileQuestion, FileText } from 'lucide-react';

if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

export interface PdfPreviewPaneProps {
  pdfBytes: Uint8Array | null;
  compiling: boolean;
  projectName?: string;
  compileStatus?: CompileStatus;
  syncTexIndex?: SyncTexIndex;
  onNavigateToSource?: (target: { file: string; line: number }) => void;
}

import { isTauri, uint8ArrayToBase64 } from '../storage/tauriStorage';

export const PdfPreviewPane: React.FC<PdfPreviewPaneProps> = ({
  pdfBytes,
  compiling,
  projectName = 'document',
  compileStatus,
  syncTexIndex,
  onNavigateToSource,
}) => {
  const { theme } = useThemeSafe();
  const isDark = theme === 'dark';
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.1);
  const [renderError, setRenderError] = useState<boolean>(false);
  const [pages, setPages] = useState<Map<number, any>>(new Map());
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [docRevision, setDocRevision] = useState<number>(0);
  const pdfDocRef = useRef<any>(null);

  const hasPdf = Boolean(pdfBytes && pdfBytes.length > 0);

  useEffect(() => {
    let active = true;

    async function loadPdf() {
      if (!pdfBytes || pdfBytes.length === 0) {
        setNumPages(0);
        setPdfDoc(null);
        pdfDocRef.current = null;
        setPages(new Map());
        setRenderError(false);
        return;
      }

      try {
        setRenderError(false);
        const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice() });
        const doc = await loadingTask.promise;
        if (!active) return;
        pdfDocRef.current = doc;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setDocRevision((rev) => rev + 1);
      } catch (err) {
        console.error('Failed to parse PDF bytes with PDF.js:', err);
        if (active) {
          setRenderError(true);
          setPdfDoc(null);
          pdfDocRef.current = null;
          setNumPages(0);
          setPages(new Map());
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
      const doc = pdfDoc;
      if (!doc) return;

      const fetched = new Map<number, any>();
      for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
        if (canceled) break;
        try {
          const page = await doc.getPage(pageNum);
          fetched.set(pageNum, page);
        } catch (e) {
          console.error(`Error fetching page ${pageNum}:`, e);
          if (!canceled) {
            setRenderError(true);
          }
          break;
        }
      }

      if (!canceled) {
        setPages(fetched);
      }
    }

    if (pdfDoc && pdfDoc.numPages > 0) {
      renderPages();
    } else {
      setPages(new Map());
    }

    return () => {
      canceled = true;
    };
  }, [pdfDoc, scale]);

  const handlePdfDoubleClick = (event: {
    pageNumber: number;
    xPt: number;
    yPt: number;
    pageHeight: number;
    textSnippet: string;
  }) => {
    if (!onNavigateToSource || !syncTexIndex) return;
    const resolved = resolveSyncTexPosition(
      syncTexIndex,
      event.pageNumber,
      event.xPt,
      event.yPt,
      36
    );
    // No SyncTeX mapping: do nothing rather than jump to a wrong line.
    if (resolved) onNavigateToSource(resolved);
  };

  const handleDownload = async () => {
    if (!pdfBytes || pdfBytes.length === 0) return;

    // If running inside Tauri desktop, use the native save dialog
    // so the file goes to the user's chosen location instead of the
    // browser's download directory (which can be silently suppressed in WebViews).
    if (typeof window !== 'undefined' && isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const base64 = uint8ArrayToBase64(pdfBytes);
        await invoke('save_file', {
          filename: `${projectName?.toLowerCase().replace(/\s+/g, '-') || 'document'}.pdf`,
          data: base64,
        });
        return;
      } catch (e: any) {
        if (e === 'Save dialog cancelled' || e?.message?.includes('cancelled')) {
          return;
        }
        console.warn('[PdfPreviewPane] Tauri save_file failed, falling back to Blob:', e);
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
          {numPages > 0 && !renderError && (
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
          {renderError && hasPdf && (
            <span className="font-sans text-[11px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500 font-medium">
              PDF.js error
            </span>
          )}
          {compiling && (
            <span className="text-[#3574f0] font-medium text-[11px] animate-pulse">
              Compiling...
            </span>
          )}
        </div>

        <div className={`flex items-center gap-1 ${isDark ? 'text-[#c2c5cc]' : 'text-[#6c707e]'}`}>
          {/* Zoom controls */}
          <button
            onClick={() => setScale((s) => Math.max(0.6, s - 0.2))}
            disabled={!hasPdf || renderError}
            className={`p-1 rounded transition ${
              !hasPdf || renderError
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
              !hasPdf || renderError ? 'opacity-40' : ''
            }`}
          >
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((s) => Math.min(2.5, s + 0.2))}
            disabled={!hasPdf || renderError}
            className={`p-1 rounded transition ${
              !hasPdf || renderError
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
            disabled={!hasPdf || renderError}
            className={`p-1 rounded transition ${
              !hasPdf || renderError
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
          'p-4'
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
        ) : renderError ? (
          <div className={`my-auto max-w-xs text-center text-xs ${isDark ? 'text-[#a9abb3]' : 'text-[#6c707e]'}`}>
            PDF.js could not render this document. Download the PDF to open it in another viewer.
          </div>
        ) : (
          <div ref={containerRef} className="flex flex-col items-center">
            {Array.from(pages.keys()).map((pageNumber) => (
              <PdfPageView
                key={`${pageNumber}-${docRevision}-${(pdfDoc as any)?._fingerprint || ''}`}
                page={pages.get(pageNumber)}
                pageNumber={pageNumber}
                scale={scale}
                onDoubleClick={handlePdfDoubleClick}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

