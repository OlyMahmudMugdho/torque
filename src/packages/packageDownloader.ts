import {
  sanitizePackageFilename,
  defaultPackageCache,
  type PackageCache,
} from '../storage/packageCache';
import { DEFAULT_PACKAGE_CATALOG } from './packageCatalog';
import JSZip from 'jszip';

export interface DownloadFileOptions {
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  packageCache?: PackageCache | {
    savePackageFile: (filename: string, data: Uint8Array, packageId?: string) => Promise<void>;
    getPackageFile?: (filename: string) => Promise<Uint8Array | null>;
    isPackageFileCached?: (filename: string) => Promise<boolean>;
  };
  skipIfCached?: boolean;
  /** Use CTAN's official JSON catalogue after direct mirror lookup. */
  enableCtanApi?: boolean;
}

export interface DownloadPackageOptions extends DownloadFileOptions {}

const CTAN_API_BASE = 'https://www.ctan.org';

function getCtanProxyBase(): string {
  // The development proxy runs beside Next on port 8787. The production
  // static server routes /api/ctan itself, so it remains same-origin.
  if (typeof window !== 'undefined' && window.location.port === '3000') {
    return `${window.location.protocol}//${window.location.hostname}:8787`;
  }
  return '';
}

function getCtanApiUrl(path: string): string {
  return `${getCtanProxyBase()}${path}`;
}

function getCtanDownloadUrl(url: string): string {
  const proxyBase = getCtanProxyBase();
  if (proxyBase) {
    return `${proxyBase}/api/ctan/download?url=${encodeURIComponent(url)}`;
  }
  // Fall back to direct CTAN URL when the development proxy is not running
  // (e.g. production static export, or proxy server not started).
  return url;
}

export interface CtanSearchHit {
  title: string;
  path: string;
  text: string | null;
}

export interface CtanSearchResponse {
  numberOfHits: number;
  hits: CtanSearchHit[];
}

export interface CtanPackageMetadata {
  id: string;
  name: string;
  ctan?: { path: string; file?: boolean };
  install?: { path: string };
  texlive?: string | { location: string };
}

/** Query CTAN's official package search endpoint. */
export async function searchCtanPackages(
  phrase: string,
  fetchFn: typeof fetch = globalThis.fetch
): Promise<CtanSearchHit[]> {
  const query = phrase.trim();
  if (!query) return [];
  const path = `/api/ctan/search?phrase=${encodeURIComponent(query)}&max=32&ext=true&PKG=true`;
  const url = typeof window === 'undefined'
    ? `${CTAN_API_BASE}/search/json?phrase=${encodeURIComponent(query)}&max=32&ext=true&PKG=true`
    : getCtanApiUrl(path);
  const response = await fetchFn(url);
  if (!response.ok) throw new Error(`CTAN search failed with HTTP ${response.status}`);
  const body = (await response.json()) as CtanSearchResponse;
  return Array.isArray(body.hits) ? body.hits : [];
}

/** Query metadata for a specific CTAN package. */
export async function getCtanPackageMetadata(
  packageId: string,
  fetchFn: typeof fetch = globalThis.fetch
): Promise<CtanPackageMetadata | null> {
  const id = packageId.trim().toLowerCase();
  if (!id) return null;
  const officialUrl = `${CTAN_API_BASE}/json/3.0/pkg/${encodeURIComponent(id)}`;
  const url = typeof window === 'undefined'
    ? officialUrl
    : getCtanApiUrl(`/api/ctan/package/${encodeURIComponent(id)}`);
  const response = await fetchFn(url);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`CTAN metadata lookup failed with HTTP ${response.status}`);
  return (await response.json()) as CtanPackageMetadata;
}

function resolveOfficialCtanUrls(metadata: CtanPackageMetadata, filename: string): string[] {
  const ctanPath = metadata.ctan?.path?.replace(/\/$/, '');
  if (!ctanPath) return [];
  return [
    `https://mirrors.ctan.org${ctanPath}/${encodeURIComponent(filename)}`,
    `https://www.ctan.org/tex-archive${ctanPath}/${encodeURIComponent(filename)}`,
    ...(metadata.ctan?.file ? [`https://mirrors.ctan.org${ctanPath}.zip`] : []),
  ];
}

