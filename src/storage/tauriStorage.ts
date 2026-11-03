import type { Project, ProjectFile } from '../types/workspace';
import { normalizeFilePath } from './pathUtils';

export function isTauri(): boolean {
  const g = typeof globalThis !== 'undefined' ? (globalThis as any) : null;
  return Boolean(g?.__TAURI_INTERNALS__ || g?.window?.__TAURI_INTERNALS__);
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export interface RawTauriFile {
  projectId: string;
  path: string;
  content: string | number[] | Uint8Array | Record<string, number>;
  isBinary: boolean;
  updatedAt: number;
}

export function decodeTauriFile(raw: RawTauriFile): ProjectFile {
  const isBinary = Boolean(raw.isBinary);
  let content: string | Uint8Array;

  if (isBinary) {
    if (typeof raw.content === 'string') {
      content = base64ToUint8Array(raw.content);
    } else if (Array.isArray(raw.content)) {
      content = new Uint8Array(raw.content);
    } else if (raw.content instanceof Uint8Array) {
      content = raw.content;
    } else if (raw.content && typeof raw.content === 'object') {
      const values = Object.keys(raw.content)
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => (raw.content as Record<string, number>)[k]);
      content = new Uint8Array(values);
    } else {
      content = new Uint8Array();
    }
  } else {
    content = typeof raw.content === 'string' ? raw.content : String(raw.content ?? '');
  }

  return {
    projectId: raw.projectId,
    path: normalizeFilePath(raw.path),
    content,
    isBinary,
    updatedAt: Number(raw.updatedAt) || Date.now(),
  };
}

export function encodeFileForTauri(file: ProjectFile): RawTauriFile {
  const isBinary = file.isBinary !== undefined ? file.isBinary : file.content instanceof Uint8Array;
  let content: string;

  if (file.content instanceof Uint8Array) {
    content = uint8ArrayToBase64(file.content);
  } else if (typeof file.content === 'string') {
    content = file.content;
  } else {
    content = String(file.content ?? '');
  }

  return {
    projectId: file.projectId,
    path: normalizeFilePath(file.path),
    content,
    isBinary,
    updatedAt: file.updatedAt || Date.now(),
  };
}

export type TauriInvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

async function defaultInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const g = typeof globalThis !== 'undefined' ? (globalThis as any) : null;
  if (g?.__TAURI_INTERNALS__?.invoke) {
    return g.__TAURI_INTERNALS__.invoke(cmd, args);
  }
  if (g?.window?.__TAURI_INTERNALS__?.invoke) {
    return g.window.__TAURI_INTERNALS__.invoke(cmd, args);
  }
  const core = await import('@tauri-apps/api/core');
  return core.invoke<T>(cmd, args);
}

export class TauriStorage {
  private invoke: TauriInvokeFn;

  constructor(invokeFn?: TauriInvokeFn) {
    this.invoke = invokeFn || defaultInvoke;
  }

  async init(): Promise<void> {
    try {
      await this.invoke('get_torque_dir');
    } catch {
      // Allow graceful fallback or initialization if get_torque_dir is unavailable
    }
  }

  close(): void {
    // No-op for Tauri disk storage
  }

  async getTorqueDir(): Promise<string> {
    return this.invoke<string>('get_torque_dir');
  }

