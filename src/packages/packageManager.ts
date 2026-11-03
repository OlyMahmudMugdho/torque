import type { LatexPackage, PackageCategory } from './packageTypes';
import {
  defaultPackageCache,
  type PackageCache,
} from '../storage/packageCache';

export const PACKAGE_STORAGE_KEY = 'torque_installed_packages';

export { DEFAULT_PACKAGE_CATALOG } from './packageCatalog';
import { DEFAULT_PACKAGE_CATALOG } from './packageCatalog';

// In-memory state tracking overrides and dynamically registered packages
let installedOverrides: Record<string, boolean> = {};
let dynamicPackages: LatexPackage[] = [];
let cachedPackageIds: Set<string> = new Set();
let hasLoadedStorage = false;

/**
 * Manually marks a package as cached in-memory.
 */
export function markPackageCached(nameOrId: string, isCached = true): void {
  const normalized = nameOrId.trim().toLowerCase();
  const clean = normalized.endsWith('.sty') ? normalized.slice(0, -4) : normalized;
  if (isCached) {
    cachedPackageIds.add(clean);
  } else {
    cachedPackageIds.delete(clean);
  }
}

/**
 * Checks if a package is marked as cached in memory.
 */
export function isPackageCachedInMemory(nameOrId: string): boolean {
  const normalized = nameOrId.trim().toLowerCase();
  const clean = normalized.endsWith('.sty') ? normalized.slice(0, -4) : normalized;
  return cachedPackageIds.has(clean);
}

/**
 * Synchronizes cached packages by querying persistent packageCache and updating in-memory cache set.
 */
export async function syncPackageCacheStatus(
  cache: PackageCache = defaultPackageCache
): Promise<Set<string>> {
  try {
    const cachedFiles = await cache.listCachedPackageFiles();
    const cachedFileSet = new Set(cachedFiles.map((f) => f.toLowerCase()));

    for (const pkg of DEFAULT_PACKAGE_CATALOG) {
      if (pkg.files.length > 0 && pkg.files.every((f) => cachedFileSet.has(f.toLowerCase()))) {
        cachedPackageIds.add(pkg.id.toLowerCase());
      } else {
        cachedPackageIds.delete(pkg.id.toLowerCase());
      }
    }

    for (const dyn of dynamicPackages) {
      if (dyn.files.length > 0 && dyn.files.every((f) => cachedFileSet.has(f.toLowerCase()))) {
        cachedPackageIds.add(dyn.id.toLowerCase());
      } else {
        cachedPackageIds.delete(dyn.id.toLowerCase());
      }
    }
  } catch (err) {
    console.warn('[packageManager] Failed to sync package cache status:', err);
  }

  return new Set(cachedPackageIds);
}

function getLocalStorage(): Storage | null {
  const g = typeof globalThis !== 'undefined' ? (globalThis as any) : null;
  try {
    return g?.localStorage || g?.window?.localStorage || null;
  } catch {
    return null;
  }
}

function loadStorageOverrides(): void {
  if (hasLoadedStorage) return;
  hasLoadedStorage = true;

  const storage = getLocalStorage();
  if (storage) {
    try {
      const stored = storage.getItem(PACKAGE_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed === 'object' && parsed !== null) {
          installedOverrides = { ...parsed };
        }
      }
    } catch {
      // Fallback if localStorage access is restricted
    }
  }
}

function persistStorageOverrides(): void {
  const storage = getLocalStorage();
  if (storage) {
    try {
      storage.setItem(PACKAGE_STORAGE_KEY, JSON.stringify(installedOverrides));
    } catch {
      // Fallback if localStorage access is restricted
    }
  }
}

/**
 * Returns a cloned list of all available packages with their current installed state.
 */
export function getPackageCatalog(): LatexPackage[] {
  loadStorageOverrides();

  const isPkgInstalled = (pkg: LatexPackage) => {
    if (installedOverrides[pkg.name] !== undefined) {
      return installedOverrides[pkg.name];
    }
    if (pkg.source === 'bundle') {
      return true;
    }
    if (cachedPackageIds.has(pkg.id.toLowerCase()) || cachedPackageIds.has(pkg.name.toLowerCase())) {
      return true;
    }
    return pkg.isInstalled;
  };

  const catalog: LatexPackage[] = DEFAULT_PACKAGE_CATALOG.map((pkg) => ({
    ...pkg,
    isInstalled: isPkgInstalled(pkg),
  }));

  for (const dyn of dynamicPackages) {
    catalog.push({
      ...dyn,
      isInstalled: isPkgInstalled(dyn),
    });
  }

  return catalog;
}

