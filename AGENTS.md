<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Torque Agent Operating Instructions

> [!IMPORTANT]
> **MANDATORY FIRST STEP FOR ALL AGENTS**:
> Before reading further, proposing changes, or touching any code in this repository, you **MUST read [`MAP.md`](file:///home/mugdho/codes/torque/MAP.md)**.
> `MAP.md` contains the full structural map of directories, files, component hierarchies, compiler subsystems, and architecture decisions.

---

## Critical Architecture Invariants

When modifying or expanding Torque, all agents must adhere to the following rules:

### 1. Client-Side WebAssembly Execution
- TeX compilation is 100% client-side via `glyphtex-engine` (`tectonic_wasm.wasm`).
- Never introduce server-side TeX compilation endpoints or proxies.
- Compilation must always remain isolated in a dedicated Web Worker (`src/compiler/compiler.worker.ts`) to avoid locking the UI thread.
- Always reuse the precompiled `WebAssembly.Module` across compilations (`WebAssembly.compileStreaming` / `WebAssembly.compile`), but **always invalidate the `TexEngine` instance** on compilation failures or runtime traps to keep WASM linear memory pristine.
- Stderr/stdout logs must be captured via `TexEngine.load(wasmModule, { onStderr, onStdout })` to extract real Rust panics, font shaper errors, and missing package messages.

### 2. Zero-Space Diagnostic Pane
- The Problems / Build Output panel (`src/components/DiagnosticsLogPanel.tsx`) must dismiss cleanly with zero persistent footprint.
- When closed, it must not leave blank margins, dead space, or phantom padding in the editor area.

### 3. Desktop Storage Fallback
- Project persistence must support both desktop and web seamlessly:
  - If running inside Tauri desktop (`isTauri()` is true), persist to native disk under `~/.torque/projects` via `TauriStorage` (`src/storage/tauriStorage.ts`).
  - If running in a web browser, fall back cleanly to IndexedDB (`src/storage/projectStore.ts`).
- Path traversal outside project bounds (`..`) must always be blocked and normalized via `normalizeFilePath`.

### 4. IntelliJ IDEA Aesthetics & JetBrains Design Language
- UI components must match IntelliJ IDEA New UI aesthetics:
  - Clean toolbar styling with status pills.
  - Dark (`darcula`) and Light (`intellij-light`) themes with subtle borders (`#323232` dark / `#d1d5db` light).
  - Standard JetBrains keyboard shortcut conventions (`Ctrl+B` / `Cmd+B` to build, `Ctrl+Alt+P` for package manager).
  - Welcome screen layout mirroring JetBrains Project Wizard cards and recent projects list.

### 5. Semantic Versioning Authority
- Version numbers are authoritatively defined in [`src/version.ts`](file:///home/mugdho/codes/torque/src/version.ts) (`APP_VERSION`).
- Any version bumps must update `src/version.ts` and `package.json` in tandem following SemVer 2.0.0.

---

## Verification Requirement
Every change must be validated by running:
1. `npm test` — all Vitest suites must pass with zero failures.
2. `npm run build` — Next.js static export must complete without TypeScript or bundling errors.
