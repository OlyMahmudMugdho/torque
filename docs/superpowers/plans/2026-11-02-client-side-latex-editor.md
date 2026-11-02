# Client-Side LaTeX Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an open-source, browser-based multi-project LaTeX editor with Monaco Editor, Web Worker WASM compilation via `glyphtex-engine`, structured diagnostic markers, PDF.js preview, and programmatic action hooks for AI harnesses.

**Architecture:** A client-only Vite + React + TypeScript Single Page Application backed by IndexedDB (`projects` and `project_files` stores). Compilation runs off the main thread inside a dedicated Web Worker wrapping `glyphtex-engine` (Tectonic WASM), communicating via typed messages to update Monaco diagnostic markers and a PDF.js canvas viewer.

**Tech Stack:** Vite, React 19, TypeScript, Tailwind CSS, `@monaco-editor/react`, `monaco-editor`, `glyphtex-engine` (`^0.1.0`), `pdfjs-dist`, `jszip`, `react-resizable-panels`, `lucide-react`, Vitest, `@testing-library/react`, `fake-indexeddb`.

**Spec:** `docs/superpowers/specs/2026-11-02-client-side-latex-editor-design.md`

## Global Constraints

- All TeX compilation must occur 100% client-side in WebAssembly via `glyphtex-engine` inside a dedicated Web Worker; never transmit user LaTeX code to external build servers.
- Compilation is strictly trigger-based (via the "Compile" button, `Cmd+Enter` / `Ctrl+Enter` shortcut, or programmatic `WorkspaceActions.compile()` hook)—never auto-compile on every keystroke.
- Heavy compilation tasks or PDF byte transfers must not block Monaco Editor or main-thread UI interactions.
- Storage uses IndexedDB with two object stores: `projects` (`{ id, name, rootEntry, createdAt, updatedAt }`) and `project_files` (compound key `[projectId, path]`, `{ projectId, path, content, isBinary, updatedAt }`).
- Root entry point defaults to `main.tex`, with support for designating any `.tex` file as the active project's compilation entry point.
- Bidirectional SyncTeX and LLM streaming harnesses are out of scope for Phase 1; Phase 1 exposes the `WorkspaceActions` hook interface for Phase 2 AI integration.

## Review Focus

