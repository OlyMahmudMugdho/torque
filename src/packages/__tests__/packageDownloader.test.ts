import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resolveCtanUrls,
  inferPackageId,
  downloadSingleFile,
  downloadPackage,
  isPackageDownloaded,
  isValidPackageContent,
} from '../packageDownloader';
import { PackageCache } from '../../storage/packageCache';

describe('inferPackageId', () => {
  it('infers packageId from DEFAULT_PACKAGE_CATALOG', () => {
    expect(inferPackageId('physics.sty')).toBe('physics');
    expect(inferPackageId('mathtools.sty')).toBe('mathtools');
    expect(inferPackageId('tikz-cd.sty')).toBe('tikz-cd');
  });

  it('infers packageId by stripping known extensions when not in catalog', () => {
    expect(inferPackageId('custompkg.sty')).toBe('custompkg');
    expect(inferPackageId('myclass.cls')).toBe('myclass');
    expect(inferPackageId('mydefs.def')).toBe('mydefs');
  });

  it('handles filenames with paths by sanitizing first', () => {
    expect(inferPackageId('../../macros/physics.sty')).toBe('physics');
  });
});

describe('resolveCtanUrls', () => {
  it('generates mirrors in expected priority order with explicit packageId', () => {
    const urls = resolveCtanUrls('physics.sty', 'physics');
    expect(urls).toEqual([
      'https://mirrors.ctan.org/macros/latex/contrib/physics/physics.sty',
      'https://www.ctan.org/tex-archive/macros/latex/contrib/physics/physics.sty',
    ]);
  });

  it('infers packageId when packageId is omitted', () => {
    const urls = resolveCtanUrls('mathtools.sty');
    expect(urls).toEqual([
      'https://mirrors.ctan.org/macros/latex/contrib/mathtools/mathtools.sty',
      'https://www.ctan.org/tex-archive/macros/latex/contrib/mathtools/mathtools.sty',
    ]);
  });

  it('sanitizes filename to prevent directory traversal', () => {
    const urls = resolveCtanUrls('../../../physics.sty', 'physics');
    expect(urls[0]).toBe('https://mirrors.ctan.org/macros/latex/contrib/physics/physics.sty');
  });

  it('throws on invalid package extensions', () => {
    expect(() => resolveCtanUrls('script.exe', 'script')).toThrow();
  });
});

describe('isValidPackageContent', () => {
  it('accepts valid TeX/LaTeX content', () => {
    const encoder = new TextEncoder();
    const content = encoder.encode('\\ProvidesPackage{test}[2023/01/01]');
    expect(isValidPackageContent(content).valid).toBe(true);
  });

  it('rejects empty byte arrays', () => {
    const res = isValidPackageContent(new Uint8Array(0));
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/empty/i);
  });

  it('rejects HTML error pages', () => {
    const encoder = new TextEncoder();
    const html1 = encoder.encode('<!DOCTYPE html><html><head><title>404 Not Found</title></head></html>');
    expect(isValidPackageContent(html1).valid).toBe(false);
    expect(isValidPackageContent(html1).reason).toMatch(/HTML/i);

    const html2 = encoder.encode('<html><body>Error</body></html>');
    expect(isValidPackageContent(html2).valid).toBe(false);
  });
});

describe('downloadSingleFile', () => {
  let mockCache: PackageCache;

  beforeEach(() => {
    mockCache = new PackageCache({ forceInMemory: true });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('successfully downloads from primary mirror and caches data', async () => {
    const fakeContent = new TextEncoder().encode('\\ProvidesPackage{physics}[2023/01/01]');
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/plain' }),
      arrayBuffer: async () => fakeContent.buffer,
    });

    const result = await downloadSingleFile('physics.sty', 'physics', {
      fetchFn: fetchMock as unknown as typeof fetch,
      packageCache: mockCache,
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(Array.from(result.data!)).toEqual(Array.from(fakeContent));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Verify it was stored in cache
    const cached = await mockCache.getPackageFile('physics.sty');
    expect(Array.from(cached!)).toEqual(Array.from(fakeContent));
  });

  it('falls back to second mirror when primary mirror returns 404', async () => {
    const fakeContent = new TextEncoder().encode('\\ProvidesPackage{physics}[2023/01/01]');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        arrayBuffer: async () => fakeContent.buffer,
      });

    const result = await downloadSingleFile('physics.sty', 'physics', {
      fetchFn: fetchMock as unknown as typeof fetch,
      packageCache: mockCache,
    });

    expect(result.success).toBe(true);
    expect(Array.from(result.data!)).toEqual(Array.from(fakeContent));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const cached = await mockCache.getPackageFile('physics.sty');
    expect(Array.from(cached!)).toEqual(Array.from(fakeContent));
  });

  it('falls back when mirror throws network error', async () => {
    const fakeContent = new TextEncoder().encode('\\ProvidesPackage{physics}[2023/01/01]');
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error / CORS blocked'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        arrayBuffer: async () => fakeContent.buffer,
      });

    const result = await downloadSingleFile('physics.sty', 'physics', {
      fetchFn: fetchMock as unknown as typeof fetch,
      packageCache: mockCache,
    });

    expect(result.success).toBe(true);
    expect(Array.from(result.data!)).toEqual(Array.from(fakeContent));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects HTML error page from mirror and tries next mirror', async () => {
    const htmlError = new TextEncoder().encode('<!DOCTYPE html><html><body>404 Not Found</body></html>');
    const validTex = new TextEncoder().encode('\\ProvidesPackage{physics}[2023/01/01]');

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/html' }),
        arrayBuffer: async () => htmlError.buffer,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/plain' }),
        arrayBuffer: async () => validTex.buffer,
      });

    const result = await downloadSingleFile('physics.sty', 'physics', {
      fetchFn: fetchMock as unknown as typeof fetch,
      packageCache: mockCache,
    });

    expect(result.success).toBe(true);
    expect(Array.from(result.data!)).toEqual(Array.from(validTex));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns failure when all mirrors fail', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const result = await downloadSingleFile('nonexistent.sty', 'nonexistent', {
      fetchFn: fetchMock as unknown as typeof fetch,
      packageCache: mockCache,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/failed/i);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const cached = await mockCache.getPackageFile('nonexistent.sty');
    expect(cached).toBeNull();
  });

  it('skips download if file is already cached and skipIfCached is true', async () => {
    const existingData = new Uint8Array([5, 6, 7]);
    await mockCache.savePackageFile('physics.sty', existingData, 'physics');

    const fetchMock = vi.fn();
    const result = await downloadSingleFile('physics.sty', 'physics', {
      fetchFn: fetchMock as unknown as typeof fetch,
      packageCache: mockCache,
      skipIfCached: true,
    });

    expect(result.success).toBe(true);
    expect(Array.from(result.data!)).toEqual([5, 6, 7]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns failure immediately when filename has invalid extension', async () => {
    const result = await downloadSingleFile('evil.sh', 'evil', {
      packageCache: mockCache,
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/extension/i);
  });
});

