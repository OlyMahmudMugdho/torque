import { TexEngine } from 'glyphtex-engine';
import type { CompileWorkerRequest, CompileWorkerResponse } from './compilerProtocol';
import type { Diagnostic } from '../types/workspace';

let enginePromise: Promise<TexEngine> | null = null;
let bundleManifest: Set<string> | null = null;
const cachedBundleFiles = new Map<string, Uint8Array>();

async function getEngine(): Promise<TexEngine> {
  if (!enginePromise) {
    enginePromise = (async () => {
      const wasmResp = await fetch('/wasm/tectonic_wasm.wasm');
      const engine = await TexEngine.load(wasmResp);

      try {
        const manifestResp = await fetch('/bundle/manifest.json');
        if (manifestResp.ok) {
          const list: string[] = await manifestResp.json();
          bundleManifest = new Set(list);
        }
      } catch (err) {
        console.warn('Could not load bundle manifest:', err);
      }

      return engine;
    })();
  }
  return enginePromise;
}

async function fetchBundleFile(name: string): Promise<Uint8Array | null> {
  if (cachedBundleFiles.has(name)) {
    return cachedBundleFiles.get(name)!;
  }
  if (bundleManifest && !bundleManifest.has(name)) {
    return null;
  }
  try {
    const resp = await fetch(`/bundle/${encodeURIComponent(name)}`);
    if (!resp.ok) return null;
    const buf = new Uint8Array(await resp.arrayBuffer());
    cachedBundleFiles.set(name, buf);
    return buf;
  } catch {
    return null;
  }
}

self.addEventListener('message', async (event: MessageEvent<CompileWorkerRequest>) => {
  const req = event.data;
  if (!req || req.type !== 'compile') return;

  const start = performance.now();

  try {
    const engine = await getEngine();

    // Reset files in engine for clean build
    engine.clearFiles();

    // Re-mount cached bundle files so far
    for (const [name, data] of cachedBundleFiles.entries()) {
      engine.addFile(name, data);
    }

    // Ensure format file is present
    if (!cachedBundleFiles.has('latex.fmt')) {
      const fmt = await fetchBundleFile('latex.fmt');
      if (fmt) engine.addFile('latex.fmt', fmt);
    }

    // Mount all project files
    for (const file of req.files) {
      engine.addFile(file.path, file.content);
    }

    let compileRes = engine.compile({
      entry: req.entry,
      synctex: false,
    });

    // Handle missing files on-demand
    let passes = 0;
    while (compileRes.missingFiles && compileRes.missingFiles.length > 0 && passes < 15) {
      passes++;
      let added = 0;
      for (const missing of compileRes.missingFiles) {
        const data = await fetchBundleFile(missing);
        if (data) {
          engine.addFile(missing, data);
          added++;
        }
      }
      if (added === 0) break;
      compileRes = engine.compile({
        entry: req.entry,
        synctex: false,
      });
    }

    const durationMs = Math.round(performance.now() - start);

    let pdfBytes: Uint8Array | null = null;
    if (compileRes.status !== 'failed') {
      pdfBytes = engine.pdf() ?? null;
    }

    const diagnostics: Diagnostic[] = (compileRes.diagnostics || []).map((d) => ({
      severity: d.severity === 'error' ? 'error' : d.severity === 'warning' ? 'warning' : 'info',
      file: d.file ?? undefined,
      line: d.line ?? undefined,
      message: d.message,
    }));

    const response: CompileWorkerResponse = {
      type: 'compile-result',
      requestId: req.requestId,
      result: {
        status: compileRes.status,
        pdfBytes,
        diagnostics,
        missingFiles: compileRes.missingFiles ?? [],
        durationMs,
      },
    };

    if (pdfBytes) {
      // Transfer the underlying ArrayBuffer for zero-copy performance
      (self as unknown as Worker).postMessage(response, [pdfBytes.buffer as ArrayBuffer]);
    } else {
      (self as unknown as Worker).postMessage(response);
    }
  } catch (error) {
    const durationMs = Math.round(performance.now() - start);
    const errMessage = error instanceof Error ? error.message : String(error);

    const response: CompileWorkerResponse = {
      type: 'compile-result',
      requestId: req.requestId,
      result: {
        status: 'failed',
        pdfBytes: null,
        diagnostics: [
          {
            severity: 'error',
            message: errMessage,
          },
        ],
        missingFiles: [],
        durationMs,
      },
      error: errMessage,
    };
    self.postMessage(response);
  }
});
