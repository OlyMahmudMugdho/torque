---
name: client-side-latex-wasm
description: Historical reference for building, debugging, or integrating client-side LaTeX compilation in the browser using WebAssembly (Tectonic / glyphtex-engine). Note that Torque has migrated to Native TeX Live and Tauri architecture.
---

# Client-Side LaTeX Compilation with WebAssembly

> [!NOTE] Architecture Migration Notice
> **Torque has migrated from in-browser WebAssembly to Native TeX Live & Tauri Architecture**:
> Production compilation in Torque is now executed natively via the host's TeX Live installation (`latexmk`, `pdflatex`, `xelatex`, `lualatex`) paired with automated CTAN package resolution into `TEXMFHOME` via Tauri IPC and the lightweight compilation server.
> For current Torque IDE development, refer to [`skills/torque-ide-development/SKILL.md`](file:///home/mugdho/codes/torque/skills/torque-ide-development/SKILL.md) and [`MAP.md`](file:///home/mugdho/codes/torque/MAP.md).
> This document is preserved as an engineering reference for WebAssembly-based client-side TeX, virtual filesystems, and Web Worker isolation patterns.

Compile LaTeX documents directly inside the browser using WebAssembly (Tectonic compiled to WASM via `glyphtex-engine`). Eliminates backend TeX servers, preserves privacy, enables offline-capable compilation, and provides zero-server infrastructure cost.

## Core Principles

1. **Worker Isolation**: Always execute the WebAssembly TeX engine off the main thread in a dedicated Web Worker (`new Worker(new URL('./compiler.worker.ts', import.meta.url), { type: 'module' })`) to prevent UI freezes or dropped frames in the code editor during compilation. Eagerly pre-warm the WASM module and bundle cache in the background upon worker creation.
2. **Precompiled WebAssembly.Module**: Compile the WASM binary once using `WebAssembly.compileStreaming(resp)` (when `Content-Type: application/wasm` is confirmed) or `WebAssembly.compile(buf)` and cache the `WebAssembly.Module` promise. Never use `resp.clone()` with `compileStreaming` as unconsumed parent streams cause tee stream deadlocks in browser workers. Instantiating a new engine from a precompiled module takes ~1-3ms instead of recompiling bytecode from scratch (~200ms).
3. **Automatic Engine Invalidation on Failure**: Tectonic's internal Rust/C engine enters a dirty or poisoned state when a compile errors out or traps (`RuntimeError: unreachable` or `index out of bounds` in `bridge_core`). Discard the engine instance (`currentEngine = null`) on failure so the next run starts with a clean linear memory instance.
4. **Stderr & Stdout Diagnostics Capture**: Pass `{ onStderr, onStdout }` handlers to `TexEngine.load(wasmModule, { onStderr, onStdout })`. Parse stderr for Rust panic reasons (`panicked at ...`), fatal errors, and LaTeX job abortion messages to construct human-actionable error messages.
5. **XeTeX Font Name Probe Resolution**: XeTeX probes fonts with specific suffixes, bracket specifiers (e.g., `[lmroman10-regular.otf]`), and mapping options (e.g., `:mapping=tex-text`). Sanitize probe requests by stripping brackets, options, and auxiliary extensions before querying the bundle cache.
6. **Multi-Pass Missing File Termination Guard**: When compiling in multiple passes to resolve missing files, only trigger a subsequent pass if `newFilesAdded > 0` (files not already present in `cachedBundleFiles`). Font probes (e.g. `lmroman10-bold`) that already exist in memory must not trigger repeated recompilations, otherwise compiles will loop indefinitely and hit client timeouts.
7. **Core Bundle, TikZ & Hyperref Preloading**: Preload essential format files (`latex.fmt`), document classes (`article.cls`, `IEEEtran.cls`), AMS packages, TikZ core, Hyperref suite (`hyperref`, `hxetex.def`, `rerunfilecheck`, `uniquecounter`, etc.), table helpers (`booktabs`, `multirow`), conditionals (`ifthen`), and Latin Modern Roman OpenType fonts so standard documents compile in a single pass without extra roundtrips.
8. **Fontspec Compatibility Stubs**: When providing WebAssembly compatibility stubs for `fontspec.sty`, define font macros using `\DeclareDocumentCommand` with `{ o m o }` and `{ m o m o }` to swallow leading and trailing optional arguments (`\setmainfont{Font}[Options]` and `\newfontfamily\cmd[Options]{Font}`) cleanly without leaking raw brackets or script names into the document body.
9. **Package Manager Integration**: Pair compiler diagnostics with an interactive package catalog to allow one-click insertion of missing `\usepackage{...}` statements before `\begin{document}`.
10. **Header Hygiene**: Do NOT set `Cross-Origin-Embedder-Policy: require-corp` on the server unless you strictly require `SharedArrayBuffer` (single-threaded TeX WASM does not). COEP causes browsers to silently block static bundle asset fetches (`CORP` errors) unless every static asset has explicit CORS/CORP headers.

---

## Quick Reference

| Problem | Root Cause | Solution |
|---|---|---|
| `RuntimeError: unreachable` in `bridge_core` | Previous compilation failed, leaving dirty engine memory | Invalidate engine instance (`currentEngine = null`) on failure and recreate from cached `WebAssembly.Module` |
| `LaTeX Error: File 'l3backend-xetex.def' not found` | Sub-resource fetch blocked by browser COEP or missing from engine virtual FS | Remove `Cross-Origin-Embedder-Policy: require-corp` from server config; preload core bundle assets in worker init |
| `Compilation timed out after 20s/45s` | Multi-pass loop repeatedly re-fetches font probes already in cache, or stream deadlock in `compileStreaming` | Check if `resolved` is already in `cachedBundleFiles` before fetching; only loop if `newFilesAdded > 0`; avoid `.clone()` in `compileStreaming` |
| Leaked brackets / options text on Page 1 (`[SmallCaps...]`, `Script=Bengali`) | `fontspec.sty` stubs defined with rigid optional argument ordering | Use `\DeclareDocumentCommand` with `{ o m o }` and `{ m o m o }` to absorb both leading and trailing option syntax |
| `panicked at ...: index out of bounds` | Font shaper error or unmapped Unicode glyph | Catch in `onStderr`, diagnose invalid characters/glyphs, and reinitialize engine |
| `Missing files: ['latex', 'latex.fmt']` | Engine initialized without format file in virtual filesystem | Add `latex.fmt` to `TexEngine` before first compile pass |
| `operation is manually canceled` | Overlapping compiles triggered before previous pass finished | Add an `isCompiling()` concurrency guard in the client controller |
| Font file not resolved (`[lmroman10-regular.otf]:mapping=tex-text`) | XeTeX requests font with brackets and mapping parameters | Strip brackets `[...]` and `:mapping=...` options in `resolveCandidateBundleName` |
| TikZ compilation failure (`pgfsys`, `arrows.meta`, `plotmarks`) | Missing auxiliary TikZ libraries | Preload `tikz.code.tex`, `tikz-cd.sty`, `pgfsys-xetex.def`, and TikZ libraries in `CORE_BUNDLE_FILES` |
| Hyperref compilation failure (`hxetex.def`, `rerunfilecheck`, `uniquecounter`) | Missing XeTeX hyperref driver & helpers | Preload `hyperref.sty`, `hxetex.def`, `rerunfilecheck.sty`, `uniquecounter.sty`, `puenc.def`, and `pzdr.tfm` |
| Diagnostic line numbers are `0` or `null` | Global TeX engine errors (e.g., memory, format, or general packages) | Clamp line numbers with `Math.max(1, d.line ?? 1)` when projecting to Monaco markers |

---

## Architecture Overview

```
Main Thread                                       Web Worker Thread
┌─────────────────────────┐                      ┌────────────────────────────────────────┐
│ Monaco Code Editor      │                      │ TexEngine (Tectonic WASM)              │
│ & Project State         │                      │ - Precompiled WebAssembly.Module       │
└───────────┬─────────────┘                      │ - Virtual Memory Filesystem            │
            │                                    │ - Stderr / Stdout Diagnostic Parser    │
            │ postMessage({ files, entry })      └───────────────────▲────────────────────┘
            ▼                                                        │
┌─────────────────────────┐   postMessage(result)┌───────────────────┴────────────────────┐
│ CompilerClient          │◄─────────────────────┤ On-Demand Bundle Resolver              │
│ - Concurrency Guard     │                      │ - XeTeX Probe & Font Stripping         │
│ - Promise Resolution    │                      │ - Manifest Lookup (/bundle/manifest)   │
│ - Error Recovery        │                      │ - Fetches /bundle/<resolvedName>       │
└─────────────────────────┘                      └────────────────────────────────────────┘
```

---

## Standard LaTeX & TikZ Bundle Requirements

For standard LaTeX documents and TikZ diagrams, Tectonic requires these core bundle files preloaded:

1. **Format & Document Classes**: `latex.fmt`, `article.cls`, `IEEEtran.cls`, `size10.clo`, `size11.clo`, `size12.clo`, `l3backend-xetex.def`
2. **AMS Math Suite**: `amsmath.sty`, `amssymb.sty`, `amstext.sty`, `amsfonts.sty`, `umsa.fd`, `umsb.fd`
3. **Graphics & Layout**: `graphicx.sty`, `graphics.sty`, `xcolor.sty`, `geometry.sty`, `multicol.sty`, `calc.sty`, `etoolbox.sty`
4. **TikZ & PGF Ecosystem**:
   - `pgf.sty`, `tikz.sty`, `tikz.code.tex`, `pgfsys.code.tex`, `pgfsys-xetex.def`
   - `tikz-cd.sty`, `tikzlibrarycd.code.tex`, `tikzlibrarymatrix.code.tex`
   - `tikzlibraryquotes.code.tex`, `pgflibraryarrows.meta.code.tex`
   - `tikzlibraryplothandlers.code.tex`, `tikzlibrarytopaths.code.tex`, `tikzlibraryplotmarks.code.tex`
5. **OpenType Fonts & Font Mappings**:
   - `lmroman10-regular.otf`, `lmroman12-regular.otf`
   - `ckx.map`, `glyphlist.txt`, `kanjix.map`, `pdfglyphlist.txt`, `pdftex.map`, `tex-text.tec`, `texglyphlist.txt`
6. **Math Metric & Outline Files**:
   - `cmex10.tfm`, `cmmi10.tfm`, `cmr10.tfm`, `cmsy10.tfm`, `msam10.tfm`, `msbm10.tfm`
   - `cmex10.pfb`, `cmmi10.pfb`, `cmr10.pfb`, `cmsy10.pfb`, `msam10.pfb`, `msbm10.pfb`

---

## Implementation Pattern

### 1. Robust Web Worker Implementation (`compiler.worker.ts`)

```typescript
import { TexEngine } from 'glyphtex-engine';

let wasmModulePromise: Promise<WebAssembly.Module> | null = null;
let currentEngine: TexEngine | null = null;
let engineUsageCount = 0;
const MAX_ENGINE_USES = 25;

let bundleManifest: Set<string> | null = null;
const cachedBundleFiles = new Map<string, Uint8Array>();
let stderrLogs: string[] = [];
let stdoutLogs: string[] = [];

// Precompile and cache WebAssembly module once
async function getWasmModule(): Promise<WebAssembly.Module> {
  if (!wasmModulePromise) {
    wasmModulePromise = (async () => {
      const resp = await fetch('/wasm/tectonic_wasm.wasm');
      if (!resp.ok) {
        throw new Error(`Failed to fetch tectonic_wasm.wasm: HTTP ${resp.status}`);
      }
      const contentType = resp.headers.get('content-type') || '';
      if (typeof WebAssembly.compileStreaming === 'function' && contentType.includes('application/wasm')) {
        try {
          return await WebAssembly.compileStreaming(resp);
        } catch {
          const arrayResp = await fetch('/wasm/tectonic_wasm.wasm');
          const buf = await arrayResp.arrayBuffer();
          return await WebAssembly.compile(buf);
        }
      }
      const buf = await resp.arrayBuffer();
      return await WebAssembly.compile(buf);
    })();
  }
  return wasmModulePromise;
}

// Strip XeTeX probe parameters and options
function resolveCandidateBundleName(name: string): string | null {
  if (name.startsWith('[') || name.endsWith(']') || name.includes(':')) {
    // Strip [font.otf]:mapping=tex-text
    const cleaned = name.replace(/^\[+|\]+$/g, '').split(':')[0];
    if (bundleManifest && bundleManifest.has(cleaned)) return cleaned;
    return null;
  }
  if (!bundleManifest) return name;
  if (bundleManifest.has(name)) return name;

  // Probe with standard extensions
  if (!name.includes('.')) {
    for (const ext of ['.sty', '.cls', '.tfm', '.pfb', '.otf', '.def']) {
      const cand = `${name}${ext}`;
      if (bundleManifest.has(cand)) return cand;
    }
  }
  return null;
}

async function createFreshEngine(): Promise<TexEngine> {
  const module = await getWasmModule();
  stderrLogs = [];
  stdoutLogs = [];

  const engine = await TexEngine.load(module, {
    onStdout: (text: string) => stdoutLogs.push(text),
    onStderr: (text: string) => stderrLogs.push(text),
  });

  for (const [name, data] of cachedBundleFiles.entries()) {
    engine.addFile(name, data);
  }

  engineUsageCount = 0;
  return engine;
}

async function getEngine(): Promise<TexEngine> {
  if (!currentEngine || engineUsageCount >= MAX_ENGINE_USES) {
    currentEngine = await createFreshEngine();
  }
  return currentEngine;
}

self.addEventListener('message', async (event: MessageEvent) => {
  const req = event.data;
  if (!req || req.type !== 'compile') return;

  const start = performance.now();
  try {
    let engine = await getEngine();
    stderrLogs = [];
    stdoutLogs = [];

    engine.clearFiles();
    for (const [name, data] of cachedBundleFiles.entries()) {
      engine.addFile(name, data);
    }
    for (const file of req.files) {
      engine.addFile(file.path, file.content);
    }

    engineUsageCount++;
    let compileRes = engine.compile({ entry: req.entry, synctex: false });

    // Handle missing files on-demand with termination guard
    let passes = 0;
    while ((compileRes.status === 'failed' || compileRes.status === 'errors') && compileRes.missingFiles?.length && passes < 10) {
      passes++;
      let newFilesAdded = 0;
      for (const missing of compileRes.missingFiles) {
        const resolved = resolveCandidateBundleName(missing) || missing;
        const alreadyHad = (resolved && cachedBundleFiles.has(resolved)) || cachedBundleFiles.has(missing);
        if (!alreadyHad) {
          const resp = await fetch(`/bundle/${encodeURIComponent(resolved)}`);
          if (resp.ok) {
            const buf = new Uint8Array(await resp.arrayBuffer());
            cachedBundleFiles.set(resolved, buf);
            newFilesAdded++;
          }
        }
      }
      if (newFilesAdded === 0) break;

      // Recreate engine with freshly fetched bundle files
      currentEngine = await createFreshEngine();
      engine = currentEngine;
      for (const file of req.files) {
        engine.addFile(file.path, file.content);
      }
      compileRes = engine.compile({ entry: req.entry, synctex: false });
    }

    // CRITICAL: Invalidate engine if compilation failed to prevent corrupted state
    if (compileRes.status === 'failed') {
      currentEngine = null;
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
        diagnostics: compileRes.diagnostics || [],
        durationMs,
      },
    };

    if (pdfBytes) {
      (self as unknown as Worker).postMessage(response, [pdfBytes.buffer as ArrayBuffer]);
    } else {
      self.postMessage(response);
    }
  } catch (error) {
    // Drop engine on crash
    currentEngine = null;
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

### 2. Main-Thread Concurrency Guard & Error Recovery (`compilerClient.ts`)

```typescript
export class CompilerClient {
  private worker: Worker | null = null;
  private compiling = false;
  private activeResolver: ((res: any) => void) | null = null;
  private activeRequestId: string | null = null;

  isCompiling(): boolean {
    return this.compiling;
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

### 3. Preamble Package Insertion Pattern (`packageManager.ts`)

```typescript
export function injectPackageIntoDocument(documentContent: string, packageName: string, options?: string): string {
  const packageStatement = options ? `\\usepackage[${options}]{${packageName}}` : `\\usepackage{${packageName}}`;

  // Avoid duplicate package insertion
  const packageRegex = new RegExp(`\\\\usepackage(?:\\[[^\\]]*\\])?\\{${packageName}\\}`, 'm');
  if (packageRegex.test(documentContent)) {
    return documentContent;
  }

  // Insert before \begin{document}
  const beginDocMatch = documentContent.match(/\\begin\{document\}/);
  if (beginDocMatch && beginDocMatch.index !== undefined) {
    const before = documentContent.substring(0, beginDocMatch.index);
    const after = documentContent.substring(beginDocMatch.index);
    return `${before}${packageStatement}\n${after}`;
  }

  // Fallback: Append after documentclass
  const docClassMatch = documentContent.match(/\\documentclass(\[[^\]]*\])?\{[^}]+\}/);
  if (docClassMatch && docClassMatch.index !== undefined) {
    const insertPos = docClassMatch.index + docClassMatch[0].length;
    return `${documentContent.slice(0, insertPos)}\n${packageStatement}${documentContent.slice(insertPos)}`;
  }

  return `${packageStatement}\n${documentContent}`;
}
```

---

## Best Practices & Anti-Patterns Checklist

- [x] **DO** compile `WebAssembly.Module` once and instantiate `TexEngine` instances from it.
- [x] **DO** discard and nullify `currentEngine` when a compile fails or aborts to avoid `bridge_core` crashes.
- [x] **DO** capture `onStderr` logs from `TexEngine.load` to diagnose Rust panic reasons and missing fonts.
- [x] **DO** transfer `pdfBytes.buffer` in `postMessage(response, [pdfBytes.buffer])` for zero-copy IPC.
- [x] **DO** strip bracket font lookups (`[name.otf]:mapping=...`) when checking `/bundle/manifest.json`.
- [ ] **DON'T** enable `COEP: require-corp` on the web server unless strictly required (it blocks local font and bundle fetches).
- [ ] **DON'T** re-compile raw WASM bytes from scratch on every run; instantiate from cached `WebAssembly.Module`.
- [ ] **DON'T** leave the Problems / Build Output panel visible with dead vertical space when dismissed.
