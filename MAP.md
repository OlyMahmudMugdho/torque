# Torque Architecture & Codebase Map

> **Torque**: Modern, open-source LaTeX IDE featuring IntelliJ IDEA aesthetics, native TeX Live execution, automated CTAN package resolution, and native Tauri desktop support.

---

## 1. Project Purpose & Core Architecture

Torque provides a full-featured LaTeX authoring environment powered by the host's native TeX Live distribution (`latexmk`, `pdflatex`, `xelatex`, `lualatex`) with automated CTAN package resolution and SyncTeX bi-directional navigation. It runs as a native desktop application via Tauri v2 or as a web client communicating with a lightweight TeX compilation backend.

### Architectural Pillars:
1. **Native TeX Live Execution**: Powered by host TeX Live (`latexmk`, `pdflatex`, `xelatex`, `lualatex`). Compiles standard LaTeX, XeLaTeX, and LuaLaTeX documents with full font, microtype, and multi-pass citation/cross-reference support.
2. **Automated CTAN Package Resolution**: Automatically detects missing packages, style files, classes, and font metrics from TeX compilation logs and resolves them directly from CTAN mirrors into the user TeXMF tree (`TEXMFHOME`), running `mktexlsr`/`texhash` and retrying compilation seamlessly.
3. **Unified Compiler Driver Architecture**: Single frontend controller (`CompilerDriver`) interfacing with native Tauri IPC (`src-tauri/src/compiler.rs`) in Desktop mode and HTTP server endpoints (`src/compiler/serverCompiler.ts`, `/api/compile`, `scripts/compiler-server.js`) in Web/Dev mode.
4. **IntelliJ IDEA New UI Aesthetics**: Dark (`darcula`) and Light (`intellij-light`) design language replicating JetBrains IDE toolbar styling, status pills (Idle, Compiling, Success, Failed, Duration, Engine selector), project trees, tab controls, menus, and keyboard shortcuts.
5. **SyncTeX Bi-Directional Navigation**: Generates `.synctex.gz` records during compilation and provides inverse search (click PDF preview to jump to source line) and forward search (jump from cursor to PDF coordinate).
6. **Multi-Platform Storage**: Automatically detects whether it is running within Tauri desktop (`~/.torque` on the local filesystem) or a web browser (IndexedDB via `projectStore.ts`).

---

## 2. High-Level System Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Next.js 16 UI Layer                             │
│                                                                        │
│  ┌───────────────────────┐             ┌────────────────────────────┐  │
│  │ TopMenuBar & TopBar   │             │ WelcomeHomeScreen          │  │
│  │ (Engine Switcher)     │             │ (JetBrains Wizard)         │  │
│  └───────────┬───────────┘             └─────────────┬──────────────┘  │
│              │                                       │                 │
│              ▼                                       ▼                 │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │              useWorkspace Hook (Workspace State)                 │  │
│  └───────┬───────────────────────┬──────────────────────────┬───────┘  │
│          │                       │                          │          │
│          ▼                       ▼                          ▼          │
│  ┌───────────────┐     ┌───────────────────┐     ┌──────────────────┐  │
│  │ MonacoEditor  │     │ PdfPreviewPane    │     │ DiagnosticsPanel │  │
│  │ (latexLang)   │     │ (SyncTeX Click)   │     │ (zero-space)     │  │
│  └───────────────┘     └───────────────────┘     └──────────────────┘  │
└──────────┬──────────────────────────────────────────────────┬──────────┘
           │                                                  │
           │ compile({ files, entry, engine, synctex })       ▼
           ▼                                      ┌──────────────────────┐
┌──────────────────────────────────────┐          │ Storage Abstraction  │
│ CompilerClient / CompilerDriver      │          │ ┌──────────────────┐ │
│ ┌──────────────────────────────────┐ │          │ │ TauriStorage     │ │
│ │ TauriCompilerDriver (Tauri IPC)  │ │          │ │ (~/.torque)      │ │
│ ├──────────────────────────────────┤ │          │ ├──────────────────┤ │
│ │ ServerCompilerDriver (HTTP POST) │ │          │ │ ProjectStore     │ │
│ └──────────────────────────────────┘ │          │ │ (IndexedDB)      │ │
└──────────────────┬───────────────────┘          │ └──────────────────┘ │
                   │                              └──────────────────────┘
                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Native TeX Live Execution Backend (Tauri Rust / Node.js Server)       │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ TeX Engine Runner: latexmk -pdf / -xelatex / -lualatex -synctex=1  │ │
