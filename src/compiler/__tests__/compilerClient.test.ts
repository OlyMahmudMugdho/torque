import { describe, it, expect } from 'vitest';
import { CompilerClient, type WorkerLike } from '../compilerClient';
import type { CompileWorkerRequest, CompileWorkerResponse } from '../compilerProtocol';

function createMockWorker(
  handler: (req: CompileWorkerRequest, respond: (res: CompileWorkerResponse) => void) => void
): WorkerLike {
  const listeners = new Set<EventListenerOrEventListenerObject>();
  return {
    postMessage(msg: CompileWorkerRequest) {
      handler(msg, (res) => {
        const event = new MessageEvent('message', { data: res });
        listeners.forEach((l) => (typeof l === 'function' ? l(event) : l.handleEvent(event)));
      });
    },
    addEventListener(_type: string, listener: EventListenerOrEventListenerObject) {
      listeners.add(listener);
    },
    removeEventListener(_type: string, listener: EventListenerOrEventListenerObject) {
      listeners.delete(listener);
    },
    terminate() {
      listeners.clear();
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
});
