import React, { useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFPageProxy } from 'pdfjs-dist/types/src/display/api';

if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

export interface PdfPageViewProps {
  page: PDFPageProxy;
  pageNumber: number;
  scale: number;
  searchQuery?: string;
  onDoubleClick?: (event: { pageNumber: number; xPt: number; yPt: number; textSnippet: string }) => void;
}

export const PdfPageView: React.FC<PdfPageViewProps> = ({
  page,
  pageNumber,
  scale,
  searchQuery,
  onDoubleClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    const renderPage = async () => {
      if (!canvasRef.current || !textLayerRef.current || !wrapperRef.current) return;

      try {
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.scale(dpr, dpr);

        await page.render({
          canvasContext: ctx,
          viewport,
        }).promise;
      } catch (e) {
        console.error(`[PdfPageView] Error rendering page ${pageNumber}:`, e);
      }
    };

    renderPage();

    return () => {
      cancelled = true;
    };
  }, [page, pageNumber, scale]);

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onDoubleClick || !textLayerRef.current) return;

    const rect = textLayerRef.current.getBoundingClientRect();
    const xPt = (e.clientX - rect.left) / scale;
    const yPt = (e.clientY - rect.top) / scale;

    onDoubleClick({ pageNumber, xPt, yPt, textSnippet: '' });
  };

  return (
    <div
      ref={wrapperRef}
      className="mb-4 shadow-2xl bg-white rounded-sm overflow-hidden flex justify-center relative"
      onDoubleClick={handleDoubleClick}
      style={{ cursor: 'crosshair' }}
    >
      <canvas ref={canvasRef} className="block" />
      <div
        ref={textLayerRef}
        className="absolute inset-0 textLayer"
        style={{ pointerEvents: 'auto' }}
      />
    </div>
  );
};

export default PdfPageView;