import type { CompileResult, ProjectFile, SyncTexBlock, SyncTexIndex } from '../types/workspace';
import type { CompileWorkerRequest, CompileWorkerResponse } from './compilerProtocol';
import {
  type CompilerDriver,
  type CompileDriverRequest,
  type CompileDriverResponse,
  getActiveCompilerDriver,
} from './compilerDriver';
import { decompressGzip, parseSyncTex } from './synctexParser';
import { parser as syncTexJsParser } from 'synctex-js';

export type WorkerLike = Pick<Worker, 'postMessage' | 'addEventListener' | 'removeEventListener' | 'terminate'>;

export interface CompileProgressEvent {
  stage: 'compiling' | 'resolving';
  package?: string;
  message?: string;
}

export type CompileProgressCallback = (event: CompileProgressEvent) => void;

export interface CompileClientOptions {
  engine?: 'pdflatex' | 'xelatex' | 'lualatex';
  synctex?: boolean;
  projectId?: string;
  onProgress?: CompileProgressCallback;
}

export function parseSyncTexWithLibrary(rawText: string, fallbackFile: string): SyncTexIndex {
  try {
    const parsed = syncTexJsParser.parseSyncTex(rawText);
    if (parsed?.files && parsed?.blockNumberLine) {
      const files = new Map<number, string>();
      for (const [tag, file] of Object.entries(parsed.files)) {
        files.set(Number(tag), file.name === 'texput' ? fallbackFile : file.name);
      }

      const blocks: SyncTexBlock[] = [];
      for (const lines of Object.values(parsed.blockNumberLine)) {
        for (const [lineNumber, pages] of Object.entries(lines)) {
          for (const [pageNumber, elements] of Object.entries(pages)) {
            for (const element of elements) {
              blocks.push({
                file: element.file?.name === 'texput' || !element.file?.name
                  ? fallbackFile
                  : element.file.name,
                line: element.line || Number(lineNumber),
                x: element.left,
                y: element.bottom,
                width: element.width ?? 0,
                height: element.height ?? 0,
                page: element.page || Number(pageNumber),
              });
            }
          }
        }
      }

      return { files, blocks };
    }
  } catch {
    // Fall back to built-in parser
  }
  return parseSyncTex(rawText, fallbackFile);
}

class WorkerCompilerDriver implements CompilerDriver {
  private worker: WorkerLike | null = null;
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private errorHandler: ((event: Event) => void) | null = null;

  constructor(
    private createWorker: () => WorkerLike,
    private timeoutMs: number
  ) {}

  async detectEnvironment() {
    return {
      available: true,
      latexmk: false,
      pdflatex: true,
      xelatex: true,
      lualatex: false,
      texhash: false,
      synctex: true,
      version: 'WebAssembly Tectonic Engine',
    };
  }

  private getWorker(): WorkerLike {
    if (!this.worker) {
      this.worker = this.createWorker();
    }
    return this.worker;
  }

  async compile(request: CompileDriverRequest): Promise<CompileDriverResponse> {
    const worker = this.getWorker();
    const requestId = crypto.randomUUID();

    return new Promise<CompileDriverResponse>((resolve) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (this.worker && this.messageHandler) {
          this.worker.removeEventListener('message', this.messageHandler as EventListener);
          this.messageHandler = null;
        }
        if (this.worker && this.errorHandler) {
          this.worker.removeEventListener('error', this.errorHandler as EventListener);
          this.errorHandler = null;
        }
      };

      timeoutId = setTimeout(() => {
        cleanup();
        this.dispose();
        resolve({
          status: 'failed',
          pdfBytes: null,
          synctexBytes: null,
          diagnostics: [
            {
              severity: 'error',
              file: request.entry,
              line: 1,
              message: `Compilation timed out (${Math.round(this.timeoutMs / 1000)}s). Resetting compiler worker.`,
            },
          ],
          missingFiles: [],
          resolvedPackages: [],
          durationMs: this.timeoutMs,
          stdout: '',
          stderr: 'Compilation timed out',
        });
      }, this.timeoutMs);

      this.messageHandler = (event: MessageEvent<CompileWorkerResponse>) => {
        const data = event.data;
        if (!data || data.type !== 'compile-result') return;

        if (data.requestId === requestId) {
          cleanup();
          const r = data.result;
          resolve({
            status: r.status === 'spotless' ? 'spotless' : r.status === 'warnings' ? 'warnings' : r.status === 'errors' ? 'errors' : 'failed',
            pdfBytes: r.pdfBytes,
            synctexBytes: null,
            diagnostics: r.diagnostics,
            missingFiles: r.missingFiles,
            resolvedPackages: [],
            durationMs: r.durationMs,
            stdout: '',
            stderr: '',
          });
        }
      };

      this.errorHandler = (event: Event) => {
        cleanup();
        this.dispose();
        const errorMsg = (event as ErrorEvent).message || 'Compiler worker crashed unexpectedly';
        resolve({
          status: 'failed',
          pdfBytes: null,
          synctexBytes: null,
          diagnostics: [
            {
              severity: 'error',
              file: request.entry,
              line: 1,
              message: `Compiler worker fatal error: ${errorMsg}. Reinitializing worker.`,
            },
          ],
          missingFiles: [],
          resolvedPackages: [],
          durationMs: 0,
          stdout: '',
          stderr: errorMsg,
        });
      };

      worker.addEventListener('message', this.messageHandler as EventListener);
      worker.addEventListener('error', this.errorHandler as EventListener);

      const workerReq: CompileWorkerRequest = {
        type: 'compile',
        requestId,
        entry: request.entry,
        files: Object.entries(request.files).map(([p, c]) => ({
          path: p,
          content: c,
        })),
      };

      worker.postMessage(workerReq);
    });
  }

  dispose() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}

