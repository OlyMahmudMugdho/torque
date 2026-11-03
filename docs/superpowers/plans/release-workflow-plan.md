# Implementation Plan: GitHub Actions Multi-Platform Release Workflow

## Goal
Create an automated GitHub Actions release workflow that builds binaries for Linux (`.deb`, `.rpm`, `.AppImage`), Windows (`.exe` NSIS installer, `.msi`), and macOS (`.dmg`, `.app`), and uploads all artifacts directly to the GitHub Releases section when a version tag is pushed or triggered manually.

## Global Constraints
1. Multi-platform Tauri v2 builder using `tauri-apps/tauri-action@v0`.
2. Linux build must produce both Debian (`.deb`) and Red Hat (`.rpm`) packages, plus `.AppImage`.
3. Windows build must produce a standalone installer executable (`.exe` via NSIS).
4. macOS build must produce DMG installer (`.dmg`) and `.app` bundle for Apple Silicon and Intel.
5. All binaries must be attached as release assets to GitHub Releases with `contents: write` permissions.
6. Must not break existing Next.js static build or Vitest test suites.

---

## Tasks

### Task 1: Configure Tauri Packaging Metadata & Bundle Targets
**Files**: `src-tauri/tauri.conf.json`, `MAP.md`
**Objective**:
- Configure `src-tauri/tauri.conf.json` to ensure bundle targets support `deb`, `rpm`, `appimage`, `nsis`, and `dmg`.
- Add application metadata (category: `Utility` / `Office`, copyright, long description).
- Configure NSIS installer options for Windows (`displayLanguageSelector: false`, installer icon).
- Configure Linux package options (package section: `deb` and `rpm` dependencies).

### Task 2: Create Multi-Platform GitHub Actions Workflow
**Files**: `.github/workflows/release.yml`
**Objective**:
- Create `.github/workflows/release.yml` with triggers:
  - `push: tags: ['v*']`
  - `workflow_dispatch` (with optional `draft` and `prerelease` inputs).
- Build matrix across 3 platforms:
  - `ubuntu-22.04` (Linux): Installs `libwebkit2gtk-4.1-dev`, `build-essential`, `curl`, `wget`, `file`, `libxdo-dev`, `libssl-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, and `rpm`.
  - `windows-latest` (Windows): Installs NSIS / Rust toolchain, builds Windows installer `.exe`.
  - `macos-latest` (macOS): Installs Rust toolchain, builds `.dmg`.
- Matrix steps:
  - Checkout repository with submodules if any.
  - Setup Node.js (v20) and cache `npm`.
  - Setup Rust (stable toolchain) with `swatinem/rust-cache@v2`.
  - `npm ci` or `npm install`.
  - Build and publish via `tauri-apps/tauri-action@v0`:
    - `tagName: ${{ github.ref_name }}`
    - `releaseName: 'Torque v__VERSION__'`
    - `releaseBody: 'See the release assets below to download and install Torque LaTeX Editor for your platform.'`
    - `releaseDraft: ${{ github.event.inputs.draft || false }}`
    - `prerelease: ${{ github.event.inputs.prerelease || false }}`
    - `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`

### Task 3: Workflow Validation Suite & Pipeline Verification
**Files**: `src/__tests__/workflow.test.ts`, `MAP.md`
**Objective**:
- Add unit tests verifying `.github/workflows/release.yml` is valid YAML and defines jobs for `ubuntu-22.04`, `windows-latest`, and `macos-latest`, with `rpm`, `deb`, `nsis`, and `tauri-action`.
- Verify `src-tauri/tauri.conf.json` contains proper bundle configuration.
- Run `npm test` and `npm run build` to confirm zero regressions.
