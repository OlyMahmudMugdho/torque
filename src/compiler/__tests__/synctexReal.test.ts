import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSyncTex, normalizeSyncTexPath } from '../synctexParser';
import { resolveSyncTexPosition } from '../synctexResolver';

// Real output of `latexmk -pdf -synctex=1 -outdir=build main.tex` (absolute, `/./` paths).
const raw = readFileSync(join(__dirname, 'fixtures', 'main.synctex.txt'), 'utf-8');

describe('real SyncTeX output', () => {
  it('normalizes absolute build paths to project-relative names', () => {
    expect(normalizeSyncTexPath('/tmp/sx/./main.tex', ['main.tex', 'a/b.tex'])).toBe('main.tex');
    expect(normalizeSyncTexPath('/tmp/sx/./chapters/intro.tex', ['main.tex', 'chapters/intro.tex'])).toBe('chapters/intro.tex');
    expect(normalizeSyncTexPath('./main.tex')).toBe('main.tex');
  });

  it('parses coordinates into PDF points (unit 1sp, 72.27pt/in)', () => {
    const index = parseSyncTex(raw, 'main.tex', ['main.tex']);
    expect(index.files.get(1)).toBe('main.tex');
    const first = index.blocks.find((b) => b.kind === 'node' && b.line === 3)!;
    expect(first.file).toBe('main.tex');
    expect(first.x).toBeCloseTo(133.8, 0); // 8799518 sp / 65781.76
    expect(first.y).toBeCloseTo(134.8, 0);
    expect(first.page).toBe(1);
  });

  it('maps clicks on text lines back to source lines', () => {
    const index = parseSyncTex(raw, 'main.tex', ['main.tex']);
    // First text line (baseline ~134.8pt) is source line 3; second (~146.7) line 5.
    expect(resolveSyncTexPosition(index, 1, 150, 131, 36)).toEqual({ file: 'main.tex', line: 3 });
    expect(resolveSyncTexPosition(index, 1, 150, 144, 36)).toEqual({ file: 'main.tex', line: 5 });
    // Click left of the text still resolves to that line.
    expect(resolveSyncTexPosition(index, 1, 80, 131, 36)?.line).toBe(3);
  });

  it('returns null when nothing is near the click', () => {
    const index = parseSyncTex(raw, 'main.tex', ['main.tex']);
    expect(resolveSyncTexPosition(index, 1, 100, 780, 10)).toBeNull();
    expect(resolveSyncTexPosition(index, 5, 100, 100, 10)).toBeNull();
  });
});
