export type CompileStatus = 'idle' | 'compiling' | 'spotless' | 'warnings' | 'errors' | 'failed';

export interface Diagnostic {
  severity: 'error' | 'warning' | 'info';
  file?: string;
  line?: number;
  message: string;
}

export interface CompileResult {
  status: Exclude<CompileStatus, 'idle' | 'compiling'>;
  pdfBytes: Uint8Array | null;
  diagnostics: Diagnostic[];
  missingFiles: string[];
  durationMs: number;
}

export interface Project {
  id: string;
  name: string;
  rootEntry: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectFile {
  projectId: string;
  path: string;
  content: string | Uint8Array;
  isBinary: boolean;
  updatedAt: number;
}

export interface WorkspaceActions {
  compile: () => Promise<CompileResult>;
  getFileContent: (path: string) => Promise<string>;
  setFileContent: (path: string, content: string) => Promise<void>;
  applyDiff: (path: string, original: string, modified: string) => Promise<void>;
  getDiagnostics: () => Diagnostic[];
}
