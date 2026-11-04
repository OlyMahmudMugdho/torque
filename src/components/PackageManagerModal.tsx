'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import JSZip from 'jszip';
import {
  Package,
  X,
  Search,
  Check,
  Download,
  Trash2,
  ExternalLink,
  FileCode,
  Loader2,
  AlertCircle,
  Upload,
  Archive,
} from 'lucide-react';
import { useThemeSafe as useTheme } from '../context/ThemeContext';
import type { LatexPackage, PackageCategory } from '../packages/packageTypes';
import {
  getPackageCatalog,
  setPackageInstalled,
  markPackageCached,
  syncPackageCacheStatus,
} from '../packages/packageManager';
import {
  downloadPackage,
  inferPackageId,
  searchCtanPackages,
} from '../packages/packageDownloader';
import {
  defaultPackageCache,
  deletePackageFile,
  sanitizePackageFilename,
  savePackageFile,
} from '../storage/packageCache';

export interface PackageManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertPackage?: (packageName: string) => void;
  initialSearchQuery?: string;
}

const CATEGORIES: readonly (PackageCategory | 'All')[] = [
  'All',
  'Math',
  'Physics',
  'Graphics',
  'Layout',
  'Typography',
  'Citations',
  'Code',
  'Tables',
];

export const PackageManagerModal: React.FC<PackageManagerModalProps> = ({
  isOpen,
  onClose,
  onInsertPackage,
  initialSearchQuery = '',
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [packages, setPackages] = useState<LatexPackage[]>(() =>
    isOpen ? getPackageCatalog() : []
  );
  const [ctanPackages, setCtanPackages] = useState<LatexPackage[]>([]);
  const [ctanSearching, setCtanSearching] = useState(false);
  const [cachedPackageIds, setCachedPackageIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [selectedCategory, setSelectedCategory] = useState<PackageCategory | 'All'>('All');
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);

  const [downloadingPackageId, setDownloadingPackageId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // Sync state and query cache when modal opens or initialSearchQuery changes
  useEffect(() => {
    if (isOpen) {
      setPackages(getPackageCatalog());
      setCtanPackages([]);
      setSearchQuery(initialSearchQuery);
      setSelectedCategory('All');
      setDownloadError(null);
      setUploadProgress(null);

      let isMounted = true;
      syncPackageCacheStatus(defaultPackageCache).then((cached) => {
        if (isMounted) {
          setCachedPackageIds(cached);
          setPackages(getPackageCatalog());
        }
      });

      return () => {
        isMounted = false;
      };
    }
  }, [isOpen, initialSearchQuery]);

  // Query CTAN's official search API for packages outside the curated catalog.
  useEffect(() => {
    if (!isOpen || searchQuery.trim().length < 3) {
      setCtanPackages([]);
      setCtanSearching(false);
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      setCtanSearching(true);
      try {
        const hits = await searchCtanPackages(searchQuery);
        if (!active) return;
        const remote = hits
          .filter((hit) => hit.title.startsWith('Package '))
          .map((hit): LatexPackage => {
            const id = hit.path.split('/').pop() || hit.title.replace(/^Package /, '');
            const name = hit.title.replace(/^Package /, '');
            return {
              id,
              name,
              description: hit.text || 'Package discovered from the CTAN catalogue.',
              category: 'General',
              files: [`${id}.sty`],
              isInstalled: false,
              source: 'ctan',
              documentationUrl: `https://ctan.org/pkg/${encodeURIComponent(id)}`,
            };
          });
        setCtanPackages(remote);
      } catch {
        if (active) setCtanPackages([]);
      } finally {
        if (active) setCtanSearching(false);
      }
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [isOpen, searchQuery]);

  // Handle keyboard Escape dismissal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Filtered package list based on search query and category
  const filteredPackages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const allPackages = [...packages, ...ctanPackages.filter(
      (remote) => !packages.some((pkg) => pkg.id === remote.id)
    )];

    return allPackages.filter((pkg) => {
      if (selectedCategory !== 'All' && pkg.category !== selectedCategory) {
        return false;
      }
      if (!q) return true;

      return (
        pkg.name.toLowerCase().includes(q) ||
        pkg.id.toLowerCase().includes(q) ||
        pkg.description.toLowerCase().includes(q) ||
        pkg.files.some((f) => f.toLowerCase().includes(q))
      );
    });
  }, [packages, ctanPackages, searchQuery, selectedCategory]);

  // Determine currently selected package
  const selectedPackage = useMemo(() => {
    if (filteredPackages.length === 0) return null;
    if (selectedPackageId) {
      const found = filteredPackages.find((p) => p.id === selectedPackageId);
      if (found) return found;
    }
    return filteredPackages[0];
  }, [filteredPackages, selectedPackageId]);

  // Refresh package catalog helper
  const refreshCatalog = useCallback(() => {
    setPackages(getPackageCatalog());
  }, []);

  // Helper checking whether a package is installed or cached
  const isPackageCachedOrInstalled = useCallback(
    (pkg: LatexPackage) => {
      if (pkg.source === 'bundle') {
        return pkg.isInstalled;
      }
      return (
        cachedPackageIds.has(pkg.id.toLowerCase()) ||
        cachedPackageIds.has(pkg.name.toLowerCase()) ||
        pkg.isInstalled
      );
    },
    [cachedPackageIds]
  );

  // Toggle installation status (for bundle packages)
  const handleToggleInstall = useCallback(
    (pkg: LatexPackage) => {
      const nextStatus = !pkg.isInstalled;
      setPackageInstalled(pkg.name, nextStatus);
      refreshCatalog();
    },
    [refreshCatalog]
  );

  // Download CTAN package and store in persistent cache
  const handleDownload = useCallback(
    async (pkg: LatexPackage) => {
      setDownloadingPackageId(pkg.id);
      setDownloadProgress(`Connecting to CTAN for ${pkg.name}...`);
      setDownloadError(null);

      try {
        const result = await downloadPackage(pkg.id, (msg) => {
          setDownloadProgress(msg);
        }, { enableCtanApi: true });

        if (result.success) {
          setCachedPackageIds((prev) => {
            const next = new Set(prev);
            next.add(pkg.id.toLowerCase());
            return next;
          });
          markPackageCached(pkg.id, true);
          setPackageInstalled(pkg.name, true);
          refreshCatalog();
          setDownloadProgress(null);
        } else {
          setDownloadError(result.error || `Failed to download ${pkg.name}`);
        }
      } catch (err: any) {
        setDownloadError(err?.message || `Failed to download ${pkg.name}`);
      } finally {
        setDownloadingPackageId(null);
      }
    },
    [refreshCatalog]
  );

  const handleUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;

    setDownloadError(null);
    setUploadProgress(`Uploading ${files.length} package file${files.length === 1 ? '' : 's'}...`);

    const accepted = new Set([
      '.sty', '.cls', '.def', '.fd', '.tfm', '.tex',
      // Documented source (.dtx) and installation scripts (.ins) distributed
      // by packages such as ragged2e that ship source rather than compiled .sty.
      '.dtx', '.ins',
      // Font files uploaded alongside packages (e.g. fontawesome5 .ttf assets)
      '.otf', '.ttf', '.pfb', '.pfa', '.ttc', '.dfont',
      '.zip',
    ]);
    const uploadedIds: string[] = [];
    const rejected: string[] = [];

    /**
     * Extract a .sty file from a .dtx using docstrip guards.
     * Parses the .ins file for \file{<sty>}{\from{<dtx>}{<guard>}} patterns,
     * then extracts guard-delimited code from the .dtx into <sty>.sty.
     */
    function extractStyFromDtx(dtxText: string, insText: string): { styFilename: string; styContent: string } | null {
      // Match \file{ragged2e.sty}{\from{ragged2e.dtx}{package}}
      const fileRegex = /\\file\{([^}]+)\}\{\\from\{[^}]+\}\{([^}]+)\}\}/g;
      const matches = [...insText.matchAll(fileRegex)];
      if (matches.length === 0) return null;

      // Use the first match
      const styFilename = matches[0][1];
      const guard = matches[0][2];

      const lines = dtxText.split('\n');
      const result: string[] = [];
      let inMetaComment = false;
      let inDriver = false;

      for (const line of lines) {
        const trimmed = line.trim();

        // Docstrip meta-comment block (%\iffalse ... \%\fi)
        // Matches %% \iffalse meta-comment, %\iffalse, % \iffalse, etc.
        if (/^%+\s*\\iffalse/.test(trimmed)) {
          inMetaComment = true;
          continue;
        }
        if (/^%+\s*\\fi/.test(trimmed)) {
          inMetaComment = false;
          continue;
        }
        if (inMetaComment) continue;

        // Driver guard block (%<*driver> ... %</driver>)
        if (trimmed === '%<*driver>') {
          inDriver = true;
          continue;
        }
        if (trimmed === '%</driver>') {
          inDriver = false;
          continue;
        }
        if (inDriver) continue;

        // Block guard open/close (%<*guard> ... %</guard>)
        if (trimmed === `%<*${guard}>`) continue;
        if (trimmed === `%</${guard}>`) continue;

        // Strip inline guard prefix: %<guard>\foo -> \foo
        // Strip inline guard suffix: \foo%<guard> -> \foo
        let processed = line;
        processed = processed.replace(new RegExp(`^([^%]*?)%<${guard}\\>(.*)$`), '$1$2');
        processed = processed.replace(new RegExp(`^(.*)%<${guard}\\>([^%]*?)$`), '$1$2');

        result.push(processed);
      }

      return { styFilename, styContent: result.join('\n') };
    }

    try {
      for (const file of files) {
        const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
        if (!accepted.has(extension)) {
          rejected.push(file.name);
          continue;
        }

        // Handle zip archives containing LaTeX packages
        if (extension === '.zip') {
          const zip = await JSZip.loadAsync(await file.arrayBuffer());
          let zipFilesExtracted = 0;
          const extractedByBasename: Record<string, { data: Uint8Array; ext: string }> = {};

          for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
            if (zipEntry.dir) continue;
            if (relativePath.startsWith('__MACOSX/') || relativePath.includes('/__MACOSX/')) continue;
            if (relativePath.endsWith('.DS_Store')) continue;

            const innerExt = relativePath.slice(relativePath.lastIndexOf('.')).toLowerCase();
            if (!accepted.has(innerExt)) continue;

            const basename = relativePath.split('/').pop()!;
            const filename = sanitizePackageFilename(basename);
            const data = new Uint8Array(await zipEntry.async('uint8array'));
            await savePackageFile(filename, data, inferPackageId(filename));
            uploadedIds.push(inferPackageId(filename));
            extractedByBasename[basename] = { data, ext: innerExt };
            zipFilesExtracted++;
          }

          // Post-process: extract .sty files from .dtx using .ins instructions
          for (const [basename, { data, ext }] of Object.entries(extractedByBasename)) {
            if (ext !== '.ins') continue;

            const insText = new TextDecoder().decode(data);
            // Find corresponding .dtx file (same basename)
            const dtxBasename = basename.replace(/\.ins$/, '.dtx');
            const dtxEntry = extractedByBasename[dtxBasename];
            if (!dtxEntry) continue;

            const dtxText = new TextDecoder().decode(dtxEntry.data);
            const extracted = extractStyFromDtx(dtxText, insText);
            if (!extracted) continue;

            const styFilename = sanitizePackageFilename(extracted.styFilename);
            const styData = new TextEncoder().encode(extracted.styContent);
            await savePackageFile(styFilename, styData, inferPackageId(styFilename));
            uploadedIds.push(inferPackageId(styFilename));
          }

          if (zipFilesExtracted === 0) {
            rejected.push(`${file.name} (no valid LaTeX package files found)`);
          }
          continue;
        }

        // Handle individual package files
        const filename = sanitizePackageFilename(file.name);
        const data = new Uint8Array(await file.arrayBuffer());
        await savePackageFile(filename, data, inferPackageId(filename));
        uploadedIds.push(inferPackageId(filename));
      }

      if (uploadedIds.length > 0) {
        setCachedPackageIds((previous) => {
          const next = new Set(previous);
          uploadedIds.forEach((id) => next.add(id));
          return next;
        });
        refreshCatalog();
      }

      if (rejected.length > 0) {
        setDownloadError(`Unsupported package file${rejected.length === 1 ? '' : 's'}: ${rejected.join(', ')}`);
      } else {
        setUploadProgress(`Uploaded ${uploadedIds.length} package file${uploadedIds.length === 1 ? '' : 's'} to the local cache.`);
      }
    } catch (error: any) {
      setUploadProgress(null);
      setDownloadError(error?.message || 'Failed to upload package files');
    }
  }, [refreshCatalog]);

  // Remove CTAN package from persistent cache
  const handleRemoveFromCache = useCallback(
    async (pkg: LatexPackage) => {
      for (const file of pkg.files) {
        try {
          await deletePackageFile(file);
        } catch {
          // Continue removing remaining files
        }
      }
      setCachedPackageIds((prev) => {
        const next = new Set(prev);
        next.delete(pkg.id.toLowerCase());
        return next;
      });
      markPackageCached(pkg.id, false);
      setPackageInstalled(pkg.name, false);
      refreshCatalog();
      setDownloadError(null);
    },
    [refreshCatalog]
  );

  // Insert \usepackage and close modal
  const handleInsert = useCallback(
    (pkg: LatexPackage) => {
      if (onInsertPackage) {
        onInsertPackage(pkg.name);
      }
      onClose();
    },
    [onInsertPackage, onClose]
  );

  if (!isOpen) {
    return null;
  }

  const isCurrentPkgDownloading =
    selectedPackage !== null && downloadingPackageId === selectedPackage.id;
  const isCurrentPkgCached =
    selectedPackage !== null && isPackageCachedOrInstalled(selectedPackage);

  return (
    <div
      data-testid="package-manager-backdrop"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="LaTeX Package Manager"
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-4xl h-[620px] max-h-[90vh] rounded-lg shadow-2xl flex flex-col overflow-hidden border font-sans text-xs transition-colors duration-150 ${
          isDark
            ? 'bg-[#1e1f22] border-[#393b40] text-[#dfe1e5]'
            : 'bg-[#ffffff] border-[#d1d5db] text-[#1f2328]'
        }`}
      >
        {/* Header */}
        <div
          className={`px-5 py-3.5 border-b flex items-center justify-between shrink-0 select-none ${
            isDark ? 'bg-[#2b2d30] border-[#393b40]' : 'bg-[#f7f8fa] border-[#d1d5db]'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Package className="w-5 h-5 text-[#3574f0]" />
            <span className="font-semibold text-sm">LaTeX Package Manager</span>
          </div>

          <button
            onClick={onClose}
            aria-label="Close"
            className={`p-1.5 rounded-md transition ${
              isDark
                ? 'hover:bg-[#393b40] text-[#8c9099] hover:text-[#dfe1e5]'
                : 'hover:bg-[#e4e6eb] text-[#57606a] hover:text-[#1f2328]'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Category Filter Bar */}
        <div
          className={`px-5 py-3 border-b flex flex-col gap-2.5 shrink-0 ${
            isDark ? 'bg-[#1e1f22] border-[#393b40]' : 'bg-[#ffffff] border-[#d1d5db]'
          }`}
        >
          {/* Search Input */}
          <div className="relative flex items-center">
            <Search
              className={`w-4 h-4 absolute left-3 pointer-events-none ${
                isDark ? 'text-[#8c9099]' : 'text-[#8c9099]'
              }`}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search packages (e.g. tikz-cd, amsmath, biblatex)..."
              className={`w-full pl-9 pr-8 py-1.5 rounded text-xs outline-none border transition ${
                isDark
                  ? 'bg-[#2b2d30] border-[#393b40] text-[#dfe1e5] placeholder-[#8c9099] focus:border-[#3574f0]'
                  : 'bg-[#f7f8fa] border-[#d1d5db] text-[#1f2328] placeholder-[#6e7781] focus:border-[#3574f0]'
              }`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className={`absolute right-2 p-0.5 rounded transition ${
                  isDark
                    ? 'text-[#8c9099] hover:text-[#dfe1e5] hover:bg-[#393b40]'
                    : 'text-[#6e7781] hover:text-[#1f2328] hover:bg-[#e4e6eb]'
                }`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className={isDark ? 'text-[#8c9099]' : 'text-[#6e7781]'}>
              {ctanSearching ? 'Searching the CTAN catalogue…' : 'Search the CTAN catalogue or upload local package files.'}
            </span>
            <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium bg-[#3574f0] text-white hover:bg-[#2b62cc] shadow-xs cursor-pointer shrink-0">
              <div className="inline-flex items-center gap-1">
                <Upload className="w-3.5 h-3.5" />
                <Archive className="w-3.5 h-3.5" />
              </div>
              Upload package
              <input
                type="file"
                multiple
                accept=".sty,.cls,.def,.fd,.tfm,.tex,.dtx,.ins,.zip"
                className="sr-only"
                data-testid="package-upload-input"
                onChange={handleUpload}
              />
            </label>
          </div>

          {/* Category Filter Pills */}
          <div
            data-testid="category-filter-bar"
            role="toolbar"
            aria-label="Category filters"
            className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-thin"
          >
            {CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  data-testid={`category-pill-${cat.toLowerCase()}`}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition border ${
                    isSelected
                      ? isDark
                        ? 'bg-[#3574f0] border-[#3574f0] text-white shadow-xs'
                        : 'bg-[#3574f0] border-[#3574f0] text-white shadow-xs'
                      : isDark
                      ? 'bg-[#2b2d30] border-[#393b40] text-[#8c9099] hover:text-[#dfe1e5] hover:bg-[#323438]'
                      : 'bg-[#f7f8fa] border-[#d1d5db] text-[#57606a] hover:text-[#1f2328] hover:bg-[#eef0f3]'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* Master-Detail Split Pane */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Pane: Package List */}
          <div
            data-testid="package-list"
            className={`w-5/12 border-r flex flex-col overflow-y-auto select-none ${
              isDark ? 'border-[#393b40] bg-[#1e1f22]' : 'border-[#d1d5db] bg-[#ffffff]'
            }`}
          >
            {filteredPackages.length === 0 ? (
              <div className="p-8 text-center flex flex-col items-center justify-center my-auto">
                <Package className={`w-8 h-8 mb-2 opacity-40 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                <p className="font-medium text-xs">No packages found</p>
                <p className={`text-[11px] mt-1 ${isDark ? 'text-[#8c9099]' : 'text-[#6e7781]'}`}>
                  Try another search query or category filter.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-transparent">
                {filteredPackages.map((pkg) => {
                  const isSelected = selectedPackage?.id === pkg.id;
                  const isInstalledOrCached = isPackageCachedOrInstalled(pkg);

                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      data-testid={`package-item-${pkg.id}`}
                      aria-label={`Select ${pkg.name}`}
                      onClick={() => {
                        setSelectedPackageId(pkg.id);
                        setDownloadError(null);
                      }}
                      className={`w-full text-left p-3 transition flex flex-col gap-1 border-b ${
                        isDark ? 'border-[#2b2d30]' : 'border-[#f0f2f5]'
                      } ${
                        isSelected
                          ? isDark
                            ? 'bg-[#2e436e] text-white'
                            : 'bg-[#cfe1fd] text-[#1f2328]'
                          : isDark
                          ? 'hover:bg-[#2b2d30]/70 text-[#dfe1e5]'
                          : 'hover:bg-[#f7f8fa] text-[#1f2328]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-xs tracking-tight">{pkg.name}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${
                              isSelected
                                ? isDark
                                  ? 'bg-black/30 text-white'
                                  : 'bg-white/60 text-[#1f2328]'
                                : isDark
                                ? 'bg-[#2b2d30] text-[#8c9099]'
                                : 'bg-[#eef0f3] text-[#57606a]'
                            }`}
                          >
                            {pkg.category}
                          </span>

                          {isInstalledOrCached ? (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-500 dark:text-emerald-400">
                              <Check className="w-2.5 h-2.5" />
                              Installed
                            </span>
                          ) : (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                isSelected
                                  ? isDark
                                    ? 'bg-black/20 text-blue-200'
                                    : 'bg-white/60 text-blue-800'
                                  : isDark
                                  ? 'bg-[#2b2d30] text-[#8c9099]'
                                  : 'bg-[#f0f2f5] text-[#57606a]'
                              }`}
                            >
                              Available
                            </span>
                          )}
                        </div>
                      </div>

                      <p
                        className={`text-[11px] truncate leading-tight ${
                          isSelected
                            ? isDark
                              ? 'text-gray-200'
                              : 'text-gray-700'
                            : isDark
                            ? 'text-[#8c9099]'
                            : 'text-[#6e7781]'
                        }`}
                      >
                        {pkg.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Pane: Package Details */}
          <div
            data-testid="package-detail-pane"
            className={`w-7/12 flex flex-col justify-between overflow-y-auto p-6 ${
              isDark ? 'bg-[#1e1f22]' : 'bg-[#ffffff]'
            }`}
          >
            {selectedPackage ? (
              <div className="flex flex-col h-full justify-between">
                {/* Details Top Section */}
                <div className="flex flex-col gap-4">
                  {/* Name, Category, Version, Source */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-bold tracking-tight">{selectedPackage.name}</h2>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            isDark ? 'bg-[#2b2d30] text-[#8c9099]' : 'bg-[#eef0f3] text-[#57606a]'
                          }`}
                        >
                          {selectedPackage.category}
                        </span>
                        {selectedPackage.version && (
                          <span
                            className={`text-xs ${
                              isDark ? 'text-[#8c9099]' : 'text-[#6e7781]'
                            }`}
                          >
                            v{selectedPackage.version}
                          </span>
                        )}
                        <span
                          className={`px-1.5 py-0.5 rounded text-[11px] uppercase tracking-wide font-medium ${
                            selectedPackage.source === 'bundle'
                              ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400'
                              : 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                          }`}
                        >
                          {selectedPackage.source === 'bundle' ? 'Bundle' : 'CTAN'}
                        </span>
                      </div>
                    </div>

                    {selectedPackage.source === 'bundle' ? (
                      selectedPackage.isInstalled ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-500 dark:text-emerald-400 shrink-0">
                          <Check className="w-3.5 h-3.5" />
                          Installed
                        </span>
                      ) : (
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-medium shrink-0 ${
                            isDark ? 'bg-[#2b2d30] text-[#8c9099]' : 'bg-[#f0f2f5] text-[#57606a]'
                          }`}
                        >
                          Available
                        </span>
                      )
                    ) : isCurrentPkgCached ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-500 dark:text-emerald-400 shrink-0">
                        <Check className="w-3.5 h-3.5" />
                        Installed (Cached)
                      </span>
                    ) : (
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-medium shrink-0 ${
                          isDark ? 'bg-[#2b2d30] text-[#8c9099]' : 'bg-[#f0f2f5] text-[#57606a]'
                        }`}
                      >
                        Available (CTAN)
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  <p
                    className={`text-xs leading-relaxed ${
                      isDark ? 'text-[#dfe1e5]' : 'text-[#24292f]'
                    }`}
                  >
                    {selectedPackage.description}
                  </p>

                  {/* Files List */}
                  <div>
                    <h3
                      className={`text-[11px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5 ${
                        isDark ? 'text-[#8c9099]' : 'text-[#6e7781]'
                      }`}
                    >
                      <FileCode className="w-3.5 h-3.5" />
                      Package Files
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedPackage.files.map((file) => (
                        <span
                          key={file}
                          className={`font-mono text-[11px] px-2 py-0.5 rounded border ${
                            isDark
                              ? 'bg-[#2b2d30] border-[#393b40] text-[#dfe1e5]'
                              : 'bg-[#f7f8fa] border-[#d1d5db] text-[#1f2328]'
                          }`}
                        >
                          {file}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Documentation Link */}
                  {selectedPackage.documentationUrl && (
                    <div className="pt-1">
                      <a
                        href={selectedPackage.documentationUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1.5 text-xs text-[#3574f0] hover:underline"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        CTAN Documentation
                      </a>
                    </div>
                  )}

                  {/* Error & Progress Feedback Banner */}
                  {downloadError && (
                    <div
                      data-testid="download-error-message"
                      className="p-3 rounded text-xs flex items-center justify-between gap-2 border bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400 animate-in fade-in"
                    >
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{downloadError}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDownload(selectedPackage)}
                        className="px-2.5 py-1 rounded text-xs font-medium bg-red-600 text-white hover:bg-red-700 transition shrink-0 cursor-pointer shadow-xs"
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  {isCurrentPkgDownloading && (
                    <div
                      data-testid="download-progress-indicator"
                      className="p-2.5 rounded text-xs flex items-center gap-2.5 border bg-blue-500/10 border-blue-500/30 text-[#3574f0] dark:text-[#528bff] animate-in fade-in"
                    >
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      <span className="font-medium">
                        {downloadProgress || 'Downloading from CTAN...'}
                      </span>
                    </div>
                  )}

                  {uploadProgress && (
                    <div
                      data-testid="upload-progress-indicator"
                      className="p-2.5 rounded text-xs flex items-center gap-2.5 border bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 animate-in fade-in"
                    >
                      <Upload className="w-4 h-4 shrink-0" />
                      <span className="font-medium">{uploadProgress}</span>
                    </div>
                  )}
                </div>

                {/* Bottom Action Bar */}
                <div
                  className={`pt-5 mt-6 border-t flex items-center justify-between gap-3 ${
                    isDark ? 'border-[#393b40]' : 'border-[#d1d5db]'
                  }`}
                >
                  {/* Left Action: Install / Download / Remove from Cache */}
                  {selectedPackage.source === 'bundle' ? (
                    selectedPackage.isInstalled ? (
                      <button
                        type="button"
                        onClick={() => handleToggleInstall(selectedPackage)}
                        className={`px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition border ${
                          isDark
                            ? 'border-red-500/40 text-red-400 hover:bg-red-500/10'
                            : 'border-red-500/40 text-red-600 hover:bg-red-50'
                        }`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Uninstall
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleToggleInstall(selectedPackage)}
                        className="px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition bg-[#3574f0] text-white hover:bg-[#2b62cc] shadow-xs cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Install Package
                      </button>
                    )
                  ) : isCurrentPkgCached ? (
                    <button
                      type="button"
                      data-testid="remove-cache-button"
                      aria-label="Uninstall and remove from cache"
                      onClick={() => handleRemoveFromCache(selectedPackage)}
                      className={`px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition border ${
                        isDark
                          ? 'border-red-500/40 text-red-400 hover:bg-red-500/10'
                          : 'border-red-500/40 text-red-600 hover:bg-red-50'
                      }`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove from Cache
                    </button>
                  ) : (
                    <button
                      type="button"
                      data-testid="download-package-button"
                      aria-label={`Download and install ${selectedPackage.name}`}
                      disabled={isCurrentPkgDownloading}
                      onClick={() => handleDownload(selectedPackage)}
                      className={`px-3.5 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition ${
                        isCurrentPkgDownloading
                          ? 'bg-[#3574f0]/60 text-white cursor-not-allowed opacity-75'
                          : 'bg-[#3574f0] text-white hover:bg-[#2b62cc] shadow-xs cursor-pointer'
                      }`}
                    >
                      {isCurrentPkgDownloading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Downloading...
                        </>
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5" />
                          Download
                        </>
                      )}
                    </button>
                  )}

                  {/* Insert \usepackage Button */}
                  <button
                    type="button"
                    onClick={() => handleInsert(selectedPackage)}
                    className="px-4 py-1.5 rounded text-xs font-medium transition bg-[#3574f0] text-white hover:bg-[#2b62cc] shadow-xs ml-auto cursor-pointer"
                  >
                    Insert \usepackage
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-6">
                <Package className={`w-10 h-10 mb-3 opacity-30 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                <p className="font-semibold text-xs">No package selected</p>
                <p className={`text-[11px] mt-1 ${isDark ? 'text-[#8c9099]' : 'text-[#6e7781]'}`}>
                  Choose a package from the list to view files and actions.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
