'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Package,
  X,
  Search,
  Check,
  ExternalLink,
  FileCode,
} from 'lucide-react';
import { useThemeSafe as useTheme } from '../context/ThemeContext';
import type { LatexPackage, PackageCategory } from '../packages/packageTypes';
import { getPackageCatalog } from '../packages/packageManager';

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
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [selectedCategory, setSelectedCategory] = useState<PackageCategory | 'All'>('All');
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);

  // Sync state when modal opens or initialSearchQuery changes
  useEffect(() => {
    if (isOpen) {
      setPackages(getPackageCatalog());
      setSearchQuery(initialSearchQuery);
      setSelectedCategory('All');
    }
  }, [isOpen, initialSearchQuery]);

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

    return packages.filter((pkg) => {
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
  }, [packages, searchQuery, selectedCategory]);

  // Determine currently selected package
  const selectedPackage = useMemo(() => {
    if (filteredPackages.length === 0) return null;
    if (selectedPackageId) {
      const found = filteredPackages.find((p) => p.id === selectedPackageId);
      if (found) return found;
    }
    return filteredPackages[0];
  }, [filteredPackages, selectedPackageId]);

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

          <div className="flex items-center justify-between gap-3 text-[11px]">
            <span className={isDark ? 'text-[#8c9099]' : 'text-[#6e7781]'}>
              TeX Live native package catalog. Missing packages are automatically resolved and downloaded upon compilation.
            </span>
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
                      ? 'bg-[#3574f0] border-[#3574f0] text-white shadow-xs'
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

                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      data-testid={`package-item-${pkg.id}`}
                      aria-label={`Select ${pkg.name}`}
                      onClick={() => {
                        setSelectedPackageId(pkg.id);
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

                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-500 dark:text-emerald-400">
                            <Check className="w-2.5 h-2.5" />
                            TeX Live
                          </span>
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
                        <span className="px-1.5 py-0.5 rounded text-[11px] uppercase tracking-wide font-medium bg-blue-500/15 text-blue-600 dark:text-blue-400">
                          TeX Live
                        </span>
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-500 dark:text-emerald-400 shrink-0">
                      <Check className="w-3.5 h-3.5" />
                      TeX Live Package
                    </span>
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
                </div>

                {/* Bottom Action Bar */}
                <div
                  className={`pt-5 mt-6 border-t flex items-center justify-between gap-3 ${
                    isDark ? 'border-[#393b40]' : 'border-[#d1d5db]'
                  }`}
                >
                  <span className={`text-[11px] ${isDark ? 'text-[#8c9099]' : 'text-[#6e7781]'}`}>
                    Auto-resolves from CTAN if not present locally
                  </span>

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
