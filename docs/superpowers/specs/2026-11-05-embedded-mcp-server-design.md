# Embedded Live MCP Server for Torque LaTeX IDE

## 1. Intent & The Why

Torque is a modern LaTeX IDE designed with IntelliJ IDEA aesthetics and powered by native TeX Live execution. As AI-assisted coding and authoring evolve, users frequently use external AI assistants (such as Claude Desktop, Cursor, Antigravity, and Zed) to draft sections, fix LaTeX compile errors, construct math formulas, and refactor bibliographies.

Instead of copying and pasting code back and forth or dealing with external editors out-of-sync with Torque, Torque should expose an embedded Model Context Protocol (MCP) server directly while running. External AI tools can connect to Torque over standard MCP transports (HTTP/SSE or a lightweight stdio bridge) to inspect project structure, read and edit LaTeX source files, trigger native multi-pass compilation, and receive structured diagnostics and SyncTeX mappings in real time.

When an AI agent modifies a file or triggers compilation through the MCP server, the open Monaco editor buffer, PDF preview pane, and Diagnostics panel in Torque reactively update in real time.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
1. **Embedded MCP Server Endpoint**: Expose an embedded HTTP server providing standard MCP endpoints (SSE `/sse` + POST `/message`, and streamable `/mcp`) in Desktop mode (via Tauri Rust backend) and Web/Dev mode (via `scripts/compiler-server.js`).
2. **Standard LaTeX Workspace Tools**: Expose the following core tools compliant with the MCP tool specification:
   - `torque_list_projects`: List all available projects (ID, name, root entry, last updated).
   - `torque_get_active_project`: Get details and file manifest of the currently active/selected project.
   - `torque_read_file`: Read full or partial content of a file in a project, supporting optional line ranges (`startLine`, `endLine`) to inspect specific sections efficiently.
   - `torque_write_file`: Create or fully overwrite content of a file in a project.
   - `torque_edit_file`: Surgically edit a specific section of a file using exact target/replacement matching (or line ranges), preventing full-file overwrite errors.
   - `torque_compile`: Trigger native compilation (`pdflatex`, `xelatex`, `lualatex`) using Torque's TeX engine, returning status, duration, structured diagnostics (severity, line, file, message), and missing packages.
   - `torque_get_diagnostics`: Retrieve the latest compilation diagnostics and log errors for a project.
3. **Reactive UI Synchronization**:
   - When a file is modified via `torque_write_file`, Tauri emits an event to the frontend (`mcp:file-changed`), updating the Monaco editor buffer if the file is currently open, and refreshing the file tree.
   - When compilation is triggered via `torque_compile`, Tauri compiles and emits `mcp:compile-finished`, updating the PDF preview pane and Diagnostics panel in the UI.
4. **Stdio Bridge Script**: Provide a zero-dependency Node.js bridge script (`scripts/torque-mcp-bridge.js`) that translates stdio JSON-RPC to the running embedded HTTP/SSE server, allowing stdio-only MCP clients (like Claude Desktop) to connect easily.
5. **UI Status & Settings**: Show MCP server status (e.g. running port, connection status indicator) in the IntelliJ-style status bar / menu and Settings modal (`Ctrl+Alt+S`), with option to configure the listening port (default: `3030`).

### Non-Goals
- In-editor chat panel: Torque is not embedding its own conversational chatbot inside the editor UI in this phase; it exposes tools to external AI clients.
- Cloud hosting / remote auth: The MCP server binds to `127.0.0.1` (localhost only) for local pair programming.
- Git VCS operations through MCP: MCP tools focus on LaTeX project authoring and compilation, not git commits/pushes.

### Anti-Goals
- Blocking the main UI thread during compilation or file I/O.
- Silent file overwrites without informing the editor: Monaco must stay in sync and not overwrite external AI edits on the next autosave.
- Exposing arbitrary filesystem access outside `~/.torque/projects/` or the active project boundary (enforce path normalization and bounds checks).

---

## 3. Constraints & Architectural Invariants

