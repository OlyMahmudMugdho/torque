import React, { useRef } from 'react';
import type { ProjectFile } from '../types/workspace';
import { FileText, Image, FilePlus, Upload, Trash2, Edit, CheckCircle, ChevronDown, Folder } from 'lucide-react';

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
      return (
        <span className="w-4 h-4 flex items-center justify-center font-bold text-[10px] text-[#59a869] bg-[#59a869]/10 rounded border border-[#59a869]/30 shrink-0">
          T
        </span>
      );
    }
    if (ext === 'bib') {
      return (
        <span className="w-4 h-4 flex items-center justify-center font-bold text-[10px] text-[#e2a53b] bg-[#e2a53b]/10 rounded border border-[#e2a53b]/30 shrink-0">
          B
        </span>
      );
    }
    if (['png', 'jpg', 'jpeg', 'pdf', 'eps', 'svg'].includes(ext ?? '')) {
      return <Image className="w-4 h-4 text-[#3574f0] shrink-0" />;
    }
    return <FileText className="w-4 h-4 text-[#868a91] shrink-0" />;
  };

  const sortedFiles = [...files].sort((a, b) => {
    if (a.path === rootEntry) return -1;
    if (b.path === rootEntry) return 1;
    return a.path.localeCompare(b.path);
  });

  return (
    <aside className="w-full h-full bg-[#2b2d30] border-r border-[#1e1f22] flex flex-col select-none text-[13px] text-[#dfe1e5] font-sans">
      {/* IntelliJ Tool Window Header */}
      <div className="h-8 px-3 border-b border-[#1e1f22] flex items-center justify-between text-xs text-[#dfe1e5] bg-[#2b2d30]">
        <div className="flex items-center gap-1.5 font-semibold text-[#dfe1e5]">
          <Folder className="w-3.5 h-3.5 text-[#3574f0]" />
          <span>Project</span>
        </div>

        <div className="flex items-center gap-1 text-[#868a91]">
          <button
            onClick={handleCreate}
            className="p-1 hover:bg-[#393b40] hover:text-[#dfe1e5] rounded transition"
            title="New File (Alt+Insert)"
          >
            <FilePlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1 hover:bg-[#393b40] hover:text-[#dfe1e5] rounded transition"
            title="Upload Files"
          >
            <Upload className="w-3.5 h-3.5" />
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

      {/* Project Tree Items */}
      <div className="flex-1 overflow-y-auto py-1">
        {/* Root Directory Row */}
        <div className="px-2 py-1 flex items-center gap-1.5 text-xs text-[#868a91] font-medium">
          <ChevronDown className="w-3.5 h-3.5 text-[#868a91]" />
          <Folder className="w-3.5 h-3.5 text-[#e2a53b]" />
          <span className="text-[#dfe1e5]">project-root</span>
        </div>

        {/* Files */}
        <div className="pl-3">
          {sortedFiles.map((file) => {
            const isActive = file.path === activeFilePath;
            const isRoot = file.path === rootEntry;
            const isTex = file.path.endsWith('.tex');

            return (
              <div
                key={file.path}
                onClick={() => onSelectFile(file.path)}
                className={`group flex items-center justify-between pl-3 pr-2 py-1 cursor-pointer transition text-xs border-l-2 ${
                  isActive
                    ? 'bg-[#2e436e]/60 text-white font-medium border-[#3574f0]'
                    : 'border-transparent text-[#dfe1e5] hover:bg-[#313438]'
                }`}
              >
                <div className="flex items-center gap-2 truncate flex-1">
                  {getFileIcon(file.path)}
                  <span className="truncate">{file.path}</span>
                  {isRoot && (
                    <span className="text-[9px] uppercase font-bold bg-[#3574f0]/20 text-[#3574f0] px-1 rounded border border-[#3574f0]/40">
                      ROOT
                    </span>
                  )}
                </div>

                {/* IntelliJ Quick Actions */}
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[#868a91]">
                  {isTex && !isRoot && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSetRootEntry(file.path);
                      }}
                      className="p-0.5 hover:text-[#3574f0]"
                      title="Set as Root Entry"
                    >
                      <CheckCircle className="w-3 h-3" />
                    </button>
                  )}

                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      const newPath = window.prompt('Rename file path (Shift+F6):', file.path);
                      if (newPath?.trim() && newPath !== file.path) {
                        await onRenameFile(file.path, newPath.trim());
                      }
                    }}
                    className="p-0.5 hover:text-white"
                    title="Rename"
                  >
                    <Edit className="w-3 h-3" />
                  </button>

                  {!isRoot && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (window.confirm(`Delete ${file.path}?`)) {
                          await onDeleteFile(file.path);
                        }
                      }}
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
      </div>
    </aside>
  );
};
