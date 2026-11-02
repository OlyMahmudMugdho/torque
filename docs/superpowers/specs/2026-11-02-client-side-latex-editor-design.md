# Client-Side LaTeX Editor (Open-Source Prism Alternative) - Design Document

## 1. Intent & Why
OpenAI Prism demonstrated the power of an interactive, AI-assisted workspace tailored for scientific and mathematical writing. However, traditional online LaTeX editors (like Overleaf) and cloud solutions rely heavily on centralized, expensive backend compilation infrastructure (TeXLive server farms), which adds latency, privacy concerns for sensitive academic drafts, and operational maintenance costs.

This project builds an open-source, client-side web alternative:
- **Private & Local-First:** All compilation happens 100% inside the user's browser via WebAssembly (`glyphtex-engine` based on Tectonic). Documents and assets never leave the browser to compile.
- **Snappy & Cost-Free:** Zero server compute required for TeX builds.
- **Phase 1 Foundation:** Establishes a robust multi-file LaTeX workspace with Monaco Editor, trigger-based WebAssembly compilation, and real-time PDF viewing.
- **AI-Ready:** Architected with clean programmatic hooks so that Phase 2 can seamlessly integrate conversational, inline, or agentic AI editing and self-repairing compile loops.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Monaco Code Editor:** Provide a full-featured code editor with LaTeX syntax highlighting, line numbers, bracket matching, and standard keyboard shortcuts.
- **Web Worker Compilation:** Run `glyphtex-engine` inside a dedicated Web Worker to compile LaTeX projects without ever freezing or stuttering the main UI thread.
- **Structured Error Diagnostics:** Ingest structured diagnostics (severity, line numbers, error messages) from `glyphtex-engine` and project them directly onto Monaco editor lines as error markers/squiggles, along with an interactive compile log panel.
- **Multi-File Workspace & File Tree:** Support multi-file projects (e.g., `main.tex`, chapters, `.bib` files, images, custom `.sty`/`.cls` files) with create, rename, delete, and upload actions.
- **Multi-Project Management:** Support creating, naming, deleting, and switching between multiple independent projects locally in the browser.
- **Browser-Local Persistence:** Persist all projects and files reliably in the browser (IndexedDB) so work is saved across sessions without requiring accounts or logins.
- **PDF Preview Pane:** Embed a high-performance PDF viewer (via PDF.js) displaying the compiled PDF with zoom, page navigation, and responsive split-pane layout.
- **Trigger-Based Compilation:** Compile only when explicitly triggered—either manually via the "Compile" button / hotkey (e.g., Cmd+Enter / Ctrl+Enter) or programmatically via an action hook (preparing for AI actions).
- **Import / Export:** Enable importing and exporting projects as `.zip` archives.

### Non-Goals (Phase 1)
- Bidirectional SyncTeX (clicking PDF to jump to source code and vice-versa is deferred to Phase 2).
- Backend user authentication, cloud database storage, or multi-user live real-time collaboration (e.g. CRDTs / WebSockets).
- Full inline AI generation or LLM streaming harnesses (reserved for Phase 2).

### Anti-Goals
- Auto-compiling on every keystroke (which would throttle browser CPU, exhaust battery, and produce constant syntax noise while typing).
- Calling remote TeX compilation servers or transmitting user LaTeX code to any third-party build service.

---

## 3. Constraints
- **Client-Side WASM Execution:** All TeX processing must occur in WebAssembly. The WASM binary and engine must load smoothly and gracefully handle initial asset caching.
- **No UI Freezes:** Heavy compilation tasks or PDF byte manipulations must not block Monaco or user interactions.
- **Browser Compatibility:** Must run on modern desktop evergreen browsers (Chrome, Firefox, Safari, Edge) that support WebAssembly, Web Workers, and IndexedDB/OPFS.

---

## 4. Approaches Considered

### Approach 1: Browser-Local Persistence (OPFS / IndexedDB) + Web Worker *(Selected)*
- **Architecture:** Client-only Single Page Application (Vite + React + TypeScript). Project files stored in the browser using OPFS / IndexedDB. Compilation executed inside a Web Worker wrapping `glyphtex-engine`.
- **Trade-offs:** 
  - *Pros:* Zero backend cost, runs in any modern browser, instant private workspace, zero latency, works offline once the WASM bundle is cached.
  - *Cons:* Files live inside the browser sandbox; users must export/import zips to sync with desktop/git.
- **Selection Rationale:** Selected by the user as the cleanest, most reliable, and immediately usable foundation for the Phase 1 milestone.

### Approach 2: Direct Local Folder Mapping (File System Access API) + Worker
- **Architecture:** Mounts a real local directory from disk via `showDirectoryPicker()`.
- **Trade-offs:** 
  - *Pros:* Direct disk editing, natural Git workflow.
  - *Cons:* Non-standard cross-browser support (Chromium-only; broken/absent in Safari and Firefox without fallback code) and friction with re-authorizing disk permissions.

