# High-Fidelity PDF Viewer & Reverse SyncTeX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the basic canvas/iframe PDF preview with a high-fidelity High-DPI PDF.js viewer featuring a selectable TextLayer, thumbnail navigation, in-document search, and double-click reverse SyncTeX navigation that jumps the Monaco editor to the clicked LaTeX source code.

**Architecture:** Client-side TeX Web Worker compiles with `synctex: true` and decompresses `synctex.gz` into structured line/coordinate records. `PdfPreviewPane` renders high-DPI canvases with overlaid text layers, thumbnails, and search. Double-clicking a section maps PDF coordinates (or double-clicked text) to the source line and instructs Monaco to reveal and highlight the target line.

**Tech Stack:** Next.js 16 (React 19), `pdfjs-dist` v4.10.38, `glyphtex-engine` WebAssembly, Monaco Editor, Lucide icons, Tailwind CSS, Vitest.

**Spec:** [`docs/superpowers/specs/2026-11-03-pdf-viewer-and-synctex-design.md`](file:///home/mugdho/codes/torque/docs/superpowers/specs/2026-11-03-pdf-viewer-and-synctex-design.md)

---

## Global Constraints

- TeX compilation and PDF rendering are 100% client-side (no server endpoints).
- All changes must be compatible with React 19, Next.js 16 static HTML export (`output: 'export'`), and Web Worker isolation.
- Dark theme (`darcula`) and Light theme (`intellij-light`) styles must match IntelliJ IDEA New UI aesthetics.
- Reverse SyncTeX must support both coordinate-based SyncTeX and robust text-matching fallback.
- All Vitest suites must pass with zero failures (`npm test`).
- Next.js build (`npm run build`) must succeed without TypeScript or bundling errors.

---

## Review Focus

1. High-DPI Canvas Blur: Ensure canvas width/height are multiplied by `devicePixelRatio` while CSS styling stays at viewport size so Retina screens render razor-sharp text.
2. Coordinate Scaled Points: SyncTeX coordinates use TeX scaled points (`65536 sp = 1 pt`). Conversion to PDF points (`pt`) and viewport coordinates must account for TeX's origin and page dimensions.
3. SyncTeX Gzip Decompression: Browser Web Workers must decompress gzip data cleanly without external node libraries, with safe fallback when gzip headers are malformed.
4. TextLayer Alignment: The HTML TextLayer text boxes must align exactly with the canvas text so selections feel natural.
5. Missing SyncTeX Fallback: When a document does not yield SyncTeX data, double-clicking text must cleanly fallback to locating the text snippet in the active editor file without throwing runtime errors.

---

### Task 1: SyncTeX Parser & Engine Worker Integration

**Files:**
- Create: `src/compiler/synctexParser.ts`
- Create: `src/compiler/__tests__/synctexParser.test.ts`
- Modify: `src/compiler/compilerProtocol.ts:25-50`
- Modify: `src/compiler/compiler.worker.ts:830-885`

**Interfaces:**
- Produces:
  ```ts
  export interface SyncTexBlock {
    file: string;
    line: number;
    col: number;
    page: number;
    x: number; // in PDF pt
    y: number; // in PDF pt
    width: number;
    height: number;
  }
  export interface SyncTexIndex {
    files: Map<number, string> | Record<number, string>;
    blocks: SyncTexBlock[];
  }
  export function parseSyncTex(rawText: string): SyncTexIndex;
  export function resolveSyncTexPosition(
    index: SyncTexIndex,
    page: number,
    xPt: number,
    yPt: number,
    tolerancePt?: number
  ): { file: string; line: number } | null;
  export function decompressGzip(bytes: Uint8Array): Promise<string>;
  ```

- [ ] **Step 1: Write the failing tests for `synctexParser`**
Create `src/compiler/__tests__/synctexParser.test.ts` testing `parseSyncTex`, `resolveSyncTexPosition`, and `decompressGzip` with sample SyncTeX text and gzip data.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run src/compiler/__tests__/synctexParser.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `synctexParser.ts`**
Implement SyncTeX parser extracting `Input:<tag>:<filename>` and record lines `[<tag>,<line>:<x>,<y>:<w>,<h>]`, converting TeX sp to pt (`sp / 65536`), and implement `resolveSyncTexPosition` using nearest Euclidean / bounding box distance. Implement `decompressGzip` using browser `DecompressionStream('gzip')` with `TextDecoder`.

- [ ] **Step 4: Update `compilerProtocol.ts` and `compiler.worker.ts`**
Add `synctexIndex?: SyncTexIndex` to `CompileWorkerResult`. In `compiler.worker.ts`, pass `synctex: true` to `engine.compile()`, retrieve `jobname.synctex.gz`, decompress and parse it, and include `synctexIndex` in the posted result.

- [ ] **Step 5: Run tests to verify they pass**
Run: `npx vitest run src/compiler/__tests__/synctexParser.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**
```bash
git add src/compiler/synctexParser.ts src/compiler/__tests__/synctexParser.test.ts src/compiler/compilerProtocol.ts src/compiler/compiler.worker.ts
git commit -m "feat(compiler): add synctex parser and worker compilation integration"
```

---

### Task 2: High-DPI & TextLayer Core PDF Page Component

**Files:**
- Create: `src/components/pdf/PdfPageView.tsx`
- Create: `src/components/__tests__/PdfPageView.test.tsx`

**Interfaces:**
- Consumes: `pdfjsLib.PDFPageProxy`, `pdfjsLib.PageViewport`
- Produces:
  ```ts
  export interface PdfPageViewProps {
    page: any; // pdfjsLib.PDFPageProxy
    pageNumber: number;
    scale: number;
    searchQuery?: string;
    onDoubleClick?: (event: { pageNumber: number; xPt: number; yPt: number; textSnippet: string }) => void;
  }
  export const PdfPageView: React.FC<PdfPageViewProps>;
  ```

- [ ] **Step 1: Write failing test for `PdfPageView`**
Create `src/components/__tests__/PdfPageView.test.tsx` asserting that `PdfPageView` renders a canvas with `devicePixelRatio` scaling, sets up the text layer container, and triggers `onDoubleClick` with normalized PDF coordinates and clicked text snippet.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run src/components/__tests__/PdfPageView.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `PdfPageView.tsx`**
Implement the component:
1. Render canvas with `width = viewport.width * dpr`, `height = viewport.height * dpr`, CSS `width = viewport.width px`, `ctx.scale(dpr, dpr)`.
2. Render text layer using `pdfjsLib.renderTextLayer` (or `pdfjsLib.TextLayer` in v4) with CSS `.textLayer` classes for text selection.
3. Attach `onDoubleClick` event listener: compute `xPt = (e.clientX - rect.left) / scale` and `yPt = (e.clientY - rect.top) / scale`, extract selected text or text under cursor, and call `props.onDoubleClick`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run src/components/__tests__/PdfPageView.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/components/pdf/PdfPageView.tsx src/components/__tests__/PdfPageView.test.tsx
git commit -m "feat(pdf): add High-DPI PdfPageView with selectable TextLayer and double-click handler"
```

---

### Task 3: PDF Preview Toolbar, Thumbnail Sidebar & In-Document Search

**Files:**
- Create: `src/components/pdf/PdfToolbar.tsx`
- Create: `src/components/pdf/PdfThumbnailsPane.tsx`
- Create: `src/components/__tests__/PdfToolbar.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface PdfToolbarProps {
    currentPage: number;
    numPages: number;
    scale: number;
    searchOpen: boolean;
    searchQuery: string;
    searchMatchesCount: number;
    activeSearchMatch: number;
    showThumbnails: boolean;
    onPageChange: (page: number) => void;
    onScaleChange: (scale: number) => void;
    onFitWidth: () => void;
    onFitPage: () => void;
    onToggleThumbnails: () => void;
    onToggleSearch: () => void;
    onSearchChange: (query: string) => void;
    onSearchNext: () => void;
    onSearchPrev: () => void;
    onDownload: () => void;
  }
  export const PdfToolbar: React.FC<PdfToolbarProps>;
  ```

- [ ] **Step 1: Write failing test for `PdfToolbar` and `PdfThumbnailsPane`**
Create `src/components/__tests__/PdfToolbar.test.tsx` verifying page number input, zoom buttons (In, Out, Fit Width, Fit Page), thumbnail toggle, and search input with navigation buttons.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run src/components/__tests__/PdfToolbar.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `PdfToolbar.tsx` and `PdfThumbnailsPane.tsx`**
Implement the toolbar with IntelliJ IDEA styling (status pills, compact buttons, icon sizing, keyboard shortcuts) and the collapsible thumbnail pane rendering small page canvas previews.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run src/components/__tests__/PdfToolbar.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/components/pdf/PdfToolbar.tsx src/components/pdf/PdfThumbnailsPane.tsx src/components/__tests__/PdfToolbar.test.tsx
git commit -m "feat(pdf): add IntelliJ-styled PdfToolbar and PdfThumbnailsPane"
```

---

### Task 4: Complete `PdfPreviewPane` Integration & Workspace Reverse Sync Wiring

**Files:**
- Modify: `src/components/PdfPreviewPane.tsx`
- Modify: `src/components/WorkspaceUI.tsx:120-160`
- Modify: `src/types/workspace.ts`
- Create/Modify: `src/components/__tests__/PdfPreviewPane.test.tsx`

**Interfaces:**
- Consumes:
  - `PdfPreviewPaneProps` accepts `syncTexIndex?: SyncTexIndex`, `onNavigateToSource?: (file: string, line: number) => void`.
  - `WorkspaceUI` binds `onNavigateToSource` to `monacoEditorRef.current.revealLineInCenter(line)` and sets selection.

- [ ] **Step 1: Write integration tests for reverse sync and preview pane**
Create `src/components/__tests__/PdfPreviewPane.test.tsx` verifying:
1. Double-clicking on a page resolves SyncTeX position and calls `onNavigateToSource(file, line)`.
2. Fallback text search matches snippet in workspace file content when SyncTeX is absent.
3. Zooming and page switching work smoothly.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run src/components/__tests__/PdfPreviewPane.test.tsx`
Expected: FAIL (missing props or behaviors).

- [ ] **Step 3: Wire `PdfPreviewPane` with `PdfPageView`, `PdfToolbar`, and `PdfThumbnailsPane`**
Refactor `PdfPreviewPane.tsx` to mount `PdfToolbar`, `PdfThumbnailsPane`, continuous scroll page list with `PdfPageView`, handle double-click events, resolve SyncTeX coordinates or text match fallback, and trigger `onNavigateToSource`.
In `WorkspaceUI.tsx`, pass `syncTexIndex` from compilation result to `PdfPreviewPane` and implement `handleNavigateToSource`:
```ts
const handleNavigateToSource = (targetFile: string, targetLine: number) => {
  if (targetFile && targetFile !== currentFile) {
    setActiveFile(targetFile);
  }
  if (editorInstanceRef.current) {
    editorInstanceRef.current.revealLineInCenter(targetLine);
    editorInstanceRef.current.setPosition({ lineNumber: targetLine, column: 1 });
    editorInstanceRef.current.focus();
    // Flash line highlight decoration for 1.2s
  }
};
```

- [ ] **Step 4: Run all Vitest suites and Next.js build**
Run: `npm test && npm run build`
Expected: 100% tests pass (all 17+ suites), Next.js export completes without errors.

- [ ] **Step 5: Commit**
```bash
git add src/components/PdfPreviewPane.tsx src/components/WorkspaceUI.tsx src/types/workspace.ts src/components/__tests__/PdfPreviewPane.test.tsx
git commit -m "feat(pdf): integrate high-fidelity PDF viewer with reverse synctex navigation to Monaco editor"
```
