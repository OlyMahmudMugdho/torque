import {
  isTauri,
  uint8ArrayToBase64,
  base64ToUint8Array,
  type TauriInvokeFn,
} from './tauriStorage';

export const ALLOWED_EXTENSIONS = ['.sty', '.cls', '.def', '.fd', '.tfm', '.tex'] as const;

/**
 * Sanitizes a LaTeX package filename:
 * - Strips directory traversal (../, /, \) by taking only the file basename.
 * - Strips any characters outside [a-zA-Z0-9._-].
 * - Validates that the file has a valid extension (.sty, .cls, .def, .fd, .tfm, .tex).
 * - Ensures there is a non-empty name before the extension.
 */
export function sanitizePackageFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') {
    throw new Error('Invalid package filename: filename must be a non-empty string');
  }

  const trimmed = filename.trim();
  if (!trimmed) {
    throw new Error('Invalid package filename: filename cannot be empty or whitespace');
  }

  // Extract basename by splitting on slashes and filtering out '.', '..' and empty segments
  const segments = trimmed.split(/[/\\]/).filter((s) => s && s !== '.' && s !== '..');
  const base = segments.pop() || '';

  // Remove disallowed characters: keep only alphanumeric, dots, dashes, underscores
  const sanitized = base.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!sanitized) {
    throw new Error(`Invalid package filename "${filename}": resulting filename is empty`);
  }

  const lower = sanitized.toLowerCase();
  const matchedExt = ALLOWED_EXTENSIONS.find((ext) => lower.endsWith(ext));
  if (!matchedExt) {
    throw new Error(
      `Invalid package extension in "${filename}". Allowed extensions: ${ALLOWED_EXTENSIONS.join(', ')}`
    );
  }

  const nameBeforeExt = sanitized.slice(0, sanitized.length - matchedExt.length);
  if (!nameBeforeExt || nameBeforeExt.replace(/\./g, '') === '') {
    throw new Error(`Invalid package filename "${filename}": missing name before extension`);
  }

  return sanitized;
}

export interface CachedPackageRecord {
  filename: string;
  data: Uint8Array;
  packageId?: string;
  cachedAt: number;
}

export interface PackageCacheOptions {
  dbName?: string;
  useTauri?: boolean;
  tauriInvoke?: TauriInvokeFn;
  forceInMemory?: boolean;
}

async function defaultInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__?.invoke) {
    return (window as any).__TAURI_INTERNALS__.invoke(cmd, args);
  }
  const core = await import('@tauri-apps/api/core');
  return core.invoke<T>(cmd, args);
}

export class PackageCache {
  private dbName: string;
  private isDesktop: boolean;
  private tauriInvoke: TauriInvokeFn;
  private forceInMemory: boolean;
  private inMemoryMap: Map<string, CachedPackageRecord> = new Map();
  private dbPromise: Promise<IDBDatabase | null> | null = null;

  constructor(options?: PackageCacheOptions) {
    this.dbName = options?.dbName ?? 'torque_package_cache';
    this.isDesktop = options?.useTauri !== undefined ? options.useTauri : isTauri();
    this.tauriInvoke = options?.tauriInvoke ?? defaultInvoke;
    this.forceInMemory = Boolean(options?.forceInMemory);
  }