async function extractPackageFile(archive: Uint8Array, filename: string): Promise<Uint8Array | null> {
  const zip = await JSZip.loadAsync(archive);
  const match = Object.values(zip.files).find((entry) =>
    !entry.dir && entry.name.split('/').pop()?.toLowerCase() === filename.toLowerCase()
  );
  return match ? new Uint8Array(await match.async('uint8array')) : null;
}

export interface ContentValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validates LaTeX package binary content.
 * Checks for non-empty payload and rejects HTML error/captive portal pages.
 */
export function isValidPackageContent(data: Uint8Array): ContentValidationResult {
  if (!data || data.length === 0) {
    return { valid: false, reason: 'Empty response (0 bytes)' };
  }

  // Sniff up to first 512 bytes for HTML markup
  const sampleLength = Math.min(data.length, 512);
  const textSample = new TextDecoder('utf-8', { fatal: false })
    .decode(data.subarray(0, sampleLength))
    .toLowerCase()
    .trimStart();

  if (
    textSample.startsWith('<!doctype') ||
    textSample.includes('<!doctype') ||
    textSample.includes('<html') ||
    textSample.includes('<head')
  ) {
    return { valid: false, reason: 'HTML error page detected' };
  }

  return { valid: true };
}

/**
 * Infers package identifier from a filename.
 * 1. Checks DEFAULT_PACKAGE_CATALOG for any package containing this file.
 * 2. Falls back to stripping known file extensions.
 */
export function inferPackageId(filename: string): string {
  const sanitized = sanitizePackageFilename(filename);

  const matched = DEFAULT_PACKAGE_CATALOG.find((pkg) =>
    pkg.files.some((f) => f.toLowerCase() === sanitized.toLowerCase())
  );
  if (matched) {
    return matched.id;
  }

  // Strip known extensions e.g. .sty, .cls, .def, .fd, .tfm, .tex, .code.tex
  const stripped = sanitized.replace(/\.(sty|cls|def|fd|tfm|tex|code\.tex)$/i, '');
  return (stripped || sanitized).toLowerCase();
}

/**
 * Resolves priority CTAN and CDN mirror URLs for a given filename and package ID.
 */
export function resolveCtanUrls(
  filename: string,
  packageId?: string
): string[] {
  const sanitizedFilename = sanitizePackageFilename(filename);
  const pkgId = (packageId || inferPackageId(sanitizedFilename)).trim().toLowerCase();

  return [
    `https://mirrors.ctan.org/macros/latex/contrib/${pkgId}/${sanitizedFilename}`,
    `https://www.ctan.org/tex-archive/macros/latex/contrib/${pkgId}/${sanitizedFilename}`,
  ];
}

/**
 * Downloads a single LaTeX package file with multi-mirror fallback and content validation.
 * On success, saves file to persistent packageCache.
 */
