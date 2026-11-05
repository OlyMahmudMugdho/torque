import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type {
  Project,
  ProjectFile,
  CompileStatus,
  CompileResult,
  WorkspaceActions,
  LatexEngine,
  McpFileChangedPayload,
} from '../types/workspace';
import { ProjectStore, normalizeFilePath } from '../storage/projectStore';
import { CompilerClient } from '../compiler/compilerClient';
import type { CompilerDriver } from '../compiler/compilerDriver';
import { exportProjectZip, importProjectZip } from '../archive/zipArchive';
import { applyTextDiff } from '../editor/latexLanguage';
import { isTauri, base64ToUint8Array } from '../storage/tauriStorage';
import { decompressGzip, parseSyncTex } from '../compiler/synctexParser';

export const AUTOSAVE_STORAGE_KEY = 'torque_autosave_enabled';

export interface UseWorkspaceOptions {
  store?: ProjectStore;
  compiler?: CompilerClient;
  driver?: CompilerDriver;
  autoSave?: boolean;
}

export interface WorkspaceState {
  ready: boolean;
  projects: Project[];
  activeProject: Project | null;
  files: ProjectFile[];
  activeFilePath: string;
  openTabs: string[];
  compileStatus: CompileStatus;
  lastResult: CompileResult | null;
  selectedEngine: LatexEngine;
  setSelectedEngine: (engine: LatexEngine) => void;
  autoSave: boolean;
  setAutoSave: (enabled: boolean) => void;
  save: () => Promise<void>;
  resolvingPackage: string | null;
  resolvedPackages: string[];
  clearResolvedPackages: () => void;
  selectProject: (projectId: string) => Promise<void>;
  createNewProject: (
    name: string,
    initialFiles?: Omit<ProjectFile, 'projectId' | 'updatedAt'>[],
    rootEntry?: string
  ) => Promise<Project>;
  renameActiveProject: (name: string) => Promise<void>;
  deleteProjectById: (projectId: string) => Promise<void>;
  selectFile: (path: string) => void;
  closeTab: (path: string) => void;
  createFile: (path: string, content?: string | Uint8Array, isBinary?: boolean) => Promise<void>;
  updateFileContent: (path: string, content: string) => Promise<void>;
  updateActiveFileContent: (content: string) => Promise<void>;
  createFolder: (path: string) => Promise<void>;
  renameFilePath: (oldPath: string, newPath: string) => Promise<void>;
  deleteFilePath: (path: string) => Promise<void>;
  setProjectRootEntry: (path: string) => Promise<void>;
  exportActiveProjectZip: () => Promise<Uint8Array>;
  importZipAsProject: (name: string, zipBytes: ArrayBuffer | Uint8Array) => Promise<Project>;
  actions: WorkspaceActions;
}

