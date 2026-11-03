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
});
