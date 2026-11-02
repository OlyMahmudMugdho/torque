import type { Project, ProjectFile } from '../types/workspace';
import { isTauri, TauriStorage } from './tauriStorage';

export { isTauri, TauriStorage };

export interface ProjectStoreOptions {
  useTauri?: boolean;
  tauriStorage?: TauriStorage;
}

export function normalizeFilePath(rawPath: string): string {
  if (!rawPath || typeof rawPath !== 'string') {
    throw new Error('Invalid path: path must be a non-empty string');
  }
  const trimmed = rawPath.trim();
  if (!trimmed) {
    throw new Error('Invalid path: empty path');
  }

  const normalizedSlashes = trimmed.replace(/\\/g, '/');
  const rawSegments = normalizedSlashes.split('/');
  const cleanedSegments: string[] = [];

  for (const seg of rawSegments) {
    if (seg === '' || seg === '.') {
      continue;
    }
    if (seg === '..') {
      throw new Error(`Invalid path: parent traversal not allowed in "${rawPath}"`);
    }
    cleanedSegments.push(seg);
  }

  if (cleanedSegments.length === 0) {
    throw new Error(`Invalid path: resulting path is empty in "${rawPath}"`);
  }

  return cleanedSegments.join('/');
}

export class ProjectStore {
  private dbName: string;
  private db: IDBDatabase | null = null;
  private tauriStorage: TauriStorage | null = null;

  constructor(dbName = 'torque_latex_db', options?: ProjectStoreOptions) {
    this.dbName = dbName;
    const shouldUseTauri = options?.useTauri !== undefined ? options.useTauri : isTauri();
    if (shouldUseTauri) {
      this.tauriStorage = options?.tauriStorage ?? new TauriStorage();
    }
  }

