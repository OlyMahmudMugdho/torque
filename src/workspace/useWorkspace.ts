import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type {
  Project,
  ProjectFile,
  CompileStatus,
  CompileResult,
  WorkspaceActions,
  LatexEngine,
} from '../types/workspace';
import { ProjectStore, normalizeFilePath } from '../storage/projectStore';
import { CompilerClient } from '../compiler/compilerClient';
import type { CompilerDriver } from '../compiler/compilerDriver';
import { exportProjectZip, importProjectZip } from '../archive/zipArchive';
import { applyTextDiff } from '../editor/latexLanguage';

export interface UseWorkspaceOptions {
  store?: ProjectStore;
  compiler?: CompilerClient;
  driver?: CompilerDriver;
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
  const [compileStatus, setCompileStatus] = useState<CompileStatus>('idle');
  const [lastResult, setLastResult] = useState<CompileResult | null>(null);

  const [selectedEngine, setSelectedEngineState] = useState<LatexEngine>('pdflatex');
  const selectedEngineRef = useRef<LatexEngine>(selectedEngine);
  selectedEngineRef.current = selectedEngine;

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

  const refreshFiles = useCallback(async (projectId: string) => {
    const list = await storeRef.current.listFiles(projectId);
    setFiles(list);
  }, []);

  const refreshProjects = useCallback(async () => {
    const list = await storeRef.current.listProjects();
    setProjects(list);
    return list;
  }, []);

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
      await storeRef.current.putFile(activeProjectRef.current.id, norm, content, false);
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
      await storeRef.current.renameFile(activeProjectRef.current.id, normOld, normNew);
      await refreshFiles(activeProjectRef.current.id);
      await refreshProjects();

      setOpenTabs((prev) => prev.map((t) => (t === normOld ? normNew : t)));
      if (activeFilePath === normOld) {
        setActiveFilePath(normNew);
      }
    },
    [activeFilePath, refreshFiles, refreshProjects]
  );

  const deleteFilePath = useCallback(
    async (path: string) => {
      if (!activeProjectRef.current) return;
      const norm = normalizeFilePath(path);
      await storeRef.current.deleteFile(activeProjectRef.current.id, norm);
      await refreshFiles(activeProjectRef.current.id);
      closeTab(norm);
    },
    [closeTab, refreshFiles]
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
        await storeRef.current.putFile(activeProjectRef.current.id, norm, content, false);
      },
      applyDiff: async (path: string, original: string, modified: string) => {
        if (!activeProjectRef.current) throw new Error('No active project');
        const norm = normalizeFilePath(path);
        const f = filesRef.current.find((file) => file.path === norm);
        if (!f) throw new Error(`File not found: ${path}`);
        const currentText = typeof f.content === 'string' ? f.content : new TextDecoder().decode(f.content);
        const updatedContent = applyTextDiff(currentText, original, modified);
        await storeRef.current.putFile(activeProjectRef.current.id, norm, updatedContent, false);
        const updated = filesRef.current.map((file) =>
          file.path === norm ? { ...file, content: updatedContent, updatedAt: Date.now() } : file
        );
        filesRef.current = updated;
        setFiles(updated);
      },
      getDiagnostics: () => {
        return lastResult?.diagnostics ?? [];
      },
    };
  }, [compileAction, lastResult]);

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
