import type { CompileResult, ProjectFile } from '../types/workspace';
import type { CompileWorkerRequest, CompileWorkerResponse } from './compilerProtocol';

export type WorkerLike = Pick<Worker, 'postMessage' | 'addEventListener' | 'removeEventListener' | 'terminate'>;

export class CompilerClient {
  private worker: WorkerLike | null = null;
  private compiling = false;
  private activeResolver: ((res: CompileResult) => void) | null = null;
  private activeRequestId: string | null = null;
  private messageHandler: ((event: MessageEvent) => void) | null = null;

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
      }
      this.worker.terminate();
      this.worker = null;
    }
    this.compiling = false;
    this.activeResolver = null;
    this.activeRequestId = null;
  }
}
