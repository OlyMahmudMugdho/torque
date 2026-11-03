import React, { useState, useRef } from 'react';
import type { Project, CompileStatus } from '../types/workspace';
import { useThemeSafe } from '../context/ThemeContext';
import { TopMenuBar } from './TopMenuBar';
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
  Sun,
  Moon,
} from 'lucide-react';

export interface ProjectTopBarProps {
  projects: Project[];
  activeProject: Project | null;
  compileStatus: CompileStatus;
  lastDurationMs?: number;
  onSelectProject: (projectId: string) => Promise<void>;
  onCreateProject: (name: string) => Promise<Project>;
  onRenameProject: (name: string) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
  onExportZip: () => Promise<void>;
  onImportZip: (file: File) => Promise<void>;
  onCompile: () => Promise<void>;
  onCloseProject?: () => void;
  onNewFile?: () => void;
  onToggleSidebar?: () => void;
  onToggleProblems?: () => void;
  onTogglePreview?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onShortcuts?: () => void;
  onAbout?: () => void;
  onOpenPackageManager?: () => void;
}

export const ProjectTopBar: React.FC<ProjectTopBarProps> = ({
  projects,
  activeProject,
  compileStatus,
  lastDurationMs,
  onSelectProject,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  onExportZip,
  onImportZip,
  onCompile,
  onCloseProject,
  onNewFile,
  onToggleSidebar,
  onToggleProblems,
  onTogglePreview,
  onUndo,
  onRedo,
  onShortcuts,
  onAbout,
  onOpenPackageManager,
}) => {
  const { theme, toggleTheme } = useThemeSafe();
  const isDark = theme === 'dark';
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCreateNew = async () => {
    const name = window.prompt('Enter new project name:', 'Untitled Project');
    if (name?.trim()) {
      await onCreateProject(name.trim());
      setDropdownOpen(false);
    }
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
      className={`h-10 border-b px-3 flex items-center justify-between select-none text-[13px] font-sans transition-colors ${
        isDark ? 'bg-[#2b2d30] border-[#1e1f22] text-[#dfe1e5]' : 'bg-[#ebecf0] border-[#d1d5db] text-[#1f2328]'
      }`}
    >
      {/* Left: IntelliJ Brand + Top Menu Bar + Project Selector */}
      <div className="flex items-center gap-1.5 min-w-0">
        {/* IntelliJ Style App Icon */}
        <button
          type="button"
          onClick={onCloseProject}
          title="Return to Welcome Screen"
          aria-label="Return to Welcome Screen"
          className="flex items-center gap-1.5 mr-1 shrink-0 cursor-pointer hover:opacity-80 transition text-left"
        >
          <div className="w-5 h-5 bg-gradient-to-tr from-[#3574f0] via-[#59a869] to-[#e2a53b] rounded flex items-center justify-center shadow-sm">
            <span className="text-[10px] font-black text-black tracking-tighter leading-none">TQ</span>
          </div>
          <span
            className={`font-semibold text-xs tracking-wide hidden sm:inline ${
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
          onToggleSidebar={onToggleSidebar}
          onToggleProblems={onToggleProblems}
          onTogglePreview={onTogglePreview}
          onUndo={onUndo}
          onRedo={onRedo}
          onShortcuts={onShortcuts}
          onAbout={onAbout}
          onOpenPackageManager={onOpenPackageManager}
          className="border-b-0 h-8 px-0"
        />

        <div className={`h-4 w-px mx-1 shrink-0 ${isDark ? 'bg-[#393b40]' : 'bg-[#d1d5db]'}`} />

        {/* Project Dropdown */}
        <div className="relative shrink-0">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded border transition text-xs font-medium ${
              isDark
                ? 'hover:bg-[#393b40] border-transparent hover:border-[#4e5157] text-[#dfe1e5]'
                : 'hover:bg-[#dfe1e5] border-transparent hover:border-[#c9ccd6] text-[#1f2328]'
            }`}
          >
            <Folder className="w-3.5 h-3.5 text-[#3574f0]" />
            <span className="max-w-[120px] truncate">{activeProject?.name ?? 'Select Project'}</span>
            <ChevronDown className={`w-3 h-3 ${isDark ? 'text-[#868a91]' : 'text-[#6c707e]'}`} />
          </button>

          {dropdownOpen && (
            <div
              className={`absolute left-0 mt-1 w-64 border rounded shadow-2xl z-50 py-1 text-xs ${
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
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[#3574f0] font-medium ${
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
      </div>

      {/* Center: IntelliJ Iconic Run Widget */}
      <div className="flex items-center gap-2 shrink-0">
        <div
          className={`flex items-center border rounded-md pl-2 pr-1 py-0.5 gap-2 ${
            isDark ? 'bg-[#1e1f22] border-[#393b40]' : 'bg-[#ffffff] border-[#d1d5db]'
          }`}
        >
          <span
            className={`text-[11px] font-mono truncate max-w-[120px] ${
              isDark ? 'text-[#868a91]' : 'text-[#6c707e]'
            }`}
          >
            {activeProject?.rootEntry || 'main.tex'}
          </span>

          <div className={`h-3 w-px ${isDark ? 'bg-[#393b40]' : 'bg-[#d1d5db]'}`} />

          <button
            onClick={onCompile}
            disabled={compileStatus === 'compiling'}
            className={`flex items-center justify-center p-1 rounded-sm transition ${
              compileStatus === 'compiling'
                ? isDark ? 'text-[#868a91] cursor-not-allowed' : 'text-[#a1a3a8] cursor-not-allowed'
                : 'text-[#59a869] hover:bg-[#59a869]/20 hover:text-[#499c5a]'
            }`}
            title="Compile (Shift+F10 / Ctrl+Enter)"
          >
            {compileStatus === 'compiling' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#3574f0]" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
          </button>
        </div>

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
        {compileStatus === 'errors' && (
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#e2a53b]/20 text-[#e2a53b] font-medium border border-[#e2a53b]/40">
            Built with Warnings
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
      </div>

      {/* Right: Theme Toggle & Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Quick Theme Toggle Button */}
        <button
          type="button"
          onClick={toggleTheme}
          className={`p-1.5 rounded transition ${
            isDark
              ? 'text-[#dfe1e5] hover:bg-[#393b40]'
              : 'text-[#1f2328] hover:bg-[#dfe1e5]'
          }`}
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          aria-label="Toggle theme"
        >
          {isDark ? (
            <Sun className="w-3.5 h-3.5 text-[#e2a53b]" />
          ) : (
            <Moon className="w-3.5 h-3.5 text-[#3574f0]" />
          )}
        </button>

        <button
          onClick={onExportZip}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition ${
            isDark
              ? 'text-[#868a91] hover:text-[#dfe1e5] hover:bg-[#393b40]'
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
              ? 'text-[#868a91] hover:text-[#dfe1e5] hover:bg-[#393b40]'
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
    </header>
  );
};