1. **Unclean or traversal paths in virtual file system and zip imports** (`./a//b.tex`, `\`, `../outside.tex`): `normalizeFilePath` must canonicalize slashes, strip leading `./` or `/`, and throw on `..` path segments.
2. **Renaming or deleting the active `rootEntry` file**: Renaming the current `rootEntry` must atomically update `project.rootEntry` to the new path; deleting the current `rootEntry` must throw an error unless another `.tex` file is set as root first.
3. **Concurrent compilation triggers while a compile is already in-flight**: `CompilerClient.compile()` must reject overlapping compile calls while `isCompiling()` is `true` so the worker queue is never flooded.
4. **Diagnostics with missing/zero line numbers or belonging to another file**: `diagnosticsToMarkers()` must clamp undefined or `< 1` line numbers to `1` and filter diagnostics so only those matching the active editor file (or global entry diagnostics) produce Monaco markers.
5. **Importing `.zip` archives with OS junk (`__MACOSX/`, `.DS_Store`), no `main.tex`, or zero `.tex` files**: `importProjectZip()` must strip OS metadata files, auto-select a `.tex` file containing `\documentclass` when `main.tex` is absent, and throw a descriptive error if the archive contains no `.tex` files.

---

## File Map

- `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/index.css` — Project build, Tailwind setup, and test runner configuration.
- `src/types/workspace.ts` — Shared TypeScript interfaces for projects, files, compiler diagnostics, worker protocol, and `WorkspaceActions`.
- `src/storage/projectStore.ts` — IndexedDB persistence service for multi-project CRUD, file tree operations, path normalization, and starter template initialization.
- `src/archive/zipArchive.ts` — `.zip` export and import utilities using `jszip` with path sanitization and root entry auto-detection.
- `src/compiler/compiler.worker.ts` — Dedicated Web Worker hosting `glyphtex-engine` (`TexEngine`), mounting virtual files, running compilation, and transferring PDF bytes.
- `src/compiler/compilerClient.ts` — Main-thread controller managing the compiler Web Worker lifecycle, concurrency guard, and Promise-based compilation.
- `src/editor/latexLanguage.ts` — Monaco LaTeX syntax tokenizer, configuration, diagnostic-to-marker converter, and text diff helper.
- `src/editor/MonacoEditorPane.tsx` — Monaco code editor component with open file tabs, marker binding, and `Cmd+Enter` / `Ctrl+Enter` compile trigger.
- `src/components/FileTreeSidebar.tsx` — Multi-file explorer tree with folder expansion, file/folder creation, binary/text asset upload, rename, delete, and "Set as Root Entry" action.
- `src/components/ProjectTopBar.tsx` — Top bar with project switcher dropdown (create, rename, switch, delete, zip import/export) and Compile button with status indicator.
- `src/components/PdfPreviewPane.tsx` — PDF.js canvas viewer with page navigation, zoom controls, fit-to-width, and PDF download.
- `src/components/DiagnosticsLogPanel.tsx` — Collapsible bottom console displaying structured TeX errors and warnings with line jump links.
- `src/workspace/useWorkspace.ts` — Central React hook integrating storage, compiler client, active editor state, and exposing `WorkspaceActions`.
- `src/App.tsx`, `src/main.tsx` — Resizable 3-pane workspace layout assembling all panels.

---

### Task 1: Project Scaffolding, Core Types & IndexedDB Multi-Project Store

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `src/types/workspace.ts`
- Create: `src/storage/projectStore.ts`
- Test: `src/storage/__tests__/projectStore.test.ts`

**Interfaces:**
- Produces in `src/types/workspace.ts`:
  ```ts
  export type CompileStatus = 'idle' | 'compiling' | 'spotless' | 'warnings' | 'errors' | 'failed';

  export interface Diagnostic {
    severity: 'error' | 'warning' | 'info';
    file?: string;
    line?: number;
    message: string;
  }

  export interface CompileResult {
    status: Exclude<CompileStatus, 'idle' | 'compiling'>;
    pdfBytes: Uint8Array | null;
    diagnostics: Diagnostic[];
    missingFiles: string[];
    durationMs: number;
  }

  export interface Project {
    id: string;
    name: string;
    rootEntry: string;
    createdAt: number;
    updatedAt: number;
  }

  export interface ProjectFile {
    projectId: string;
    path: string;
    content: string | Uint8Array;
    isBinary: boolean;
    updatedAt: number;
  }

  export interface WorkspaceActions {
    compile: () => Promise<CompileResult>;
    getFileContent: (path: string) => Promise<string>;
    setFileContent: (path: string, content: string) => Promise<void>;
    applyDiff: (path: string, original: string, modified: string) => Promise<void>;
    getDiagnostics: () => Diagnostic[];
  }
  ```
- Produces in `src/storage/projectStore.ts`:
  ```ts
  export function normalizeFilePath(rawPath: string): string;
  export class ProjectStore {
    constructor(dbName?: string);
    init(): Promise<void>;
    listProjects(): Promise<Project[]>;
    createProject(name: string, initialFiles?: Omit<ProjectFile, 'projectId' | 'updatedAt'>[], rootEntry?: string): Promise<Project>;
    renameProject(projectId: string, newName: string): Promise<Project>;
    setRootEntry(projectId: string, rootEntry: string): Promise<Project>;
    deleteProject(projectId: string): Promise<void>;
    listFiles(projectId: string): Promise<ProjectFile[]>;
    getFile(projectId: string, path: string): Promise<ProjectFile | undefined>;
    putFile(projectId: string, path: string, content: string | Uint8Array, isBinary?: boolean): Promise<ProjectFile>;
    renameFile(projectId: string, oldPath: string, newPath: string): Promise<ProjectFile>;
    deleteFile(projectId: string, path: string): Promise<void>;
  }
  ```

- [ ] **Step 1: Initialize Vite + React + TypeScript project and install dependencies**

Create `package.json`, `tsconfig.json`, and `vite.config.ts` with React, TypeScript, Tailwind CSS, `@monaco-editor/react`, `monaco-editor`, `glyphtex-engine`, `pdfjs-dist`, `jszip`, `react-resizable-panels`, `lucide-react`, and devDependencies `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `fake-indexeddb`. Run `npm install`.

- [ ] **Step 2: Write the failing unit tests for `normalizeFilePath` and `ProjectStore` in `src/storage/__tests__/projectStore.test.ts`**

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectStore, normalizeFilePath } from '../projectStore';

