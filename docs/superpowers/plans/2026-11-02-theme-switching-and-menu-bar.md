# Dark/Light Mode Theme Switching & IntelliJ Top Menu Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement IntelliJ-style dark and light theme switching across the entire workspace (including Monaco Editor and PDF preview) and an IntelliJ-style top menu bar (File, Edit, View, Help) with functional actions and shortcut hints.

**Architecture:** Introduce a centralized `ThemeContext` providing `'dark' | 'light'` state with localStorage persistence and CSS class toggle. Define an `intellij-light` Monaco theme to complement `intellij-dark`. Implement an accessible and responsive IntelliJ `TopMenuBar` component supporting nested action triggers (project import/export, file creation, compiler invocation, tool window toggling, theme switching, and editor undo/redo hooks).

**Tech Stack:** Next.js App Router, React 19, Tailwind CSS, Monaco Editor, Lucide Icons, Vitest, React Testing Library.

**Spec:** Client-side LaTeX Editor Specification (`docs/superpowers/specs/2026-11-02-client-side-latex-editor-design.md`)

## Global Constraints
- Persist theme selection in `localStorage` under key `torque_theme` with `'dark'` as default fallback.
- Support both dark (Darcula: `#1e1f22`, `#2b2d30`, `#393b40`) and light (IntelliJ Light: `#f7f8fa`, `#ebecf0`, `#dfe1e5`, `#ffffff`) color schemes across all UI components.
- Monaco Editor must dynamically synchronize its theme (`'intellij-dark'` vs `'intellij-light'`).
- The Top Menu Bar must follow IntelliJ IDEA conventions (File, Edit, View, Help) with shortcut hints and click-outside dismissal.
- Preserve 100% test pass rate with Vitest (`npm test`) and successful static build (`npm run build`).

## Review Focus
1. Theme state hydration mismatch or failure to persist in `localStorage`.
2. Monaco Editor failing to update syntax highlighting and background when switching between dark and light modes.
3. Top Menu clicks outside the active dropdown failing to dismiss the open menu.
4. Top Menu actions (e.g. File > New File, View > Toggle Sidebar, File > Compile) failing to execute bound workspace handlers.
5. Contrast or illegible text when in light mode across tabs, breadcrumbs, logs, and file tree.

---

### Task 1: Theme Context and Monaco Light Theme Definition

**Files:**
- Create: `src/context/ThemeContext.tsx`
- Modify: `src/editor/latexLanguage.ts`
- Create: `src/context/__tests__/ThemeContext.test.tsx`
- Modify: `src/editor/__tests__/latexLanguage.test.ts`

- [ ] Write tests for `ThemeContext` checking initial theme resolution (localStorage, default dark), toggle function, and storage update.
- [ ] Implement `ThemeContext` and `ThemeProvider` in `src/context/ThemeContext.tsx`.
- [ ] Define and register `'intellij-light'` theme in `src/editor/latexLanguage.ts` (light background `#ffffff` / `#f7f8fa`, Darcula light syntax tokens).
- [ ] Add unit test verifying `'intellij-light'` theme definition exists and is registered.
- [ ] Run `npm test` to verify Task 1 tests pass.
- [ ] Commit changes with message `feat(theme): add ThemeContext and Monaco intellij-light theme`.

---

### Task 2: IntelliJ Top Menu Bar Component (File, Edit, View, Help)

**Files:**
- Create: `src/components/TopMenuBar.tsx`
- Create: `src/components/__tests__/TopMenuBar.test.tsx`

- [ ] Write unit tests for `TopMenuBar` verifying menu trigger toggle, click-outside dismissal, action dispatch (e.g. New File, Compile, Toggle Theme), and shortcut displays.
- [ ] Implement `TopMenuBar.tsx` with menus:
  - **File**: New File, New Project, Import Zip, Export Zip, Compile Project (`Ctrl+B`), Separator, Exit/Close
  - **Edit**: Undo (`Ctrl+Z`), Redo (`Ctrl+Y`), Cut, Copy, Paste
  - **View**: Toggle Project Sidebar (`Alt+1`), Toggle Problems / Build Dock (`Alt+6`), Toggle PDF Preview, Theme submenu (Dark Mode, Light Mode)
  - **Help**: Shortcuts Guide, About Torque
- [ ] Handle keyboard interactions (`Escape` to close menu) and click-outside listener.
- [ ] Run `npm test` to verify TopMenuBar tests pass.
- [ ] Commit changes with message `feat(ui): add IntelliJ TopMenuBar component with dropdown actions`.

---

### Task 3: Theme Integration & Sidebar Problems/Build Panel

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/ProjectTopBar.tsx`
- Modify: `src/components/FileTreeSidebar.tsx`
- Modify: `src/editor/MonacoEditorPane.tsx`
- Modify: `src/components/DiagnosticsLogPanel.tsx`
- Modify: `src/components/PdfPreviewPane.tsx`
- Modify: `src/components/__tests__/WorkspaceUI.test.tsx`

- [ ] Update `ProjectTopBar` to embed `TopMenuBar` and include a quick Dark/Light toggle button.
- [ ] Wrap `App.tsx` with `ThemeProvider` and adapt colors to support both dark (`bg-[#1e1f22]`, `bg-[#2b2d30]`) and light (`bg-[#f7f8fa]`, `bg-[#ffffff]`, `border-[#d1d5db]`, `text-[#1f2328]`) palettes.
- [ ] Move Problems / Build pane from the bottom dock to the sidebar (accessible in the sidebar view or tool window stripe).
- [ ] Only show the Problems/Build panel in the sidebar when diagnostics or build logs exist (`diagnostics.length > 0`), ensuring no wasted UI space when clean.
- [ ] Pass current theme to `MonacoEditorPane` so `monaco.editor.setTheme(theme === 'dark' ? 'intellij-dark' : 'intellij-light')` updates immediately.
- [ ] Update `FileTreeSidebar`, `DiagnosticsLogPanel`, and `PdfPreviewPane` with theme-aware styling.
- [ ] Update UI component tests in `src/components/__tests__/WorkspaceUI.test.tsx` to assert theme classes, sidebar problems visibility, and menu rendering.
- [ ] Run `npm test` and `npm run build` to verify end-to-end type safety and test passing.
- [ ] Commit changes with message `feat(ui): integrate dark/light theme switching and sidebar problems panel into workspace`.
