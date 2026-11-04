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

### 1. Native TeX Live Execution & Automated Package Resolution
- TeX compilation is powered by the native host TeX Live distribution (`latexmk`, `pdflatex`, `xelatex`, `lualatex`).
- Compilation runs natively through Tauri IPC (`src-tauri/src/compiler.rs`) on Desktop and through the lightweight compilation server (`src/compiler/serverCompiler.ts`, `src/app/api/compile/route.ts`, `scripts/compiler-server.js`) in Web / Dev environments via the unified `CompilerDriver` interface (`src/compiler/compilerDriver.ts`).
- Missing packages, style files, classes, and font metrics are automatically detected from TeX compilation logs and resolved directly from CTAN mirrors into the user TeXMF tree (`src-tauri/src/package_resolver.rs` and standalone compiler server).
- Multi-pass compilation is managed by `latexmk` with full SyncTeX generation (`synctex=1`), enabling bi-directional navigation between Monaco editor and PDF preview.
- TeX log output is parsed into structured diagnostics with accurate line numbers, severity levels (error, warning, info), and missing file notifications.

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
  - Clean toolbar styling with status pills (Idle, Compiling, Success, Failed, Duration, Engine selector).
  - Dark (`darcula`) and Light (`intellij-light`) themes with subtle borders (`#323232` dark / `#d1d5db` light).
  - Standard JetBrains keyboard shortcut conventions (`Ctrl+B` / `Cmd+B` to build, `Ctrl+Alt+P` for package catalog).
  - Welcome screen layout mirroring JetBrains Project Wizard cards and recent projects list.

### 5. Semantic Versioning Authority
- Version numbers are authoritatively defined in [`src/version.ts`](file:///home/mugdho/codes/torque/src/version.ts) (`APP_VERSION`).
- Any version bumps must update `src/version.ts` and `package.json` in tandem following SemVer 2.0.0.

---

## Verification Requirement
Every change must be validated by running:
1. `npm test` — all Vitest suites must pass with zero failures.
2. `npm run build` — Next.js build must complete without TypeScript or bundling errors.
3. `cargo test --manifest-path src-tauri/Cargo.toml` — all Rust tests must pass with zero failures.