1. **Native TeX Live Execution (Invariant 1)**: Compilation via `torque_compile` must utilize Torque's native TeX Live execution orchestrator (`src-tauri/src/compiler.rs` / `scripts/compiler-server.js`) including automated package resolution.
2. **Zero-Space Footprint (Invariant 2)**: Any UI indicators (status pills, modal settings) must match IntelliJ New UI design language without introducing phantom margins or persistent pane bloat.
3. **Cross-Platform Compatibility**: The embedded MCP server must work on Linux, macOS, and Windows.
4. **Local Port & Conflict Handling**: Port must default to `3030` (or `3031` if occupied), binding only to localhost `127.0.0.1`.
5. **SemVer & Verification**: Changes must pass `npm test`, `npm run build`, and `cargo test --manifest-path src-tauri/Cargo.toml`.

---

## 4. Evaluated Approaches & Selected Direction

Three approaches were considered:
- **Approach 1: Standalone Stdio CLI Server**: A separate CLI running against `~/.torque/projects` directly. Dropped because changes made by AI would not reflect live in open Monaco editor buffers.
- **Approach 2: Embedded Live App Server (HTTP / SSE)**: Torque hosts an embedded MCP server while running. AI tool calls directly manipulate active project state, update Monaco editor tabs, and trigger compilations that instantly update the PDF preview. **Selected by user.**
- **Approach 3: Unified Hybrid Server**: Combining headless fallback with live bridge. Kept as a future extension, with Approach 2 providing the foundational live embedded engine and stdio bridge script.

---

## 5. Technical Specifications

### 5.1 Architecture & Components

```
┌────────────────────────────────────────────────────────┐
│  External AI Tools (Claude Desktop, Cursor, Zed, AGY) │
└──────────────────────────┬─────────────────────────────┘
                           │
             ┌─────────────┴─────────────┐
             │ (stdio)                   │ (HTTP / SSE)
             ▼                           ▼
   ┌──────────────────────┐    ┌───────────────────────────────────┐
   │ scripts/             │    │ Torque Embedded MCP Server        │
   │ torque-mcp-bridge.js ├────┤ http://127.0.0.1:3030/sse         │
   └──────────────────────┘    └─────────────────┬─────────────────┘
                                                 │
                   ┌─────────────────────────────┼─────────────────────────────┐
                   ▼                                                           ▼
       ┌───────────────────────┐                                   ┌───────────────────────┐
       │ Tauri Desktop (Rust)  │                                   │ Web Server (Node.js)  │
       │ src-tauri/src/mcp.rs  │                                   │ scripts/compiler-     │
       │ - TCP / HTTP listener │                                   │ server.js (/sse)      │
       │ - JSON-RPC handler    │                                   │                       │
       └───────────┬───────────┘                                   └───────────┬───────────┘
                   │                                                           │
                   ├───────────────────────┐                                   │
                   ▼                       ▼                                   ▼
        ┌──────────────────────┐ ┌──────────────────────┐           ┌──────────────────────┐
        │ Storage & Compiler   │ │ Tauri Event Bus      │           │ Workspace State      │
        │ storage.rs           │ │ emit("mcp:file-      │           │ (useWorkspace)       │
        │ compiler.rs          │ │      changed")       │           │                      │
        └──────────────────────┘ └──────────┬───────────┘           └──────────────────────┘
                                            │
                                            ▼
                                ┌──────────────────────┐
                                │ React Frontend       │
                                │ MonacoEditorPane     │
                                │ PdfPreviewPane       │
                                └──────────────────────┘
```

### 5.2 MCP Protocol Details
- **Protocol Version**: `2024-11-05`
- **Endpoints**:
  - `GET /sse`: Server-Sent Events stream. Sends `endpoint` event: `event: endpoint\ndata: /message?sessionId=<uuid>\n\n`.
  - `POST /message?sessionId=<uuid>`: Receives JSON-RPC 2.0 requests, dispatches responses through SSE stream or HTTP response.
  - `POST /mcp`: Direct Streamable HTTP JSON-RPC endpoint.
- **Server Info**: `{ "name": "torque-latex-ide", "version": "0.2.2" }`
- **Capabilities**: `{ "tools": {} }`

### 5.3 Tool Definitions

1. `torque_list_projects`:
   - Description: "List all LaTeX projects available in Torque."
   - Parameters: `{}`
   - Returns: JSON array of projects `{ id, name, rootEntry, updatedAt }`.

2. `torque_get_active_project`:
   - Description: "Get the currently active LaTeX project in Torque, including file manifest and root entry file."
   - Parameters: `{}`
   - Returns: Project metadata and list of files `{ id, name, rootEntry, files: [{ path, isBinary, updatedAt }] }`.