/**
 * Looks up a package by name or sty filename, case-insensitively.
 */
export function getPackageByName(name: string): LatexPackage | undefined {
  if (!name || typeof name !== 'string') return undefined;

  const normalized = name.trim().toLowerCase();
  const cleanName = normalized.endsWith('.sty') ? normalized.slice(0, -4) : normalized;

  const catalog = getPackageCatalog();
  return catalog.find(
    (pkg) =>
      pkg.name.toLowerCase() === normalized ||
      pkg.id.toLowerCase() === normalized ||
      pkg.name.toLowerCase() === cleanName ||
      pkg.id.toLowerCase() === cleanName ||
      pkg.files.some((f) => f.toLowerCase() === normalized || f.toLowerCase() === `${cleanName}.sty`)
  );
}

/**
 * Checks whether a package is installed (in bundle, overridden, or in persistent cache).
 */
export function isPackageInstalled(name: string): boolean {
  const pkg = getPackageByName(name);
  if (!pkg) return false;
  if (installedOverrides[pkg.name] !== undefined) {
    return installedOverrides[pkg.name];
  }
  if (pkg.source === 'bundle') {
    return true;
  }
  if (cachedPackageIds.has(pkg.id.toLowerCase()) || cachedPackageIds.has(pkg.name.toLowerCase())) {
    return true;
  }
  return pkg.isInstalled;
}

/**
 * Asynchronously checks whether a package is installed in bundle, overridden, or cached in packageCache.
 */
export async function isPackageInstalledAsync(
  name: string,
  cache: PackageCache = defaultPackageCache
): Promise<boolean> {
  const pkg = getPackageByName(name);
  if (!pkg) return false;
  if (installedOverrides[pkg.name] !== undefined) {
    return installedOverrides[pkg.name];
  }
  if (pkg.source === 'bundle') {
    return true;
  }
  if (cachedPackageIds.has(pkg.id.toLowerCase()) || cachedPackageIds.has(pkg.name.toLowerCase())) {
    return true;
  }

  for (const file of pkg.files) {
    const isCached = await cache.isPackageFileCached(file);
    if (!isCached) {
      return false;
    }
  }

  cachedPackageIds.add(pkg.id.toLowerCase());
  return true;
}

/**
 * Sets the installed status of a package and persists the change.
 */
export function setPackageInstalled(name: string, installed: boolean): void {
  loadStorageOverrides();

  const trimmed = name.trim();
  const cleanName = trimmed.endsWith('.sty') ? trimmed.slice(0, -4) : trimmed;

  const existing = getPackageByName(cleanName);
  if (existing) {
    installedOverrides[existing.name] = installed;
  } else {
    // Register dynamically
    const newPkg: LatexPackage = {
      id: cleanName.toLowerCase(),
      name: cleanName,
      description: `Custom package ${cleanName}`,
      category: 'General',
      files: [`${cleanName}.sty`],
      isInstalled: installed,
      source: 'ctan',
    };
    dynamicPackages.push(newPkg);
    installedOverrides[cleanName] = installed;
  }

  persistStorageOverrides();
}

/**
 * Returns all currently installed packages.
 */
export function getInstalledPackages(): LatexPackage[] {
  return getPackageCatalog().filter((pkg) => pkg.isInstalled);
}

/**
 * Searches and filters packages by query and category.
 */
export function searchPackages(query: string, category?: PackageCategory | 'All'): LatexPackage[] {
  const catalog = getPackageCatalog();
  const q = query.trim().toLowerCase();

  return catalog.filter((pkg) => {
    // Category match
    if (category && category !== 'All' && pkg.category !== category) {
      return false;
    }

    // Query match
    if (!q) {
      return true;
    }

    return (
      pkg.name.toLowerCase().includes(q) ||
      pkg.id.toLowerCase().includes(q) ||
      pkg.description.toLowerCase().includes(q) ||
      pkg.files.some((f) => f.toLowerCase().includes(q))
    );
  });
}

