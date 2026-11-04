# Native TeX Live & Automatic Package Resolution Plan

## Overview
Torque is transitioning from client-side WebAssembly (`glyphtex-engine`) and manual package downloading/bundling to native OS TeX Live execution (`latexmk`, `xelatex`, `pdflatex`, `lualatex`) with automated package resolution and a client-server ready driver architecture.

## Spec & Architecture Authority

### Architectural Pillars
1. **Zero Bundled Packages & Zero Manual Downloads**:
   - Torque does NOT ship with bundled LaTeX package assets in `/public/bundle/`.
   - The user does NOT manually download packages from CTAN or through a manual UI.
   - When compilation fails due to a missing package file (`File '<pkg>.sty' not found` or font file), the compiler backend catches the missing asset, automatically downloads the required package from CTAN into the user's TeX tree (`~/texmf/tex/latex/<pkg>` or `~/.torque/texmf`), updates the filename database (`texhash` / `mktexlsr`), and resumes compilation transparently.
2. **Native TeX Live Execution**:
   - Compiles documents via native `latexmk -synctex=1 -interaction=nonstopmode -file-line-error [engine_flags] <entry>`.
   - Supports configurable engines (`pdflatex`, `xelatex`, `lualatex`).
   - Extracts stdout/stderr logs and `.log` files to produce structured diagnostics.
   - Preserves SyncTeX output (`.synctex.gz`) and passes it to the viewer for bi-directional forward/backward search.
3. **Client-Server CompilerDriver Interface**:
   - Frontend components (`useWorkspace`, `MonacoEditor`, `PdfPreviewPane`, `TopBar`) interact strictly with a unified `CompilerDriver` interface: `compile(request: CompileRequest): Promise<CompileResponse>`.
   - In Tauri Desktop: Driver dispatches directly to native Rust `tauri::command` executing child processes.
   - In Web / Remote mode: Driver dispatches via HTTP/WebSocket to a local or remote compiler daemon/endpoint (`/api/compile`).
4. **Clean Removal of WASM**:
   - Deprecate and remove `glyphtex-engine`, `tectonic_wasm.wasm`, and WASM worker cache.
   - Update `MAP.md` and `AGENTS.md` to reflect native TeX Live authority and client-server driver architecture.

---

## Global Constraints
- All Vitest test suites (`npm test`) must pass cleanly.
- Static export build (`npm run build`) must complete without TypeScript errors.
- SyncTeX forward and backward search must continue functioning seamlessly.
- Diagnostics panel must remain zero-space when closed.
- Path traversal outside workspace must remain strictly guarded.

---

## Tasks

### Task 1: Tauri Native Compiler Backend & Engine Probing
- Implement `tauri_detect_texlive` and `tauri_compile_latex` commands in `src-tauri/src/compiler.rs`.
- `tauri_detect_texlive`: Returns available binaries on PATH (`latexmk`, `pdflatex`, `xelatex`, `lualatex`, `texhash`).
- `tauri_compile_latex`:
  - Accepts project files, main entry file, chosen engine (`pdflatex` | `xelatex` | `lualatex`), and build directory.
  - Spawns `latexmk -synctex=1 -interaction=nonstopmode -file-line-error -recorder [engine-flag] <entry>`.
  - Captures stdout/stderr, locates generated `.pdf`, `.synctex.gz`, and `.log`.
  - Parses LaTeX diagnostics from `.log` into structured error/warning messages.
  - If output halts with missing file (`File 'foo.sty' not found`), calls auto-resolver (Task 2) and retries.
  - Registers commands in `src-tauri/src/lib.rs`.
  - Write unit/integration tests for command detection and log parsing in Rust.

### Task 2: Automated Missing Package Resolver
- Implement automated package resolution module in Rust backend (`src-tauri/src/package_resolver.rs`) and companion server:
  - Parses missing `.sty`, `.cls`, `.def`, `.fd`, `.tfm` filenames from compilation logs.
  - Maps filename to CTAN package name (using CTAN API / TeX Live package database).
  - Automatically fetches the package archive from CTAN mirror into user's `TEXMFHOME` (`~/texmf` or `~/.torque/texmf`).
  - Executes `texhash` / `mktexlsr` to register the new assets with kpathsea.
  - Includes cache and loop prevention (max 5 passes, deduplication).
  - Add tests verifying package resolution logic and missing file detection.

### Task 3: Unified TypeScript Compiler Driver & Client-Server API
- Create `src/compiler/compilerDriver.ts` with unified `CompilerDriver` interface.
- Implement `TauriCompilerDriver` that invokes Tauri's `tauri_compile_latex` and `tauri_detect_texlive`.
- Implement `HttpCompilerDriver` for web / remote server modes connecting to `/api/compile`.
- Implement Next.js `/api/compile` (and standalone `scripts/compiler-server.js`) that runs the same native compilation pipeline via Node.js `child_process`.
- Update `compilerClient.ts` to use `CompilerDriver` instead of spawning WebAssembly Web Worker.
- Add unit tests for drivers, mock responses, and fallback handling.

### Task 4: UI Engine Selector & Status Integration
- Add TeX Engine selector to TopBar or Workspace settings (`latexmk (pdflatex)`, `latexmk (xelatex)`, `latexmk (lualatex)`).
- Display auto-download status pill in the toolbar when a missing package is being fetched ("Downloading package: <pkg>...").
- Keep SyncTeX integration working with native `.synctex.gz` decompression and coordinates.
- Update `WorkspaceUI` and `useWorkspace` hooks to wire into `CompilerDriver`.
- Write/update Vitest component tests.

### Task 5: Decommissioning WASM & Cleanup
- Remove `glyphtex-engine` from `package.json`.
- Remove manual package downloader modal or adapt it to a read-only viewer for installed TeX packages.
- Remove `/public/bundle/` assets and CTAN proxy scripts (`scripts/ctan-server.js`, `scripts/ctanProxy.js`).
- Update `AGENTS.md` and `MAP.md` removing WASM/Tectonic rules and enshrining native TeX Live + auto-resolution.
- Verify full test suite passes and Next.js static build succeeds.
