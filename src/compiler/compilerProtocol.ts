import type { CompileResult } from '../types/workspace';

export interface CompileWorkerRequest {
  type: 'compile';
  requestId: string;
  entry: string;
  files: Array<{ path: string; content: string | Uint8Array }>;
}

export interface CompileWorkerResponse {
  type: 'compile-result';
  requestId: string;
  result: CompileResult;
  error?: string;
}

export interface WorkerProgressMessage {
  type: 'progress';
  message: string;
}
