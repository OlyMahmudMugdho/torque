# Torque Architecture & Codebase Map

> **Torque**: Modern, open-source, client-side WebAssembly LaTeX IDE featuring IntelliJ IDEA aesthetics, instant browser compilation, and native Tauri desktop support.

---

## 1. Project Purpose & Core Architecture

Torque provides a full-featured, zero-server LaTeX authoring environment that runs completely inside the user's browser or as a native desktop application via Tauri v2.

### Architectural Pillars:
1. **100% Client-Side WebAssembly Compilation**: Powered by `glyphtex-engine` (Tectonic compiled to WASM). Documents compile locally without sending code to remote servers, preserving privacy and enabling offline use.
2. **Web Worker Isolation**: The TeX WASM engine runs in a dedicated background worker (`compiler.worker.ts`), preventing UI freezes in the Monaco editor and preview panes.
3. **IntelliJ IDEA New UI Aesthetics**: Dark (`darcula`) and Light (`intellij-light`) design language replicating JetBrains IDE toolbar styling, project trees, tab controls, menus, and keyboard shortcuts.
4. **Unified Multi-Platform Storage**: Automatically detects whether it is running within Tauri desktop (`~/.torque` on the local filesystem) or a web browser (IndexedDB via `fake-indexeddb` / browser IDB).
5. **Smart Package Resolution**: Preloads core standard TeX assets (`latex.fmt`, standard classes, AMS, TikZ, Latin Modern fonts) while fetching additional packages on demand from `/bundle/`.

---

## 2. High-Level System Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Next.js 16 UI Layer                             │
│                                                                        │
│  ┌───────────────────────┐             ┌────────────────────────────┐  │
│  │ TopMenuBar & TopBar   │             │ WelcomeHomeScreen          │  │
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
│  │ (latexLang)   │     │ (pdfjs-dist)      │     │ (zero-space)     │  │
│  └───────────────┘     └───────────────────┘     └──────────────────┘  │
└──────────┬──────────────────────────────────────────────────┬──────────┘
           │                                                  │
           │ postMessage({ files, entry })                    │
           ▼                                                  ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────┐
│ compiler.worker.ts                   │  │ Storage Abstraction          │
│ ┌──────────────────────────────────┐ │  │ ┌──────────────────────────┐ │
│ │ WebAssembly.Module (Precompiled) │ │  │ │ TauriStorage (~/.torque) │ │
│ ├──────────────────────────────────┤ │  │ ├──────────────────────────┤ │
│ │ TexEngine (glyphtex-engine)      │ │  │ │ ProjectStore (IndexedDB) │ │
│ ├──────────────────────────────────┤ │  │ └──────────────────────────┘ │
│ │ Stderr / Stdout Capturer         │ │  └──────────────────────────────┘
│ ├──────────────────────────────────┤ │
│ │ On-Demand Bundle Resolver        │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

---

## 3. Comprehensive Directory & File Reference