│ ├────────────────────────────────────────────────────────────────────┤ │
│ │ Automated CTAN Resolver: detects missing .sty/.cls, fetches, unpacks││
│ ├────────────────────────────────────────────────────────────────────┤ │
│ │ User TeXMF Updater: texmf/tex/latex/..., runs mktexlsr / texhash   │ │
│ ├────────────────────────────────────────────────────────────────────┤ │
│ │ Log & Diagnostic Parser: extracts errors, line numbers, panics     │ │
│ └────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Comprehensive Directory & File Reference

### Root Directory
- [`package.json`](file:///home/mugdho/codes/torque/package.json): Package metadata, dependencies (`monaco-editor`, `pdfjs-dist`, `synctex-js`, `next`, `@tauri-apps/api`), and scripts (`dev`, `build`, `start`, `test`, `tauri`).
- [`version.ts`](file:///home/mugdho/codes/torque/src/version.ts): Single source of truth for semantic application version (`APP_VERSION = '0.1.0'`).
- [`next.config.mjs`](file:///home/mugdho/codes/torque/next.config.mjs): Static HTML export configuration (`output: 'export'`) with unoptimized images and trailing slash settings.
- [`tsconfig.json`](file:///home/mugdho/codes/torque/tsconfig.json): TypeScript compilation options and path aliases (`@/*` -> `./src/*`).
- [`tailwind.config.js`](file:///home/mugdho/codes/torque/tailwind.config.js): Tailwind CSS utility framework settings.
- [`AGENTS.md`](file:///home/mugdho/codes/torque/AGENTS.md): Operational rules and instructions for AI agents working in this repository.
- [`MAP.md`](file:///home/mugdho/codes/torque/MAP.md): This file — authoritative architectural map.

---

### `src/app/` — Next.js 16 App Router
- [`src/app/layout.tsx`](file:///home/mugdho/codes/torque/src/app/layout.tsx): Root layout mounting font definitions and wrapping child pages with `<ThemeProvider>`.
- [`src/app/page.tsx`](file:///home/mugdho/codes/torque/src/app/page.tsx): Main entry page rendering the workspace UI or welcome screen via dynamic client import.
- [`src/app/globals.css`](file:///home/mugdho/codes/torque/src/app/globals.css): Global CSS stylesheets, Tailwind directives, and IntelliJ UI scrollbar stylings.
- [`src/app/api/compile/route.ts`](file:///home/mugdho/codes/torque/src/app/api/compile/route.ts): App Router HTTP compilation endpoint delegating to `serverCompiler.ts`.

---

### `src/compiler/` — Native TeX Compilation Subsystem
- [`src/compiler/compilerDriver.ts`](file:///home/mugdho/codes/torque/src/compiler/compilerDriver.ts):
  - Unified driver interface (`CompilerDriver`) for detecting TeX Live environments and compiling projects.
  - Implementations: `TauriCompilerDriver` (native Tauri IPC via `tauri_compile_latex` and `tauri_detect_texlive`), `ServerCompilerDriver` (HTTP client posting to `/api/compile` or standalone compiler server), and factory `getActiveCompilerDriver()`.
- [`src/compiler/compilerClient.ts`](file:///home/mugdho/codes/torque/src/compiler/compilerClient.ts):
  - Main-thread compilation controller.
  - Enforces single-concurrency guard (`isCompiling()`), progress event callbacks (`compiling`, `resolving`), compilation timeout handling, and SyncTeX decoding.
- [`src/compiler/serverCompiler.ts`](file:///home/mugdho/codes/torque/src/compiler/serverCompiler.ts):
  - Standalone Node.js compilation runner executing native `latexmk` / TeX Live binaries in temporary build directories.
  - Automatically parses TeX logs, extracts missing package names, and downloads missing CTAN archives.
- [`src/compiler/synctexParser.ts`](file:///home/mugdho/codes/torque/src/compiler/synctexParser.ts):
  - SyncTeX parser and gzip decompressor extracting line, page, and bounding box coordinate records.
- [`src/compiler/synctexResolver.ts`](file:///home/mugdho/codes/torque/src/compiler/synctexResolver.ts):
  - Forward and inverse SyncTeX coordinate mapping helper between editor line numbers and PDF preview canvas points.
- [`src/compiler/__tests__/`](file:///home/mugdho/codes/torque/src/compiler/__tests__/):
  - Comprehensive unit test suites for compiler driver, server compiler, client lifecycle, and SyncTeX parser.

---

### `src-tauri/` — Native Desktop Backend (Rust)
- [`src-tauri/src/main.rs`](file:///home/mugdho/codes/torque/src-tauri/src/main.rs): Tauri entry point.
- [`src-tauri/src/lib.rs`](file:///home/mugdho/codes/torque/src-tauri/src/lib.rs): Tauri application builder, state management, and command registration.
- [`src-tauri/src/compiler.rs`](file:///home/mugdho/codes/torque/src-tauri/src/compiler.rs):
  - Native TeX Live execution orchestrator.
  - Spawns `latexmk` with `-pdf`, `-xelatex`, or `-lualatex`, passing `-synctex=1` and `-interaction=nonstopmode`.
  - Parses TeX log output into structured diagnostics and detects missing `.sty`, `.cls`, and font metric errors.
  - Coordinates automated package resolution with `package_resolver.rs` and re-runs compilation passes until completion.
- [`src-tauri/src/package_resolver.rs`](file:///home/mugdho/codes/torque/src-tauri/src/package_resolver.rs):
  - Automated CTAN package resolver.
  - Fetches package archives directly from CTAN mirrors (TDS zip, flat zip, raw files), unpacks them into the user TeXMF tree (`TEXMFHOME`), and runs `mktexlsr` / `texhash`.
- [`src-tauri/src/storage.rs`](file:///home/mugdho/codes/torque/src-tauri/src/storage.rs): Native filesystem operations managing `~/.torque/projects` and `~/.torque/cache/packages`.
- [`src-tauri/tauri.conf.json`](file:///home/mugdho/codes/torque/src-tauri/tauri.conf.json): Tauri v2 configuration (window size, title, permissions, bundle identifier, packaging metadata).

---

### `src/components/` — IntelliJ New UI Component Hierarchy
- [`src/components/WelcomeHomeScreen.tsx`](file:///home/mugdho/codes/torque/src/components/WelcomeHomeScreen.tsx):
  - JetBrains/IntelliJ IDEA-style welcome screen displayed when no project is open.
  - Features quick action cards: *New Project*, *Open (from disk/zip)*, *Clone (from Git)*, and *Remote Dev*.
  - Project list with search filtering, last-modified timestamps, context menu (rename/delete), and drag-and-drop `.zip` import zone.
- [`src/components/TopMenuBar.tsx`](file:///home/mugdho/codes/torque/src/components/TopMenuBar.tsx):
  - IntelliJ New UI application menu bar: *File*, *Edit*, *View*, *Tools*, *Help*.
  - Keyboard shortcut hints (`Ctrl+B`, `Ctrl+S`, `Ctrl+Alt+P`), modal triggers (Package Manager, Settings, About), and export actions.
- [`src/components/ProjectTopBar.tsx`](file:///home/mugdho/codes/torque/src/components/ProjectTopBar.tsx):
  - Editor header with project breadcrumbs, active root file badge, compilation status indicator (Idle, Compiling, Success, Failed, Duration), compile button (`Ctrl+B`), engine switcher (`pdflatex`, `xelatex`, `lualatex`), and theme toggle.
- [`src/components/PackageManagerModal.tsx`](file:///home/mugdho/codes/torque/src/components/PackageManagerModal.tsx):
  - LaTeX package catalog & inspector.
  - Category filters (*Math*, *Physics*, *Graphics*, *Layout*, *Typography*, *Citations*, *Code*, *Tables*).
  - Search by package name or description.
  - One-click *Insert \usepackage* inserting required declaration directly into root entry preamble.
- [`src/components/TexSetupGuide.tsx`](file:///home/mugdho/codes/torque/src/components/TexSetupGuide.tsx):
  Modal shown when a compile result has `missingRequirements` (TeX Live / latexmk / engine missing). Lists what is missing, per-OS install commands (detected OS highlighted), and a Re-check button. Backed by a requirement preflight in Rust `compiler.rs` (`compute_missing_requirements`, `ensure_tex_path`) and Node `serverCompiler.ts` / `scripts/compiler-server.js` (`computeMissingRequirements`, `ensureTexPath`) that returns a failed result immediately.
- [`src/components/DiagnosticsLogPanel.tsx`](file:///home/mugdho/codes/torque/src/components/DiagnosticsLogPanel.tsx):
  - IntelliJ-style bottom *Problems / Build Output* tool window.
  - Zero-space dismissal: collapses to 0 height when closed without consuming editor space.
  - Severity filtering (*Errors*, *Warnings*, *Info*), jump-to-source click handling, and auto-download notification pill.
- [`src/components/FileTreeSidebar.tsx`](file:///home/mugdho/codes/torque/src/components/FileTreeSidebar.tsx):
  - IntelliJ Project Explorer tree view.
  - Create file/folder, rename, delete, download, and *Set as Root Entry* actions.
- [`src/components/PdfPreviewPane.tsx`](file:///home/mugdho/codes/torque/src/components/PdfPreviewPane.tsx):
  - PDF renderer powered by `pdfjs-dist` with SyncTeX inverse search (click to jump to editor source line).
  - Zoom controls (fit width, zoom in/out), page navigation, and download/print triggers.

---

### `src/context/` — Context & Theme Providers
- [`src/context/ThemeContext.tsx`](file:///home/mugdho/codes/torque/src/context/ThemeContext.tsx):
  - Manages dark (`darcula`) vs light (`intellij-light`) theme state.
  - Persists preference to `localStorage` and synchronizes `html.dark` class and Monaco editor theme.

---

### `src/editor/` — Monaco Editor Integration
- [`src/editor/MonacoEditorPane.tsx`](file:///home/mugdho/codes/torque/src/editor/MonacoEditorPane.tsx):
  - Wraps `@monaco-editor/react`.
  - Binds keyboard shortcuts, registers IntelliJ Darcula and Light color themes, synchronizes diagnostics to Monaco editor markers.
- [`src/editor/latexLanguage.ts`](file:///home/mugdho/codes/torque/src/editor/latexLanguage.ts):
  - Custom Monaco Monarch syntax tokenizer for LaTeX: commands, environments, math mode (`$...$`, `$$...$$`), comments, and brackets.

---

### `src/packages/` — Package Catalog Subsystem
- [`src/packages/packageCatalog.ts`](file:///home/mugdho/codes/torque/src/packages/packageCatalog.ts):
  - Curated registry and metadata definition (`DEFAULT_PACKAGE_CATALOG`) of 50+ popular LaTeX packages.
- [`src/packages/packageManager.ts`](file:///home/mugdho/codes/torque/src/packages/packageManager.ts):
  - Package catalog queries and preamble analyzer: parses existing `\usepackage{}` declarations and safely inserts new packages before `\begin{document}`.
- [`src/packages/packageTypes.ts`](file:///home/mugdho/codes/torque/src/packages/packageTypes.ts):
  - Type definitions for `LatexPackage` and `PackageCategory`.

---

### `src/storage/` — Persistence Subsystem
- [`src/storage/pathUtils.ts`](file:///home/mugdho/codes/torque/src/storage/pathUtils.ts):
  - Path normalization ensuring security against directory traversal attacks (`normalizeFilePath`).
- [`src/storage/projectStore.ts`](file:///home/mugdho/codes/torque/src/storage/projectStore.ts):
  - High-level project storage manager. Detects desktop vs web environment and routes operations to either `TauriStorage` or browser IndexedDB (`torque_latex_db`).
- [`src/storage/packageCache.ts`](file:///home/mugdho/codes/torque/src/storage/packageCache.ts):
  - Persistent package cache interface for cached package assets.
- [`src/storage/tauriStorage.ts`](file:///home/mugdho/codes/torque/src/storage/tauriStorage.ts):
  - Desktop-specific storage bridge invoking Tauri IPC commands. Stores project files under `~/.torque/projects/<id>/`.

---

### `src/workspace/` — Workspace Controller
- [`src/workspace/useWorkspace.ts`](file:///home/mugdho/codes/torque/src/workspace/useWorkspace.ts):
  - Primary React hook encapsulating state for active project, files, active tab, compiler client, compilation status, diagnostics, and PDF byte buffer.

---

### `src/archive/` — Zip Archive Support
- [`src/archive/zipArchive.ts`](file:///home/mugdho/codes/torque/src/archive/zipArchive.ts):
  - Export project to standard `.zip` file for sharing or Overleaf compatibility.
  - Import `.zip` archives into new projects with automatic binary/text file distinction.

---

### `scripts/` — Tooling & Development
- [`scripts/compiler-server.js`](file:///home/mugdho/codes/torque/scripts/compiler-server.js):
  - Standalone lightweight TeX Live HTTP compilation server with auto-resolution and SyncTeX support.
- [`scripts/dev.js`](file:///home/mugdho/codes/torque/scripts/dev.js):
  - Spawns both the compilation server and Next.js dev server concurrently.
- [`scripts/serve.js`](file:///home/mugdho/codes/torque/scripts/serve.js):
  - Static production server serving export output (`out/`).

---

### `public/` — Static Web Assets
- `public/pdf.worker.min.mjs`: Worker script for PDF preview rendering via `pdfjs-dist`.

---

## 4. Development Workflow & Verification Commands

```bash
# Install dependencies
npm install

# Run unit and integration tests (Vitest)
npm test

# Build Next.js static export
npm run build

# Run native backend tests (Cargo)
cargo test --manifest-path src-tauri/Cargo.toml

# Launch desktop app in development mode
npm run tauri:dev
```