3. `torque_read_file`:
   - Description: "Read full or partial text content of a file in a Torque project with optional line-range slicing."
   - Parameters:
     - `path`: `{ "type": "string", "description": "Relative path of the file to read" }`
     - `startLine`: `{ "type": "integer", "description": "Optional 1-based start line (inclusive)" }`
     - `endLine`: `{ "type": "integer", "description": "Optional 1-based end line (inclusive)" }`
     - `projectId`: `{ "type": "string", "description": "Optional; defaults to active project" }`
   - Behavior:
     - If `startLine` and/or `endLine` are specified, slices the content to the requested line range.
     - Returns total lines and whether content was sliced.
   - Returns: `{ "content": "...", "totalLines": 120, "startLine": 10, "endLine": 45, "isSliced": true }`.

4. `torque_write_file`:
   - Description: "Create or update a file in a Torque project. If the file is open in the Torque editor, its contents will update live."
   - Parameters: `{ "path": { "type": "string" }, "content": { "type": "string" }, "projectId": { "type": "string" } }`
   - Returns: `{ "success": true, "path": "...", "bytesWritten": 1234 }`.

5. `torque_edit_file`:
   - Description: "Surgically edit a specific section or block of text within a file without overwriting the entire file."
   - Parameters:
     - `path`: `{ "type": "string", "description": "Relative path of the file to edit" }`
     - `target`: `{ "type": "string", "description": "Exact text string or block to find and replace" }`
     - `replacement`: `{ "type": "string", "description": "New text to substitute in place of target" }`
     - `projectId`: `{ "type": "string", "description": "Optional; defaults to active project" }`
   - Behavior:
     - Validates that `target` exists in the file (returns a descriptive error if not found).
     - Performs the substitution and saves the file.
     - Emits `mcp:file-changed` so open Monaco editor models update live in-place.
   - Returns: `{ "success": true, "path": "...", "occurrencesReplaced": 1 }`.

6. `torque_compile`:
   - Description: "Compile the LaTeX project using native TeX Live (latexmk) and return status and structured diagnostics."
   - Parameters: `{ "projectId": { "type": "string" }, "engine": { "type": "string", "enum": ["pdflatex", "xelatex", "lualatex"] } }`
   - Returns: `{ "status": "spotless"|"warnings"|"errors"|"failed", "durationMs": 420, "diagnostics": [...], "missingPackages": [...], "pdfGenerated": true }`.

6. `torque_get_diagnostics`:
   - Description: "Retrieve the latest compilation diagnostics, warnings, and errors for the project."
   - Parameters: `{ "projectId": { "type": "string" } }`
   - Returns: `{ "diagnostics": [...], "status": "..." }`.

### 5.4 Live UI Synchronization Contract
- When `torque_write_file` is called:
  - Rust writes file via `storage::write_project_file`.
  - Rust emits `mcp:file-changed` with `{ projectId, path, content }`.
  - In `useWorkspace`:
    - If `projectId == activeProject.id`:
      - Updates `files` state.
      - If `path == activeFilePath`: updates Monaco editor model content without resetting cursor unnecessarily, marking document dirty / saving cleanly.
- When `torque_compile` is called:
  - Rust executes `tauri_compile_latex`.
  - Rust emits `mcp:compile-finished` with the `CompileResultPayload`.
  - In `useWorkspace`:
    - Updates `compileStatus`, `lastResult`, and triggers reload of the PDF preview buffer and diagnostics panel.

### 5.5 Stdio Bridge (`scripts/torque-mcp-bridge.js`)
- Lightweight Node script using standard `node:http` and `node:readline`.
- Listens on `process.stdin` for JSON-RPC lines.
- Forwards to `http://127.0.0.1:3030/mcp` or `/sse`.
- Prints JSON-RPC responses to `process.stdout`.
- Allows simple configuration in `claude_desktop_config.json`:
  ```json
  {
    "mcpServers": {
      "torque": {
        "command": "node",
        "args": ["/path/to/torque/scripts/torque-mcp-bridge.js"]
      }
    }
  }
  ```

---

## 6. What's Left to the Builder
- Detailed HTTP parsing implementation in Rust (`tiny_http` or lightweight standard library TCP listener with basic HTTP handling) avoiding heavy unneeded dependencies.
- Exact styling and placement of the "MCP" status pill in the top bar or settings modal.
- Test suites for the MCP JSON-RPC protocol, tool execution, and live event emission.
