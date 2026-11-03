import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PackageCache,
  sanitizePackageFilename,
  getPackageFile,
  savePackageFile,
  listCachedPackageFiles,
  isPackageFileCached,
  clearPackageCache,
} from '../packageCache';
import { uint8ArrayToBase64 } from '../tauriStorage';

describe('sanitizePackageFilename', () => {
  it('allows valid LaTeX package filenames and extensions', () => {
    expect(sanitizePackageFilename('amsmath.sty')).toBe('amsmath.sty');
    expect(sanitizePackageFilename('article.cls')).toBe('article.cls');
    expect(sanitizePackageFilename('mathtools.def')).toBe('mathtools.def');
    expect(sanitizePackageFilename('ot1cmr.fd')).toBe('ot1cmr.fd');
    expect(sanitizePackageFilename('cmr10.tfm')).toBe('cmr10.tfm');
    expect(sanitizePackageFilename('tikz.code.tex')).toBe('tikz.code.tex');
    expect(sanitizePackageFilename('my-package_v1.2.sty')).toBe('my-package_v1.2.sty');
  });

  it('strips directory traversal and path separators', () => {
    expect(sanitizePackageFilename('../amsmath.sty')).toBe('amsmath.sty');
    expect(sanitizePackageFilename('../../macros/latex/mathtools.sty')).toBe('mathtools.sty');
    expect(sanitizePackageFilename('subfolder/nested/test.def')).toBe('test.def');
    expect(sanitizePackageFilename('windows\\path\\sample.cls')).toBe('sample.cls');
  });

  it('strips disallowed characters from the filename', () => {
    expect(sanitizePackageFilename('foo$bar;calc.sty')).toBe('foobarcalc.sty');
    expect(sanitizePackageFilename('pkg#1@2.def')).toBe('pkg12.def');
  });

  it('throws on empty or whitespace strings', () => {
    expect(() => sanitizePackageFilename('')).toThrow(/invalid/i);
    expect(() => sanitizePackageFilename('   ')).toThrow(/invalid/i);
  });

  it('throws on invalid or missing extensions', () => {
    expect(() => sanitizePackageFilename('evil.exe')).toThrow(/extension/i);
    expect(() => sanitizePackageFilename('script.sh')).toThrow(/extension/i);
    expect(() => sanitizePackageFilename('archive.zip')).toThrow(/extension/i);
    expect(() => sanitizePackageFilename('document.pdf')).toThrow(/extension/i);
    expect(() => sanitizePackageFilename('noextension')).toThrow(/extension/i);
  });

  it('throws when no base name exists before extension', () => {
    expect(() => sanitizePackageFilename('.sty')).toThrow(/missing name/i);
    expect(() => sanitizePackageFilename('../.cls')).toThrow(/missing name/i);
  });
});

describe('PackageCache - IndexedDB Mode', () => {
  let cache: PackageCache;

  beforeEach(async () => {
    const dbName = `test-package-cache-${crypto.randomUUID()}`;
    cache = new PackageCache({ dbName, useTauri: false });
  });

  it('saves and retrieves binary package files', async () => {
    const testBytes = new Uint8Array([10, 20, 30, 40, 50]);
    await cache.savePackageFile('microtype.sty', testBytes, 'microtype');

    expect(await cache.isPackageFileCached('microtype.sty')).toBe(true);

    const retrieved = await cache.getPackageFile('microtype.sty');
    expect(retrieved).not.toBeNull();
    expect(Array.from(retrieved!)).toEqual([10, 20, 30, 40, 50]);
  });

  it('returns null for uncached package files', async () => {
    expect(await cache.getPackageFile('nonexistent.sty')).toBeNull();
    expect(await cache.isPackageFileCached('nonexistent.sty')).toBe(false);
  });

  it('lists all cached package filenames', async () => {
    await cache.savePackageFile('pkg-a.sty', new Uint8Array([1]), 'pkg-a');
    await cache.savePackageFile('pkg-b.def', new Uint8Array([2]), 'pkg-b');
    await cache.savePackageFile('pkg-c.tfm', new Uint8Array([3]), 'pkg-c');

    const files = await cache.listCachedPackageFiles();
    expect(files.sort()).toEqual(['pkg-a.sty', 'pkg-b.def', 'pkg-c.tfm'].sort());
  });

  it('overwrites existing cached package file with updated content', async () => {
    await cache.savePackageFile('sample.sty', new Uint8Array([1, 2, 3]));
    let data = await cache.getPackageFile('sample.sty');
    expect(Array.from(data!)).toEqual([1, 2, 3]);

    await cache.savePackageFile('sample.sty', new Uint8Array([9, 8, 7]));
    data = await cache.getPackageFile('sample.sty');
    expect(Array.from(data!)).toEqual([9, 8, 7]);
  });

  it('clears all cached package files', async () => {
    await cache.savePackageFile('a.sty', new Uint8Array([1]));
    await cache.savePackageFile('b.cls', new Uint8Array([2]));

    expect(await cache.listCachedPackageFiles()).toHaveLength(2);

    await cache.clearPackageCache();

    expect(await cache.listCachedPackageFiles()).toHaveLength(0);
    expect(await cache.getPackageFile('a.sty')).toBeNull();
  });

  it('deletes a single cached file cleanly', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    await cache.savePackageFile('physics.sty', bytes, 'physics');
    expect(await cache.isPackageFileCached('physics.sty')).toBe(true);

    await cache.deletePackageFile('physics.sty');
    expect(await cache.isPackageFileCached('physics.sty')).toBe(false);
    expect(await cache.getPackageFile('physics.sty')).toBeNull();
  });
});

