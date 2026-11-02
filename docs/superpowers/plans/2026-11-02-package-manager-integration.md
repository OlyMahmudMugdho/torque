# LaTeX Package Manager Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate a full-featured IntelliJ-style LaTeX Package Manager into Torque, allowing users to browse, search, install, and insert LaTeX packages, with quick-fix integration in the compiler diagnostics.

**Architecture:** Introduce `PackageManagerService` to query available packages (from the built-in bundle catalog, pack indices, and CTAN metadata) and manage installed status in IndexedDB/`~/.torque`. Build an IntelliJ-styled `PackageManagerModal` / Tool Window with category filtering, search, and one-click actions. Integrate with `TopMenuBar` under `Tools > LaTeX Packages` and provide quick-fix buttons on missing package diagnostics.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Lucide Icons, Vitest, React Testing Library.

**Spec:** Client-side LaTeX Editor Specification (`docs/superpowers/specs/2026-11-02-client-side-latex-editor-design.md`)

## Global Constraints
- Semantic versioning follows `APP_VERSION = '0.1.0'`.
- Supports both IntelliJ Darcula dark and IntelliJ Light palettes.
- All actions work offline for preloaded/bundle packages and support on-demand download for external CTAN packages when network is available.
- Maintain 100% test pass rate with Vitest (`npm test`) and 0 TypeScript build errors.
- Do NOT run the server (`npm start` or `next dev`).

## Review Focus
1. Search latency or memory pressure with large package catalogs.
2. Inability to insert `\usepackage{...}` properly before `\begin{document}`.
3. Offline handling when fetching external packages fails.
4. Clean dismissal of modal/drawer without UI locking.
5. Contrast and keyboard navigation in both dark and light modes.

---

### Task 1: Package Manager Service & Catalog Index

**Files:**
- Create: `src/packages/packageTypes.ts`
- Create: `src/packages/packageManager.ts`
- Create: `src/packages/__tests__/packageManager.test.ts`

- [ ] Define types: `LatexPackage` (id, name, description, category, version, files, isInstalled, source).
- [ ] Implement `packageManager.ts` with curated catalog of standard LaTeX packages (Math, Physics, Graphics, Layout, Typography, Citations, Code, Tables) and search/filter functions.
- [ ] Implement package installation and persistence in cache/store.
- [ ] Implement `insertPackageDeclaration(latexCode: string, packageName: string, options?: string): string` to cleanly insert `\usepackage[options]{packageName}` in the preamble.
- [ ] Unit tests for catalog search, filtering, and preamble insertion.
- [ ] Commit with `feat(packages): add packageManager service and catalog index`.

---

### Task 2: IntelliJ Package Manager UI Component

**Files:**
- Create: `src/components/PackageManagerModal.tsx`
- Create: `src/components/__tests__/PackageManagerModal.test.tsx`

- [ ] Implement `PackageManagerModal.tsx` styled like IntelliJ Settings > Plugins / Packages dialog:
  - Header with search bar, category filter pills (All, Math, Graphics, Typography, Tables, Code).
  - Left package list showing package name, short description, and installation badge.
  - Right package details pane with description, files list, "Install" / "Installed" button, and "Insert \usepackage" button.
  - Theme-aware styling for IntelliJ Dark and IntelliJ Light.
  - Keyboard Escape dismissal and outside click support.
- [ ] Write unit tests for search, category filter, install click, insert click, and dismissal.
- [ ] Commit with `feat(ui): add IntelliJ PackageManagerModal component`.

---

### Task 3: Workspace Integration & Diagnostic Quick-Fix

**Files:**
- Modify: `src/components/TopMenuBar.tsx`
- Modify: `src/components/ProjectTopBar.tsx`
- Modify: `src/components/DiagnosticsLogPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/__tests__/WorkspaceUI.test.tsx`

- [ ] Add `Tools` menu to `TopMenuBar.tsx` with `Package Manager...` action.
- [ ] Add package manager icon button in the Left Activity Stripe / Top Bar for quick access.
- [ ] In `DiagnosticsLogPanel.tsx`, detect missing package errors (e.g. `LaTeX Error: File '<name>.sty' not found`) and show an inline "Install <name>" quick-fix button that launches or resolves the package.
- [ ] Wire package insertion into the active editor document via `workspace.updateFileContent`.
- [ ] Run full test suite (`npm test`) and production build (`npm run build`).
- [ ] Commit with `feat(workspace): integrate package manager and diagnostic quick-fix`.