  async init(): Promise<void> {
    if (this.tauriStorage) {
      return this.tauriStorage.init();
    }
    if (this.db) {
      return;
    }

    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);

      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('project_files')) {
          const fileStore = db.createObjectStore('project_files', {
            keyPath: ['projectId', 'path'],
          });
          fileStore.createIndex('by_project', 'projectId', { unique: false });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private async getDb(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.init();
    }
    return this.db!;
  }

  close(): void {
    if (this.tauriStorage) {
      this.tauriStorage.close();
      return;
    }
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async listProjects(): Promise<Project[]> {
    if (this.tauriStorage) {
      return this.tauriStorage.listProjects();
    }
    const db = await this.getDb();
    return new Promise<Project[]>((resolve, reject) => {
      const tx = db.transaction('projects', 'readonly');
      const store = tx.objectStore('projects');
      const req = store.getAll();
      req.onsuccess = () => {
        const list = (req.result as Project[]) || [];
        list.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async createProject(
    name: string,
    initialFiles?: Omit<ProjectFile, 'projectId' | 'updatedAt'>[],
    rootEntry?: string
  ): Promise<Project> {
    if (this.tauriStorage) {
      return this.tauriStorage.createProject(name, initialFiles, rootEntry);
    }
    const db = await this.getDb();
    const id = crypto.randomUUID();
    const now = Date.now();

    const filesToInsert: ProjectFile[] = [];

    if (initialFiles && initialFiles.length > 0) {
      for (const f of initialFiles) {
        const normPath = normalizeFilePath(f.path);
        const isBinary =
          f.isBinary !== undefined ? f.isBinary : f.content instanceof Uint8Array;
        filesToInsert.push({
          projectId: id,
          path: normPath,
          content: f.content,
          isBinary,
          updatedAt: now,
        });
      }
    } else {
      const defaultTemplate = `\\documentclass{article}
\\usepackage{amsmath}

\\title{${name}}
\\author{}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Introduction}
Welcome to your LaTeX document!

\\end{document}
`;
      filesToInsert.push({
        projectId: id,
        path: 'main.tex',
        content: defaultTemplate,
        isBinary: false,
        updatedAt: now,
      });
    }

    const resolvedRoot = rootEntry
      ? normalizeFilePath(rootEntry)
      : filesToInsert.some((f) => f.path === 'main.tex')
      ? 'main.tex'
      : filesToInsert[0]?.path ?? 'main.tex';

    const project: Project = {
      id,
      name,
      rootEntry: resolvedRoot,
      createdAt: now,
      updatedAt: now,
    };

    return new Promise<Project>((resolve, reject) => {
      const tx = db.transaction(['projects', 'project_files'], 'readwrite');
      tx.oncomplete = () => resolve(project);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);

      const projectStore = tx.objectStore('projects');
      const fileStore = tx.objectStore('project_files');

      projectStore.put(project);
      for (const file of filesToInsert) {
        fileStore.put(file);
      }
    });
  }

  async renameProject(projectId: string, newName: string): Promise<Project> {
    if (this.tauriStorage) {
      return this.tauriStorage.renameProject(projectId, newName);
    }
    const db = await this.getDb();
    return new Promise<Project>((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite');
      let updatedProj: Project | null = null;

      tx.oncomplete = () => {
        if (updatedProj) {
          resolve(updatedProj);
        } else {
          reject(new Error(`Project not found: ${projectId}`));
        }
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);

      const store = tx.objectStore('projects');
      const req = store.get(projectId);
      req.onsuccess = () => {
        const project = req.result as Project | undefined;
        if (!project) {
          tx.abort();
          reject(new Error(`Project not found: ${projectId}`));
          return;
        }
        project.name = newName;
        project.updatedAt = Date.now();
        updatedProj = project;
        store.put(project);
      };
    });
  }

  async setRootEntry(projectId: string, rootEntry: string): Promise<Project> {
    if (this.tauriStorage) {
      return this.tauriStorage.setRootEntry(projectId, rootEntry);
    }
    const db = await this.getDb();
    const normRoot = normalizeFilePath(rootEntry);

    return new Promise<Project>((resolve, reject) => {
      const tx = db.transaction(['projects', 'project_files'], 'readwrite');
      let updatedProj: Project | null = null;

      tx.oncomplete = () => {
        if (updatedProj) {
          resolve(updatedProj);
        } else {
          reject(new Error(`Project not found: ${projectId}`));
        }
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);

      const projectStore = tx.objectStore('projects');
      const fileStore = tx.objectStore('project_files');

      const fileReq = fileStore.get([projectId, normRoot]);
      fileReq.onsuccess = () => {
        const file = fileReq.result as ProjectFile | undefined;
        if (!file) {
          tx.abort();
          reject(new Error(`Root entry file "${normRoot}" not found in project`));
          return;
        }

        const projReq = projectStore.get(projectId);
        projReq.onsuccess = () => {
          const project = projReq.result as Project | undefined;
          if (!project) {
            tx.abort();
            reject(new Error(`Project not found: ${projectId}`));
            return;
          }
          project.rootEntry = normRoot;
          project.updatedAt = Date.now();
          updatedProj = project;
          projectStore.put(project);
        };
      };
    });
  }

  async deleteProject(projectId: string): Promise<void> {
    if (this.tauriStorage) {
      return this.tauriStorage.deleteProject(projectId);
    }
    const db = await this.getDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['projects', 'project_files'], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);

      const projectStore = tx.objectStore('projects');
      const fileStore = tx.objectStore('project_files');
      const index = fileStore.index('by_project');

      projectStore.delete(projectId);

      const req = index.openCursor(IDBKeyRange.only(projectId));
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
    });
  }

  async listFiles(projectId: string): Promise<ProjectFile[]> {
    if (this.tauriStorage) {
      return this.tauriStorage.listFiles(projectId);
    }
    const db = await this.getDb();
    return new Promise<ProjectFile[]>((resolve, reject) => {
      const tx = db.transaction('project_files', 'readonly');
      const fileStore = tx.objectStore('project_files');
      const index = fileStore.index('by_project');
      const req = index.getAll(IDBKeyRange.only(projectId));
      req.onsuccess = () => {
        const files = (req.result as ProjectFile[]) || [];
        files.sort((a, b) => a.path.localeCompare(b.path));
        resolve(files);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getFile(projectId: string, path: string): Promise<ProjectFile | undefined> {
    if (this.tauriStorage) {
      return this.tauriStorage.getFile(projectId, path);
    }
    const db = await this.getDb();
    const normalizedPath = normalizeFilePath(path);
    return new Promise<ProjectFile | undefined>((resolve, reject) => {
      const tx = db.transaction('project_files', 'readonly');
      const fileStore = tx.objectStore('project_files');
      const req = fileStore.get([projectId, normalizedPath]);
      req.onsuccess = () => resolve(req.result as ProjectFile | undefined);
      req.onerror = () => reject(req.error);
    });
  }

  async putFile(
    projectId: string,
    path: string,
    content: string | Uint8Array,
    isBinary?: boolean
  ): Promise<ProjectFile> {
    if (this.tauriStorage) {
      return this.tauriStorage.putFile(projectId, path, content, isBinary);
    }
    const db = await this.getDb();
    const normalizedPath = normalizeFilePath(path);
    const binaryFlag = isBinary !== undefined ? isBinary : content instanceof Uint8Array;
    const now = Date.now();

    const file: ProjectFile = {
      projectId,
      path: normalizedPath,
      content,
      isBinary: binaryFlag,
      updatedAt: now,
    };

    return new Promise<ProjectFile>((resolve, reject) => {
      const tx = db.transaction(['projects', 'project_files'], 'readwrite');
      tx.oncomplete = () => resolve(file);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);

      const projectStore = tx.objectStore('projects');
      const fileStore = tx.objectStore('project_files');

      const projReq = projectStore.get(projectId);
      projReq.onsuccess = () => {
        const project = projReq.result as Project | undefined;
        if (project) {
          project.updatedAt = now;
          projectStore.put(project);
        }
      };

      fileStore.put(file);
    });
  }

  async renameFile(
    projectId: string,
    oldPath: string,
    newPath: string
  ): Promise<ProjectFile> {
    if (this.tauriStorage) {
      return this.tauriStorage.renameFile(projectId, oldPath, newPath);
    }
    const db = await this.getDb();
    const oldNorm = normalizeFilePath(oldPath);
    const newNorm = normalizeFilePath(newPath);

    if (oldNorm === newNorm) {
      const existing = await this.getFile(projectId, oldNorm);
      if (!existing) {
        throw new Error(`File not found: ${oldNorm}`);
      }
      return existing;
    }

    return new Promise<ProjectFile>((resolve, reject) => {
      const tx = db.transaction(['projects', 'project_files'], 'readwrite');
      let renamedFile: ProjectFile | null = null;

      tx.oncomplete = () => {
        if (renamedFile) {
          resolve(renamedFile);
        } else {
          reject(new Error(`Failed to rename file: ${oldNorm}`));
        }
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);

      const projectStore = tx.objectStore('projects');
      const fileStore = tx.objectStore('project_files');

      const getReq = fileStore.get([projectId, oldNorm]);
      getReq.onsuccess = () => {
        const oldFile = getReq.result as ProjectFile | undefined;
        if (!oldFile) {
          tx.abort();
          reject(new Error(`File not found: ${oldNorm}`));
          return;
        }

        fileStore.delete([projectId, oldNorm]);

        const now = Date.now();
        renamedFile = {
          projectId,
          path: newNorm,
          content: oldFile.content,
          isBinary: oldFile.isBinary,
          updatedAt: now,
        };
        fileStore.put(renamedFile);

        const projReq = projectStore.get(projectId);
        projReq.onsuccess = () => {
          const project = projReq.result as Project | undefined;
          if (project) {
            if (project.rootEntry === oldNorm) {
              project.rootEntry = newNorm;
            }
            project.updatedAt = now;
            projectStore.put(project);
          }
        };
      };
    });
  }

  async deleteFile(projectId: string, path: string): Promise<void> {
    if (this.tauriStorage) {
      return this.tauriStorage.deleteFile(projectId, path);
    }
    const db = await this.getDb();
    const normPath = normalizeFilePath(path);

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['projects', 'project_files'], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);

      const projectStore = tx.objectStore('projects');
      const fileStore = tx.objectStore('project_files');

      const projReq = projectStore.get(projectId);
      projReq.onsuccess = () => {
        const project = projReq.result as Project | undefined;
        if (!project) {
          tx.abort();
          reject(new Error(`Project not found: ${projectId}`));
          return;
        }

        if (project.rootEntry === normPath) {
          tx.abort();
          reject(
            new Error(
              `Cannot delete the active root entry file "${normPath}". Please set another root entry first.`
            )
          );
          return;
        }

        fileStore.delete([projectId, normPath]);
        project.updatedAt = Date.now();
        projectStore.put(project);
      };
    });
  }
}