describe('normalizeFilePath', () => {
  it('normalizes slashes and strips leading ./ or /', () => {
    expect(normalizeFilePath('./chapters//intro.tex')).toBe('chapters/intro.tex');
    expect(normalizeFilePath('\\sections\\math.tex')).toBe('sections/math.tex');
    expect(normalizeFilePath('/main.tex')).toBe('main.tex');
  });

  it('throws on parent traversal segments or empty path', () => {
    expect(() => normalizeFilePath('../secret.tex')).toThrow(/invalid path/i);
    expect(() => normalizeFilePath('chapters/../../etc/passwd')).toThrow(/invalid path/i);
    expect(() => normalizeFilePath('   ')).toThrow(/invalid path/i);
  });
});

describe('ProjectStore', () => {
  let store: ProjectStore;

  beforeEach(async () => {
    store = new ProjectStore(`test-db-${ crypto.randomUUID() }`);
    await store.init();
  });

  it('creates a project with starter main.tex and lists it', async () => {
    const project = await store.createProject('Quantum Paper');
    expect(project.name).toBe('Quantum Paper');
    expect(project.rootEntry).toBe('main.tex');

    const files = await store.listFiles(project.id);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('main.tex');
    expect(String(files[0].content)).toContain('\\documentclass');
  });

  it('updates rootEntry automatically when the current rootEntry file is renamed', async () => {
    const project = await store.createProject('Thesis');
    await store.renameFile(project.id, 'main.tex', 'thesis.tex');

    const [updated] = await store.listProjects();
    expect(updated.rootEntry).toBe('thesis.tex');
  });

  it('prevents deleting the active rootEntry file directly', async () => {
    const project = await store.createProject('Paper');
    await expect(store.deleteFile(project.id, 'main.tex')).rejects.toThrow(/root entry/i);
  });

  it('deletes all project files when a project is deleted', async () => {
    const project = await store.createProject('Temp');
    await store.putFile(project.id, 'refs.bib', '@article{key, title={X}}');
    await store.deleteProject(project.id);

    expect(await store.listProjects()).toHaveLength(0);
    expect(await store.listFiles(project.id)).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/storage/__tests__/projectStore.test.ts`
Expected: FAIL with module not found `../projectStore`.

- [ ] **Step 4: Implement `src/types/workspace.ts` and `src/storage/projectStore.ts`**

Implement `normalizeFilePath` and `ProjectStore` using native `indexedDB` with two object stores: `projects` (keyPath `'id'`) and `project_files` (keyPath `['projectId', 'path']`, with an index `'by_project'` on `'projectId'`). When `createProject` is called without `initialFiles`, populate a default `main.tex` article template.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/storage/__tests__/projectStore.test.ts`
Expected: PASS (5 tests passing).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts src/types/workspace.ts src/storage/projectStore.ts src/storage/__tests__/projectStore.test.ts
git commit -m "feat(storage): add workspace types and IndexedDB multi-project store"
```

---

### Task 2: Project `.zip` Archive Import and Export

**Files:**
- Create: `src/archive/zipArchive.ts`
- Test: `src/archive/__tests__/zipArchive.test.ts`

**Interfaces:**
- Consumes: `Project`, `ProjectFile` from `src/types/workspace.ts`; `normalizeFilePath` from `src/storage/projectStore.ts`.
- Produces in `src/archive/zipArchive.ts`:
  ```ts
  export interface ImportedZipProject {
    rootEntry: string;
    files: Omit<ProjectFile, 'projectId' | 'updatedAt'>[];
  }

  export function isBinaryFilePath(path: string): boolean;
  export function exportProjectZip(files: ProjectFile[]): Promise<Uint8Array>;
  export function importProjectZip(zipData: ArrayBuffer | Uint8Array): Promise<ImportedZipProject>;
  ```

- [ ] **Step 1: Write the failing tests in `src/archive/__tests__/zipArchive.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { exportProjectZip, importProjectZip } from '../zipArchive';
import type { ProjectFile } from '../../types/workspace';

describe('zipArchive', () => {
  it('round-trips text and binary files through exportProjectZip and importProjectZip', async () => {
    const files: ProjectFile[] = [
      { projectId: 'p1', path: 'main.tex', content: '\\documentclass{article}\\begin{document}Hi\\end{document}', isBinary: false, updatedAt: 1 },
      { projectId: 'p1', path: 'images/fig1.png', content: new Uint8Array([137, 80, 78, 71]), isBinary: true, updatedAt: 1 },
    ];

    const zipBytes = await exportProjectZip(files);
    const imported = await importProjectZip(zipBytes);

    expect(imported.rootEntry).toBe('main.tex');
    expect(imported.files).toHaveLength(2);
    const fig = imported.files.find(f => f.path === 'images/fig1.png');
    expect(fig?.isBinary).toBe(true);
    expect(Array.from(fig?.content as Uint8Array)).toEqual([137, 80, 78, 71]);
  });

  it('strips __MACOSX and .DS_Store and auto-detects \\documentclass root entry when main.tex is absent', async () => {
    const zip = new JSZip();
    zip.file('__MACOSX/._paper.tex', 'junk');
    zip.file('.DS_Store', 'junk');
    zip.file('chapters/intro.tex', '\\section{Intro}');
    zip.file('paper.tex', '\\documentclass{article}\n\\begin{document}\\input{chapters/intro}\\end{document}');
    const bytes = await zip.generateAsync({ type: 'uint8array' });

    const imported = await importProjectZip(bytes);
    expect(imported.files.map(f => f.path).sort()).toEqual(['chapters/intro.tex', 'paper.tex']);
    expect(imported.rootEntry).toBe('paper.tex');
  });

  it('throws if the archive contains no .tex files', async () => {
    const zip = new JSZip();
    zip.file('readme.txt', 'hello');
    const bytes = await zip.generateAsync({ type: 'uint8array' });

    await expect(importProjectZip(bytes)).rejects.toThrow(/no \.tex file/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/archive/__tests__/zipArchive.test.ts`
Expected: FAIL with module not found `../zipArchive`.

- [ ] **Step 3: Implement `src/archive/zipArchive.ts`**

Use `JSZip` to pack and unpack files. Ignore directory entries, `__MACOSX/*`, and `*.DS_Store`. Strip a single common top-level wrapper folder if all files share one and a `.tex` file exists inside it. Determine `isBinary` based on extension (`.png`, `.jpg`, `.jpeg`, `.pdf`, `.eps`, `.ttf`, `.otf`, `.woff`, `.woff2`). Pick `main.tex` as `rootEntry` if present, otherwise the first `.tex` file containing `\documentclass`, otherwise the first `.tex` file. Throw if no `.tex` file exists.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/archive/__tests__/zipArchive.test.ts`
Expected: PASS (3 tests passing).

- [ ] **Step 5: Commit**

```bash
git add src/archive/zipArchive.ts src/archive/__tests__/zipArchive.test.ts
git commit -m "feat(archive): add zip export and import with root TeX detection"
```

---

### Task 3: Web Worker `glyphtex-engine` Compiler & Main-Thread Client

**Files:**
- Create: `src/compiler/compilerProtocol.ts`
- Create: `src/compiler/compiler.worker.ts`
- Create: `src/compiler/compilerClient.ts`
- Test: `src/compiler/__tests__/compilerClient.test.ts`

**Interfaces:**
- Consumes: `CompileResult`, `Diagnostic`, `ProjectFile` from `src/types/workspace.ts`.
- Produces in `src/compiler/compilerProtocol.ts`:
  ```ts
  export interface CompileWorkerRequest {
    type: 'compile';
    requestId: string;
    entry: string;
    files: Array<{ path: string; content: string | Uint8Array }>;
  }

  export interface CompileWorkerResponse {
    type: 'compile-result';
    requestId: string;
    result: CompileResult;
    error?: string;
  }
  ```
- Produces in `src/compiler/compilerClient.ts`:
  ```ts
  export type WorkerLike = Pick<Worker, 'postMessage' | 'addEventListener' | 'removeEventListener' | 'terminate'>;

  export class CompilerClient {
    constructor(createWorker?: () => WorkerLike);
    isCompiling(): boolean;
    compile(files: Pick<ProjectFile, 'path' | 'content'>[], entry: string): Promise<CompileResult>;
    dispose(): void;
  }
  ```

- [ ] **Step 1: Write the failing tests for `CompilerClient` and worker protocol in `src/compiler/__tests__/compilerClient.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { CompilerClient, type WorkerLike } from '../compilerClient';
import type { CompileWorkerRequest, CompileWorkerResponse } from '../compilerProtocol';

function createMockWorker(handler: (req: CompileWorkerRequest, respond: (res: CompileWorkerResponse) => void) => void): WorkerLike {
  const listeners = new Set<EventListenerOrEventListenerObject>();
  return {
    postMessage(msg: CompileWorkerRequest) {
      handler(msg, (res) => {
        const event = new MessageEvent('message', { data: res });
        listeners.forEach(l => typeof l === 'function' ? l(event) : l.handleEvent(event));
      });
    },
    addEventListener(_type: string, listener: EventListenerOrEventListenerObject) {
      listeners.add(listener);
    },
    removeEventListener(_type: string, listener: EventListenerOrEventListenerObject) {
      listeners.delete(listener);
    },
    terminate() {
      listeners.clear();
    }
  };
}

describe('CompilerClient', () => {
  it('sends files and entry to worker and resolves with CompileResult', async () => {
    const client = new CompilerClient(() =>
      createMockWorker((req, respond) => {
        respond({
          type: 'compile-result',
          requestId: req.requestId,
          result: {
            status: 'spotless',
            pdfBytes: new Uint8Array([37, 80, 68, 70]),
            diagnostics: [],
            missingFiles: [],
            durationMs: 42,
          },
        });
      })
    );

    const res = await client.compile([{ path: 'main.tex', content: 'Hi' }], 'main.tex');
    expect(res.status).toBe('spotless');
    expect(res.pdfBytes).toEqual(new Uint8Array([37, 80, 68, 70]));
    expect(client.isCompiling()).toBe(false);
  });

  it('rejects concurrent compile triggers while a compilation is already in-flight', async () => {
    let release!: () => void;
    const client = new CompilerClient(() =>
      createMockWorker((req, respond) => {
        release = () =>
          respond({
            type: 'compile-result',
            requestId: req.requestId,
            result: { status: 'spotless', pdfBytes: null, diagnostics: [], missingFiles: [], durationMs: 10 },
          });
      })
    );

    const first = client.compile([{ path: 'main.tex', content: 'A' }], 'main.tex');
    expect(client.isCompiling()).toBe(true);

    await expect(client.compile([{ path: 'main.tex', content: 'B' }], 'main.tex')).rejects.toThrow(/already in progress/i);

    release();
    await first;
    expect(client.isCompiling()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/compiler/__tests__/compilerClient.test.ts`
Expected: FAIL with module not found `../compilerClient`.

- [ ] **Step 3: Implement `src/compiler/compilerProtocol.ts`, `src/compiler/compiler.worker.ts`, and `src/compiler/compilerClient.ts`**

In `src/compiler/compiler.worker.ts`, lazily initialize `TexEngine` from `glyphtex-engine`, populate project files via `engine.addFile(f.path, f.content)`, call `engine.compile({ entry: req.entry, synctex: false })`, extract `engine.pdf()` when `result.status !== 'failed'`, and post `CompileWorkerResponse` back to the main thread (transferring the `pdfBytes.buffer` when available). In `CompilerClient`, enforce the single in-flight compilation guard (`isCompiling()`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/compiler/__tests__/compilerClient.test.ts`
Expected: PASS (2 tests passing).

- [ ] **Step 5: Commit**

```bash
git add src/compiler/compilerProtocol.ts src/compiler/compiler.worker.ts src/compiler/compilerClient.ts src/compiler/__tests__/compilerClient.test.ts
git commit -m "feat(compiler): add glyphtex-engine Web Worker and CompilerClient with concurrency guard"
```

---

### Task 4: Monaco LaTeX Language Support, Diagnostic Markers & Diff Application

**Files:**
- Create: `src/editor/latexLanguage.ts`
- Test: `src/editor/__tests__/latexLanguage.test.ts`

**Interfaces:**
- Consumes: `Diagnostic` from `src/types/workspace.ts`.
- Produces in `src/editor/latexLanguage.ts`:
  ```ts
  export interface MonacoMarkerPayload {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
    message: string;
    severity: 8 | 4 | 2; // 8 = Error, 4 = Warning, 2 = Info in Monaco MarkerSeverity
  }

  export function diagnosticsToMarkers(
    diagnostics: Diagnostic[],
    activeFilePath: string,
    rootEntry: string
  ): MonacoMarkerPayload[];

  export function applyTextDiff(content: string, original: string, modified: string): string;
  export function registerLatexLanguage(monacoInstance: typeof import('monaco-editor')): void;
  ```

- [ ] **Step 1: Write the failing tests in `src/editor/__tests__/latexLanguage.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { diagnosticsToMarkers, applyTextDiff } from '../latexLanguage';
import type { Diagnostic } from '../../types/workspace';

describe('diagnosticsToMarkers', () => {
  it('maps error and warning diagnostics for the active file and clamps invalid line numbers to >= 1', () => {
    const diagnostics: Diagnostic[] = [
      { severity: 'error', file: 'main.tex', line: 12, message: 'Undefined control sequence \\foo' },
      { severity: 'warning', file: undefined, line: 0, message: 'Overfull \\hbox' },
      { severity: 'error', file: 'chapters/other.tex', line: 5, message: 'Missing $ inserted' },
    ];

    const mainMarkers = diagnosticsToMarkers(diagnostics, 'main.tex', 'main.tex');
    expect(mainMarkers).toEqual([
      {
        startLineNumber: 12,
        startColumn: 1,
        endLineNumber: 12,
        endColumn: 1000,
        message: 'Undefined control sequence \\foo',
        severity: 8,
      },
      {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 1000,
        message: 'Overfull \\hbox',
        severity: 4,
      },
    ]);

    const otherMarkers = diagnosticsToMarkers(diagnostics, 'chapters/other.tex', 'main.tex');
    expect(otherMarkers).toHaveLength(1);
    expect(otherMarkers[0].startLineNumber).toBe(5);
  });
});

describe('applyTextDiff', () => {
  it('replaces the target snippet with modified text and throws when original snippet is not found', () => {
    const doc = '\\section{Intro}\nHello world\n\\end{document}';
    expect(applyTextDiff(doc, 'Hello world', 'Hello Quantum World')).toBe(
      '\\section{Intro}\nHello Quantum World\n\\end{document}'
    );
    expect(() => applyTextDiff(doc, 'Nonexistent snippet', 'Replacement')).toThrow(/not found/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/editor/__tests__/latexLanguage.test.ts`
Expected: FAIL with module not found `../latexLanguage`.

- [ ] **Step 3: Implement `src/editor/latexLanguage.ts`**

Implement `diagnosticsToMarkers` (normalizing `d.file` when present, matching diagnostics without `d.file` to `rootEntry`, clamping `Math.max(1, d.line ?? 1)`), `applyTextDiff` (locating `original` in `content` and replacing it, throwing an error if `original` is missing), and `registerLatexLanguage` (registering `'latex'` with Monarch tokenizer rules for commands, environments, math `$...$`, comments `%`, and bracket pairs).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/editor/__tests__/latexLanguage.test.ts`
Expected: PASS (2 tests passing).

- [ ] **Step 5: Commit**

```bash
git add src/editor/latexLanguage.ts src/editor/__tests__/latexLanguage.test.ts
git commit -m "feat(editor): add LaTeX Monarch grammar, diagnostic marker mapper, and diff utility"
```

---

### Task 5: Workspace Controller Hook & AI Action Harness Interface (`useWorkspace`)

**Files:**
- Create: `src/workspace/useWorkspace.ts`
- Test: `src/workspace/__tests__/useWorkspace.test.tsx`

**Interfaces:**
- Consumes: `ProjectStore` from `src/storage/projectStore.ts`; `CompilerClient` from `src/compiler/compilerClient.ts`; `exportProjectZip`, `importProjectZip` from `src/archive/zipArchive.ts`; `applyTextDiff` from `src/editor/latexLanguage.ts`.
- Produces in `src/workspace/useWorkspace.ts`:
  ```ts
  export interface UseWorkspaceOptions {
    store?: ProjectStore;
    compiler?: CompilerClient;
  }

  export interface WorkspaceState {
    ready: boolean;
    projects: Project[];
    activeProject: Project | null;
    files: ProjectFile[];
    activeFilePath: string;
    openTabs: string[];
    compileStatus: CompileStatus;
    lastResult: CompileResult | null;
    selectProject: (projectId: string) => Promise<void>;
    createNewProject: (name: string) => Promise<Project>;
    renameActiveProject: (name: string) => Promise<void>;
    deleteProjectById: (projectId: string) => Promise<void>;
    selectFile: (path: string) => void;
    closeTab: (path: string) => void;
    createFile: (path: string, content?: string | Uint8Array, isBinary?: boolean) => Promise<void>;
    updateActiveFileContent: (content: string) => Promise<void>;
    renameFilePath: (oldPath: string, newPath: string) => Promise<void>;
    deleteFilePath: (path: string) => Promise<void>;
    setProjectRootEntry: (path: string) => Promise<void>;
    exportActiveProjectZip: () => Promise<Uint8Array>;
    importZipAsProject: (name: string, zipBytes: ArrayBuffer | Uint8Array) => Promise<Project>;
    actions: WorkspaceActions;
  }

  export function useWorkspace(options?: UseWorkspaceOptions): WorkspaceState;
  ```

- [ ] **Step 1: Write the failing tests in `src/workspace/__tests__/useWorkspace.test.tsx`**

```tsx
// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useWorkspace } from '../useWorkspace';
import { ProjectStore } from '../../storage/projectStore';
import { CompilerClient } from '../../compiler/compilerClient';

describe('useWorkspace', () => {
  it('initializes with a default project and exposes WorkspaceActions for compiling and diffing', async () => {
    const store = new ProjectStore(`ws-test-${crypto.randomUUID()}`);
    const mockCompiler = {
      isCompiling: () => false,
      compile: vi.fn().mockResolvedValue({
        status: 'spotless',
        pdfBytes: new Uint8Array([1, 2, 3]),
        diagnostics: [{ severity: 'warning', file: 'main.tex', line: 3, message: 'Test warning' }],
        missingFiles: [],
        durationMs: 55,
      }),
      dispose: vi.fn(),
    } as unknown as CompilerClient;

    const { result } = renderHook(() => useWorkspace({ store, compiler: mockCompiler }));

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.activeProject?.name).toBe('Untitled Project');
    expect(result.current.activeFilePath).toBe('main.tex');

    await act(async () => {
      await result.current.actions.setFileContent('main.tex', '\\documentclass{article}\n\\begin{document}\nOld text\n\\end{document}');
      await result.current.actions.applyDiff('main.tex', 'Old text', 'New AI edited text');
    });

    const updatedContent = await result.current.actions.getFileContent('main.tex');
    expect(updatedContent).toContain('New AI edited text');

    await act(async () => {
      const compileRes = await result.current.actions.compile();
      expect(compileRes.status).toBe('spotless');
    });

    expect(result.current.actions.getDiagnostics()).toHaveLength(1);
    expect(mockCompiler.compile).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ path: 'main.tex' })]),
      'main.tex'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/workspace/__tests__/useWorkspace.test.tsx`
Expected: FAIL with module not found `../useWorkspace`.

- [ ] **Step 3: Implement `src/workspace/useWorkspace.ts`**

Manage active project state, open tabs, file list synchronization with `ProjectStore`, and `WorkspaceActions` (`compile`, `getFileContent`, `setFileContent`, `applyDiff`, `getDiagnostics`). When `listProjects()` is empty on startup, automatically create `'Untitled Project'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/workspace/__tests__/useWorkspace.test.tsx`
Expected: PASS (1 integration hook test passing).

- [ ] **Step 5: Commit**

```bash
git add src/workspace/useWorkspace.ts src/workspace/__tests__/useWorkspace.test.tsx
git commit -m "feat(workspace): add useWorkspace state hook and Phase 2 AI WorkspaceActions interface"
```

---

### Task 6: Workspace UI Components & Split-Pane Application Assembly

**Files:**
- Create: `src/components/ProjectTopBar.tsx`
- Create: `src/components/FileTreeSidebar.tsx`
- Create: `src/components/DiagnosticsLogPanel.tsx`
- Create: `src/components/PdfPreviewPane.tsx`
- Create: `src/editor/MonacoEditorPane.tsx`
- Create: `src/App.tsx`
- Create: `src/main.tsx`
- Create: `index.html`
- Create: `src/index.css`
- Test: `src/components/__tests__/WorkspaceUI.test.tsx`

**Interfaces:**
- Consumes: `useWorkspace`, `WorkspaceState` from `src/workspace/useWorkspace.ts`; `diagnosticsToMarkers`, `registerLatexLanguage` from `src/editor/latexLanguage.ts`.
- Produces:
  - `ProjectTopBar`: project switcher dropdown, new/rename/delete project actions, zip import/export triggers, and Compile button displaying `compileStatus` and `durationMs`.
  - `FileTreeSidebar`: hierarchical folder/file tree, create file, upload binary/text file, rename, delete, and "Set as Root Entry" button showing a `ROOT` badge next to `activeProject.rootEntry`.
  - `MonacoEditorPane`: tab bar for `openTabs`, Monaco editor instance (or binary file placeholder for images), marker projection via `diagnosticsToMarkers`, and `Cmd+Enter` / `Ctrl+Enter` compile keybinding.
  - `DiagnosticsLogPanel`: collapsible bottom drawer listing diagnostics with severity badges and click handler to focus the diagnostic's file and line.
  - `PdfPreviewPane`: renders `pdfBytes` via `pdfjs-dist` into canvas elements with zoom controls (`-`, `+`, `Fit`), page count display, and a `Download PDF` button.

- [ ] **Step 1: Write the failing component tests in `src/components/__tests__/WorkspaceUI.test.tsx`**

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileTreeSidebar } from '../FileTreeSidebar';
import { DiagnosticsLogPanel } from '../DiagnosticsLogPanel';
import { ProjectTopBar } from '../ProjectTopBar';
import type { Project, ProjectFile, Diagnostic } from '../../types/workspace';

const sampleProject: Project = {
  id: 'p1',
  name: 'Relativity Paper',
  rootEntry: 'main.tex',
  createdAt: 1,
  updatedAt: 1,
};

const sampleFiles: ProjectFile[] = [
  { projectId: 'p1', path: 'main.tex', content: '...', isBinary: false, updatedAt: 1 },
  { projectId: 'p1', path: 'sections/intro.tex', content: '...', isBinary: false, updatedAt: 1 },
];

describe('Workspace UI Components', () => {
  it('renders FileTreeSidebar with ROOT badge and triggers file selection and root entry changes', () => {
    const onSelectFile = vi.fn();
    const onSetRoot = vi.fn();

    render(
      <FileTreeSidebar
        files={sampleFiles}
        activeFilePath="main.tex"
        rootEntry="main.tex"
        onSelectFile={onSelectFile}
        onCreateFile={vi.fn()}
        onUploadFiles={vi.fn()}
        onRenameFile={vi.fn()}
        onDeleteFile={vi.fn()}
        onSetRootEntry={onSetRoot}
      />
    );

    expect(screen.getByText('main.tex')).toBeInTheDocument();
    expect(screen.getByText('ROOT')).toBeInTheDocument();

    fireEvent.click(screen.getByText('intro.tex'));
    expect(onSelectFile).toHaveBeenCalledWith('sections/intro.tex');
  });

  it('triggers compile when Compile button is clicked in ProjectTopBar', () => {
    const onCompile = vi.fn();
    render(
      <ProjectTopBar
        projects={[sampleProject]}
        activeProject={sampleProject}
        compileStatus="spotless"
        lastDurationMs={120}
        onSelectProject={vi.fn()}
        onCreateProject={vi.fn()}
        onRenameProject={vi.fn()}
        onDeleteProject={vi.fn()}
        onExportZip={vi.fn()}
        onImportZip={vi.fn()}
        onCompile={onCompile}
      />
    );

    expect(screen.getByText(/120ms/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /compile/i }));
    expect(onCompile).toHaveBeenCalledTimes(1);
  });

  it('renders compiler diagnostics in DiagnosticsLogPanel and invokes onSelectDiagnostic on click', () => {
    const onSelect = vi.fn();
    const diagnostics: Diagnostic[] = [
      { severity: 'error', file: 'main.tex', line: 18, message: 'Undefined control sequence \\badmacro' },
    ];

    render(<DiagnosticsLogPanel diagnostics={diagnostics} onSelectDiagnostic={onSelect} />);
    const item = screen.getByText(/Undefined control sequence/i);
    expect(item).toBeInTheDocument();

    fireEvent.click(item);
    expect(onSelect).toHaveBeenCalledWith(diagnostics[0]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/WorkspaceUI.test.tsx`
Expected: FAIL with module not found `../FileTreeSidebar`.

- [ ] **Step 3: Implement the UI components, `src/App.tsx`, `src/main.tsx`, `index.html`, and `src/index.css`**

Implement `ProjectTopBar`, `FileTreeSidebar`, `DiagnosticsLogPanel`, `PdfPreviewPane`, `MonacoEditorPane`, and assemble them in `src/App.tsx` using `react-resizable-panels` (`PanelGroup`, `Panel`, `PanelResizeHandle`). Expose `window.__TORQUE_WORKSPACE_ACTIONS__ = workspace.actions` on `App` mount so Phase 2 AI agents and browser automation can invoke `WorkspaceActions` directly.

- [ ] **Step 4: Run full test suite and production build to verify everything passes**

Run: `npx vitest run && npm run build`
Expected: All unit/component tests PASS and Vite production bundle compiles cleanly with exit code 0.

- [ ] **Step 5: Commit**

```bash
git add index.html src/index.css src/main.tsx src/App.tsx src/editor/MonacoEditorPane.tsx src/components/
git commit -m "feat(ui): add Monaco editor pane, file tree, PDF previewer, and multi-project workspace layout"
```
