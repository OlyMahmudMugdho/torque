---
name: client-side-latex-wasm
description: Use when building, debugging, or integrating client-side LaTeX compilation in the browser using WebAssembly (Tectonic / glyphtex-engine), handling in-browser virtual filesystems, on-demand TeX package fetching, Web Worker isolation, Monaco diagnostic mapping, or Next.js WASM asset configuration.
---

# Client-Side LaTeX Compilation with WebAssembly

Compile LaTeX documents directly inside the browser using WebAssembly (Tectonic compiled to WASM via `glyphtex-engine`). Eliminates backend TeX servers, preserves privacy, enables offline-capable compilation, and provides zero-server infrastructure cost.

## Core Principles

1. **Worker Isolation**: Always execute the WebAssembly TeX engine off the main thread in a dedicated Web Worker (`new Worker(new URL('./compiler.worker.ts', import.meta.url), { type: 'module' })`) to prevent UI freezes or dropped frames in the code editor during compilation.
2. **On-Demand Package Resolution**: Rather than forcing users to download an entire 50MB+ TeX Live distribution upfront, resolve missing packages on demand when the compiler reports `missingFiles`.
3. **Core Bundle Preloading**: Preload the minimal set of standard LaTeX files (`latex.fmt`, `article.cls`, `size10.clo`, `l3backend-xetex.def`, font metrics) in parallel during engine initialization so the first compilation is instant.
4. **Header Hygiene**: Do NOT set `Cross-Origin-Embedder-Policy: require-corp` on the server unless you strictly require `SharedArrayBuffer` (single-threaded TeX WASM does not). COEP causes browsers to silently block static bundle asset fetches (`CORP` errors) unless every static asset has explicit CORS/CORP headers.

---

## Quick Reference

| Problem | Root Cause | Solution |
|---|---|---|
| `LaTeX Error: File 'l3backend-xetex.def' not found` | Sub-resource fetch blocked by browser COEP or missing from engine virtual FS | Remove `Cross-Origin-Embedder-Policy: require-corp` from server config; preload core bundle assets in worker init |
| `Missing files: ['latex', 'latex.fmt']` | Engine initialized without format file in virtual filesystem | Add `latex.fmt` to `TexEngine` before first compile pass |
| `operation is manually canceled` | Overlapping compiles triggered before previous pass finished | Add an `isCompiling()` concurrency guard in the client controller |
| Diagnostic line numbers are `0` or `null` | Global TeX engine errors (e.g., memory, format, or general packages) | Clamp line numbers with `Math.max(1, d.line ?? 1)` when projecting to Monaco markers |
| Monaco freeze / stuttering during typing | Triggering WASM compilation on every keystroke | Enforce trigger-based compilation only (manual button, hotkey, or action hook) |

---

## Architecture Overview

```
Main Thread                                       Web Worker Thread
┌─────────────────────────┐                      ┌───────────────────────────┐
│ Monaco Code Editor      │                      │ TexEngine (Tectonic WASM) │
│ & Project State         │                      │ Virtual Memory Filesystem │
└───────────┬─────────────┘                      └─────────────▲─────────────┘
            │                                                  │
            │ postMessage({ files, entry })                    │ engine.addFile()
            ▼                                                  ▼
┌─────────────────────────┐   postMessage(result)┌───────────────────────────┐
│ CompilerClient          │◄─────────────────────┤ On-Demand Bundle Resolver │
│ - Concurrency Guard     │                      │ - Checks /bundle/manifest │
│ - Promise Resolution    │                      │ - Fetches /bundle/<file>  │
└─────────────────────────┘                      └───────────────────────────┘
```

---

## Standard LaTeX Minimal Bundle Requirements

For a standard `\documentclass{article}` document, Tectonic requires these 12 core files:

1. `latex.fmt` (TeX format binary, ~3.8MB)
2. `article.cls` (Document class definition)
3. `size10.clo` (Font size definitions)
4. `l3backend-xetex.def` (LaTeX3 backend driver for XeTeX)
5. `lmroman10-regular.otf` (Latin Modern Roman OpenType font)
6. `ckx.map`, `glyphlist.txt`, `kanjix.map`, `pdfglyphlist.txt`, `pdftex.map` (Font and glyph mappings)
7. `tex-text.tec` (XeTeX font mapping table)
8. `texglyphlist.txt` (TeX glyph name mapping table)

Preloading these 12 files in parallel during worker initialization ensures the very first compilation completes cleanly in a single pass.

---

## Implementation Pattern

### 1. Dedicated Web Worker (`compiler.worker.ts`)