export async function downloadSingleFile(
  filename: string,
  packageId?: string,
  options?: DownloadFileOptions
): Promise<{ success: boolean; data?: Uint8Array; error?: string }> {
  let sanitizedFilename: string;
  try {
    sanitizedFilename = sanitizePackageFilename(filename);
  } catch (err: any) {
    return { success: false, error: err.message };
  }

  const pkgId = (packageId || inferPackageId(sanitizedFilename)).trim().toLowerCase();
  const urls = resolveCtanUrls(sanitizedFilename, pkgId);
  const fetchFn = options?.fetchFn ?? globalThis.fetch;
  const timeoutMs = options?.timeoutMs ?? 3000;
  const cache = options?.packageCache ?? defaultPackageCache;

  if (options?.skipIfCached && cache.getPackageFile) {
    const existing = await cache.getPackageFile(sanitizedFilename);
    if (existing) {
      return { success: true, data: existing };
    }
  }

  let lastError = 'No mirror available';

  for (const url of urls) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const resp = await fetchFn(getCtanDownloadUrl(url), {
        signal: controller ? controller.signal : undefined,
      });

      if (!resp.ok) {
        lastError = `HTTP ${resp.status} ${resp.statusText || ''} from ${url}`.trim();
        continue;
      }

      // Check header if present
      const contentType = resp.headers?.get('content-type')?.toLowerCase();
      if (contentType && contentType.includes('text/html')) {
        lastError = `Received HTML content from ${url} (expected LaTeX file)`;
        continue;
      }

      const buffer = await resp.arrayBuffer();
      const data = new Uint8Array(buffer);

      const validation = isValidPackageContent(data);
      if (!validation.valid) {
        lastError = `${validation.reason} from ${url}`;
        continue;
      }

      // Valid data received — persist to cache
      await cache.savePackageFile(sanitizedFilename, data, pkgId);

      return { success: true, data };
    } catch (err: any) {
      lastError = err?.name === 'AbortError'
        ? `Request timed out after ${timeoutMs}ms for ${url}`
        : (err?.message || `Failed to fetch from ${url}`);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  // The filename-based mirror paths above are only guesses. When enabled,
  // resolve the package's authoritative CTAN path before giving up.
  if (options?.enableCtanApi) {
    try {
      const metadata = await getCtanPackageMetadata(pkgId, fetchFn);
      if (metadata) {
        for (const url of resolveOfficialCtanUrls(metadata, sanitizedFilename)) {
          try {
            // CTAN downloads from the browser must pass through our backend;
            // direct CTAN URLs are not consistently CORS-enabled.
            const response = await fetchFn(getCtanDownloadUrl(url));
            if (!response.ok) continue;
            const contentType = response.headers?.get('content-type')?.toLowerCase();
            if (contentType?.includes('text/html')) continue;
            const payload = new Uint8Array(await response.arrayBuffer());
            const data = url.endsWith('.zip')
              ? await extractPackageFile(payload, sanitizedFilename)
              : payload;
            if (!data || !isValidPackageContent(data).valid) continue;
            await cache.savePackageFile(sanitizedFilename, data, pkgId);
            return { success: true, data };
          } catch {
            // Continue through the official CTAN URLs.
          }
        }
      }
    } catch (error: any) {
      lastError = error?.message || 'CTAN API lookup failed';
    }
  }

  return {
    success: false,
    error: `Failed to download ${sanitizedFilename} from all available CTAN mirrors. Last error: ${lastError}`,
  };
}

/**
 * Downloads all files for a package from the catalog (or defaults to <packageId>.sty).
 * Emits progress messages through the optional callback.
 */
export async function downloadPackage(
  packageId: string,
  onProgress?: (msg: string) => void,
  options?: DownloadPackageOptions
): Promise<{ success: boolean; files: string[]; error?: string }> {
  const trimmedId = packageId.trim().toLowerCase();
  if (!trimmedId) {
    return { success: false, files: [], error: 'Package ID cannot be empty' };
  }

  const catalogEntry = DEFAULT_PACKAGE_CATALOG.find(
    (p) => p.id.toLowerCase() === trimmedId
  );

  const files =
    catalogEntry && catalogEntry.files && catalogEntry.files.length > 0
      ? catalogEntry.files
      : [`${trimmedId}.sty`];

  if (options?.skipIfCached) {
    const isCached = await isPackageDownloaded(trimmedId, options.packageCache as PackageCache);
    if (isCached) {
      onProgress?.(`${trimmedId} is already cached`);
      return { success: true, files };
    }
  }

  const downloadedFiles: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(`Downloading ${file} (${i + 1}/${files.length})...`);

    const result = await downloadSingleFile(file, trimmedId, options);
    if (!result.success) {
      return {
        success: false,
        files: downloadedFiles,
        error: result.error || `Failed to download ${file}`,
      };
    }

    downloadedFiles.push(file);
  }

  onProgress?.(`Successfully installed ${trimmedId}`);
  return { success: true, files: downloadedFiles };
}

/**
 * Checks if all required files for a package exist in the package cache.
 */
export async function isPackageDownloaded(
  packageId: string,
  cache: PackageCache = defaultPackageCache
): Promise<boolean> {
  const trimmedId = packageId.trim().toLowerCase();
  if (!trimmedId) return false;

  const catalogEntry = DEFAULT_PACKAGE_CATALOG.find(
    (p) => p.id.toLowerCase() === trimmedId
  );

  const files =
    catalogEntry && catalogEntry.files && catalogEntry.files.length > 0
      ? catalogEntry.files
      : [`${trimmedId}.sty`];

  for (const file of files) {
    const isCached = await cache.isPackageFileCached(file);
    if (!isCached) {
      return false;
    }
  }

  return true;
}
