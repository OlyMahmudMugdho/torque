# Torque LaTeX IDE

> Modern, open-source LaTeX IDE featuring IntelliJ IDEA aesthetics, native TeX Live execution, automated CTAN package resolution, and native Tauri desktop support.

---

## Highlights

- **Native TeX Live Execution**: Compiles natively using the host system's `latexmk` (`pdflatex`, `xelatex`, `lualatex`).
- **Automated CTAN Package Resolution**: Automatically detects missing `.sty`, `.cls`, `.def`, `.fd`, and font metrics from compilation output, resolves them from CTAN directly into your user TeXMF tree (`TEXMFHOME`), refreshes kpathsea (`texhash`), and resumes compilation transparently.
- **IntelliJ IDEA New UI**: True JetBrains design language, including run widget dropdowns, status pills, dark (`darcula`) and light (`intellij-light`) themes, and standard keybindings (`Ctrl+B` / `Shift+F10` to build).
- **SyncTeX Navigation**: Full bi-directional SyncTeX navigation between Monaco Editor and the PDF preview pane.
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
