import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ProjectFile } from '../types/workspace';
import { useThemeSafe } from '../context/ThemeContext';
import { FOLDER_MARKER, isFolderMarker } from '../storage/pathUtils';
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  Crosshair,
  File as FileIcon,
  FileImage,
  FileText,
  Folder,
  FolderOpen,
  Plus,
  Upload,
} from 'lucide-react';

export interface FileTreeSidebarProps {
  files: ProjectFile[];
  activeFilePath: string;
  rootEntry: string;
  projectName?: string;
  onSelectFile: (path: string) => void;
  onCreateFile: (path: string) => Promise<void>;
  onCreateFolder?: (path: string) => Promise<void>;
  onUploadFiles: (files: FileList) => Promise<void>;
  onRenameFile: (oldPath: string, newPath: string) => Promise<void>;
  onDeleteFile: (path: string) => Promise<void>;
  onSetRootEntry: (path: string) => Promise<void>;
  /** External request (e.g. File ▸ New) to open the New File/Directory popup. */
  createRequest?: { kind: 'file' | 'folder'; nonce: number } | null;
}

export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children: TreeNode[];
}

/** Build a hierarchical tree: folders first, then files, each alphabetical. `.keep` markers are hidden. */
export function buildFileTree(files: { path: string }[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', type: 'folder', children: [] };
  const ensureFolder = (parent: TreeNode, name: string, path: string): TreeNode => {
    let node = parent.children.find((c) => c.type === 'folder' && c.name === name);
    if (!node) {
      node = { name, path, type: 'folder', children: [] };
      parent.children.push(node);
    }
    return node;
  };
  for (const f of files) {
    const parts = f.path.split('/').filter(Boolean);
    if (parts.length === 0) continue;
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      cur = ensureFolder(cur, parts[i], parts.slice(0, i + 1).join('/'));
    }
    if (isFolderMarker(f.path)) continue;
    cur.children.push({ name: parts[parts.length - 1], path: f.path, type: 'file', children: [] });
  }
  const sort = (n: TreeNode) => {
    n.children.sort((a, b) =>
      a.type !== b.type
        ? a.type === 'folder'
          ? -1
          : 1
        : a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );
    n.children.forEach(sort);
  };
  sort(root);
  return root.children;
}

const ancestorsOf = (path: string): string[] => {
  const parts = path.split('/');
  const out: string[] = [];
  for (let i = 1; i < parts.length; i++) out.push(parts.slice(0, i).join('/'));
  return out;
};

const parentOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

interface MenuItem {
  label: string;
  shortcut?: string;
  onClick?: () => void;
  submenu?: MenuItem[];
  separator?: boolean;
}

interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

