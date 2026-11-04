import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import PdfPageView from '../pdf/PdfPageView';
import { parseSyncTex } from '../../compiler/synctexParser';
import { resolveSyncTexPosition } from '../../compiler/synctexResolver';

const page = {
  getViewport: ({ scale }: { scale: number }) => ({
    width: 600 * scale,
    height: 800 * scale,
    convertToPdfPoint: (x: number, y: number) => [x / scale, 800 - y / scale],
  }),
  render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
  getTextContent: () => Promise.resolve({ items: [] }),
} as any;

describe('PdfPageView click navigation', () => {
  it('click on the page calls onNavigateToSource with {file,line} via SyncTeX', () => {
    const raw = readFileSync(join(__dirname, '../../compiler/__tests__/fixtures/main.synctex.txt'), 'utf-8');
    const index = parseSyncTex(raw, 'main.tex', ['main.tex']);
    const onNavigateToSource = vi.fn();
    render(
      <PdfPageView
        page={page}
        pageNumber={1}
        scale={1}
        onDoubleClick={(e) => {
          const r = resolveSyncTexPosition(index, e.pageNumber, e.xPt, e.yPt, 36);
          if (r) onNavigateToSource(r);
        }}
      />
    );
    fireEvent.click(screen.getByTestId('pdf-page-1'), { clientX: 150, clientY: 131 });
    expect(onNavigateToSource).toHaveBeenCalledWith({ file: 'main.tex', line: 3 });
  });

  it('reports top-left-origin point coordinates on single click', () => {
    const onClick = vi.fn();
    render(<PdfPageView page={page} pageNumber={1} scale={1} onDoubleClick={onClick} />);
    fireEvent.click(screen.getByTestId('pdf-page-1'), { clientX: 100, clientY: 200 });
    expect(onClick).toHaveBeenCalledTimes(1);
    const ev = onClick.mock.calls[0][0];
    expect(ev.pageNumber).toBe(1);
    expect(ev.xPt).toBeCloseTo(100);
    expect(ev.yPt).toBeCloseTo(200);
  });

  it('does not navigate on click while text is selected', () => {
    const onClick = vi.fn();
    render(<PdfPageView page={page} pageNumber={1} scale={1} onDoubleClick={onClick} />);
    vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'abc' } as any);
    fireEvent.click(screen.getByTestId('pdf-page-1'), { clientX: 10, clientY: 10 });
    expect(onClick).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
