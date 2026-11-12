import React, { useState, useRef } from 'react';
import type { Project, ProjectFile, CompileStatus, LatexEngine } from '../types/workspace';
import { useThemeSafe } from '../context/ThemeContext';
import { TopMenuBar } from './TopMenuBar';
import { NewProjectModal } from './NewProjectModal';
import { scaffoldProjectFiles, type NewProjectFormValues } from '../templates/projectTemplates';
import {
  Play,
  Loader2,
  Download,
  Upload,
  Plus,
  Folder,
  Trash2,
  Edit2,
  ChevronDown,
  Check,
  Package,
} from 'lucide-react';

export interface ProjectTopBarProps {
  projects: Project[];
  activeProject: Project | null;
  compileStatus: CompileStatus;
  lastDurationMs?: number;
  selectedEngine?: LatexEngine;
  onSelectEngine?: (engine: LatexEngine) => void;
  resolvingPackage?: string | null;
  resolvedPackages?: string[];
  onSelectProject: (projectId: string) => Promise<void>;
  onCreateProject: (
    name: string,
    initialFiles?: Omit<ProjectFile, 'projectId' | 'updatedAt'>[],
    rootEntry?: string
  ) => Promise<Project>;
  onRenameProject: (name: string) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
  onExportZip: () => Promise<void>;
  onImportZip: (file: File) => Promise<void>;
  onCompile: () => Promise<void>;
  onSave?: () => void;
  onOpenSettings?: () => void;
  onCloseProject?: () => void;
  onNewFile?: () => void;
  onToggleSidebar?: () => void;
  onToggleProblems?: () => void;
  onTogglePreview?: () => void;
  onToggleAiChat?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onShortcuts?: () => void;
  onAbout?: () => void;
  onOpenMcpGuide?: () => void;
  onOpenMcp?: () => void;
}

