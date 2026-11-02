import React, { useState, useRef } from 'react';
import type { Project, CompileStatus } from '../types/workspace';
import { Play, Loader2, Download, Upload, Plus, Folder, Trash2, Edit2 } from 'lucide-react';

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
    <header className="h-14 border-b border-zinc-800 bg-zinc-950 px-4 flex items-center justify-between text-zinc-100 select-none">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 font-semibold text-lg tracking-tight text-white">
          <span className="bg-indigo-600 text-white p-1 rounded font-bold text-xs">TEX</span>
          <span>Prism LaTeX</span>
        </div>

        {/* Project Switcher */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-zinc-800 border border-zinc-800 text-sm font-medium transition"
          >
            <Folder className="w-4 h-4 text-indigo-400" />
            <span className="max-w-[160px] truncate">{activeProject?.name ?? 'No Project'}</span>
          </button>

          {dropdownOpen && (
            <div className="absolute left-0 mt-2 w-64 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 py-1.5 text-sm">
              <div className="px-3 py-1 text-xs text-zinc-400 uppercase font-semibold">Your Projects</div>
              <div className="max-h-48 overflow-y-auto">
                {projects.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => {
                      onSelectProject(p.id);
                      setDropdownOpen(false);
                    }}
                    className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-zinc-800 ${
                      p.id === activeProject?.id ? 'bg-zinc-800/80 font-medium text-white' : 'text-zinc-300'
                    }`}
                  >
                    <span className="truncate flex-1">{p.name}</span>
                    <div className="flex items-center gap-1 opacity-60 hover:opacity-100">
                      {p.id === activeProject?.id && (
                        <button onClick={handleRename} className="p-1 hover:text-white" title="Rename">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {projects.length > 1 && (
                        <button
                          onClick={(e) => handleDelete(e, p.id, p.name)}
                          className="p-1 hover:text-red-400"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-zinc-800 mt-1 pt-1">
                <button
                  onClick={handleCreateNew}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800 text-indigo-400"
                >
                  <Plus className="w-4 h-4" />
                  <span>New Project</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Center Actions: Compile Button */}
      <div className="flex items-center gap-3">
        <button
          onClick={onCompile}
          disabled={compileStatus === 'compiling'}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-md font-medium text-sm transition shadow-sm ${
            compileStatus === 'compiling'
              ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
          }`}
          title="Compile LaTeX (Ctrl+Enter / Cmd+Enter)"
        >
          {compileStatus === 'compiling' ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Compiling...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              <span>Compile</span>
            </>
          )}
        </button>

        {lastDurationMs !== undefined && (
          <span className="text-xs text-zinc-400 font-mono">
            {lastDurationMs}ms
          </span>
        )}

        {compileStatus === 'failed' && (
          <span className="text-xs px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-800">
            Error
          </span>
        )}
        {compileStatus === 'warnings' && (
          <span className="text-xs px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800">
            Warnings
          </span>
        )}
        {compileStatus === 'spotless' && (
          <span className="text-xs px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
            Clean
          </span>
        )}
      </div>

      {/* Right Actions: Export / Import Zip */}
      <div className="flex items-center gap-2">
        <button
          onClick={onExportZip}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-zinc-800 hover:bg-zinc-800 text-xs text-zinc-300 font-medium transition"
          title="Export Project as .zip"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export .zip</span>
        </button>

        <label className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-zinc-800 hover:bg-zinc-800 text-xs text-zinc-300 font-medium cursor-pointer transition">
          <Upload className="w-3.5 h-3.5" />
          <span>Import .zip</span>
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
