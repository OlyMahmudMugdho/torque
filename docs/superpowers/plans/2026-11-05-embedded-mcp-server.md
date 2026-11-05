# Embedded Live MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Embed a Model Context Protocol (MCP) server directly into Torque, allowing external AI assistants (Claude Desktop, Cursor, Antigravity, Zed) to inspect projects, read specific sections, perform targeted edits, and trigger native multi-pass compilation with live UI synchronization.

**Architecture:** A lightweight HTTP server running on `127.0.0.1:3030` providing standard MCP SSE (`/sse` + `/message`) and Streamable HTTP (`/mcp`) endpoints. Implemented in Tauri Rust backend for desktop mode and `scripts/compiler-server.js` for web/dev mode. Tool calls for file edits and compilation emit Tauri IPC events (`mcp:file-changed`, `mcp:compile-finished`) to update Monaco editor buffers, PDF preview, and Diagnostics pane live. A Node stdio bridge script (`scripts/torque-mcp-bridge.js`) enables compatibility with stdio-only MCP clients.

**Tech Stack:** Rust (Tauri v2, tokio, serde, serde_json), TypeScript/JavaScript (Node.js, Next.js 16, Monaco Editor, React 19), Vitest, Cargo.

**Spec:** [`docs/superpowers/specs/2026-11-05-embedded-mcp-server-design.md`](file:///home/mugdho/codes/torque/docs/superpowers/specs/2026-11-05-embedded-mcp-server-design.md)

## Global Constraints

- TeX compilation powered by native host TeX Live (`latexmk`, `pdflatex`, `xelatex`, `lualatex`) with automated package resolution.
- UI elements must follow IntelliJ IDEA New UI aesthetics with zero-space diagnostic pane dismissal.
- The MCP server must bind only to localhost (`127.0.0.1`) on port `3030` (with fallback to `3031` if occupied).
- Path traversal outside project bounds (`..`) must be rejected using `normalize_path` / `normalizeFilePath`.
- All Vitest tests (`npm test`), Next.js build (`npm run build`), and Cargo tests (`cargo test --manifest-path src-tauri/Cargo.toml`) must pass with zero errors.

## Review Focus

1. Partial read line bounds: `startLine` or `endLine` out of range must be clamped gracefully without crashing.
2. Targeted edit mismatch: `target` text not found in file must return a clean JSON-RPC error without modifying the file.
3. Concurrent writes: Live updates in Monaco must not get clobbered or produce infinite re-save loops.
4. Port conflict: If port 3030 is in use, fallback to 3031 or next available port.
5. Large file streaming / binary files: Binary files must be flagged or rejected gracefully in text edit tools.

---

### Task 1: Rust MCP Core Server & Tool Handlers

**Files:**
- Create: `src-tauri/src/mcp.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml`
- Test: `src-tauri/src/mcp.rs` (unit tests)

**Steps:**
- [ ] Add unit tests in `src-tauri/src/mcp.rs` for:
  - JSON-RPC `initialize` and `tools/list` responses.
  - `torque_read_file` with and without line range slicing (`startLine`, `endLine`).
  - `torque_write_file` writing content and verifying disk update.
  - `torque_edit_file` replacing targeted text snippet, rejecting nonexistent targets.
  - `torque_list_projects` and `torque_get_diagnostics`.
- [ ] Implement `src-tauri/src/mcp.rs` with `tokio::net::TcpListener` serving:
  - `GET /sse`: Server-Sent Events endpoint with session ID generator.
  - `POST /message?sessionId=...`: JSON-RPC request dispatcher.
  - `POST /mcp`: Direct JSON-RPC endpoint.
- [ ] Implement tool handlers:
  - `torque_list_projects`: Queries `storage::list_projects`.
  - `torque_get_active_project`: Returns active project metadata and files.
  - `torque_read_file`: Reads file content, slicing by `startLine`/`endLine` if provided.
  - `torque_write_file`: Overwrites file, emits `mcp:file-changed` event to Tauri webview.
  - `torque_edit_file`: Validates `target`, replaces with `replacement`, saves, emits `mcp:file-changed`.
  - `torque_compile`: Calls `compiler::compile_latex`, emits `mcp:compile-finished`, returns result.
  - `torque_get_diagnostics`: Returns latest compilation diagnostics.
- [ ] Wire server launch into `src-tauri/src/lib.rs` during Tauri app setup.
- [ ] Run `cargo test --manifest-path src-tauri/Cargo.toml` and confirm all tests pass.
- [ ] Commit: `feat(mcp): add embedded Rust MCP server and tool handlers in Tauri`

---

### Task 2: Node Dev Server MCP Endpoints & Tests

**Files:**
- Modify: `scripts/compiler-server.js`
- Create: `src/compiler/__tests__/mcpServer.test.ts`

**Steps:**
- [x] Write integration tests in `src/compiler/__tests__/mcpServer.test.ts` verifying `/mcp` and `/sse` endpoints, `tools/list`, `torque_read_file` slicing, and `torque_edit_file` exact replacements.
- [x] Add MCP request handling to `scripts/compiler-server.js`:
  - Route `GET /sse`, `POST /message`, and `POST /mcp`.
  - Implement tool execution for `torque_list_projects`, `torque_read_file`, `torque_edit_file`, `torque_write_file`, `torque_compile`.
- [x] Run `npm test src/compiler/__tests__/mcpServer.test.ts` and confirm passing.
- [ ] Commit: `feat(mcp): add MCP server endpoints to Node compiler-server`

---

### Task 3: Stdio Bridge Script for External AI Clients

**Files:**
- Create: `scripts/torque-mcp-bridge.js`
- Create: `src/compiler/__tests__/mcpBridge.test.ts`

**Steps:**
- [ ] Create `scripts/torque-mcp-bridge.js` reading JSON-RPC lines from `process.stdin` and forwarding via HTTP POST to `http://127.0.0.1:3030/mcp` (or specified `TORQUE_MCP_PORT`), printing JSON-RPC replies to `process.stdout`.
- [ ] Add unit test in `src/compiler/__tests__/mcpBridge.test.ts` verifying JSON-RPC round-trip communication through the bridge script.
- [ ] Run `npm test src/compiler/__tests__/mcpBridge.test.ts` and confirm passing.
- [ ] Commit: `feat(mcp): add stdio bridge script for external MCP clients`

---

### Task 4: Frontend Live Reactive Synchronization, UI Status Pill & In-App MCP Instructions

**Files:**
- Modify: `src/workspace/useWorkspace.ts`
- Modify: `src/components/ProjectTopBar.tsx`
- Modify: `src/components/TopMenuBar.tsx`
- Create: `src/components/McpInstructionsModal.tsx`
- Modify: `src/types/workspace.ts`
- Test: `src/workspace/__tests__/mcpSync.test.ts`
- Test: `src/components/__tests__/McpInstructionsModal.test.tsx`

**Steps:**
- [ ] Create `src/components/McpInstructionsModal.tsx`:
  - IntelliJ New UI styled dialog showing running status and active port (`http://127.0.0.1:3030/sse`).
  - Step-by-step instructions and one-click copyable configuration snippets for Claude Desktop, Cursor, Antigravity, and Zed.
  - Explains available tools (`torque_read_file` with line slicing, `torque_edit_file` with surgical diffs, `torque_compile`, and `torque_get_diagnostics`).
- [ ] In `src/components/ProjectTopBar.tsx`:
  - Add clickable IntelliJ status pill showing `MCP` with green active dot that opens `McpInstructionsModal`.
- [ ] In `src/components/TopMenuBar.tsx`:
  - Add *Help -> MCP AI Assistant Guide...* to open `McpInstructionsModal`.
- [ ] In `src/workspace/useWorkspace.ts`:
  - Listen for Tauri events `mcp:file-changed` and `mcp:compile-finished`.
  - Update files, active file buffer, and compile results upon receiving MCP notifications.
  - Synchronize active project ID to Tauri via `tauri_set_active_project`.
- [ ] Write tests in `src/workspace/__tests__/mcpSync.test.ts` and `src/components/__tests__/McpInstructionsModal.test.tsx`.
- [ ] Run `npm test` and `npm run build` to verify clean frontend compilation.
- [ ] Commit: `feat(mcp): add live reactive workspace sync, MCP status pill, and in-app instructions modal`

---

### Task 5: End-to-End Verification & Documentation

**Files:**
- Modify: `README.md`
- Modify: `MAP.md`

**Steps:**
- [ ] Document MCP integration in `README.md` (how to configure Claude Desktop, Cursor, and Antigravity to connect to Torque).
- [ ] Update `MAP.md` architecture map with MCP subsystem details.
- [ ] Run full test suite:
  - `npm test`
  - `npm run build`
  - `cargo test --manifest-path src-tauri/Cargo.toml`
- [ ] Commit: `docs(mcp): update documentation and architectural map for MCP server`