  private async getIndexedDb(): Promise<IDBDatabase | null> {
    if (this.forceInMemory || typeof indexedDB === 'undefined') {
      return null;
    }

    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise<IDBDatabase | null>((resolve) => {
      try {
        const req = indexedDB.open(this.dbName, 1);

        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('packages')) {
            db.createObjectStore('packages', { keyPath: 'filename' });
          }
        };

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          console.warn(`[PackageCache] IndexedDB open error: ${req.error?.message}. Falling back to in-memory.`);
          resolve(null);
        };
      } catch (e) {
        console.warn('[PackageCache] Failed to initialize IndexedDB. Falling back to in-memory.', e);
        resolve(null);
      }
    });

    return this.dbPromise;
  }

  async getPackageFile(filename: string): Promise<Uint8Array | null> {
    const sanitized = sanitizePackageFilename(filename);

    if (this.isDesktop) {
      try {
        const b64 = await this.tauriInvoke<string | null>('tauri_get_package_file', {
          filename: sanitized,
        });
        if (!b64) {
          return null;
        }
        return base64ToUint8Array(b64);
      } catch (err) {
        console.warn(`[PackageCache] Desktop getPackageFile failed for ${sanitized}:`, err);
        return null;
      }
    }

    const db = await this.getIndexedDb();
    if (!db) {
      const record = this.inMemoryMap.get(sanitized);
      return record ? record.data : null;
    }

    return new Promise<Uint8Array | null>((resolve, reject) => {
      try {
        const tx = db.transaction('packages', 'readonly');
        const store = tx.objectStore('packages');
        const req = store.get(sanitized);

        req.onsuccess = () => {
          const record = req.result as CachedPackageRecord | undefined;
          if (!record || !record.data) {
            resolve(null);
            return;
          }
          const rawData = record.data as unknown;
          if (rawData instanceof Uint8Array) {
            resolve(rawData);
          } else if (rawData instanceof ArrayBuffer) {
            resolve(new Uint8Array(rawData));
          } else if (Array.isArray(rawData) || (rawData && typeof rawData === 'object')) {
            resolve(new Uint8Array(Object.values(rawData as Record<string, number>)));
          } else {
            resolve(null);
          }
        };

        req.onerror = () => reject(req.error);
      } catch (err) {
        // Fallback to in-memory if transaction fails
        const record = this.inMemoryMap.get(sanitized);
        resolve(record ? record.data : null);
      }
    });
  }

  async savePackageFile(filename: string, data: Uint8Array, packageId?: string): Promise<void> {
    const sanitized = sanitizePackageFilename(filename);
    const now = Date.now();

    if (this.isDesktop) {
      const b64 = uint8ArrayToBase64(data);
      await this.tauriInvoke('tauri_save_package_file', {
        filename: sanitized,
        data: b64,
      });
      return;
    }

    const db = await this.getIndexedDb();
    const record: CachedPackageRecord = {
      filename: sanitized,
      data,
      packageId,
      cachedAt: now,
    };

    if (!db) {
      this.inMemoryMap.set(sanitized, record);
      return;
    }

    return new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction('packages', 'readwrite');
        const store = tx.objectStore('packages');
        const req = store.put(record);

        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        this.inMemoryMap.set(sanitized, record);
        resolve();
      }
    });
  }

  async listCachedPackageFiles(): Promise<string[]> {
    if (this.isDesktop) {
      try {
        const list = await this.tauriInvoke<string[]>('tauri_list_package_files');
        return list || [];
      } catch (err) {
        console.warn('[PackageCache] Desktop listCachedPackageFiles failed:', err);
        return [];
      }
    }

    const db = await this.getIndexedDb();
    if (!db) {
      return Array.from(this.inMemoryMap.keys());
    }

    return new Promise<string[]>((resolve, reject) => {
      try {
        const tx = db.transaction('packages', 'readonly');
        const store = tx.objectStore('packages');
        const req = store.getAllKeys();

        req.onsuccess = () => {
          const keys = req.result as string[];
          resolve(keys || []);
        };

        req.onerror = () => reject(req.error);
      } catch (err) {
        resolve(Array.from(this.inMemoryMap.keys()));
      }
    });
  }

  async isPackageFileCached(filename: string): Promise<boolean> {
    try {
      const sanitized = sanitizePackageFilename(filename);
      const data = await this.getPackageFile(sanitized);
      return data !== null;
    } catch {
      return false;
    }
  }

  async deletePackageFile(filename: string): Promise<void> {
    const sanitized = sanitizePackageFilename(filename);

    if (this.isDesktop) {
      try {
        await this.tauriInvoke('tauri_delete_package_file', { filename: sanitized });
      } catch (err) {
        console.warn(`[PackageCache] Desktop deletePackageFile failed for ${sanitized}:`, err);
      }
      return;
    }

    this.inMemoryMap.delete(sanitized);

    const db = await this.getIndexedDb();
    if (!db) {
      return;
    }

    return new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction('packages', 'readwrite');
        const store = tx.objectStore('packages');
        const req = store.delete(sanitized);

        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        resolve();
      }
    });
  }

  async clearPackageCache(): Promise<void> {
    if (this.isDesktop) {
      try {
        await this.tauriInvoke('tauri_clear_package_cache');
      } catch (err) {
        console.warn('[PackageCache] Desktop clearPackageCache failed:', err);
      }
      return;
    }

    this.inMemoryMap.clear();

    const db = await this.getIndexedDb();
    if (!db) {
      return;
    }

    return new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction('packages', 'readwrite');
        const store = tx.objectStore('packages');
        const req = store.clear();

        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        resolve();
      }
    });
  }
}

export const defaultPackageCache = new PackageCache();

export async function getPackageFile(filename: string): Promise<Uint8Array | null> {
  return defaultPackageCache.getPackageFile(filename);
}

export async function savePackageFile(
  filename: string,
  data: Uint8Array,
  packageId?: string
): Promise<void> {
  return defaultPackageCache.savePackageFile(filename, data, packageId);
}

export async function listCachedPackageFiles(): Promise<string[]> {
  return defaultPackageCache.listCachedPackageFiles();
}

export async function isPackageFileCached(filename: string): Promise<boolean> {
  return defaultPackageCache.isPackageFileCached(filename);
}

export async function deletePackageFile(filename: string): Promise<void> {
  return defaultPackageCache.deletePackageFile(filename);
}

export async function clearPackageCache(): Promise<void> {
  return defaultPackageCache.clearPackageCache();
}
