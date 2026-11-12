---
name: torque-ide-development
description: Authoritative guide for developing, extending, testing, and debugging the Torque LaTeX IDE, including native TeX Live compilation, automated CTAN package resolution, compiler drivers, embedded MCP server, AI assistant multi-turn loop with Auto Edit and interactive message queuing, IntelliJ New UI design language, and desktop/web persistence.
---

# Torque IDE Development & Architecture Guide

Torque is a modern, open-source LaTeX IDE featuring IntelliJ IDEA aesthetics, native host TeX Live execution (`latexmk`, `pdflatex`, `xelatex`, `lualatex`), automated CTAN package resolution directly into user `TEXMFHOME`, SyncTeX bi-directional navigation, multi-window Tauri desktop integration with a native splash screen, an embedded Model Context Protocol (MCP) server, and an embedded multi-turn AI Assistant with Auto Edit mode, message queuing, and live thinking/activity indicators.

---

## 1. Critical Architecture Invariants

All developers and agents working on Torque must uphold five non-negotiable invariants:

### 1.1 Native TeX Live Execution & Automated CTAN Resolution
- Compilation runs native host TeX Live binaries (`latexmk`, `pdflatex`, `xelatex`, `lualatex`).
- Compilation runs natively through Tauri IPC (`src-tauri/src/compiler.rs`) on Desktop and through the lightweight compilation server (`src/compiler/serverCompiler.ts`, `src/app/api/compile/route.ts`, `scripts/compiler-server.js`) in Web / Dev environments via the unified `CompilerDriver` interface (`src/compiler/compilerDriver.ts`).
- Missing packages, style files (`.sty`), classes (`.cls`), and font metrics (`.tfm`, `.pfb`, `.otf`) are automatically detected from TeX compilation logs and resolved directly from CTAN mirrors into the user TeXMF tree (`TEXMFHOME`, typically `~/.torque/texmf` or `~/texmf`).
- Automated package resolution unpacks TDS archives, flat zip archives, or raw files, runs `mktexlsr` / `texhash`, and restarts the compilation pass seamlessly up to a configurable maximum attempt threshold.
- Multi-pass compilation is managed by `latexmk` with full SyncTeX generation (`-synctex=1`), enabling bi-directional navigation between Monaco editor and PDF preview.

### 1.2 Zero-Space Diagnostic Pane
- The Problems / Build Output panel (`src/components/DiagnosticsLogPanel.tsx`) must dismiss cleanly with zero persistent footprint.
- When closed, it must return `null` and not leave blank margins, dead space, phantom padding, or borders in the editor layout area.

### 1.3 Desktop Storage Fallback & Path Traversal Prevention
- Project persistence must support both desktop and web seamlessly:
  - Inside Tauri desktop (`isTauri()` is `true`), persist to native disk under `~/.torque/projects/<projectId>/` via `TauriStorage` (`src/storage/tauriStorage.ts`).
  - In a standard web browser, fall back cleanly to IndexedDB (`torque_latex_db`) via `ProjectStore` (`src/storage/projectStore.ts`).
- Path traversal outside project bounds (`..`, absolute paths with root prefixes) must always be blocked and sanitized via `normalizeFilePath` (`src/storage/pathUtils.ts`) and `normalize_path` (`src-tauri/src/storage.rs`).

### 1.4 IntelliJ IDEA Aesthetics & JetBrains Design Language
- UI components must strictly adhere to IntelliJ IDEA New UI aesthetics:
  - Clean toolbar styling with centered run widget pill (Run / Compile button, TeX Engine dropdown, Stop button, status pills: Idle, Compiling, Success, Failed, Duration).
  - Dark (`darcula`, `#1e1f22`, `#2b2d30`, `#323232`) and Light (`intellij-light`, `#f8f9fa`, `#ffffff`, `#d1d5db`) color palettes.
  - Standard JetBrains keyboard shortcut conventions (`Ctrl+B` / `Cmd+B` to build, `Ctrl+Alt+S` for Settings, `Ctrl+S` to save, `Ctrl+Alt+P` for package catalog).
  - Welcome screen layout mirroring JetBrains Project Wizard cards (New Project, Open from disk/folder, Get from VCS, Remote Dev) and recent projects list with search filtering.