/**
 * Strips comments from a single LaTeX line, respecting escaped \%.
 */
function stripLineComment(line: string): string {
  let inEscape = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '\\') {
      inEscape = !inEscape;
    } else if (char === '%' && !inEscape) {
      return line.slice(0, i);
    } else {
      inEscape = false;
    }
  }
  return line;
}

/**
 * Inserts \usepackage[options]{packageName} cleanly into the LaTeX document preamble.
 * If the package is already imported in the preamble, the document is returned unchanged.
 */
export function insertPackageDeclaration(latexCode: string, packageName: string, options?: string): string {
  const cleanPkg = packageName.trim().replace(/\.sty$/, '');
  if (!cleanPkg) {
    return latexCode;
  }

  const cleanOpt = options?.trim();
  const optStr = cleanOpt ? cleanOpt.replace(/^\[/, '').replace(/\]$/, '').trim() : '';
  const declaration = optStr ? `\\usepackage[${optStr}]{${cleanPkg}}` : `\\usepackage{${cleanPkg}}`;

  if (!latexCode || !latexCode.trim()) {
    return `${declaration}\n`;
  }

  const eol = latexCode.includes('\r\n') ? '\r\n' : '\n';
  const lines = latexCode.split(/\r?\n/);

  // 1. Locate \begin{document}
  let docBeginLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const active = stripLineComment(lines[i]);
    if (/\\begin\s*\{\s*document\s*\}/.test(active)) {
      docBeginLineIdx = i;
      break;
    }
  }

  const preambleEndIdx = docBeginLineIdx !== -1 ? docBeginLineIdx : lines.length;

  // 2. Check if already declared in preamble
  const preambleActiveText = lines
    .slice(0, preambleEndIdx)
    .map(stripLineComment)
    .join('\n');

  const usePackageRegex = /\\usepackage(?:\s*\[[^\]]*\])?\s*\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = usePackageRegex.exec(preambleActiveText)) !== null) {
    const declaredNames = match[1].split(',').map((p) => p.trim().toLowerCase());
    if (declaredNames.includes(cleanPkg.toLowerCase())) {
      return latexCode;
    }
  }

  // 3. Find insertion point:
  // Prefer right after the last \usepackage, or after \documentclass, or before \begin{document}
  let lastPackageLineIdx = -1;
  let docClassEndLineIdx = -1;

  let inDocClass = false;
  let inUsePackage = false;

  for (let i = 0; i < preambleEndIdx; i++) {
    const active = stripLineComment(lines[i]);

    if (/\\documentclass/.test(active)) {
      inDocClass = true;
    }
    if (inDocClass) {
      if (active.includes('}')) {
        docClassEndLineIdx = i;
        inDocClass = false;
      }
    }

    if (/\\usepackage/.test(active)) {
      inUsePackage = true;
    }
    if (inUsePackage) {
      if (active.includes('}')) {
        lastPackageLineIdx = i;
        inUsePackage = false;
      }
    }
  }

  if (lastPackageLineIdx !== -1) {
    lines.splice(lastPackageLineIdx + 1, 0, declaration);
    return lines.join(eol);
  }

  if (docClassEndLineIdx !== -1) {
    let insertIdx = docClassEndLineIdx + 1;
    // Skip any immediate comments directly following documentclass block
    while (insertIdx < preambleEndIdx && lines[insertIdx].trim().startsWith('%')) {
      insertIdx++;
    }
    lines.splice(insertIdx, 0, declaration);
    return lines.join(eol);
  }

  if (docBeginLineIdx !== -1) {
    lines.splice(docBeginLineIdx, 0, declaration);
    return lines.join(eol);
  }

  // Fallback: prepend declaration
  lines.unshift(declaration);
  return lines.join(eol);
}

/**
 * Resets in-memory package manager state and clears storage.
 */
export function resetPackageManagerState(): void {
  installedOverrides = {};
  dynamicPackages = [];
  cachedPackageIds.clear();
  hasLoadedStorage = false;

  const storage = getLocalStorage();
  if (storage) {
    try {
      storage.removeItem(PACKAGE_STORAGE_KEY);
    } catch {
      // Fallback if localStorage access is restricted
    }
  }
}
