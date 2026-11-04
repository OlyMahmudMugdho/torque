# UI Streamlining, Autosave, and Package Manager Removal Plan

## Overview
Streamline Torque's user interface and compilation workflow:
1. Remove "Built with Warnings" status pills from ProjectTopBar and PdfPreviewPane (only show spotless/success vs failure/errors).
2. Remove direct theme switcher toggle buttons from the toolbar and side rail; theme switching is strictly accessed from View menu and Settings.
3. Add full support for enabling/disabling Autosave (with persistent settings, configurable interval or toggle, and integration with useWorkspace).
4. Remove the manual Package Manager section/modal/shortcuts/catalog completely, since packages are automatically downloaded on the fly via the automated CTAN resolver.
5. Provide an IntelliJ-style Settings modal accessible from TopMenuBar (File -> Settings / Tools -> Settings) and the side rail Settings gear button, featuring Theme selection and Autosave toggle.

## Global Constraints
- Vitest test suite (`npm test`) must pass with 0 failures.
- Next.js static build (`npm run build`) must complete without TypeScript or bundling errors.
- Cargo tests (`cargo test --manifest-path src-tauri/Cargo.toml`) must pass.
- MAP.md and AGENTS.md must reflect the streamlined UI and autosave capabilities.

## Tasks

### Task 1: Remove "Built with Warnings" Pills & Remove Direct Theme Toggle Buttons
- In `ProjectTopBar.tsx`, remove the yellow "Built with Warnings" status pill and the sun/moon theme toggle button from the right side.
- In `PdfPreviewPane.tsx`, remove the "Built with Warnings" status badge.
- In `App.tsx`, remove the theme toggle button from the left activity stripe (keeping only Problems and Settings gear).
- Ensure theme selection remains fully functional in `TopMenuBar.tsx` under View -> Dark Mode / Light Mode.
- Update tests asserting "Built with Warnings" and toolbar theme toggle.

### Task 2: Implement Enable/Disable Autosave & Settings Dialog
- Add autosave setting in workspace state (`useWorkspace.ts` or persistent settings store): `autoSaveEnabled` (default `true`) and `autoSaveIntervalMs` (e.g., 2000ms debounce / 5000ms interval).
- When autosave is enabled, changes in Monaco editor are debounced and persisted to store automatically. When disabled, file changes remain in memory until manual save (`Ctrl+S` / File -> Save).
- Build IntelliJ-style `SettingsModal.tsx` containing:
  - Appearance: Theme selection (Darcula / IntelliJ Light).
  - Editor / Save: Autosave checkbox ("Save files automatically") + interval configuration.
  - TeX Engine default selection.
- Wire Settings dialog to open from `TopMenuBar` (File -> Settings / Ctrl+Alt+S) and activity rail Settings button.
- Add unit tests for autosave toggle and Settings modal.

### Task 3: Remove Package Manager Section & Modal
- Remove `PackageManagerModal.tsx` and its test file.
- In `TopMenuBar.tsx`, remove "LaTeX Package Manager..." and shortcut `Shift+Alt+P`.
- In `App.tsx` and `ProjectTopBar.tsx`, remove all package manager modal state, triggers, and keyboard shortcuts (`Ctrl+Alt+P` / `Shift+Alt+P`).
- In `DiagnosticsLogPanel.tsx`, remove the quick-fix button that opened the package manager modal (compilation already auto-downloads missing packages!).
- Update `packageManager.ts` if needed or keep helper utilities like `insertPackageDeclaration` if used, but remove catalog UI.
- Update tests for TopMenuBar, WorkspaceUI, etc. to remove package manager expectations.

### Task 4: Documentation & Final Verification
- Update `MAP.md` and `AGENTS.md` removing `PackageManagerModal` references and documenting the Settings modal and Autosave support.
- Run `npm test`, `npm run build`, and `cargo test`.
