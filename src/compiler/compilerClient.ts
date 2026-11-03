import type { CompileResult, ProjectFile } from '../types/workspace';
import type { CompileWorkerRequest, CompileWorkerResponse } from './compilerProtocol';

export type WorkerLike = Pick<Worker, 'postMessage' | 'addEventListener' | 'removeEventListener' | 'terminate'>;

export class CompilerClient {
  private worker: WorkerLike | null = null;
  private compiling = false;
  private activeResolver: ((res: CompileResult) => void) | null = null;
  private activeRequestId: string | null = null;
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private errorHandler: ((event: Event) => void) | null = null;

  private compileTimeoutMs = 45000;
  private compileTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(private createWorker?: () => WorkerLike, options?: { timeoutMs?: number }) {
    if (options?.timeoutMs) {
      this.compileTimeoutMs = options.timeoutMs;
    }
  }

  private clearCompileTimeout(): void {
    if (this.compileTimeoutId) {
      clearTimeout(this.compileTimeoutId);
      this.compileTimeoutId = null;
    }
  }

  private getWorker(): WorkerLike {
    if (!this.worker) {
      if (this.createWorker) {
        this.worker = this.createWorker();
      } else {
        // Instantiate the dedicated Vite Web Worker
        this.worker = new Worker(new URL('./compiler.worker.ts', import.meta.url), {
          type: 'module',
        });
      }

      this.messageHandler = (event: MessageEvent<CompileWorkerResponse>) => {
        const data = event.data;
        if (!data || data.type !== 'compile-result') return;

        if (data.requestId === this.activeRequestId) {
          this.clearCompileTimeout();
          this.compiling = false;
          const resolve = this.activeResolver;
          this.activeResolver = null;
          this.activeRequestId = null;

          if (data.error && data.result.status === 'failed') {
            resolve?.(data.result);
          } else {
            resolve?.(data.result);
          }
        }
      };

      this.worker.addEventListener('message', this.messageHandler as EventListener);

      this.errorHandler = (event: Event) => {
        this.clearCompileTimeout();
        const errorMsg = (event as ErrorEvent).message || 'Compiler worker crashed unexpectedly';
        console.error('[CompilerClient] Worker error:', event);
        this.compiling = false;
        const resolve = this.activeResolver;
        this.activeResolver = null;
        this.activeRequestId = null;

        resolve?.({
          status: 'failed',
          pdfBytes: null,
          diagnostics: [
            {
              severity: 'error',
              file: 'main.tex',
              line: 1,
              message: `Compiler worker fatal error: ${errorMsg}. Reinitializing worker.`,
            },
          ],
          missingFiles: [],
          durationMs: 0,
        });

        this.dispose();
      };

      this.worker.addEventListener('error', this.errorHandler as EventListener);
    }
    return this.worker;
  }

  isCompiling(): boolean {
    return this.compiling;
  }

  async compile(
    files: Array<Pick<ProjectFile, 'path' | 'content'>>,
    entry: string
  ): Promise<CompileResult> {
    if (this.compiling) {
      throw new Error('Compilation already in progress');
    }

    this.compiling = true;
    const requestId = crypto.randomUUID();
    this.activeRequestId = requestId;

    const worker = this.getWorker();

    return new Promise<CompileResult>((resolve) => {
      this.activeResolver = resolve;

      this.compileTimeoutId = setTimeout(() => {
        console.warn(`[CompilerClient] Compilation timed out after ${this.compileTimeoutMs}ms. Resetting worker.`);
        const resolver = this.activeResolver;
        this.activeResolver = null;
        this.activeRequestId = null;
        this.compiling = false;
        this.dispose();

        resolver?.({
          status: 'failed',
          pdfBytes: null,
          diagnostics: [
            {
              severity: 'error',
              file: entry,
              line: 1,
              message: `Compilation timed out (${Math.round(this.compileTimeoutMs / 1000)}s). The compiler worker has been reset. Please check the browser console (F12) for logs.`,
            },
          ],
          missingFiles: [],
          durationMs: this.compileTimeoutMs,
        });
      }, this.compileTimeoutMs);

      const request: CompileWorkerRequest = {
        type: 'compile',
        requestId,
        entry,
        files: files.map((f) => ({
          path: f.path,
          content: f.content,
        })),
      };

      worker.postMessage(request);
    });
  }

  dispose(): void {
    this.clearCompileTimeout();
    if (this.worker) {
      if (this.messageHandler) {
        this.worker.removeEventListener('message', this.messageHandler as EventListener);
        this.messageHandler = null;
      }
      if (this.errorHandler) {
        this.worker.removeEventListener('error', this.errorHandler as EventListener);
        this.errorHandler = null;
      }
      this.worker.terminate();
      this.worker = null;
    }
    this.compiling = false;
    this.activeResolver = null;
    this.activeRequestId = null;
  }
}
