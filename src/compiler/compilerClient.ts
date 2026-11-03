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

  constructor(private createWorker?: () => WorkerLike) {}

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
