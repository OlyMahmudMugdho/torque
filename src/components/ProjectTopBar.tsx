import React, { useState, useRef } from 'react';
import type { Project, CompileStatus } from '../types/workspace';
import { Play, Loader2, Download, Upload, Plus, Folder, Trash2, Edit2, ChevronDown, Check } from 'lucide-react';

interface ProjectTopBarProps {
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
}) => {
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
    <header className="h-10 bg-[#2b2d30] border-b border-[#1e1f22] px-3 flex items-center justify-between text-[#dfe1e5] select-none text-[13px] font-sans">
      {/* Left: IntelliJ Brand + Project Selector */}
      <div className="flex items-center gap-2">
        {/* IntelliJ Style App Icon */}
        <div className="flex items-center gap-1.5 mr-2">
          <div className="w-5 h-5 bg-gradient-to-tr from-[#3574f0] via-[#59a869] to-[#e2a53b] rounded flex items-center justify-center shadow-sm">
            <span className="text-[10px] font-black text-black tracking-tighter leading-none">TQ</span>
          </div>
          <span className="font-semibold text-xs tracking-wide text-[#dfe1e5]">Torque</span>
        </div>

        {/* Project Dropdown (IntelliJ Style Combo Box) */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-[#393b40] border border-transparent hover:border-[#4e5157] text-[#dfe1e5] transition text-xs font-medium"
          >
            <Folder className="w-3.5 h-3.5 text-[#3574f0]" />
            <span className="max-w-[140px] truncate">{activeProject?.name ?? 'Select Project'}</span>
            <ChevronDown className="w-3 h-3 text-[#868a91]" />
          </button>

          {dropdownOpen && (
            <div className="absolute left-0 mt-1 w-64 bg-[#2b2d30] border border-[#4e5157] rounded shadow-2xl z-50 py-1 text-xs text-[#dfe1e5]">
              <div className="px-3 py-1 text-[11px] text-[#868a91] font-semibold uppercase tracking-wider">
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
                      className={`flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-[#393b40] ${
                        isCur ? 'bg-[#3574f0]/20 text-white font-medium' : 'text-[#dfe1e5]'
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
                      <div className="flex items-center gap-1 text-[#868a91]">
                        {isCur && (
                          <button onClick={handleRename} className="p-0.5 hover:text-white" title="Rename">
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

              <div className="border-t border-[#393b40] mt-1 pt-1">
                <button
                  onClick={handleCreateNew}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[#393b40] text-[#3574f0] font-medium"
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
      <div className="flex items-center gap-2">
        <div className="flex items-center bg-[#1e1f22] border border-[#393b40] rounded-md pl-2 pr-1 py-0.5 gap-2">
          <span className="text-[11px] font-mono text-[#868a91] truncate max-w-[120px]">
            {activeProject?.rootEntry || 'main.tex'}
          </span>

          <div className="h-3 w-px bg-[#393b40]" />

          <button
            onClick={onCompile}
            disabled={compileStatus === 'compiling'}
            className={`flex items-center justify-center p-1 rounded-sm transition ${
              compileStatus === 'compiling'
                ? 'text-[#868a91] cursor-not-allowed'
                : 'text-[#59a869] hover:bg-[#59a869]/20 hover:text-[#6ec27e]'
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
          <span className="text-[11px] text-[#868a91] font-mono px-1">
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
      </div>

      {/* Right: Actions & Tools */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onExportZip}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-[#868a91] hover:text-[#dfe1e5] hover:bg-[#393b40] transition"
          title="Export Project (.zip)"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Export</span>
        </button>

        <label className="flex items-center gap-1 px-2 py-1 rounded text-xs text-[#868a91] hover:text-[#dfe1e5] hover:bg-[#393b40] cursor-pointer transition">
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