export function useWorkspace(options?: UseWorkspaceOptions): WorkspaceState {
  const storeRef = useRef<ProjectStore>(options?.store ?? new ProjectStore());
  const compilerRef = useRef<CompilerClient>(
    options?.compiler ?? (options?.driver ? new CompilerClient(options.driver) : new CompilerClient())
  );

  const [ready, setReady] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string>('main.tex');
  const activeFilePathRef = useRef<string>(activeFilePath);
  activeFilePathRef.current = activeFilePath;
  const [openTabs, setOpenTabs] = useState<string[]>(['main.tex']);
  const openTabsRef = useRef<string[]>(openTabs);
  openTabsRef.current = openTabs;
  const [compileStatus, setCompileStatus] = useState<CompileStatus>('idle');
  const [lastResult, setLastResult] = useState<CompileResult | null>(null);

  const [selectedEngine, setSelectedEngineState] = useState<LatexEngine>('pdflatex');
  const selectedEngineRef = useRef<LatexEngine>(selectedEngine);
  selectedEngineRef.current = selectedEngine;

  const [autoSave, setAutoSaveState] = useState<boolean>(() => {
    if (options?.autoSave !== undefined) {
      return options.autoSave;
    }
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(AUTOSAVE_STORAGE_KEY);
        if (stored !== null) {
          return stored === 'true';
        }
      } catch {
        // ignore
      }
    }
    return true;
  });
  const autoSaveRef = useRef<boolean>(autoSave);
  autoSaveRef.current = autoSave;

  const dirtyFilesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (options?.autoSave !== undefined) {
      setAutoSaveState(options.autoSave);
      autoSaveRef.current = options.autoSave;
    }
  }, [options?.autoSave]);

  const [resolvingPackage, setResolvingPackage] = useState<string | null>(null);
  const [resolvedPackages, setResolvedPackages] = useState<string[]>([]);

  const setSelectedEngine = useCallback((engine: LatexEngine) => {
    selectedEngineRef.current = engine;
    setSelectedEngineState(engine);
  }, []);

  const clearResolvedPackages = useCallback(() => {
    setResolvedPackages([]);
    setResolvingPackage(null);
  }, []);

  // Keep a ref of files so actions always access up-to-date content
  const filesRef = useRef<ProjectFile[]>(files);
  filesRef.current = files;

  const activeProjectRef = useRef<Project | null>(activeProject);
  activeProjectRef.current = activeProject;

  const saveAction = useCallback(async () => {
    if (!activeProjectRef.current) return;
    const projId = activeProjectRef.current.id;
    if (dirtyFilesRef.current.size > 0) {
      const paths = Array.from(dirtyFilesRef.current);
      for (const p of paths) {
        const f = filesRef.current.find((file) => file.path === p);
        if (f) {
          await storeRef.current.putFile(projId, f.path, f.content, f.isBinary);
        }
      }
      dirtyFilesRef.current.clear();
    } else {
      const active = activeFilePathRef.current;
      if (active) {
        const f = filesRef.current.find((file) => file.path === active);
        if (f) {
          await storeRef.current.putFile(projId, f.path, f.content, f.isBinary);
        }
      }
    }
  }, []);

  const setAutoSave = useCallback(
    (enabled: boolean) => {
      setAutoSaveState(enabled);
      autoSaveRef.current = enabled;
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(AUTOSAVE_STORAGE_KEY, String(enabled));
        } catch {
          // ignore
        }
      }
      if (enabled) {
        saveAction();
      }
    },
    [saveAction]
  );

  const refreshFiles = useCallback(async (projectId: string) => {
    const list = await storeRef.current.listFiles(projectId);
    setFiles(list);
  }, []);

  const refreshProjects = useCallback(async () => {
    const list = await storeRef.current.listProjects();
    setProjects(list);
    return list;
  }, []);

  // Synchronize active project ID to Tauri MCP server
  useEffect(() => {
    if (!activeProject?.id) return;
    if (isTauri()) {
      const g = typeof window !== 'undefined' ? (window as any) : null;
      if (g?.__TAURI_INTERNALS__?.invoke) {
        g.__TAURI_INTERNALS__.invoke('tauri_set_active_project', { projectId: activeProject.id }).catch(() => {});
      } else {
        import('@tauri-apps/api/core')
          .then(({ invoke }) => {
            invoke('tauri_set_active_project', { projectId: activeProject.id }).catch(() => {});
          })
          .catch(() => {});
      }
    }
  }, [activeProject?.id]);

  // MCP live reactive synchronization handlers
  const handleMcpFileChanged = useCallback((payload: McpFileChangedPayload) => {
    if (!payload || !payload.path) return;
    if (payload.projectId && activeProjectRef.current && payload.projectId !== activeProjectRef.current.id) {
      return;
    }
    const norm = normalizeFilePath(payload.path);
    const newContent = payload.content;

    setFiles((prevFiles) => {
      let found = false;
      const updated = prevFiles.map((f) => {
        if (f.path === norm) {
          found = true;
          return { ...f, content: newContent, updatedAt: Date.now() };
        }
        return f;
      });
      const nextFiles = found
        ? updated
        : [
            ...updated,
            {
              projectId: activeProjectRef.current?.id || '',
              path: norm,
              content: newContent,
              isBinary: false,
              updatedAt: Date.now(),
            },
          ];
      filesRef.current = nextFiles;
      return nextFiles;
    });
  }, []);

  const handleMcpCompileFinished = useCallback(async (raw: any) => {
    if (!raw) return;

    let pdfBytes: Uint8Array | null = null;
    const rawPdf = raw.pdfBytes ?? raw.pdf;
    if (rawPdf) {
      if (typeof rawPdf === 'string') {
        pdfBytes = base64ToUint8Array(rawPdf);
      } else if (rawPdf instanceof Uint8Array) {
        pdfBytes = rawPdf;
      } else if (Array.isArray(rawPdf)) {
        pdfBytes = new Uint8Array(rawPdf);
      }
    }

    let syncTexIndex = raw.syncTexIndex;
    if (!syncTexIndex && raw.synctex) {
      try {
        const rawBytes = typeof raw.synctex === 'string' ? base64ToUint8Array(raw.synctex) : raw.synctex;
        const rawText =
          rawBytes[0] === 0x1f && rawBytes[1] === 0x8b
            ? await decompressGzip(rawBytes)
            : new TextDecoder().decode(rawBytes);
        syncTexIndex = parseSyncTex(
          rawText,
          activeProjectRef.current?.rootEntry || 'main.tex',
          filesRef.current.map((f) => f.path)
        );
      } catch {
        // ignore synctex parse error
      }
    }

    const rawStatus = String(raw.status || 'spotless').toLowerCase();
    let status: CompileResult['status'] =
      rawStatus === 'spotless' || rawStatus === 'success'
        ? 'spotless'
        : rawStatus === 'warnings'
        ? 'warnings'
        : rawStatus === 'errors'
        ? 'errors'
        : 'failed';

    if (status === 'failed' && pdfBytes) {
      const hasErrors = Array.isArray(raw.diagnostics) && raw.diagnostics.some((d: any) => d.severity === 'error');
      status = hasErrors ? 'errors' : 'warnings';
    }

    const resolvedPackages = Array.isArray(raw.resolved_packages)
      ? raw.resolved_packages
      : Array.isArray(raw.resolvedPackages)
      ? raw.resolvedPackages
      : [];

    const result: CompileResult = {
      status,
      pdfBytes,
      diagnostics: Array.isArray(raw.diagnostics) ? raw.diagnostics : [],
      missingFiles: Array.isArray(raw.missing_files) ? raw.missing_files : Array.isArray(raw.missingFiles) ? raw.missingFiles : [],
      durationMs: Number(raw.duration_ms ?? raw.durationMs) || 0,
      syncTexIndex,
      resolvedPackages,
      missingRequirements: raw.missing_requirements ?? raw.missingRequirements,
      engine: raw.engine || selectedEngineRef.current,
    };

    setCompileStatus(result.status);
    setLastResult(result);
    if (resolvedPackages.length > 0) {
      setResolvedPackages(resolvedPackages);
    }
  }, []);

  useEffect(() => {
    let unlistenFile: (() => void) | undefined;
    let unlistenCompile: (() => void) | undefined;

    if (isTauri()) {
      import('@tauri-apps/api/event')
        .then(({ listen }) => {
          listen<McpFileChangedPayload>('mcp:file-changed', (event) => {
            handleMcpFileChanged(event.payload);
          }).then((fn) => {
            unlistenFile = fn;
          });

          listen<any>('mcp:compile-finished', (event) => {
            handleMcpCompileFinished(event.payload);
          }).then((fn) => {
            unlistenCompile = fn;
          });
        })
        .catch(() => {});
    }

    const handleCustomFileChanged = (e: Event) => {
      const ce = e as CustomEvent<McpFileChangedPayload>;
      if (ce.detail) {
        handleMcpFileChanged(ce.detail);
      }
    };

    const handleCustomCompileFinished = (e: Event) => {
      const ce = e as CustomEvent<any>;
      if (ce.detail) {
        handleMcpCompileFinished(ce.detail);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('torque:mcp-file-changed', handleCustomFileChanged);
      window.addEventListener('torque:mcp-compile-finished', handleCustomCompileFinished);
    }

    return () => {
      try {
        if (typeof unlistenFile === 'function') {
          Promise.resolve(unlistenFile()).catch(() => {});
        }
      } catch {
        // ignore
      }
      try {
        if (typeof unlistenCompile === 'function') {
          Promise.resolve(unlistenCompile()).catch(() => {});
        }
      } catch {
        // ignore
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('torque:mcp-file-changed', handleCustomFileChanged);
        window.removeEventListener('torque:mcp-compile-finished', handleCustomCompileFinished);
      }
    };
  }, [handleMcpFileChanged, handleMcpCompileFinished]);

  // Initialize store and default project
  useEffect(() => {
    let mounted = true;

    async function init() {
      await storeRef.current.init();
      let allProjects = await storeRef.current.listProjects();

      if (allProjects.length === 0) {
        const defaultProj = await storeRef.current.createProject('Untitled Project');
        allProjects = [defaultProj];
      }

      if (mounted) {
        setProjects(allProjects);
        const current = allProjects[0];
        setActiveProject(current);
        const initialFiles = await storeRef.current.listFiles(current.id);
        setFiles(initialFiles);
        const root = current.rootEntry || 'main.tex';
        setActiveFilePath(root);
        setOpenTabs([root]);
        if (current.engine) {
          setSelectedEngine(current.engine);
        }
        setReady(true);
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, [setSelectedEngine]);

  const selectProject = useCallback(
    async (projectId: string) => {
      const p = projects.find((proj) => proj.id === projectId);
      if (!p) return;
      setActiveProject(p);
      const projFiles = await storeRef.current.listFiles(p.id);
      setFiles(projFiles);
      const root = p.rootEntry || 'main.tex';
      setActiveFilePath(root);
      setOpenTabs([root]);
      setLastResult(null);
      setCompileStatus('idle');
      setResolvingPackage(null);
      setResolvedPackages([]);
      if (p.engine) {
        setSelectedEngine(p.engine);
      }
    },
    [projects, setSelectedEngine]
  );

  const createNewProject = useCallback(
    async (
      name: string,
      initialFiles?: Omit<ProjectFile, 'projectId' | 'updatedAt'>[],
      rootEntry?: string
    ) => {
      const newProj = await storeRef.current.createProject(name, initialFiles, rootEntry);
      await refreshProjects();
      await selectProject(newProj.id);
      return newProj;
    },
    [refreshProjects, selectProject]
  );

  const renameActiveProject = useCallback(
    async (name: string) => {
      if (!activeProjectRef.current) return;
      const updated = await storeRef.current.renameProject(activeProjectRef.current.id, name);
      setActiveProject(updated);
      await refreshProjects();
    },
    [refreshProjects]
  );

  const deleteProjectById = useCallback(
    async (projectId: string) => {
      await storeRef.current.deleteProject(projectId);
      const remaining = await refreshProjects();
      if (activeProjectRef.current?.id === projectId) {
        if (remaining.length > 0) {
          await selectProject(remaining[0].id);
        } else {
          setActiveProject(null);
          setFiles([]);
          setOpenTabs([]);
        }
      }
    },
    [refreshProjects, selectProject]
  );

  const selectFile = useCallback((path: string) => {
    const norm = normalizeFilePath(path);
    setActiveFilePath(norm);
    setOpenTabs((prev) => (prev.includes(norm) ? prev : [...prev, norm]));
  }, []);

  const closeTab = useCallback((path: string) => {
    const norm = normalizeFilePath(path);
    setOpenTabs((prev) => {
      const filtered = prev.filter((t) => t !== norm);
      if (filtered.length > 0) {
        setActiveFilePath(filtered[filtered.length - 1]);
      }
      return filtered;
    });
  }, []);

  const createFile = useCallback(
    async (path: string, content: string | Uint8Array = '', isBinary = false) => {
      if (!activeProjectRef.current) return;
      const norm = normalizeFilePath(path);
      await storeRef.current.putFile(activeProjectRef.current.id, norm, content, isBinary);
      await refreshFiles(activeProjectRef.current.id);
      selectFile(norm);
    },
    [refreshFiles, selectFile]
  );

  const updateFileContent = useCallback(
    async (path: string, content: string) => {
      if (!activeProjectRef.current) return;
      const norm = normalizeFilePath(path);
      let found = false;
      const updated = filesRef.current.map((f) => {
        if (f.path === norm) {
          found = true;
          return { ...f, content, updatedAt: Date.now() };
        }
        return f;
      });
      const finalFiles = found
        ? updated
        : [
            ...updated,
            {
              projectId: activeProjectRef.current.id,
              path: norm,
              content,
              isBinary: false,
              updatedAt: Date.now(),
            },
          ];
      filesRef.current = finalFiles;
      setFiles(finalFiles);
      if (autoSaveRef.current) {
        await storeRef.current.putFile(activeProjectRef.current.id, norm, content, false);
      } else {
        dirtyFilesRef.current.add(norm);
      }
    },
    []
  );

  const updateActiveFileContent = useCallback(
    async (content: string) => {
      const target = activeFilePathRef.current;
      if (!target) return;
      await updateFileContent(target, content);
    },
    [updateFileContent]
  );

  const renameFilePath = useCallback(
    async (oldPath: string, newPath: string) => {
      if (!activeProjectRef.current) return;
      const normOld = normalizeFilePath(oldPath);
      const normNew = normalizeFilePath(newPath);
      await storeRef.current.renameFilePath(activeProjectRef.current.id, normOld, normNew);
      await refreshFiles(activeProjectRef.current.id);
      await refreshProjects();

      const remap = (t: string) =>
        t === normOld
          ? normNew
          : t.startsWith(normOld + '/')
          ? normNew + t.slice(normOld.length)
          : t;
      setOpenTabs((prev) => prev.map(remap));
      if (activeFilePath) {
        setActiveFilePath(remap(activeFilePath));
      }
    },
    [activeFilePath, refreshFiles, refreshProjects]
  );

  const deleteFilePath = useCallback(
    async (path: string) => {
      if (!activeProjectRef.current) return;
      const norm = normalizeFilePath(path);
      await storeRef.current.deleteFilePath(activeProjectRef.current.id, norm);
      await refreshFiles(activeProjectRef.current.id);
      for (const tab of openTabsRef.current) {
        if (tab === norm || tab.startsWith(norm + '/')) closeTab(tab);
      }
    },
    [closeTab, refreshFiles]
  );

  const createFolder = useCallback(
    async (path: string) => {
      if (!activeProjectRef.current) return;
      const norm = normalizeFilePath(path);
      await storeRef.current.createFolder(activeProjectRef.current.id, norm);
      await refreshFiles(activeProjectRef.current.id);
    },
    [refreshFiles]
  );

  const setProjectRootEntry = useCallback(
    async (path: string) => {
      if (!activeProjectRef.current) return;
      const norm = normalizeFilePath(path);
      const updated = await storeRef.current.setRootEntry(activeProjectRef.current.id, norm);
      setActiveProject(updated);
      await refreshProjects();
    },
    [refreshProjects]
  );

  const exportActiveProjectZip = useCallback(async () => {
    return exportProjectZip(filesRef.current);
  }, []);

  const importZipAsProject = useCallback(
    async (name: string, zipBytes: ArrayBuffer | Uint8Array) => {
      const imported = await importProjectZip(zipBytes);
      const proj = await storeRef.current.createProject(name, imported.files, imported.rootEntry);
      await refreshProjects();
      await selectProject(proj.id);
      return proj;
    },
    [refreshProjects, selectProject]
  );

  const compileAction = useCallback(
    async (compileOpts?: { engine?: LatexEngine }): Promise<CompileResult> => {
      if (!activeProjectRef.current) {
        throw new Error('No active project to compile');
      }

      const engineToUse = compileOpts?.engine || selectedEngineRef.current || 'pdflatex';
      setCompileStatus('compiling');
      setResolvingPackage(null);

      try {
        const entry = activeProjectRef.current.rootEntry || 'main.tex';
        // Always compile with the freshest in-memory filesRef.current!
        const filesToCompile = filesRef.current;

        const result = await compilerRef.current.compile(filesToCompile, entry, {
          engine: engineToUse,
          projectId: activeProjectRef.current.id,
          synctex: true,
          onProgress: (progress) => {
            if (progress.stage === 'resolving') {
              setResolvingPackage(progress.package || progress.message || 'Resolving package...');
            } else {
              setResolvingPackage(null);
            }
          },
        });

        // Ensure that if a PDF was produced, it is not marked as failed
        if (result.status === 'failed' && result.pdfBytes) {
          const hasErrors = result.diagnostics.some((d) => d.severity === 'error');
          result.status = hasErrors ? 'errors' : 'warnings';
        }
        setCompileStatus(result.status);
        setLastResult(result);
        setResolvingPackage(null);

        if (result.resolvedPackages && result.resolvedPackages.length > 0) {
          setResolvedPackages(result.resolvedPackages);
        }

        return result;
      } catch (err) {
        setCompileStatus('failed');
        setResolvingPackage(null);
        const errRes: CompileResult = {
          status: 'failed',
          pdfBytes: null,
          diagnostics: [
            {
              severity: 'error',
              message: err instanceof Error ? err.message : String(err),
            },
          ],
          missingFiles: [],
          durationMs: 0,
          resolvedPackages: [],
          engine: engineToUse,
        };
        setLastResult(errRes);
        throw err;
      }
    },
    []
  );

  const actions = useMemo<WorkspaceActions>(() => {
    return {
      compile: compileAction,
      getFileContent: async (path: string) => {
        const norm = normalizeFilePath(path);
        const f = filesRef.current.find((file) => file.path === norm);
        if (!f) throw new Error(`File not found: ${path}`);
        return typeof f.content === 'string' ? f.content : new TextDecoder().decode(f.content);
      },
      setFileContent: async (path: string, content: string) => {
        if (!activeProjectRef.current) throw new Error('No active project');
        const norm = normalizeFilePath(path);
        let found = false;
        const updated = filesRef.current.map((f) => {
          if (f.path === norm) {
            found = true;
            return { ...f, content, updatedAt: Date.now() };
          }
          return f;
        });
        const finalFiles = found
          ? updated
          : [
              ...updated,
              {
                projectId: activeProjectRef.current.id,
                path: norm,
                content,
                isBinary: false,
                updatedAt: Date.now(),
              },
            ];
        filesRef.current = finalFiles;
        setFiles(finalFiles);
        if (autoSaveRef.current) {
          await storeRef.current.putFile(activeProjectRef.current.id, norm, content, false);
        } else {
          dirtyFilesRef.current.add(norm);
        }
      },
      applyDiff: async (path: string, original: string, modified: string) => {
        if (!activeProjectRef.current) throw new Error('No active project');
        const norm = normalizeFilePath(path);
        const f = filesRef.current.find((file) => file.path === norm);
        if (!f) throw new Error(`File not found: ${path}`);
        const currentText = typeof f.content === 'string' ? f.content : new TextDecoder().decode(f.content);
        const updatedContent = applyTextDiff(currentText, original, modified);
        const updated = filesRef.current.map((file) =>
          file.path === norm ? { ...file, content: updatedContent, updatedAt: Date.now() } : file
        );
        filesRef.current = updated;
        setFiles(updated);
        if (autoSaveRef.current) {
          await storeRef.current.putFile(activeProjectRef.current.id, norm, updatedContent, false);
        } else {
          dirtyFilesRef.current.add(norm);
        }
      },
      getDiagnostics: () => {
        return lastResult?.diagnostics ?? [];
      },
      manualSave: saveAction,
      save: saveAction,
    };
  }, [compileAction, lastResult, saveAction]);

  return {
    ready,
    projects,
    activeProject,
    files,
    activeFilePath,
    openTabs,
    compileStatus,
    lastResult,
    selectedEngine,
    setSelectedEngine,
    autoSave,
    setAutoSave,
    save: saveAction,
    resolvingPackage,
    resolvedPackages,
    clearResolvedPackages,
    selectProject,
    createNewProject,
    renameActiveProject,
    deleteProjectById,
    selectFile,
    closeTab,
    createFile,
    createFolder,
    updateFileContent,
    updateActiveFileContent,
    renameFilePath,
    deleteFilePath,
    setProjectRootEntry,
    exportActiveProjectZip,
    importZipAsProject,
    actions,
  };
}