  async listProjects(): Promise<Project[]> {
    const list = await this.invoke<Project[]>('tauri_list_projects');
    return (list || []).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async createProject(
    name: string,
    initialFiles?: Omit<ProjectFile, 'projectId' | 'updatedAt'>[],
    rootEntry?: string
  ): Promise<Project> {
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

    const encodedFiles = filesToInsert.map(encodeFileForTauri);
    await this.invoke('tauri_save_project', { project, files: encodedFiles });
    return project;
  }

  async renameProject(projectId: string, newName: string): Promise<Project> {
    const data = await this.invoke<any>('tauri_load_project', { id: projectId });
    if (!data) {
      throw new Error(`Project not found: ${projectId}`);
    }
    const [project, rawFiles] = Array.isArray(data) ? data : [data.project, data.files];
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    project.name = newName;
    project.updatedAt = Date.now();
    await this.invoke('tauri_save_project', { project, files: rawFiles || [] });
    return project;
  }

  async setRootEntry(projectId: string, rootEntry: string): Promise<Project> {
    const normRoot = normalizeFilePath(rootEntry);
    const data = await this.invoke<any>('tauri_load_project', { id: projectId });
    if (!data) {
      throw new Error(`Project not found: ${projectId}`);
    }
    const [project, rawFiles] = Array.isArray(data) ? data : [data.project, data.files];
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const files: ProjectFile[] = ((rawFiles as RawTauriFile[]) || []).map(decodeTauriFile);
    if (!files.some((f) => f.path === normRoot)) {
      throw new Error(`Root entry file "${normRoot}" not found in project`);
    }

    project.rootEntry = normRoot;
    project.updatedAt = Date.now();
    await this.invoke('tauri_save_project', { project, files: rawFiles || [] });
    return project;
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.invoke('tauri_delete_project', { id: projectId });
  }

  async listFiles(projectId: string): Promise<ProjectFile[]> {
    const data = await this.invoke<any>('tauri_load_project', { id: projectId });
    if (!data) {
      return [];
    }
    const [, rawFiles] = Array.isArray(data) ? data : [data.project, data.files];
    const files: ProjectFile[] = ((rawFiles as RawTauriFile[]) || []).map(decodeTauriFile);
    files.sort((a, b) => a.path.localeCompare(b.path));
    return files;
  }

  async getFile(projectId: string, path: string): Promise<ProjectFile | undefined> {
    const normPath = normalizeFilePath(path);
    const files = await this.listFiles(projectId);
    return files.find((f) => f.path === normPath);
  }

  async putFile(
    projectId: string,
    path: string,
    content: string | Uint8Array,
    isBinary?: boolean
  ): Promise<ProjectFile> {
    const normPath = normalizeFilePath(path);
    const data = await this.invoke<any>('tauri_load_project', { id: projectId });
    if (!data) {
      throw new Error(`Project not found: ${projectId}`);
    }
    const [project, rawFiles] = Array.isArray(data) ? data : [data.project, data.files];
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const files: ProjectFile[] = ((rawFiles as RawTauriFile[]) || []).map(decodeTauriFile);
    const binaryFlag = isBinary !== undefined ? isBinary : content instanceof Uint8Array;
    const now = Date.now();

    const file: ProjectFile = {
      projectId,
      path: normPath,
      content,
      isBinary: binaryFlag,
      updatedAt: now,
    };

    const existingIdx = files.findIndex((f) => f.path === normPath);
    if (existingIdx >= 0) {
      files[existingIdx] = file;
    } else {
      files.push(file);
    }

    project.updatedAt = now;
    const encodedFiles = files.map(encodeFileForTauri);
    await this.invoke('tauri_save_project', { project, files: encodedFiles });
    return file;
  }

  async renameFile(
    projectId: string,
    oldPath: string,
    newPath: string
  ): Promise<ProjectFile> {
    const oldNorm = normalizeFilePath(oldPath);
    const newNorm = normalizeFilePath(newPath);

    if (oldNorm === newNorm) {
      const existing = await this.getFile(projectId, oldNorm);
      if (!existing) {
        throw new Error(`File not found: ${oldNorm}`);
      }
      return existing;
    }

    const data = await this.invoke<any>('tauri_load_project', { id: projectId });
    if (!data) {
      throw new Error(`Project not found: ${projectId}`);
    }
    const [project, rawFiles] = Array.isArray(data) ? data : [data.project, data.files];
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const files: ProjectFile[] = ((rawFiles as RawTauriFile[]) || []).map(decodeTauriFile);
    const oldIdx = files.findIndex((f) => f.path === oldNorm);
    if (oldIdx === -1) {
      throw new Error(`File not found: ${oldNorm}`);
    }

    const oldFile = files[oldIdx];
    const now = Date.now();
    const renamed: ProjectFile = {
      projectId,
      path: newNorm,
      content: oldFile.content,
      isBinary: oldFile.isBinary,
      updatedAt: now,
    };

    files.splice(oldIdx, 1);
    const newIdx = files.findIndex((f) => f.path === newNorm);
    if (newIdx >= 0) {
      files[newIdx] = renamed;
    } else {
      files.push(renamed);
    }

    if (project.rootEntry === oldNorm) {
      project.rootEntry = newNorm;
    }
    project.updatedAt = now;

    const encodedFiles = files.map(encodeFileForTauri);
    await this.invoke('tauri_save_project', { project, files: encodedFiles });
    return renamed;
  }

  async deleteFile(projectId: string, path: string): Promise<void> {
    const normPath = normalizeFilePath(path);
    const data = await this.invoke<any>('tauri_load_project', { id: projectId });
    if (!data) {
      throw new Error(`Project not found: ${projectId}`);
    }
    const [project, rawFiles] = Array.isArray(data) ? data : [data.project, data.files];
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    if (project.rootEntry === normPath) {
      throw new Error(
        `Cannot delete the active root entry file "${normPath}". Please set another root entry first.`
      );
    }

    const files: ProjectFile[] = ((rawFiles as RawTauriFile[]) || []).map(decodeTauriFile);
    const remaining = files.filter((f) => f.path !== normPath);
    project.updatedAt = Date.now();

    const encodedFiles = remaining.map(encodeFileForTauri);
    await this.invoke('tauri_save_project', { project, files: encodedFiles });
  }
}
