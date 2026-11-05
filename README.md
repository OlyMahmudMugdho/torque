# Torque LaTeX IDE

> Modern, open-source LaTeX IDE featuring IntelliJ IDEA aesthetics, native TeX Live execution, automated CTAN package resolution, and native Tauri desktop support.

---

## Highlights

- **Native TeX Live Execution**: Compiles natively using the host system's `latexmk` (`pdflatex`, `xelatex`, `lualatex`).
- **Automated CTAN Package Resolution**: Automatically detects missing `.sty`, `.cls`, `.def`, `.fd`, and font metrics from compilation output, resolves them from CTAN directly into your user TeXMF tree (`TEXMFHOME`), refreshes kpathsea (`texhash`), and resumes compilation transparently.
- **IntelliJ IDEA New UI**: True JetBrains design language, including run widget dropdowns, status pills, dark (`darcula`) and light (`intellij-light`) themes, and standard keybindings (`Ctrl+B` / `Shift+F10` to build).
- **SyncTeX Navigation**: Full bi-directional SyncTeX navigation between Monaco Editor and the PDF preview pane.
- **Embedded Model Context Protocol (MCP) Server**: Embedded real-time MCP server (`http://127.0.0.1:3030/sse` / `/mcp`) with live bidirectional editor synchronization, allowing external AI assistants (Claude Desktop, Cursor, Antigravity, Zed) to inspect projects, read sections with line-range slicing, perform surgical search-and-replace edits, and trigger multi-pass compilation.
- **Client-Server Architecture**: Unified `CompilerDriver` allowing seamless compilation via Tauri IPC on Desktop and HTTP/WebSocket endpoints for web or remote server deployments.

---

## Prerequisites

Ensure you have TeX Live installed on your system:

```bash
# Ubuntu / Debian
sudo apt update && sudo apt install -y latexmk texlive-latex-base texlive-latex-recommended texlive-xetex
```

*(Missing packages are automatically fetched on demand when compiling projects).*

---

## Getting Started

### Development (Desktop / Tauri)
```bash
npm run tauri dev
```

### Development (Web / Browser)
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## AI Assistant & MCP Server Integration

Torque embeds a live Model Context Protocol (MCP) server running on `http://127.0.0.1:3030` (fallback `3031`) with full bidirectional synchronization to Monaco Editor and PDF preview.

### In-App Instructions
Click the **MCP** status pill in Torque's top toolbar or navigate to **Help -> MCP AI Assistant Guide...** to view live connection status and one-click copyable configuration snippets.

### Claude Desktop Integration
Add the following to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "torque": {
      "command": "node",
      "args": ["/absolute/path/to/torque/scripts/torque-mcp-bridge.js"]
    }
  }
}
```

### Cursor & Antigravity Integration
Connect via Server-Sent Events (SSE) endpoint:
- **Transport**: `sse`
- **URL**: `http://127.0.0.1:3030/sse`

### Exposed MCP Tools
- `torque_read_file`: Read entire files or sliced sections with 1-based `startLine` and `endLine` parameters.
- `torque_edit_file`: Surgically search-and-replace exact text blocks (`target` -> `replacement`) with zero file truncation.
- `torque_write_file`: Create or overwrite files, updating open editor tabs in real time.
- `torque_compile`: Multi-pass native TeX Live compilation returning structured diagnostics and refreshing PDF preview.
- `torque_list_projects` & `torque_get_active_project`: Inspect workspaces and file manifests.
- `torque_get_diagnostics`: Retrieve compilation errors, warnings, and missing package logs.

---

## Verification & Testing

```bash
# Run Vitest test suite
npm test

# Run Next.js production build
npm run build

# Run Rust tests
cargo test --manifest-path src-tauri/Cargo.toml
```

---

## Architecture

For the complete architectural blueprint, subsystem breakdowns, and operating invariants, consult:
- [`MAP.md`](./MAP.md) — Structural map and component hierarchy.
- [`AGENTS.md`](./AGENTS.md) — Operational instructions and engineering invariants.
