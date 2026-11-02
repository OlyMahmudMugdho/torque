import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { ZoomIn, ZoomOut, Maximize2, Download, FileQuestion } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

interface PdfPreviewPaneProps {
  pdfBytes: Uint8Array | null;
  compiling: boolean;
  projectName?: string;
}

export const PdfPreviewPane: React.FC<PdfPreviewPaneProps> = ({
  pdfBytes,
  compiling,
  projectName = 'document',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.2);
  const pdfDocRef = useRef<any>(null);

  useEffect(() => {
    let active = true;

    async function loadPdf() {
      if (!pdfBytes || pdfBytes.length === 0) {
        setNumPages(0);
        return;
      }

      try {
        const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
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

  // Render all pages onto canvas elements
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
          pageWrapper.className = 'mb-4 shadow-lg bg-white rounded overflow-hidden flex justify-center';

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
    if (!pdfBytes) return;
    const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.toLowerCase().replace(/\s+/g, '-')}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full h-full flex flex-col bg-zinc-900 border-l border-zinc-800 select-none">
      {/* Controls Bar */}
      <div className="h-10 px-4 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between text-xs text-zinc-300">
        <div className="flex items-center gap-2">
          <span className="font-medium text-zinc-200">PDF Preview</span>
          {numPages > 0 && (
            <span className="text-zinc-500 font-mono">
              ({numPages} {numPages === 1 ? 'page' : 'pages'})
            </span>
          )}
          {compiling && (
            <span className="text-emerald-400 font-medium animate-pulse">
              Updating...
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setScale((s) => Math.max(0.6, s - 0.2))}
            className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-[11px] w-12 text-center text-zinc-400">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((s) => Math.min(2.5, s + 0.2))}
            className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setScale(1.0)}
            className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white"
            title="Fit View"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          <div className="h-4 w-px bg-zinc-800 mx-1" />

          <button
            onClick={handleDownload}
            disabled={!pdfBytes}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition ${
              pdfBytes
                ? 'bg-zinc-800 hover:bg-zinc-700 text-white'
                : 'text-zinc-600 cursor-not-allowed'
            }`}
            title="Download PDF"
          >
            <Download className="w-3.5 h-3.5" />
            <span>PDF</span>
          </button>
        </div>
      </div>

      {/* Preview Canvas Container */}
      <div className="flex-1 overflow-auto p-4 flex flex-col items-center justify-start bg-zinc-900/90">
        {!pdfBytes && (
          <div className="my-auto flex flex-col items-center gap-3 text-zinc-500">
            <FileQuestion className="w-12 h-12 text-zinc-600" />
            <p className="text-sm font-medium">No PDF compiled yet</p>
            <p className="text-xs text-zinc-600">
              Click &quot;Compile&quot; in the top bar or press <kbd className="bg-zinc-800 px-1 py-0.5 rounded text-zinc-400">Ctrl+Enter</kbd>
            </p>
          </div>
        )}

        <div ref={containerRef} className="flex flex-col items-center" />
      </div>
    </div>
  );
};