export const FileTreeSidebar: React.FC<FileTreeSidebarProps> = ({
  files,
  activeFilePath,
  rootEntry,
  projectName,
  onSelectFile,
  onCreateFile,
  onCreateFolder,
  onUploadFiles,
  onRenameFile,
  onDeleteFile,
  onSetRootEntry,
  createRequest,
}) => {
  const { theme } = useThemeSafe();
  const isDark = theme === 'dark';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);

  const tree = useMemo(() => buildFileTree(files), [files]);
  const allPaths = useMemo(() => {
    const set = new Set<string>();
    for (const f of files) {
      if (!isFolderMarker(f.path)) set.add(f.path);
      ancestorsOf(f.path).forEach((a) => set.add(a));
    }
    return set;
  }, [files]);

  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(ancestorsOf(activeFilePath))
  );
  const [selected, setSelected] = useState<string>(activeFilePath);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [openSub, setOpenSub] = useState<number | null>(null);
  const [newItem, setNewItem] = useState<{ kind: 'file' | 'folder'; parent: string } | null>(null);
  const [newValue, setNewValue] = useState('');
  const [newError, setNewError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);

  // Expand the path to the active file whenever it changes (Locate).
  useEffect(() => {
    if (!activeFilePath) return;
    setExpanded((prev) => {
      const missing = ancestorsOf(activeFilePath).filter((a) => !prev.has(a));
      return missing.length === 0 ? prev : new Set([...prev, ...missing]);
    });
    setSelected(activeFilePath);
  }, [activeFilePath]);

  const isFileAt = (p: string) => files.some((f) => f.path === p);
  const isFolderPath = (p: string) => p !== '' && allPaths.has(p) && !isFileAt(p);

  const selectedParentDir = () => {
    if (!selected) return '';
    return isFolderPath(selected) ? selected : parentOf(selected);
  };

  const openNew = (kind: 'file' | 'folder', parent: string) => {
    setMenu(null);
    setNewValue('');
    setNewError(null);
    setNewItem({ kind, parent });
  };

  const lastNonce = useRef<number | null>(null);
  useEffect(() => {
    if (createRequest && createRequest.nonce !== lastNonce.current) {
      lastNonce.current = createRequest.nonce;
      openNew(createRequest.kind, selectedParentDir());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createRequest]);

  const validateName = (raw: string, parent: string, ignorePath?: string): string | null => {
    const name = raw.trim();
    if (!name) return 'Name must not be empty';
    if (/[\\:*?"<>|]/.test(name)) return 'Name contains invalid characters';
    const segs = name.split('/').filter((s) => s !== '');
    if (segs.length === 0) return 'Name must not be empty';
    if (segs.some((s) => s === '.' || s === '..')) return 'Path must not contain "." or ".."';
    if (segs.some((s) => s === FOLDER_MARKER)) return `"${FOLDER_MARKER}" is a reserved name`;
    const full = (parent ? parent + '/' : '') + segs.join('/');
    if (full !== ignorePath && allPaths.has(full)) return `"${full}" already exists`;
    const parts = full.split('/');
    for (let i = 1; i < parts.length; i++) {
      const anc = parts.slice(0, i).join('/');
      if (isFileAt(anc)) return `"${anc}" is a file`;
    }
    return null;
  };

  const submitNew = async () => {
    if (!newItem) return;
    const err = validateName(newValue, newItem.parent);
    if (err) {
      setNewError(err);
      return;
    }
    const segs = newValue.trim().split('/').filter(Boolean);
    const full = (newItem.parent ? newItem.parent + '/' : '') + segs.join('/');
    try {
      if (newItem.kind === 'folder') {
        await onCreateFolder?.(full);
        setExpanded((prev) => new Set([...prev, full, ...ancestorsOf(full)]));
      } else {
        await onCreateFile(full);
        setExpanded((prev) => new Set([...prev, ...ancestorsOf(full)]));
      }
      setSelected(full);
      setNewItem(null);
    } catch (e) {
      setNewError(e instanceof Error ? e.message : String(e));
    }
  };

  const startRename = (path: string) => {
    setMenu(null);
    setRenaming(path);
    setRenameValue(path.split('/').pop() ?? path);
    setRenameError(null);
  };

  const submitRename = async () => {
    if (!renaming) return;
    const parent = parentOf(renaming);
    const err = validateName(renameValue, parent, renaming);
    if (err) {
      setRenameError(err);
      return;
    }
    const segs = renameValue.trim().split('/').filter(Boolean);
    const full = (parent ? parent + '/' : '') + segs.join('/');
    if (full === renaming) {
      setRenaming(null);
      return;
    }
    try {
      await onRenameFile(renaming, full);
      setExpanded((prev) => {
        const next = new Set<string>();
        for (const p of prev) {
          next.add(p === renaming ? full : p.startsWith(renaming + '/') ? full + p.slice(renaming.length) : p);
        }
        return next;
      });
      setSelected(full);
      setRenaming(null);
    } catch (e) {
      setRenameError(e instanceof Error ? e.message : String(e));
    }
  };

  const deleteItem = async (path: string) => {
    setMenu(null);
    const kind = isFolderPath(path) ? 'directory' : 'file';
    if (window.confirm(`Delete ${kind} "${path}"?`)) {
      await onDeleteFile(path);
    }
  };

  const collapseAll = () => setExpanded(new Set());
  const locate = () => {
    setExpanded((prev) => new Set([...prev, ...ancestorsOf(activeFilePath)]));
    setSelected(activeFilePath);
  };

  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const rows = useMemo(() => {
    const out: { node: TreeNode; depth: number }[] = [];
    const walk = (nodes: TreeNode[], depth: number) => {
      for (const n of nodes) {
        out.push({ node: n, depth });
        if (n.type === 'folder' && expanded.has(n.path)) walk(n.children, depth + 1);
      }
    };
    walk(tree, 0);
    return out;
  }, [tree, expanded]);

  const newMenuItems = (parent: string): MenuItem[] => [
    { label: 'File', onClick: () => openNew('file', parent) },
    { label: 'Directory', onClick: () => openNew('folder', parent) },
  ];

  const contextItems = (path: string | null): MenuItem[] => {
    const parent = path === null ? '' : isFolderPath(path) ? path : parentOf(path);
    const items: MenuItem[] = [
      { label: 'New', submenu: newMenuItems(parent), shortcut: 'Alt+Insert' },
    ];
    if (path !== null) {
      items.push({ separator: true, label: '' });
      if (path.endsWith('.tex') && isFileAt(path) && path !== rootEntry) {
        items.push({
          label: 'Set as Root File',
          onClick: () => {
            setMenu(null);
            void onSetRootEntry(path);
          },
        });
      }
      items.push({ label: 'Rename…', shortcut: 'F2', onClick: () => startRename(path) });
      items.push({ label: 'Delete…', shortcut: 'Del', onClick: () => void deleteItem(path) });
    }
    items.push({ separator: true, label: '' });
    items.push({
      label: 'Collapse All',
      onClick: () => {
        setMenu(null);
        collapseAll();
      },
    });
    return items;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (renaming || newItem) return;
    const idx = rows.findIndex((r) => r.node.path === selected);
    const cur = idx >= 0 ? rows[idx].node : null;
    if (e.altKey && e.key === 'Insert') {
      e.preventDefault();
      const rect = treeRef.current?.getBoundingClientRect();
      setOpenSub(null);
      setMenu({
        x: (rect?.left ?? 0) + 24,
        y: (rect?.top ?? 0) + 8,
        items: newMenuItems(selectedParentDir()),
      });
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (idx < rows.length - 1) setSelected(rows[idx + 1].node.path);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (idx > 0) setSelected(rows[idx - 1].node.path);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (cur?.type === 'folder') {
          if (!expanded.has(cur.path)) toggle(cur.path);
          else if (cur.children[0]) setSelected(cur.children[0].path);
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (cur?.type === 'folder' && expanded.has(cur.path)) toggle(cur.path);
        else if (cur && parentOf(cur.path)) setSelected(parentOf(cur.path));
        break;
      case 'Enter':
        e.preventDefault();
        if (cur?.type === 'folder') toggle(cur.path);
        else if (cur) onSelectFile(cur.path);
        break;
      case 'F2':
        e.preventDefault();
        if (cur) startRename(cur.path);
        break;
      case 'Delete':
        e.preventDefault();
        if (cur) void deleteItem(cur.path);
        break;
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await onUploadFiles(e.target.files);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const badge = (letter: string, color: string) => (
    <span
      className="w-4 h-4 flex items-center justify-center font-bold text-[9px] rounded-sm border shrink-0"
      style={{ color, borderColor: color + '66', backgroundColor: color + '1a' }}
    >
      {letter}
    </span>
  );

  const fileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'tex') return badge('T', '#59a869');
    if (ext === 'bib') return badge('B', '#e2a53b');
    if (ext === 'sty' || ext === 'cls') return badge('S', '#b07fe0');
    if (['png', 'jpg', 'jpeg', 'gif', 'eps', 'svg'].includes(ext ?? '')) {
      return <FileImage className="w-4 h-4 text-[#3574f0] shrink-0" />;
    }
    if (ext === 'pdf') return <FileText className="w-4 h-4 text-[#e05555] shrink-0" />;
    return <FileIcon className={`w-4 h-4 shrink-0 ${isDark ? 'text-[#c2c5cc]' : 'text-[#6c707e]'}`} />;
  };

  const muted = isDark ? 'text-[#c2c5cc]' : 'text-[#6c707e]';
  const btn = `p-1 rounded transition ${
    isDark ? 'text-[#c2c5cc] hover:bg-[#393b40] hover:text-white' : 'text-[#6c707e] hover:bg-[#dfe1e5] hover:text-[#1f2328]'
  }`;
  const inputCls = `w-full h-5 px-1 text-[12px] outline-none border rounded-sm ${
    isDark ? 'bg-[#1e1f22] text-[#dfe1e5]' : 'bg-white text-[#1f2328]'
  }`;
  const menuHover = isDark ? 'hover:bg-[#2e436e]' : 'hover:bg-[#d4e2ff]';

  const renderMenu = () =>
    menu && (
      <>
        <div
          className="fixed inset-0 z-40"
          onClick={() => setMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu(null);
          }}
        />
        <div
          role="menu"
          data-testid="tree-context-menu"
          style={{ left: menu.x, top: menu.y }}
          className={`fixed z-50 min-w-[190px] py-1 rounded-md shadow-xl border text-[12px] ${
            isDark ? 'bg-[#2b2d30] border-[#43454a] text-[#dfe1e5]' : 'bg-white border-[#d1d5db] text-[#1f2328]'
          }`}
        >
          {menu.items.map((item, i) =>
            item.separator ? (
              <div key={i} className={`my-1 h-px ${isDark ? 'bg-[#393b40]' : 'bg-[#ebecf0]'}`} />
            ) : (
              <div key={i} className="relative" onMouseEnter={() => setOpenSub(item.submenu ? i : null)}>
                <button
                  role="menuitem"
                  onClick={() => (item.submenu ? setOpenSub(i) : item.onClick?.())}
                  className={`w-full px-3 h-6 flex items-center justify-between gap-6 text-left ${menuHover}`}
                >
                  <span>{item.label}</span>
                  <span className={`flex items-center gap-1 ${muted}`}>
                    {item.shortcut}
                    {item.submenu && <ChevronRight className="w-3 h-3" />}
                  </span>
                </button>
                {item.submenu && openSub === i && (
                  <div
                    role="menu"
                    className={`absolute left-full top-0 min-w-[140px] py-1 rounded-md shadow-xl border ${
                      isDark ? 'bg-[#2b2d30] border-[#43454a]' : 'bg-white border-[#d1d5db]'
                    }`}
                  >
                    {item.submenu.map((s) => (
                      <button
                        key={s.label}
                        role="menuitem"
                        onClick={s.onClick}
                        className={`w-full px-3 h-6 flex items-center text-left ${menuHover}`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          )}
        </div>
      </>
    );

  const renderNewDialog = () =>
    newItem && (
      <div
        className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/20"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) setNewItem(null);
        }}
      >
        <div
          role="dialog"
          aria-label={newItem.kind === 'file' ? 'New File' : 'New Directory'}
          className={`w-[360px] rounded-lg shadow-2xl border overflow-hidden ${
            isDark ? 'bg-[#2b2d30] border-[#43454a] text-[#dfe1e5]' : 'bg-white border-[#d1d5db] text-[#1f2328]'
          }`}
        >
          <div
            className={`px-3 h-8 flex items-center text-[12px] font-semibold border-b ${
              isDark ? 'border-[#393b40] bg-[#2b2d30]' : 'border-[#ebecf0] bg-[#f7f8fa]'
            }`}
          >
            {newItem.kind === 'file' ? 'New File' : 'New Directory'}
          </div>
          <div className="p-3 space-y-1.5">
            <input
              autoFocus
              aria-label={newItem.kind === 'file' ? 'File name' : 'Directory name'}
              value={newValue}
              placeholder={newItem.kind === 'file' ? 'chapters/intro.tex' : 'figures/plots'}
              onChange={(e) => {
                setNewValue(e.target.value);
                setNewError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void submitNew();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setNewItem(null);
                }
                e.stopPropagation();
              }}
              className={`${inputCls} h-7 text-[13px] ${newError ? 'border-[#e05555]' : 'border-[#3574f0]'}`}
            />
            <div
              className={`text-[11px] min-h-[14px] ${newError ? 'text-[#e05555]' : muted}`}
              role={newError ? 'alert' : undefined}
            >
              {newError ??
                (newItem.parent
                  ? `In ${newItem.parent}/ — use a/b/c to create nested paths`
                  : 'Use a/b/c to create nested paths')}
            </div>
          </div>
        </div>
      </div>
    );

  return (
    <aside
      className={`w-full h-full border-r flex flex-col select-none text-[13px] font-sans ${
        isDark ? 'bg-[#2b2d30] border-[#1e1f22] text-[#dfe1e5]' : 'bg-[#f7f8fa] border-[#d1d5db] text-[#1f2328]'
      }`}
    >
      {/* IntelliJ Tool Window Header */}
      <div
        className={`h-8 px-2 border-b flex items-center justify-between text-xs ${
          isDark ? 'border-[#1e1f22] bg-[#2b2d30]' : 'border-[#d1d5db] bg-[#ebecf0]'
        }`}
      >
        <div className="flex items-center gap-1 font-semibold min-w-0">
          <span>Project</span>
          <ChevronDown className={`w-3 h-3 ${muted}`} />
        </div>
        <div className={`flex items-center gap-0.5 ${muted}`}>
          <button
            aria-label="New"
            title="New (Alt+Insert)"
            className={btn}
            onClick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setOpenSub(null);
              setMenu({ x: r.left, y: r.bottom + 2, items: newMenuItems(selectedParentDir()) });
            }}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button aria-label="Collapse All" title="Collapse All" className={btn} onClick={collapseAll}>
            <ChevronsDownUp className="w-3.5 h-3.5" />
          </button>
          <button aria-label="Locate Active File" title="Expand to Active File" className={btn} onClick={locate}>
            <Crosshair className="w-3.5 h-3.5" />
          </button>
          <button
            aria-label="Upload Files"
            title="Upload Files"
            className={btn}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-3.5 h-3.5" />
          </button>
          <input ref={fileInputRef} type="file" multiple onChange={handleUpload} className="hidden" />
        </div>
      </div>

      {/* Tree */}
      <div
        ref={treeRef}
        role="tree"
        tabIndex={0}
        aria-label="Project files"
        onKeyDown={handleKeyDown}
        onContextMenu={(e) => {
          e.preventDefault();
          setOpenSub(null);
          setMenu({ x: e.clientX, y: e.clientY, items: contextItems(null) });
        }}
        className="flex-1 overflow-y-auto py-0.5 outline-none"
      >
        <div className="h-[22px] px-2 flex items-center gap-1.5 text-[12px] font-semibold">
          <ChevronDown className={`w-3.5 h-3.5 ${muted}`} />
          <Folder className="w-4 h-4 text-[#e2a53b] shrink-0" />
          <span className="truncate">{projectName || 'project'}</span>
        </div>
        {rows.map(({ node, depth }) => {
          const isSelected = selected === node.path;
          const isRoot = node.type === 'file' && node.path === rootEntry;
          const isOpen = node.type === 'folder' && expanded.has(node.path);
          const pad = 8 + 14 + depth * 14;
          return (
            <div
              key={node.path}
              role="treeitem"
              aria-selected={isSelected}
              aria-expanded={node.type === 'folder' ? isOpen : undefined}
              data-path={node.path}
              onClick={() => {
                setSelected(node.path);
                if (node.type === 'folder') toggle(node.path);
                else onSelectFile(node.path);
                treeRef.current?.focus();
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSelected(node.path);
                setOpenSub(null);
                setMenu({ x: e.clientX, y: e.clientY, items: contextItems(node.path) });
              }}
              style={{ paddingLeft: pad, height: 22 }}
              className={`relative flex items-center gap-1.5 pr-2 cursor-default ${
                isSelected
                  ? isDark
                    ? 'bg-[#2e436e]'
                    : 'bg-[#d4e2ff]'
                  : isDark
                  ? 'hover:bg-[#393b40]'
                  : 'hover:bg-[#ebecf0]'
              }`}
            >
              {Array.from({ length: depth }).map((_, i) => (
                <span
                  key={i}
                  data-testid="indent-guide"
                  className={`absolute top-0 bottom-0 w-px ${isDark ? 'bg-[#393b40]' : 'bg-[#dfe1e5]'}`}
                  style={{ left: 8 + 14 + i * 14 - 7 }}
                />
              ))}
              {node.type === 'folder' ? (
                <>
                  {isOpen ? (
                    <ChevronDown className={`w-3 h-3 -ml-[14px] ${muted}`} />
                  ) : (
                    <ChevronRight className={`w-3 h-3 -ml-[14px] ${muted}`} />
                  )}
                  {isOpen ? (
                    <FolderOpen className="w-4 h-4 text-[#e2a53b] shrink-0" />
                  ) : (
                    <Folder className="w-4 h-4 text-[#e2a53b] shrink-0" />
                  )}
                </>
              ) : (
                fileIcon(node.name)
              )}
              {renaming === node.path ? (
                <div className="flex-1 min-w-0">
                  <input
                    autoFocus
                    aria-label="Rename"
                    value={renameValue}
                    onFocus={(e) => {
                      const dot = renameValue.lastIndexOf('.');
                      e.currentTarget.setSelectionRange(
                        0,
                        dot > 0 && node.type === 'file' ? dot : renameValue.length
                      );
                    }}
                    onChange={(e) => {
                      setRenameValue(e.target.value);
                      setRenameError(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void submitRename();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setRenaming(null);
                      }
                      e.stopPropagation();
                    }}
                    onBlur={() => setRenaming(null)}
                    title={renameError ?? undefined}
                    className={`${inputCls} ${renameError ? 'border-[#e05555]' : 'border-[#3574f0]'}`}
                  />
                  {renameError && (
                    <div role="alert" className="text-[10px] text-[#e05555] truncate">
                      {renameError}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <span className={`truncate ${isRoot ? 'font-bold' : ''}`}>{node.name}</span>
                  {isRoot && (
                    <span
                      className={`ml-1 text-[9px] uppercase font-bold px-1 rounded border ${
                        isDark
                          ? 'bg-[#3574f0]/20 text-[#6c9cf5] border-[#3574f0]/40'
                          : 'bg-[#3574f0]/15 text-[#1750eb] border-[#3574f0]/30'
                      }`}
                    >
                      ROOT
                    </span>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      {renderMenu()}
      {renderNewDialog()}
    </aside>
  );
};