describe('PackageCache - In-Memory Fallback Mode', () => {
  let cache: PackageCache;

  beforeEach(() => {
    cache = new PackageCache({ forceInMemory: true });
  });

  it('saves, retrieves, lists, and clears packages in memory', async () => {
    const bytes = new Uint8Array([100, 200]);
    await cache.savePackageFile('fallback.sty', bytes);

    expect(await cache.isPackageFileCached('fallback.sty')).toBe(true);
    const retrieved = await cache.getPackageFile('fallback.sty');
    expect(Array.from(retrieved!)).toEqual([100, 200]);

    const list = await cache.listCachedPackageFiles();
    expect(list).toEqual(['fallback.sty']);

    await cache.clearPackageCache();
    expect(await cache.listCachedPackageFiles()).toHaveLength(0);
    expect(await cache.getPackageFile('fallback.sty')).toBeNull();
  });
});

describe('PackageCache - Desktop (Tauri) Mode', () => {
  let mockInvoke: ReturnType<typeof vi.fn>;
  let cache: PackageCache;

  beforeEach(() => {
    mockInvoke = vi.fn();
    cache = new PackageCache({
      useTauri: true,
      tauriInvoke: mockInvoke as any,
    });
  });

  it('saves package file by invoking tauri_save_package_file with base64 data', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const b64 = uint8ArrayToBase64(bytes);
    mockInvoke.mockResolvedValueOnce(undefined);

    await cache.savePackageFile('desktop.sty', bytes, 'desktop-pkg');

    expect(mockInvoke).toHaveBeenCalledWith('tauri_save_package_file', {
      filename: 'desktop.sty',
      data: b64,
    });
  });

  it('retrieves package file by invoking tauri_get_package_file and decoding base64', async () => {
    const bytes = new Uint8Array([42, 43, 44]);
    const b64 = uint8ArrayToBase64(bytes);
    mockInvoke.mockResolvedValueOnce(b64);

    const result = await cache.getPackageFile('desktop.sty');
    expect(mockInvoke).toHaveBeenCalledWith('tauri_get_package_file', {
      filename: 'desktop.sty',
    });
    expect(result).not.toBeNull();
    expect(Array.from(result!)).toEqual([42, 43, 44]);
  });

  it('returns null when tauri_get_package_file returns null or empty', async () => {
    mockInvoke.mockResolvedValueOnce(null);
    const result = await cache.getPackageFile('missing.sty');
    expect(result).toBeNull();
  });

  it('lists package files by invoking tauri_list_package_files', async () => {
    mockInvoke.mockResolvedValueOnce(['file1.sty', 'file2.def']);
    const list = await cache.listCachedPackageFiles();
    expect(mockInvoke).toHaveBeenCalledWith('tauri_list_package_files');
    expect(list).toEqual(['file1.sty', 'file2.def']);
  });

  it('clears package cache by invoking tauri_clear_package_cache', async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    await cache.clearPackageCache();
    expect(mockInvoke).toHaveBeenCalledWith('tauri_clear_package_cache');
  });
});

describe('Standalone packageCache module functions', () => {
  beforeEach(async () => {
    await clearPackageCache();
  });

  it('delegates to the default singleton cache', async () => {
    const bytes = new Uint8Array([7, 8, 9]);
    await savePackageFile('standalone.sty', bytes);

    expect(await isPackageFileCached('standalone.sty')).toBe(true);

    const retrieved = await getPackageFile('standalone.sty');
    expect(retrieved).not.toBeNull();
    expect(Array.from(retrieved!)).toEqual([7, 8, 9]);

    const list = await listCachedPackageFiles();
    expect(list).toContain('standalone.sty');

    await clearPackageCache();
    expect(await isPackageFileCached('standalone.sty')).toBe(false);
  });
});