### Approach 3: Client-Compiled with Lightweight Cloud Sync
- **Architecture:** Client-side WASM compilation paired with a minimal Node/Supabase backend for user accounts and cloud file sync.
- **Trade-offs:** 
  - *Pros:* Multi-device access without manual zip management.
  - *Cons:* Bloats initial scope with auth, database models, and sync conflict resolution, distracting from core editor and compilation reliability.

---

## 5. System Architecture & Decisions

### 5.1 Technology Stack & Engine Distribution
- **Frontend Framework:** Vite + React + TypeScript + Tailwind CSS (for modern, responsive split-pane UI).
- **Editor:** `@monaco-editor/react` / `monaco-editor` with LaTeX language definition and diagnostic marker mapping.
- **Compilation Engine:** `glyphtex-engine` (public npm package `glyphtex-engine@0.1.0`) running inside a dedicated Web Worker. The engine loads Tectonic WebAssembly and format bundle assets served statically and cached via Cache API / IndexedDB.
- **Root Entry Point:** Defaults to `main.tex`, with an option in the file tree context menu to set any `.tex` file as the root compilation entry for the active project.
- **PDF Viewer:** `pdfjs-dist` (PDF.js) rendering PDF pages into a canvas viewer component with zoom, pan, page navigation, and download controls.
- **Storage Layer:** IndexedDB with two primary stores:
  - `projects`: `{ id: string, name: string, rootEntry: string, createdAt: number, updatedAt: number }`
  - `project_files`: keyed by compound `[projectId, path]`: `{ projectId: string, path: string, content: string | Uint8Array, isBinary: boolean, updatedAt: number }`
- **Archive Utility:** `jszip` for project zip export and import.

### 5.2 Workspace Layout
- **Top Navigation Bar:** Project selector dropdown (switch projects, create new, rename, delete, import zip), "Compile" button (with loading spinner and status badge: "Compiled in 1.2s", "Error", etc.), and layout toggles.
- **Left Panel (Collapsible):** File Explorer (active project tree, add file/folder, delete, upload image/asset, download current project as zip).
- **Center Panel:** Monaco Code Editor with tabs for open files, status bar indicating compilation status, and a bottom collapsible Log / Diagnostics console.
- **Right Panel:** PDF Previewer with zoom controls, fit-to-width, page selector, and download PDF button.
- **Split Resizers:** Draggable splitters between panels (using `react-resizable-panels`).

### 5.3 Compilation & Worker Lifecycle
1. User clicks "Compile" (or presses `Ctrl+Enter` / `Cmd+Enter`), or an external action hook is called:
2. The UI enters `compiling` state (disables redundant compile triggers, displays compile spinner).
3. The main thread packages current project files from the virtual file system (including the active dirty editor buffer) into a transfer payload.
4. The Web Worker receives the payload, mounts all files into `TexEngine`, and triggers `engine.compile({ entry: 'main.tex', synctex: true })`.
5. If compilation succeeds:
   - Worker retrieves `engine.pdf()` as a `Uint8Array`.
   - Worker posts `{ status: 'success', pdfData, diagnostics, durationMs }` back to the main thread.
   - Main thread updates the PDF viewer with an object URL or transferred array buffer, and clears error markers or sets minor warnings.
6. If compilation fails:
   - Worker posts `{ status: 'failed', diagnostics, durationMs }`.
   - Main thread maps diagnostics directly to Monaco markers:
     ```ts
     monaco.editor.setModelMarkers(model, 'glyphtex', diagnostics.map(d => ({
       startLineNumber: d.line ?? 1,
       startColumn: 1,
       endLineNumber: d.line ?? 1,
       endColumn: 1000,
       message: d.message,
       severity: d.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning
     })));
     ```
   - Opens the log console highlighting the error line and message.

### 5.4 AI Action Hook Interface (Phase 2 Prep)
The workspace will expose an `editorActions` interface:
```ts
interface WorkspaceActions {
  compile: () => Promise<CompileResult>;
  getFileContent: (path: string) => Promise<string>;
  setFileContent: (path: string, content: string) => Promise<void>;
  applyDiff: (path: string, original: string, modified: string) => Promise<void>;
  getDiagnostics: () => Diagnostic[];
}
```
This ensures Phase 2 AI harnesses can easily read code, apply diffs, trigger compilation, and read compile logs programmatically.

---

## 6. What's Left to the Builder
- Choice of specific icon library (e.g., `lucide-react`).
- Exact visual styling tokens (dark/light theme palette for panels and Monaco).
- Default starter template for new projects (standard LaTeX article with sample math, table, and bibliography reference).
- Virtual file system caching optimizations (only passing modified files to the worker where applicable).