### Root Directory
- [`package.json`](file:///home/mugdho/codes/torque/package.json): Package metadata, dependencies (`glyphtex-engine`, `monaco-editor`, `pdfjs-dist`, `next`, `@tauri-apps/api`), and scripts (`dev`, `build`, `start`, `test`, `tauri`).
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

---

### `src/compiler/` — WebAssembly TeX Compiler Subsystem
- [`src/compiler/compiler.worker.ts`](file:///home/mugdho/codes/torque/src/compiler/compiler.worker.ts):
  - Dedicated Web Worker executing `TexEngine` off the main thread.
  - **Module Caching**: Compiles `WebAssembly.Module` once (`getWasmModule()`) and reuses it across engine instances for instant engine recreation.
  - **Auto Engine Invalidation**: If a compile fails or traps, `currentEngine` is set to `null` so corrupted WASM linear memory / `bridge_core` state never poisons subsequent compilations.
  - **Diagnostic & Log Extraction**: Captures `onStderr` and `onStdout` to parse panic reasons, missing file notices, and LaTeX syntax errors into structured diagnostics.
  - **XeTeX Font Name Probe Resolution**: Automatically strips `.sty.aux`, probe suffixes, brackets (`[...]`), and `:mapping` specifiers from XeTeX font lookups to match files in `/bundle/`.
  - **TikZ & AMS Preload**: Bundles core TeX packages, Latin Modern Roman fonts, and TikZ libraries upfront.
- [`src/compiler/compilerClient.ts`](file:///home/mugdho/codes/torque/src/compiler/compilerClient.ts):
  - Main thread controller interfacing with `compiler.worker.ts`.
  - Enforces single-concurrency guard (`isCompiling()`), generates unique request IDs, handles timeouts, and disposes worker instances gracefully on error.
- [`src/compiler/compilerProtocol.ts`](file:///home/mugdho/codes/torque/src/compiler/compilerProtocol.ts):
  - Data contracts between main thread and worker (`CompileWorkerRequest`, `CompileWorkerResponse`, `CompileWorkerResult`).
- [`src/compiler/__tests__/`](file:///home/mugdho/codes/torque/src/compiler/__tests__/):
  - Comprehensive unit and integration test suite for engine lifecycle, diagnostics parsing, and concurrency protection.

---

### `src/components/` — IntelliJ New UI Component Hierarchy
- [`src/components/WelcomeHomeScreen.tsx`](file:///home/mugdho/codes/torque/src/components/WelcomeHomeScreen.tsx):
  - JetBrains/IntelliJ IDEA-style welcome screen displayed when no project is open.
  - Features quick action cards: *New Project*, *Open (from disk/zip)*, *Clone (from Git)*, and *Remote Dev*.
  - Project list with search filtering, last-modified timestamps, context menu (rename/delete), and drag-and-drop `.zip` import zone.
- [`src/components/TopMenuBar.tsx`](file:///home/mugdho/codes/torque/src/components/TopMenuBar.tsx):
  - IntelliJ New UI application menu bar: *File*, *Edit*, *View*, *Tools*, *Help*.
  - Keyboard shortcut hints (`Ctrl+B`, `Ctrl+S`, `Ctrl+Alt+P`), modal triggers (Package Manager, Settings, About), and export actions.
- [`src/components/PackageManagerModal.tsx`](file:///home/mugdho/codes/torque/src/components/PackageManagerModal.tsx):
  - Interactive LaTeX package browser and manager.
  - Category filters (*Math & Science*, *Graphics & TikZ*, *Layout & Formatting*, *Tables*, *Code & Algorithms*).
  - Search by package name or description.
  - One-click *Add to Document* inserting required `\usepackage{...}` snippet directly into root entry preamble.
- [`src/components/DiagnosticsLogPanel.tsx`](file:///home/mugdho/codes/torque/src/components/DiagnosticsLogPanel.tsx):
  - IntelliJ-style bottom *Problems / Build Output* tool window.
  - Zero-space dismissal: collapses to 0 height when closed without consuming editor space.
  - Severity filtering (*Errors*, *Warnings*, *Info*), jump-to-source click handling, and quick-fix button for missing packages.
- [`src/components/ProjectTopBar.tsx`](file:///home/mugdho/codes/torque/src/components/ProjectTopBar.tsx):
  - Editor header with project breadcrumbs, active root file badge, compilation status indicator (Idle, Compiling, Success, Failed, Duration), compile button (`Ctrl+B`), and dark/light theme switch.
- [`src/components/FileTreeSidebar.tsx`](file:///home/mugdho/codes/torque/src/components/FileTreeSidebar.tsx):
  - IntelliJ Project Explorer tree view.
  - Create file/folder, rename, delete, download, and *Set as Root Entry* actions.
- [`src/components/PdfPreviewPane.tsx`](file:///home/mugdho/codes/torque/src/components/PdfPreviewPane.tsx):
  - Client-side PDF renderer powered by `pdfjs-dist`.
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

### `src/packages/` — Package Manager Subsystem
- [`src/packages/packageManager.ts`](file:///home/mugdho/codes/torque/src/packages/packageManager.ts):
  - Curated registry of 50+ popular LaTeX packages with descriptions, categories, dependencies, and code snippets.
  - Preamble analyzer: parses existing `\usepackage{}` declarations, detects missing packages, and safely inserts new packages before `\begin{document}`.
  - Manages package installation status, synchronizing with both the preloaded bundle and the persistent package cache.
- [`src/packages/packageDownloader.ts`](file:///home/mugdho/codes/torque/src/packages/packageDownloader.ts):
  - CTAN and TeX Live CDN mirror downloader with resilient fallback, content validation (rejecting HTML error pages and empty responses), and multi-file package resolution.
  - Persists retrieved files directly into `packageCache`.
- [`src/packages/packageTypes.ts`](file:///home/mugdho/codes/torque/src/packages/packageTypes.ts):
  - Type definitions for `LatexPackage`, `PackageCategory`, and package manager events.

---

### `src/storage/` — Persistence Subsystem
- [`src/storage/projectStore.ts`](file:///home/mugdho/codes/torque/src/storage/projectStore.ts):
  - High-level project storage manager. Detects desktop vs web environment and routes operations to either `TauriStorage` or browser IndexedDB (`torque_latex_db`).
  - Path normalization ensuring security against directory traversal attacks.
- [`src/storage/packageCache.ts`](file:///home/mugdho/codes/torque/src/storage/packageCache.ts):
  - Persistent global cache for downloaded CTAN LaTeX packages.
  - In Web: IndexedDB database (`torque_package_cache`, object store `packages`).
  - In Desktop: Native filesystem storage (`~/.torque/cache/packages/`) via Tauri IPC.
  - Enforces strict filename sanitization and extension whitelisting (`.sty`, `.cls`, `.def`, `.fd`, `.tfm`, `.tex`).
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

### `src-tauri/` — Native Desktop Backend (Rust)
- [`src-tauri/src/main.rs`](file:///home/mugdho/codes/torque/src-tauri/src/main.rs): Tauri entry point.
- [`src-tauri/src/lib.rs`](file:///home/mugdho/codes/torque/src-tauri/src/lib.rs): Tauri application builder and IPC command registration.
- [`src-tauri/src/storage.rs`](file:///home/mugdho/codes/torque/src-tauri/src/storage.rs): Native filesystem operations managing `~/.torque/projects`, reading/writing text & binary assets.
- [`src-tauri/tauri.conf.json`](file:///home/mugdho/codes/torque/src-tauri/tauri.conf.json): Tauri v2 configuration (window size, title, permissions, bundle identifier, packaging metadata, and multi-platform bundle targets).

---

### `.github/workflows/` — Continuous Integration & Releases
- [`.github/workflows/release.yml`](file:///home/mugdho/codes/torque/.github/workflows/release.yml): Multi-platform GitHub Actions release matrix building binaries for Linux (`deb`, `rpm`, `AppImage`), Windows (`nsis` `.exe`, `msi`), and macOS (`dmg`, `app`), uploading built artifacts directly to GitHub Releases.

---

### `public/` — Static Web Assets & TeX Distribution
- `public/wasm/tectonic_wasm.wasm`: Precompiled WebAssembly binary of Tectonic.
- `public/bundle/`: TeX Live distribution files (LaTeX format `latex.fmt`, standard packages, AMS fonts `.tfm`/`.pfb`, TikZ `.code.tex`, Latin Modern fonts `.otf`).
- `public/bundle/manifest.json`: List of all available bundle files for fast in-worker presence checks.

---

### `scripts/` — Tooling & Development
- [`scripts/serve.js`](file:///home/mugdho/codes/torque/scripts/serve.js): Lightweight static HTTP server for running the production export (`out/`) with correct MIME types for `.wasm`, `.otf`, and `.tfm`.
- [`scripts/test-compile.mjs`](file:///home/mugdho/codes/torque/scripts/test-compile.mjs): Standalone Node.js script for verifying WASM compilation with `glyphtex-engine`.

---

### `skills/` & `docs/` — Agent Skills & Specifications
- [`skills/client-side-latex-wasm/SKILL.md`](file:///home/mugdho/codes/torque/skills/client-side-latex-wasm/SKILL.md): Comprehensive agent skill for client-side LaTeX WASM integration.
- `docs/superpowers/`: Architecture specifications and implementation plans.

---

## 4. Development Workflow & Verification Commands

```bash
# Install dependencies
npm install

# Run unit and integration tests (Vitest)
npm test

# Build Next.js static export
npm run build

# Run production static server
npm run start

# Launch desktop app in development mode
npm run tauri:dev
```
