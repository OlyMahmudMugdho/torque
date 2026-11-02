import React, { useRef } from 'react';
import type { ProjectFile } from '../types/workspace';
import { FileCode, FileText, Image, FilePlus, Upload, Trash2, Edit, CheckCircle } from 'lucide-react';

interface FileTreeSidebarProps {
  files: ProjectFile[];
  activeFilePath: string;
  rootEntry: string;
  onSelectFile: (path: string) => void;
  onCreateFile: (path: string) => Promise<void>;
  onUploadFiles: (files: FileList) => Promise<void>;
  onRenameFile: (oldPath: string, newPath: string) => Promise<void>;
  onDeleteFile: (path: string) => Promise<void>;
  onSetRootEntry: (path: string) => Promise<void>;
}

export const FileTreeSidebar: React.FC<FileTreeSidebarProps> = ({
  files,
  activeFilePath,
  rootEntry,
  onSelectFile,
  onCreateFile,
  onUploadFiles,
  onRenameFile,
  onDeleteFile,
  onSetRootEntry,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCreate = async () => {
    const path = window.prompt('Enter file path (e.g. chapters/intro.tex):');
    if (path?.trim()) {
      await onCreateFile(path.trim());
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await onUploadFiles(e.target.files);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getFileIcon = (path: string) => {
    const ext = path.split('.').pop()?.toLowerCase();
    if (ext === 'tex' || ext === 'sty' || ext === 'cls') {
      return <FileCode className="w-4 h-4 text-emerald-400 shrink-0" />;
    }
    if (ext === 'bib') {
      return <FileText className="w-4 h-4 text-amber-400 shrink-0" />;
    }
    if (['png', 'jpg', 'jpeg', 'pdf', 'eps', 'svg'].includes(ext ?? '')) {
      return <Image className="w-4 h-4 text-sky-400 shrink-0" />;
    }
    return <FileText className="w-4 h-4 text-zinc-400 shrink-0" />;
  };

  // Sort files with rootEntry first, then alphabetically
  const sortedFiles = [...files].sort((a, b) => {
    if (a.path === rootEntry) return -1;
    if (b.path === rootEntry) return 1;
    return a.path.localeCompare(b.path);
  });

  return (
    <aside className="w-full h-full bg-zinc-950 border-r border-zinc-800 flex flex-col select-none">
      <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Project Files</span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCreate}
            className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded"
            title="New File"
          >
            <FilePlus className="w-4 h-4" />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded"
            title="Upload Files"
          >
            <Upload className="w-4 h-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleUpload}
            className="hidden"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {sortedFiles.map((file) => {
          const isActive = file.path === activeFilePath;
          const isRoot = file.path === rootEntry;
          const isTex = file.path.endsWith('.tex');

          return (
            <div
              key={file.path}
              onClick={() => onSelectFile(file.path)}
              className={`group flex items-center justify-between px-3 py-1.5 cursor-pointer text-sm transition ${
                isActive
                  ? 'bg-zinc-800/90 text-white font-medium border-l-2 border-indigo-500'
                  : 'text-zinc-300 hover:bg-zinc-900'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                {getFileIcon(file.path)}
                <span className="truncate">{file.path}</span>
                {isRoot && (
                  <span className="text-[10px] uppercase font-bold bg-indigo-900/80 text-indigo-300 px-1 rounded">
                    ROOT
                  </span>
                )}
              </div>

              {/* Action Buttons on Hover */}
              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-zinc-400">
                {isTex && !isRoot && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetRootEntry(file.path);
                    }}
                    className="p-1 hover:text-indigo-400"
                    title="Set as Root Entry"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                  </button>
                )}

                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    const newPath = window.prompt('Rename file path:', file.path);
                    if (newPath?.trim() && newPath !== file.path) {
                      await onRenameFile(file.path, newPath.trim());
                    }
                  }}
                  className="p-1 hover:text-white"
                  title="Rename"
                >
                  <Edit className="w-3.5 h-3.5" />
                </button>

                {!isRoot && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (window.confirm(`Delete ${file.path}?`)) {
                        await onDeleteFile(file.path);
                      }
                    }}
                    className="p-1 hover:text-red-400"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
};
