import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { useThemeSafe } from '../context/ThemeContext';
import { ZoomIn, ZoomOut, Maximize2, Download, FileQuestion, FileText } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

export interface PdfPreviewPaneProps {
  pdfBytes: Uint8Array | null;
  compiling: boolean;
  projectName?: string;
}

export const PdfPreviewPane: React.FC<PdfPreviewPaneProps> = ({
  pdfBytes,
  compiling,
  projectName = 'document',
}) => {
  const { theme } = useThemeSafe();
  const isDark = theme === 'dark';
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.1);
  const pdfDocRef = useRef<any>(null);

  useEffect(() => {
    let active = true;

    async function loadPdf() {
      if (!pdfBytes || pdfBytes.length === 0) {
        setNumPages(0);
        return;
      }

      try {
        const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice() });
        const doc = await loadingTask.promise;
        if (!active) return;
        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
      } catch (err) {
        console.error('Failed to parse PDF bytes:', err);
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
        }
      }
    }

    if (numPages > 0) {
      renderPages();
    }

    return () => {
      canceled = true;
    };
  }, [numPages, scale]);

  const handleDownload = () => {
    if (!pdfBytes || pdfBytes.length === 0) return;
    const blob = new Blob([pdfBytes.slice()], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.toLowerCase().replace(/\s+/g, '-')}.pdf`;
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
          {numPages > 0 && (
            <span
              className={`font-mono text-[11px] ${
                isDark ? 'text-[#868a91]' : 'text-[#6c707e]'
              }`}
            >
              {numPages} {numPages === 1 ? 'page' : 'pages'}
            </span>
          )}
          {compiling && (
            <span className="text-[#3574f0] font-medium text-[11px] animate-pulse">
              Compiling...
            </span>
          )}
        </div>

        <div className={`flex items-center gap-1 ${isDark ? 'text-[#868a91]' : 'text-[#6c707e]'}`}>
          <button
            onClick={() => setScale((s) => Math.max(0.6, s - 0.2))}
            className={`p-1 rounded transition ${
              isDark ? 'hover:bg-[#393b40] hover:text-[#dfe1e5]' : 'hover:bg-[#dfe1e5] hover:text-[#1f2328]'
            }`}
            title="Zoom Out"
          >
            <ZoomOut className="w-3 h-3" />
          </button>
          <span className="font-mono text-[11px] w-10 text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((s) => Math.min(2.5, s + 0.2))}
            className={`p-1 rounded transition ${
              isDark ? 'hover:bg-[#393b40] hover:text-[#dfe1e5]' : 'hover:bg-[#dfe1e5] hover:text-[#1f2328]'
            }`}
            title="Zoom In"
          >
            <ZoomIn className="w-3 h-3" />
          </button>
          <button
            onClick={() => setScale(1.0)}
            className={`p-1 rounded transition ${
              isDark ? 'hover:bg-[#393b40] hover:text-[#dfe1e5]' : 'hover:bg-[#dfe1e5] hover:text-[#1f2328]'
            }`}
            title="Actual Size"
          >
            <Maximize2 className="w-3 h-3" />
          </button>

          <div className={`h-3.5 w-px mx-1 ${isDark ? 'bg-[#393b40]' : 'bg-[#d1d5db]'}`} />

          <button
            onClick={handleDownload}
            disabled={!pdfBytes || pdfBytes.length === 0}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition ${
              pdfBytes && pdfBytes.length > 0
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
        className={`flex-1 overflow-auto p-4 flex flex-col items-center justify-start ${
          isDark ? 'bg-[#141517]' : 'bg-[#e5e7eb]'
        }`}
      >
        {(!pdfBytes || pdfBytes.length === 0) && (
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
              No PDF compiled
            </p>
            <p className="text-[11px]">
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
            </p>
          </div>
        )}

        <div ref={containerRef} className="flex flex-col items-center" />
      </div>
    </div>
  );
};