### 1.5 Semantic Versioning Authority
- Version numbers are authoritatively defined in [`src/version.ts`](file:///home/mugdho/codes/torque/src/version.ts) (`APP_VERSION`).
- Any version bumps must update `src/version.ts`, `package.json`, and `src-tauri/tauri.conf.json` / `Cargo.toml` in tandem following SemVer 2.0.0.

---

## 2. Compilation Subsystem & Driver Architecture

Torque abstracts TeX compilation behind a clean, multi-runtime driver architecture:

```
┌────────────────────────────────────────────────────────┐
│                   Monaco / Workspace UI                │
└───────────────────────────┬────────────────────────────┘
                            │ compile({ files, entry, engine, synctex })
                            ▼
┌────────────────────────────────────────────────────────┐
│         CompilerClient (Single Concurrency Guard)      │
└───────────────────────────┬────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
┌───────────────────────────┐ ┌───────────────────────────┐
│   TauriCompilerDriver     │ │   ServerCompilerDriver    │
│   (Native Desktop IPC)    │ │   (HTTP POST /api/compile)│
└─────────────┬─────────────┘ └───────────┬───────────────┘
              │                           │
              ▼                           ▼
┌───────────────────────────┐ ┌───────────────────────────┐
│ src-tauri/src/compiler.rs │ │ scripts/compiler-server.js│
│ - Spawns latexmk          │ │ - Spawns latexmk          │
│ - Parses TeX log output   │ │ - Parses TeX log output   │
│ - Automated CTAN Resolver │ │ - Automated CTAN Resolver │
│ - User TEXMF integration  │ │ - User TEXMF integration  │
└───────────────────────────┘ └───────────────────────────┘
```

### 2.1 Unified Drivers
- `CompilerDriver`: Base interface (`detectEnvironment()`, `compile(request)`).
- `TauriCompilerDriver`: Dispatches to Tauri native commands `tauri_compile_latex` and `tauri_detect_texlive`.
- `ServerCompilerDriver`: Posts multipart or JSON payloads to `/api/compile` or standalone compiler server on `127.0.0.1:3030`.
- `getActiveCompilerDriver()`: Automatically instantiates `TauriCompilerDriver` when running inside Tauri, or `ServerCompilerDriver` otherwise.

### 2.2 Concurrency Guard & SyncTeX
- `CompilerClient`: Manages compilation lifecycle, enforcing a single-concurrency guard (`isCompiling()`), compile progress states (`compiling`, `resolving`), and SyncTeX record decompression.
- `synctexParser.ts` & `synctexResolver.ts`: Parses `.synctex.gz` records into line-to-coordinate and coordinate-to-line bounding box mappings for bi-directional navigation.

---

## 3. Embedded Model Context Protocol (MCP) Server

Torque embeds a full-featured Model Context Protocol (MCP) server listening on `127.0.0.1:3030` (fallback `3031`), available in both Tauri Desktop (`src-tauri/src/mcp/`) and Node Server (`scripts/compiler-server.js`):

### 3.1 Endpoints & Protocol
- Implements MCP Specification `2024-11-05` and JSON-RPC 2.0.
- Endpoints:
  - `GET /sse`: Server-Sent Events stream for push notifications (`endpoint`, `tools/list_changed`).
  - `POST /message`: Message ingress for SSE sessions.
  - `POST /mcp`: Direct HTTP JSON-RPC endpoint supporting single-roundtrip calls.
- Stdio Bridge: `scripts/torque-mcp-bridge.js` provides a zero-dependency Node bridge for stdio-only MCP clients (e.g., Claude Desktop).

### 3.2 Workspace & Search Tools
The embedded MCP server and AI assistant share the same set of tools:

| Tool Name | Parameters | Description |
|---|---|---|
| `torque_create_project` | `name` | Creates a new LaTeX project in the workspace |
| `torque_list_projects` | (none) | Lists all available projects and metadata |
| `torque_get_active_project` | (none) | Retrieves active project ID, root entry, and files |
| `torque_read_file` | `path`, `startLine?`, `endLine?` | Reads file content with optional 1-based line slicing |
| `torque_write_file` | `path`, `content` | Creates or overwrites a file with full content |
| `torque_edit_file` | `path`, `target`, `replacement` | Surgically edits a file section via exact text matching |
| `torque_compile` | `engine?` (`pdflatex`, `xelatex`, `lualatex`) | Compiles the project and generates PDF/SyncTeX |
| `torque_get_diagnostics` | (none) | Returns compilation errors, warnings, and missing packages |
| `torque_search_academic` | `query`, `source?` (`all`, `arxiv`, `semanticscholar`), `maxResults?` | Searches academic literature and returns formatted BibTeX |
| `torque_search_web` | `query`, `maxResults?` | Searches the web for LaTeX documentation and packages |

### 3.3 Argument Extraction & Parameter Resilience
LLMs frequently pass varying argument structures depending on client prompt formats. Torque implements robust argument unwrapping (`unwrapToolArgs` / `unwrap_args`):
- Path extraction checks: `path`, `filePath`, `filepath`, `filename`, `fileName`, `file`, `targetPath`, `relPath`, `relative_path`, `Path`, `FilePath`.
- Content extraction checks: `content`, `code`, `text`, `contents`, `data`, `Content`, `Code`.
- Target extraction checks: `target`, `find`, `search`, `original`, `oldText`, `old_text`, `Target`.
- Replacement extraction checks: `replacement`, `replace`, `substitute`, `newText`, `new_text`, `Replacement`.
- Query extraction checks: `query`, `q`, `search`, `prompt`, `Query`.
- Nested wrappers unwrapped recursively: `args.params`, `args.arguments` (including stringified JSON), `args.input`.
- Active file fallback: If path is omitted or empty, operations safely fall back to the workspace's active file path (`context.activeFilePath`).

---

## 4. AI Assistant Subsystem

Torque includes an integrated AI co-author accessible via the sidebar tool window (`src/components/AiChatPanel.tsx`):

### 4.1 Multi-Turn Autonomous Execution Loop
- Managed by `AgentClient.runTurn()` (`src/ai/agentClient.ts`).
- Executes up to 15 turns iteratively, invoking read-only tools (`torque_read_file`, `torque_compile`, `torque_get_diagnostics`, `torque_search_academic`, `torque_search_web`) and injecting tool results back into the conversation context until the model produces its final text response.

### 4.2 Auto Edit (Auto-Apply) Mode
- When `autoEdit: true` (or `autoApply: true`) is set in `AgentLoopOptions`:
  - Changes generated by `torque_edit_file` and `torque_write_file` are automatically written to the workspace via `context.writeFile()`.
  - The tool call status is marked as `accepted` with `{ status: 'success', message: 'Changes auto-applied to workspace.' }`.
  - Execution continues into subsequent turns without pausing for manual user approval.
- In manual review mode (`autoEdit: false`):
  - Diffs are presented interactively in `AiDiffCard.tsx` with side-by-side or unified hunks.
  - The loop pauses with `pending_approval` until the user clicks *Accept* or *Reject*.

### 4.3 Interactive Message Queuing
- While the assistant is actively thinking or executing tools (`isGenerating === true`), user follow-up messages are placed into a FIFO queue (`messageQueue`).
- The UI displays an interactive queue container (`data-testid="queued-messages-container"`):
  - Shows pending message count (`Queued Messages (N)`).
  - Allows removing individual queued items via `X` button (`handleRemoveQueuedMessage`).
  - Allows clearing all queued items via *Clear All* button (`handleClearQueue`).
- When the active generation turn completes (in `finally` block of `executeSendMessage`):
  - If messages remain in `messageQueueRef`, the next item is dequeued and automatically dispatched via `executeSendMessage` after a 50ms tick.

### 4.4 Live Thinking & Execution Status Indicators
- Real-time status reporting via `onStatusChange` callback (`src/ai/agentClient.ts`):
  - `thinking`: Model generation in progress (`"Thinking..."`).
  - `executing_tool`: Specific tool execution with human-friendly context (e.g., `"Reading main.tex..."`, `"Editing references.bib..."`, `"Compiling LaTeX document..."`, `"Searching academic papers: \"diffusion models\"..."`).
- Rendered in `AiChatPanel` via a pulse indicator pill above the message feed.

---

## 5. UI Architecture & Responsive Layout

Torque adheres to IntelliJ IDEA New UI aesthetics across all components:

### 5.1 Centered Run Widget & Responsive Top Bar
- `ProjectTopBar.tsx` features a three-part layout:
  - **Left**: Torque brand logo, project switcher dropdown (responsive truncating `max-w-[80px] sm:max-w-[130px] md:max-w-[180px]`), and embedded top menu bar (*File*, *Edit*, *View*, *Tools*, *Help*).
  - **Center**: IntelliJ-style centered run widget pill containing:
    - Compile / Run button (`Ctrl+B` / `Cmd+B`) with green accent.
    - TeX Engine selector dropdown (`pdflatex`, `xelatex`, `lualatex`).
    - Stop / Cancel button.
    - Status badges (Spotless, Success, Compiling, Warnings, Errors, Failed, Duration).
  - **Right**: Export `.zip`, Packages (`Ctrl+Alt+P`), MCP status pill, and Settings gear (`Ctrl+Alt+S`).

### 5.2 Multi-Window Desktop & Native Splash Screen
- Tauri Desktop launches with a native splashscreen window (`public/splashscreen.html`) displaying the Torque branding and loading status.
- Once the frontend workspace hook signals `workspace.ready`, the splash window is cleanly closed via `invoke('close_splashscreen')`.

---

## 6. Testing & Verification Workflows

Every change to Torque must be verified against all three test runners:

```bash
# 1. Run full Vitest suite (40+ test files, 480+ tests)
npm test

# 2. Validate static Next.js export build (strict TypeScript and bundling check)
npm run build

# 3. Run native Rust backend test suite (32 tests in compiler, MCP, storage, splash)
cargo test --manifest-path src-tauri/Cargo.toml
```

### Common Pitfalls & Checklist:
- [x] **DO** use `normalizeFilePath` on all user-supplied paths to prevent `..` directory traversal.
- [x] **DO** ensure `DiagnosticsLogPanel` returns `null` when closed to guarantee zero-space footprint.
- [x] **DO** verify that `unwrapToolArgs` and `extractToolPath` are used for all workspace tool arguments.
- [x] **DO** ensure the single-concurrency guard in `CompilerClient` prevents overlapping compilations.
- [x] **DO** keep SemVer numbers synchronized across `src/version.ts`, `package.json`, and Tauri config files.
- [ ] **DON'T** reintroduce hardcoded button accessible name dependencies in UI tests without matching `aria-label`.
- [ ] **DON'T** pause the agent loop when `autoEdit: true` is enabled; apply diffs directly and continue.
- [ ] **DON'T** run blocking compilation commands synchronously on the React UI main thread.