export class CompilerClient {
  private driver: CompilerDriver;
  private compiling = false;
  private compileTimeoutMs = 45000;
  private compileTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(
    driverOrWorker?: CompilerDriver | (() => WorkerLike),
    options?: { timeoutMs?: number }
  ) {
    if (options?.timeoutMs) {
      this.compileTimeoutMs = options.timeoutMs;
    }

    if (typeof driverOrWorker === 'function') {
      this.driver = new WorkerCompilerDriver(driverOrWorker, this.compileTimeoutMs);
    } else if (driverOrWorker && typeof driverOrWorker === 'object' && 'compile' in driverOrWorker) {
      this.driver = driverOrWorker;
    } else {
      this.driver = getActiveCompilerDriver();
    }
  }

  isCompiling(): boolean {
    return this.compiling;
  }

  getDriver(): CompilerDriver {
    return this.driver;
  }

  setDriver(driver: CompilerDriver): void {
    this.driver = driver;
  }

  private clearCompileTimeout(): void {
    if (this.compileTimeoutId) {
      clearTimeout(this.compileTimeoutId);
      this.compileTimeoutId = null;
    }
  }

  async compile(
    files: Array<Pick<ProjectFile, 'path' | 'content'>>,
    entry: string,
    options?: CompileClientOptions
  ): Promise<CompileResult> {
    if (this.compiling) {
      throw new Error('Compilation already in progress');
    }

    this.compiling = true;
    options?.onProgress?.({
      stage: 'compiling',
      message: `Compiling with ${options?.engine || 'pdflatex'}...`,
    });

    const filesMap: Record<string, Uint8Array | string> = {};
    for (const f of files) {
      filesMap[f.path] = f.content;
    }

    const driverReq: CompileDriverRequest = {
      projectId: options?.projectId || 'default',
      files: filesMap,
      entry,
      engine: options?.engine,
      synctex: options?.synctex !== false,
    };

    const timeoutPromise = new Promise<CompileDriverResponse>((resolve) => {
      this.compileTimeoutId = setTimeout(() => {
        resolve({
          status: 'failed',
          pdfBytes: null,
          synctexBytes: null,
          diagnostics: [
            {
              severity: 'error',
              file: entry,
              line: 1,
              message: `Compilation timed out (${Math.round(this.compileTimeoutMs / 1000)}s).`,
            },
          ],
          missingFiles: [],
          resolvedPackages: [],
          durationMs: this.compileTimeoutMs,
          stdout: '',
          stderr: 'Compilation timed out',
        });
      }, this.compileTimeoutMs);
    });

    try {
      const res = await Promise.race([this.driver.compile(driverReq), timeoutPromise]);
      this.clearCompileTimeout();

      if (res.resolvedPackages && res.resolvedPackages.length > 0) {
        options?.onProgress?.({
          stage: 'resolving',
          package: res.resolvedPackages.join(', '),
          message: `Resolved packages: ${res.resolvedPackages.join(', ')}`,
        });
      }

      let syncTexIndex: SyncTexIndex | undefined;
      if (res.synctexBytes && res.synctexBytes.length > 0) {
        try {
          const rawSyncTex =
            res.synctexBytes[0] === 0x1f && res.synctexBytes[1] === 0x8b
              ? await decompressGzip(res.synctexBytes)
              : new TextDecoder().decode(res.synctexBytes);
          syncTexIndex = parseSyncTexWithLibrary(rawSyncTex, entry);
        } catch (err) {
          console.warn('[CompilerClient] Failed to parse SyncTeX output:', err);
        }
      }

      const rawStatus = res.status;
      const status: CompileResult['status'] =
        rawStatus === 'spotless' || rawStatus === 'success'
          ? 'spotless'
          : rawStatus === 'warnings'
          ? 'warnings'
          : rawStatus === 'errors'
          ? 'errors'
          : 'failed';

      return {
        status,
        pdfBytes: res.pdfBytes,
        diagnostics: res.diagnostics,
        missingFiles: res.missingFiles,
        durationMs: res.durationMs,
        syncTexIndex,
        resolvedPackages: res.resolvedPackages || [],
        ...(res.missingRequirements?.length ? { missingRequirements: res.missingRequirements } : {}),
        engine: options?.engine || 'pdflatex',
      };
    } finally {
      this.clearCompileTimeout();
      this.compiling = false;
    }
  }

  dispose(): void {
    this.clearCompileTimeout();
    this.compiling = false;
    if (this.driver && 'dispose' in this.driver && typeof (this.driver as any).dispose === 'function') {
      (this.driver as any).dispose();
    }
  }
}
