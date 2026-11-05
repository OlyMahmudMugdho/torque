export type CompileStatus = 'idle' | 'compiling' | 'spotless' | 'warnings' | 'errors' | 'failed';

export type LatexEngine = 'pdflatex' | 'xelatex' | 'lualatex';

export interface Diagnostic {
  severity: 'error' | 'warning' | 'info';
  file?: string;
  line?: number;
  message: string;
}

export interface SyncTexBlock {
  file: string;
  line: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Depth below the baseline (real SyncTeX boxes). */
  depth?: number;
  page: number;
  /** 'box' for [ / ( records (spans), 'node' for point anchors. */
  kind?: 'box' | 'node';
}

export interface SyncTexIndex {
  files: Map<number, string>;
  blocks: SyncTexBlock[];
}

export interface CompileResult {
  status: Exclude<CompileStatus, 'idle' | 'compiling'>;
  pdfBytes: Uint8Array | null;
  diagnostics: Diagnostic[];
  missingFiles: string[];
  durationMs: number;
  syncTexIndex?: SyncTexIndex;
  resolvedPackages?: string[];
  missingRequirements?: string[];
  engine?: LatexEngine;
}

export interface Project {
  id: string;
  name: string;
  rootEntry: string;
  createdAt: number;
  updatedAt: number;
  engine?: LatexEngine;
}

export interface ProjectFile {
  projectId: string;
  path: string;
  content: string | Uint8Array;
  isBinary: boolean;
  updatedAt: number;
}

export interface McpInfo {
  port: number;
  active: boolean;
}

export interface McpFileChangedPayload {
  projectId?: string;
  path: string;
  content: string;
}

export interface WorkspaceActions {
  compile: (options?: { engine?: LatexEngine }) => Promise<CompileResult>;
  getFileContent: (path: string) => Promise<string>;
  setFileContent: (path: string, content: string) => Promise<void>;
  applyDiff: (path: string, original: string, modified: string) => Promise<void>;
  getDiagnostics: () => Diagnostic[];
  manualSave: () => Promise<void>;
  save?: () => Promise<void>;
}