```typescript
import { TexEngine } from 'glyphtex-engine';

let enginePromise: Promise<TexEngine> | null = null;
let bundleManifest: Set<string> | null = null;
const cachedBundleFiles = new Map<string, Uint8Array>();

const CORE_BUNDLE_FILES = [
  'latex.fmt',
  'article.cls',
  'size10.clo',
  'l3backend-xetex.def',
  'lmroman10-regular.otf',
  'ckx.map',
  'glyphlist.txt',
  'kanjix.map',
  'pdfglyphlist.txt',
  'pdftex.map',
  'tex-text.tec',
  'texglyphlist.txt',
];

async function fetchBundleFile(name: string): Promise<Uint8Array | null> {
  if (cachedBundleFiles.has(name)) return cachedBundleFiles.get(name)!;

  // Skip probe names containing brackets or invalid symbols
  if (name.startsWith('[') || name.endsWith(']') || name.includes(':')) {
    return null;
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
  } catch (err) {
    console.warn(`[compiler] Failed to fetch bundle file: ${name}`, err);
    return null;
  }
}

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
      } catch (e) {
        console.warn('[compiler] Could not load bundle manifest:', e);
      }

      // Preload core bundle files in parallel
      await Promise.all(
        CORE_BUNDLE_FILES.map(async (file) => {
          const data = await fetchBundleFile(file);
          if (data) engine.addFile(file, data);
        })
      );

      return engine;
    })();
  }
  return enginePromise;
}

self.addEventListener('message', async (event: MessageEvent) => {
  const req = event.data;
  if (!req || req.type !== 'compile') return;

  const start = performance.now();
  try {
    const engine = await getEngine();

    // Clear previous project inputs
    engine.clearFiles();

    // Re-mount cached bundle files
    for (const [name, data] of cachedBundleFiles.entries()) {
      engine.addFile(name, data);
    }

    // Mount user files
    for (const file of req.files) {
      engine.addFile(file.path, file.content);
    }

    let compileRes = engine.compile({
      entry: req.entry,
      synctex: false,
    });

    // Handle missing package resolution loop
    let passes = 0;
    while (compileRes.missingFiles && compileRes.missingFiles.length > 0 && passes < 15) {
      passes++;
      let added = 0;
      for (const missing of compileRes.missingFiles) {
        if (!cachedBundleFiles.has(missing)) {
          const data = await fetchBundleFile(missing);
          if (data) {
            engine.addFile(missing, data);
            added++;
          }
        }
      }
      if (added === 0) break;
      compileRes = engine.compile({ entry: req.entry, synctex: false });
    }

    const durationMs = Math.round(performance.now() - start);
    let pdfBytes: Uint8Array | null = null;
    if (compileRes.status !== 'failed') {
      pdfBytes = engine.pdf() ?? null;
    }

    const response = {
      type: 'compile-result',
      requestId: req.requestId,
      result: {
        status: compileRes.status,
        pdfBytes,
        diagnostics: (compileRes.diagnostics || []).map((d: any) => ({
          severity: d.severity === 'error' ? 'error' : 'warning',
          file: d.file ?? undefined,
          line: d.line ?? undefined,
          message: d.message,
        })),
        durationMs,
      },
    };

    if (pdfBytes) {
      (self as unknown as Worker).postMessage(response, [pdfBytes.buffer as ArrayBuffer]);
    } else {
      self.postMessage(response);
    }
  } catch (error) {
    self.postMessage({
      type: 'compile-result',
      requestId: req.requestId,
      result: {
        status: 'failed',
        pdfBytes: null,
        diagnostics: [{ severity: 'error', message: String(error) }],
        durationMs: Math.round(performance.now() - start),
      },
    });
  }
});
```

---

### 2. Main-Thread Controller (`compilerClient.ts`)

```typescript
export class CompilerClient {
  private worker: Worker | null = null;
  private compiling = false;
  private activeResolver: ((res: any) => void) | null = null;
  private activeRequestId: string | null = null;

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./compiler.worker.ts', import.meta.url), {
        type: 'module',
      });
      this.worker.addEventListener('message', (event) => {
        const data = event.data;
        if (data.requestId === this.activeRequestId) {
          this.compiling = false;
          const resolve = this.activeResolver;
          this.activeResolver = null;
          this.activeRequestId = null;
          resolve?.(data.result);
        }
      });
    }
    return this.worker;
  }

  async compile(files: Array<{ path: string; content: string | Uint8Array }>, entry: string) {
    if (this.compiling) throw new Error('Compilation already in progress');
    this.compiling = true;
    const requestId = crypto.randomUUID();
    this.activeRequestId = requestId;

    return new Promise((resolve) => {
      this.activeResolver = resolve;
      this.getWorker().postMessage({ type: 'compile', requestId, entry, files });
    });
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.compiling = false;
  }
}
```

---

### 3. Mapping Diagnostics to Monaco Markers

```typescript
export function diagnosticsToMarkers(
  diagnostics: Array<{ file?: string; line?: number; message: string; severity: 'error' | 'warning' }>,
  activeFilePath: string,
  rootEntry: string
) {
  return diagnostics
    .filter((d) => (d.file ? d.file === activeFilePath : activeFilePath === rootEntry))
    .map((d) => ({
      startLineNumber: Math.max(1, d.line ?? 1),
      startColumn: 1,
      endLineNumber: Math.max(1, d.line ?? 1),
      endColumn: 1000,
      message: d.message,
      severity: d.severity === 'error' ? 8 : 4, // monaco.MarkerSeverity
    }));
}
```

---

## Common Mistakes to Avoid

1. **Setting `COEP: require-corp` unnecessarily**: Single-threaded WASM does not use `SharedArrayBuffer`. Enabling `require-corp` forces the browser to block all local static fetches without `Cross-Origin-Resource-Policy` headers.
2. **Re-initializing `TexEngine` on every compile**: Initializing the WASM instance compiles the module and allocates WebAssembly linear memory (~100-300ms). Keep a singleton instance in the Web Worker and only call `engine.clearFiles()` between runs.
3. **Discarding auxiliary files when resolving missing packages**: When a compile halts due to `missingFiles`, do NOT clear auxiliary files (`.aux`, `.toc`). Tectonic needs them so the rerun picks up where it left off.
4. **Passing `pdfBytes` without transferring the ArrayBuffer**: Copying multi-megabyte PDF byte buffers across the Web Worker boundary serializes the entire array. Always use `self.postMessage(response, [pdfBytes.buffer])` to transfer ownership with zero copy overhead.