export const ProjectTopBar: React.FC<ProjectTopBarProps> = ({
  projects,
  activeProject,
  compileStatus,
  lastDurationMs,
  selectedEngine = 'pdflatex',
  onSelectEngine,
  resolvingPackage,
  resolvedPackages,
  onSelectProject,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  onExportZip,
  onImportZip,
  onCompile,
  onSave,
  onOpenSettings,
  onCloseProject,
  onNewFile,
  onToggleSidebar,
  onToggleProblems,
  onTogglePreview,
  onToggleAiChat,
  onUndo,
  onRedo,
  onShortcuts,
  onAbout,
  onOpenMcpGuide,
  onOpenMcp,
}) => {
  const { theme } = useThemeSafe();
  const isDark = theme === 'dark';
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [engineDropdownOpen, setEngineDropdownOpen] = useState(false);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const engineDropdownRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!dropdownOpen && !engineDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (dropdownOpen && projectDropdownRef.current && !projectDropdownRef.current.contains(target)) {
        setDropdownOpen(false);
      }
      if (engineDropdownOpen && engineDropdownRef.current && !engineDropdownRef.current.contains(target)) {
        setEngineDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen, engineDropdownOpen]);

  const handleCreateNew = () => {
    setIsNewProjectModalOpen(true);
    setDropdownOpen(false);
  };

  const handleConfirmCreate = async (values: NewProjectFormValues) => {
    const { files, rootEntry } = scaffoldProjectFiles(values);
    await onCreateProject(values.name, files, rootEntry);
  };

  const handleRename = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeProject) return;
    const name = window.prompt('Rename project:', activeProject.name);
    if (name?.trim() && name !== activeProject.name) {
      await onRenameProject(name.trim());
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (window.confirm(`Delete project "${name}"? This cannot be undone.`)) {
      await onDeleteProject(id);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await onImportZip(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <header
      className={`h-10 border-b px-3 flex items-center justify-between select-none text-[13px] font-sans transition-colors relative z-40 ${
        isDark ? 'bg-[#2b2d30] border-[#1e1f22] text-[#dfe1e5]' : 'bg-[#ebecf0] border-[#d1d5db] text-[#1f2328]'
      }`}
    >
      {/* Left: IntelliJ Brand + Top Menu Bar */}
      <div className="flex-1 flex items-center justify-start min-w-max gap-1">
        {/* IntelliJ Style App Icon */}
        <button
          type="button"
          onClick={onCloseProject}
          title="Return to Welcome Screen"
          aria-label="Return to Welcome Screen"
          className="flex items-center gap-1.5 mr-1 shrink-0 cursor-pointer hover:opacity-80 transition text-left"
        >
          <img
            src="/logo.png"
            alt="Torque Logo"
            className="w-5 h-5 object-contain shrink-0"
          />
          <span
            className={`font-semibold text-xs tracking-wide hidden sm:inline shrink-0 ${
              isDark ? 'text-[#dfe1e5]' : 'text-[#1f2328]'
            }`}
          >
            Torque
          </span>
        </button>

        {/* Embedded IntelliJ TopMenuBar */}
        <TopMenuBar
          onNewFile={onNewFile}
          onNewProject={handleCreateNew}
          onImportZip={() => fileInputRef.current?.click()}
          onExportZip={onExportZip}
          onCloseProject={onCloseProject}
          onCompile={onCompile}
          onSave={onSave}
          onOpenSettings={onOpenSettings}
          onToggleSidebar={onToggleSidebar}
          onToggleProblems={onToggleProblems}
          onTogglePreview={onTogglePreview}
          onToggleAiChat={onToggleAiChat}
          onUndo={onUndo}
          onRedo={onRedo}
          onShortcuts={onShortcuts}
          onAbout={onAbout}
          onOpenMcpGuide={onOpenMcpGuide}
          onOpenMcp={onOpenMcp}
          selectedEngine={selectedEngine}
          onSelectEngine={onSelectEngine}
          className="border-b-0 h-8 px-0 shrink-0"
        />
      </div>

      {/* Center: Merged Project & Run Widget */}
      <div className="flex items-center justify-center gap-2 shrink-0 px-2">
        <div
          className={`flex items-center border rounded-md pl-1.5 pr-1 py-0.5 gap-1.5 shadow-xs ${
            isDark ? 'bg-[#1e1f22] border-[#393b40]' : 'bg-[#ffffff] border-[#d1d5db]'
          }`}
        >
          {/* Project Switcher Dropdown */}
          <div className="relative" ref={projectDropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded transition text-xs font-medium cursor-pointer ${
                isDark
                  ? 'hover:bg-[#2b2d30] text-[#dfe1e5]'
                  : 'hover:bg-[#ebecf0] text-[#1f2328]'
              }`}
              title="Switch Project"
            >
              <Folder className="w-3.5 h-3.5 text-[#3574f0] shrink-0" />
              <span className="max-w-[130px] truncate">{activeProject?.name ?? 'Select Project'}</span>
              <ChevronDown className={`w-3 h-3 shrink-0 ${isDark ? 'text-[#868a91]' : 'text-[#6c707e]'}`} />
            </button>

            {dropdownOpen && (
              <div
                className={`absolute left-0 top-full mt-1 w-64 border rounded shadow-2xl z-50 py-1 text-xs ${
                  isDark ? 'bg-[#2b2d30] border-[#4e5157] text-[#dfe1e5]' : 'bg-[#ffffff] border-[#d1d5db] text-[#1f2328]'
                }`}
              >
                <div
                  className={`px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${
                    isDark ? 'text-[#868a91]' : 'text-[#6c707e]'
                  }`}
                >
                  Projects
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {projects.map((p) => {
                    const isCur = p.id === activeProject?.id;
                    return (
                      <div
                        key={p.id}
                        onClick={() => {
                          onSelectProject(p.id);
                          setDropdownOpen(false);
                        }}
                        className={`flex items-center justify-between px-3 py-1.5 cursor-pointer ${
                          isCur
                            ? 'bg-[#3574f0]/20 font-medium ' + (isDark ? 'text-white' : 'text-[#1750eb]')
                            : isDark
                              ? 'text-[#dfe1e5] hover:bg-[#393b40]'
                              : 'text-[#1f2328] hover:bg-[#ebecf0]'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate flex-1">
                          {isCur ? (
                            <Check className="w-3 h-3 text-[#3574f0] shrink-0" />
                          ) : (
                            <div className="w-3 h-3 shrink-0" />
                          )}
                          <span className="truncate">{p.name}</span>
                        </div>
                        <div className={`flex items-center gap-1 ${isDark ? 'text-[#868a91]' : 'text-[#6c707e]'}`}>
                          {isCur && (
                            <button
                              onClick={handleRename}
                              className={`p-0.5 ${isDark ? 'hover:text-white' : 'hover:text-black'}`}
                              title="Rename"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          )}
                          {projects.length > 1 && (
                            <button
                              onClick={(e) => handleDelete(e, p.id, p.name)}
                              className="p-0.5 hover:text-[#e05555]"
                              title="Delete"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className={`border-t mt-1 pt-1 ${isDark ? 'border-[#393b40]' : 'border-[#e5e7eb]'}`}>
                  <button
                    onClick={handleCreateNew}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[#3574f0] font-medium cursor-pointer ${
                      isDark ? 'hover:bg-[#393b40]' : 'hover:bg-[#ebecf0]'
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Project...</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className={`h-3 w-px ${isDark ? 'bg-[#393b40]' : 'bg-[#d1d5db]'}`} />

          {/* Engine Selector Dropdown */}
          <div className="relative" ref={engineDropdownRef}>
            <button
              type="button"
              onClick={() => setEngineDropdownOpen(!engineDropdownOpen)}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono transition cursor-pointer ${
                isDark
                  ? 'hover:bg-[#2b2d30] text-[#dfe1e5]'
                  : 'hover:bg-[#ebecf0] text-[#1f2328]'
              }`}
              title="Select TeX Engine"
              aria-label="Select TeX Engine"
            >
              <span className="font-semibold">{selectedEngine}</span>
              <ChevronDown className="w-2.5 h-2.5 opacity-60" />
            </button>

            {engineDropdownOpen && (
              <div
                role="menu"
                aria-label="TeX Engine menu"
                className={`absolute left-0 top-full mt-1 w-44 border rounded shadow-2xl z-50 py-1 text-xs ${
                  isDark
                    ? 'bg-[#2b2d30] border-[#4e5157] text-[#dfe1e5]'
                    : 'bg-[#ffffff] border-[#d1d5db] text-[#1f2328]'
                }`}
              >
                <div
                  className={`px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                    isDark ? 'text-[#868a91]' : 'text-[#6c707e]'
                  }`}
                >
                  TeX Engine
                </div>
                {(['pdflatex', 'xelatex', 'lualatex'] as const).map((eng) => (
                  <button
                    key={eng}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onSelectEngine?.(eng);
                      setEngineDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-left cursor-pointer transition-colors ${
                      selectedEngine === eng
                        ? isDark
                          ? 'bg-[#3574f0]/20 text-white font-medium'
                          : 'bg-[#3574f0]/10 text-[#1750eb] font-medium'
                        : isDark
                          ? 'hover:bg-[#393b40] text-[#dfe1e5]'
                          : 'hover:bg-[#ebecf0] text-[#1f2328]'
                    }`}
                  >
                    <span>latexmk ({eng})</span>
                    {selectedEngine === eng && (
                      <Check className="w-3 h-3 text-[#3574f0]" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={`h-3 w-px ${isDark ? 'bg-[#393b40]' : 'bg-[#d1d5db]'}`} />

          {/* Root Entry */}
          <span
            className={`text-[11px] font-mono truncate max-w-[120px] px-1 ${
              isDark ? 'text-[#868a91]' : 'text-[#6c707e]'
            }`}
          >
            {activeProject?.rootEntry || 'main.tex'}
          </span>

          <div className={`h-3 w-px ${isDark ? 'bg-[#393b40]' : 'bg-[#d1d5db]'}`} />

          {/* Compile / Run Button */}
          <button
            onClick={onCompile}
            disabled={compileStatus === 'compiling'}
            className={`flex items-center justify-center p-1 rounded-sm transition cursor-pointer ${
              compileStatus === 'compiling'
                ? isDark ? 'text-[#868a91] cursor-not-allowed' : 'text-[#a1a3a8] cursor-not-allowed'
                : 'text-[#59a869] hover:bg-[#59a869]/20 hover:text-[#499c5a]'
            }`}
            title="Compile (Shift+F10 / Ctrl+Enter)"
            aria-label="Compile"
          >
            {compileStatus === 'compiling' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#3574f0]" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
          </button>
        </div>

        {/* Auto-Download / Package Resolution Status Pill */}
        {resolvingPackage && (
          <span
            data-testid="status-resolving-package"
            className="text-[11px] px-2 py-0.5 rounded bg-[#3574f0]/20 text-[#3574f0] font-medium border border-[#3574f0]/40 flex items-center gap-1.5 animate-pulse"
          >
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Resolving package: {resolvingPackage}...</span>
          </span>
        )}

        {!resolvingPackage && resolvedPackages && resolvedPackages.length > 0 && (
          <span
            data-testid="status-resolved-packages"
            className="text-[11px] px-2 py-0.5 rounded bg-[#3574f0]/15 text-[#3574f0] font-medium border border-[#3574f0]/30 flex items-center gap-1.5"
            title={`Downloaded: ${resolvedPackages.join(', ')}`}
          >
            <Package className="w-3 h-3 text-[#3574f0]" />
            <span>Downloaded {resolvedPackages.join(', ')}</span>
          </span>
        )}

        {/* Status Pills */}
        {lastDurationMs !== undefined && (
          <span
            className={`text-[11px] font-mono px-1 hidden md:inline ${
              isDark ? 'text-[#868a91]' : 'text-[#6c707e]'
            }`}
          >
            {lastDurationMs}ms
          </span>
        )}

        {compileStatus === 'failed' && (
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#e05555]/20 text-[#e05555] font-medium border border-[#e05555]/40">
            Build Failed
          </span>
        )}
        {compileStatus === 'warnings' && (
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#e2a53b]/20 text-[#e2a53b] font-medium border border-[#e2a53b]/40">
            Warnings
          </span>
        )}
        {compileStatus === 'spotless' && (
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#59a869]/20 text-[#59a869] font-medium border border-[#59a869]/40">
            Build Success
          </span>
        )}

        {/* IntelliJ New UI MCP Status Pill */}
        <button
          type="button"
          onClick={() => {
            if (onOpenMcpGuide) onOpenMcpGuide();
            else if (onOpenMcp) onOpenMcp();
          }}
          data-testid="mcp-status-pill"
          title="Torque Model Context Protocol (MCP) Server Active - Click for setup guide"
          aria-label="MCP Server Active"
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border transition cursor-pointer ${
            isDark
              ? 'bg-[#1e1f22] border-[#393b40] text-[#dfe1e5] hover:bg-[#393b40] hover:border-[#4e5157]'
              : 'bg-[#ffffff] border-[#d1d5db] text-[#1f2328] hover:bg-[#ebecf0]'
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#59a869] animate-pulse" />
          <span className="font-mono font-semibold">MCP</span>
        </button>
      </div>

      {/* Right: Actions */}
      <div className="flex-1 flex items-center justify-end min-w-max gap-1.5 shrink-0">
        <button
          onClick={onExportZip}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition ${
            isDark
              ? 'text-[#c2c5cc] hover:text-white hover:bg-[#393b40]'
              : 'text-[#6c707e] hover:text-[#1f2328] hover:bg-[#dfe1e5]'
          }`}
          title="Export Project (.zip)"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Export</span>
        </button>

        <label
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer transition ${
            isDark
              ? 'text-[#c2c5cc] hover:text-white hover:bg-[#393b40]'
              : 'text-[#6c707e] hover:text-[#1f2328] hover:bg-[#dfe1e5]'
          }`}
        >
          <Upload className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Import</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
      </div>

      {/* JetBrains-style New Project Modal Wizard */}
      <NewProjectModal
        isOpen={isNewProjectModalOpen}
        onClose={() => setIsNewProjectModalOpen(false)}
        onCreate={handleConfirmCreate}
      />
    </header>
  );
};
