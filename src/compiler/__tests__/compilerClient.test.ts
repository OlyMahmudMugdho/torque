import { describe, it, expect } from 'vitest';
import { CompilerClient, type WorkerLike } from '../compilerClient';
import type { CompileWorkerRequest, CompileWorkerResponse } from '../compilerProtocol';

function createMockWorker(
  handler: (req: CompileWorkerRequest, respond: (res: CompileWorkerResponse) => void) => void
): WorkerLike {
  const listeners: Record<string, Set<EventListenerOrEventListenerObject>> = {
    message: new Set(),
    error: new Set(),
  };
  return {
    postMessage(msg: CompileWorkerRequest) {
      handler(msg, (res) => {
        const event = new MessageEvent('message', { data: res });
        listeners.message.forEach((l) => (typeof l === 'function' ? l(event) : l.handleEvent(event)));
      });
    },
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      listeners[type]?.add(listener);
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      listeners[type]?.delete(listener);
    },
    terminate() {
      listeners.message.clear();
      listeners.error.clear();
    },
  };
}

describe('CompilerClient', () => {
  it('sends files and entry to worker and resolves with CompileResult', async () => {
    const client = new CompilerClient(() =>
      createMockWorker((req, respond) => {
        respond({
          type: 'compile-result',
          requestId: req.requestId,
          result: {
            status: 'spotless',
            pdfBytes: new Uint8Array([37, 80, 68, 70]),
            diagnostics: [],
            missingFiles: [],
            durationMs: 42,
          },
        });
      })
    );

    const res = await client.compile([{ path: 'main.tex', content: 'Hi' }], 'main.tex');
    expect(res.status).toBe('spotless');
    expect(res.pdfBytes).toEqual(new Uint8Array([37, 80, 68, 70]));
    expect(client.isCompiling()).toBe(false);
  });

  it('rejects concurrent compile triggers while a compilation is already in-flight', async () => {
    let release!: () => void;
    const client = new CompilerClient(() =>
      createMockWorker((req, respond) => {
        release = () =>
          respond({
            type: 'compile-result',
            requestId: req.requestId,
            result: { status: 'spotless', pdfBytes: null, diagnostics: [], missingFiles: [], durationMs: 10 },
          });
      })
    );

    const first = client.compile([{ path: 'main.tex', content: 'A' }], 'main.tex');
    expect(client.isCompiling()).toBe(true);

    await expect(client.compile([{ path: 'main.tex', content: 'B' }], 'main.tex')).rejects.toThrow(
      /already in progress/i
    );

    release();
    await first;
    expect(client.isCompiling()).toBe(false);
  });

  it('handles worker error event gracefully without hanging compilation', async () => {
    const listeners: Record<string, Set<EventListenerOrEventListenerObject>> = {
      message: new Set(),
      error: new Set(),
    };

    const mockWorker: WorkerLike = {
      postMessage(_msg: CompileWorkerRequest) {
        setTimeout(() => {
          const errEvent = new ErrorEvent('error', { message: 'Out of memory' });
          listeners.error.forEach((l) => (typeof l === 'function' ? l(errEvent) : l.handleEvent(errEvent)));
        }, 10);
      },
      addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        listeners[type]?.add(listener);
      },
      removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        listeners[type]?.delete(listener);
      },
      terminate() {
        listeners.message.clear();
        listeners.error.clear();
      },
    };

    const client = new CompilerClient(() => mockWorker);
    const res = await client.compile([{ path: 'main.tex', content: 'C' }], 'main.tex');

    expect(res.status).toBe('failed');
    expect(res.diagnostics.length).toBeGreaterThan(0);
    expect(res.diagnostics[0].message).toContain('Out of memory');
    expect(client.isCompiling()).toBe(false);
  });

  it('triggers compile timeout and resets worker if worker never responds', async () => {
    const client = new CompilerClient(
      () =>
        createMockWorker((_req, _respond) => {
          // Never respond
        }),
      { timeoutMs: 50 }
    );

    const result = await client.compile([{ path: 'main.tex', content: 'Test' }], 'main.tex');
    expect(result.status).toBe('failed');
    expect(result.diagnostics[0].message).toMatch(/Compilation timed out/i);
    expect(client.isCompiling()).toBe(false);
  });

  describe('with CompilerDriver implementation', () => {
    it('compiles via custom CompilerDriver and maps status and PDF bytes', async () => {
      const mockDriver = {
        detectEnvironment: async () => ({
          available: true,
          latexmk: true,
          pdflatex: true,
          xelatex: false,
          lualatex: false,
          texhash: true,
          synctex: true,
          version: 'pdfTeX 1.40',
        }),
        compile: async () => ({
          status: 'spotless' as const,
          pdfBytes: new Uint8Array([37, 80, 68, 70]),
          synctexBytes: null,
          diagnostics: [],
          missingFiles: [],
          resolvedPackages: ['graphicx'],
          durationMs: 88,
          stdout: 'ok',
          stderr: '',
        }),
      };

      const client = new CompilerClient(mockDriver);
      const res = await client.compile([{ path: 'main.tex', content: 'Hello' }], 'main.tex');

      expect(res.status).toBe('spotless');
      expect(res.pdfBytes).toEqual(new Uint8Array([37, 80, 68, 70]));
      expect(res.durationMs).toBe(88);
      expect(client.isCompiling()).toBe(false);
    });

    it('decompresses and parses SyncTeX data if synctexBytes is returned', async () => {
      const synctexText = `SyncTeX Version:1\nInput:1:main.tex\n{1\n[1,1:0,0:100,100:0\nh 1,1:655360,1310720\n}\n`;
      const synctexBytes = new TextEncoder().encode(synctexText);

      const mockDriver = {
        detectEnvironment: async () => ({
          available: true,
          latexmk: true,
          pdflatex: true,
          xelatex: false,
          lualatex: false,
          texhash: true,
          synctex: true,
          version: 'pdfTeX 1.40',
        }),
        compile: async () => ({
          status: 'spotless' as const,
          pdfBytes: new Uint8Array([37, 80, 68, 70]),
          synctexBytes,
          diagnostics: [],
          missingFiles: [],
          resolvedPackages: [],
          durationMs: 50,
          stdout: '',
          stderr: '',
        }),
      };

      const client = new CompilerClient(mockDriver);
      const res = await client.compile([{ path: 'main.tex', content: 'Hello' }], 'main.tex');

      expect(res.status).toBe('spotless');
      expect(res.syncTexIndex).toBeDefined();
      expect(res.syncTexIndex?.blocks.length).toBeGreaterThan(0);
    });

    it('handles compilation timeout with CompilerDriver', async () => {
      const slowDriver = {
        detectEnvironment: async () => ({
          available: true,
          latexmk: true,
          pdflatex: true,
          xelatex: false,
          lualatex: false,
          texhash: false,
          synctex: false,
        }),
        compile: async () => new Promise<any>(() => {}), // never resolves
      };

      const client = new CompilerClient(slowDriver, { timeoutMs: 40 });
      const res = await client.compile([{ path: 'main.tex', content: 'Test' }], 'main.tex');

      expect(res.status).toBe('failed');
      expect(res.diagnostics[0].message).toMatch(/Compilation timed out/i);
      expect(client.isCompiling()).toBe(false);
    });
  });
});