describe('downloadPackage', () => {
  let mockCache: PackageCache;

  beforeEach(() => {
    mockCache = new PackageCache({ forceInMemory: true });
    vi.restoreAllMocks();
  });

  it('downloads single-file package from catalog and updates progress', async () => {
    const fakeContent = new TextEncoder().encode('\\ProvidesPackage{physics}');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      arrayBuffer: async () => fakeContent.buffer,
    });

    const progressMessages: string[] = [];
    const onProgress = (msg: string) => progressMessages.push(msg);

    const result = await downloadPackage('physics', onProgress, {
      fetchFn: fetchMock as unknown as typeof fetch,
      packageCache: mockCache,
    });

    expect(result.success).toBe(true);
    expect(result.files).toEqual(['physics.sty']);
    expect(progressMessages.length).toBeGreaterThan(0);

    const cached = await mockCache.getPackageFile('physics.sty');
    expect(Array.from(cached!)).toEqual(Array.from(fakeContent));
  });

  it('downloads multi-file package iterating all files in catalog', async () => {
    // amsmath has: ['amsmath.sty', 'amstext.sty', 'amsgen.sty', 'amsbsy.sty', 'amsopn.sty']
    const fakeContent = new TextEncoder().encode('% TeX file');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      arrayBuffer: async () => fakeContent.buffer,
    });

    const result = await downloadPackage('amsmath', undefined, {
      fetchFn: fetchMock as unknown as typeof fetch,
      packageCache: mockCache,
    });

    expect(result.success).toBe(true);
    expect(result.files).toEqual([
      'amsmath.sty',
      'amstext.sty',
      'amsgen.sty',
      'amsbsy.sty',
      'amsopn.sty',
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('returns error if any file download fails in multi-file package', async () => {
    const fakeContent = new TextEncoder().encode('% TeX file');
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('amstext.sty')) {
        return { ok: false, status: 500, statusText: 'Server Error' };
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        arrayBuffer: async () => fakeContent.buffer,
      };
    });

    const result = await downloadPackage('amsmath', undefined, {
      fetchFn: fetchMock as unknown as typeof fetch,
      packageCache: mockCache,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('downloads non-catalog package defaulting to <packageId>.sty', async () => {
    const fakeContent = new TextEncoder().encode('\\ProvidesPackage{custompkg}');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      arrayBuffer: async () => fakeContent.buffer,
    });

    const result = await downloadPackage('custompkg', undefined, {
      fetchFn: fetchMock as unknown as typeof fetch,
      packageCache: mockCache,
    });

    expect(result.success).toBe(true);
    expect(result.files).toEqual(['custompkg.sty']);
  });

  it('skips package download if all files cached and skipIfCached is true', async () => {
    await mockCache.savePackageFile('physics.sty', new Uint8Array([1, 2, 3]), 'physics');
    const fetchMock = vi.fn();

    const result = await downloadPackage('physics', undefined, {
      fetchFn: fetchMock as unknown as typeof fetch,
      packageCache: mockCache,
      skipIfCached: true,
    });

    expect(result.success).toBe(true);
    expect(result.files).toEqual(['physics.sty']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns error when packageId is empty or whitespace', async () => {
    const result = await downloadPackage('   ');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });
});

describe('isPackageDownloaded', () => {
  let mockCache: PackageCache;

  beforeEach(() => {
    mockCache = new PackageCache({ forceInMemory: true });
  });

  it('returns false when package files are not in cache', async () => {
    const isDownloaded = await isPackageDownloaded('physics', mockCache);
    expect(isDownloaded).toBe(false);
  });

  it('returns true when all package files are cached', async () => {
    await mockCache.savePackageFile('physics.sty', new Uint8Array([1, 2, 3]), 'physics');
    const isDownloaded = await isPackageDownloaded('physics', mockCache);
    expect(isDownloaded).toBe(true);
  });

  it('returns false when only some files of a multi-file package are cached', async () => {
    // amsmath has 5 files
    await mockCache.savePackageFile('amsmath.sty', new Uint8Array([1, 2, 3]), 'amsmath');
    const isDownloaded = await isPackageDownloaded('amsmath', mockCache);
    expect(isDownloaded).toBe(false);
  });
});
