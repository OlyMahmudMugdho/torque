import { describe, it, expect } from 'vitest';
import { parseSyncTex, resolveSyncTexPosition, decompressGzip } from '../synctexParser';

const SAMPLE_SYNCTEX = `Input:1:main.tex
Input:2:chapters/intro.tex
[1,10:0,0:200,100]:2:10:0,200,100
[2,20:50,50:150,150]:2:20:50,150,150`;

// Valid gzip stream of the string "test\0" (generated via `printf 'test\0' | gzip`).
const GZIP_SAMPLE = new Uint8Array([
  0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03,
  0x2b, 0x49, 0x2d, 0x2e, 0x61, 0x00, 0x00, 0xd8, 0xdc, 0x6c,
  0xdb, 0x05, 0x00, 0x00, 0x00,
]);

describe('parseSyncTex', () => {
  it('parses Input lines into file map', () => {
    const result = parseSyncTex(SAMPLE_SYNCTEX);
    expect(result.files).toBeInstanceOf(Map);
    expect(result.files.get(1)).toBe('main.tex');
    expect(result.files.get(2)).toBe('chapters/intro.tex');
  });

  it('parses record lines into blocks', () => {
    const result = parseSyncTex(SAMPLE_SYNCTEX);
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0]).toMatchObject({
      file: 'chapters/intro.tex',
      line: 10,
      page: 1,
    });
  });

  it('divides coordinates by 65536 (fixed-point)', () => {
    const result = parseSyncTex(SAMPLE_SYNCTEX);
    expect(result.blocks[0].x).toBeCloseTo(0);
    expect(result.blocks[1].x).toBeCloseTo(50 / 65536);
  });
});

describe('resolveSyncTexPosition', () => {
  it('finds nearest block within tolerance', () => {
    const result = parseSyncTex(SAMPLE_SYNCTEX);
    const found = resolveSyncTexPosition(result, 1, 0, 0, 10);
    expect(found).toEqual({ file: 'chapters/intro.tex', line: 10 });
  });

  it('returns null when no block matches', () => {
    const result = parseSyncTex(SAMPLE_SYNCTEX);
    const found = resolveSyncTexPosition(result, 99, 0, 0, 1);
    expect(found).toBeNull();
  });
});

describe('decompressGzip', () => {
  it('decompresses gzip data correctly', async () => {
    const result = await decompressGzip(GZIP_SAMPLE);
    expect(result).toContain('test');
  });
});