# High-Fidelity PDF Viewer & Reverse SyncTeX Navigation Design

## 1. Intent & Context
Torque's current PDF preview (`PdfPreviewPane.tsx`) relies on a basic sequential canvas loop or falls back to an embedded browser `<iframe>` (`blob:...`). This causes multiple usability issues:
- Text is unselectable and cannot be copied.
- Canvases render at 1x resolution, resulting in blurry text and math formulas on Retina/HiDPI screens.
- No page jumping, thumbnail sidebar, or in-document search.
- Browser `<iframe>` fallbacks look foreign, clash with IntelliJ IDEA aesthetics, and can trigger file-download prompts in desktop WebViews (Tauri).
- No connection between the compiled PDF output and the LaTeX source in the editor.

The user selected **Option 1 (High-Fidelity PDF.js Viewer)** with an essential requirement:
> **"When user double clicks on a section of the pdf, the code should move to that section."** (Reverse / Inverse SyncTeX).

---

## 2. Goals & Non-Goals

### Goals
1. **High-DPI Canvas Rendering**: Scale canvas backing store by `window.devicePixelRatio` while maintaining CSS layout dimensions, yielding crisp vector-quality text and equations.
2. **TextLayer Integration**: Render PDF.js `TextLayer` alongside the canvas to enable native text selection, copy-paste, and mouse selection.
3. **IntelliJ New UI Toolbar & Navigation**:
   - Page controls: `Page [ X ] of Y`, Previous/Next buttons, jump-to-page input.
   - Zoom controls: Zoom In, Zoom Out, 100%, 150%, 200%, Fit to Width, Fit to Page.
   - Collapsible thumbnail sidebar showing visual page previews.
   - In-document search bar (`Ctrl+F` in PDF pane) with keyword occurrence counter and prev/next match jumping.
4. **Reverse Sync (PDF -> LaTeX Source)** on Double-Click:
   - Double-clicking anywhere on the PDF page navigates Monaco editor to the corresponding file and line.
   - **Primary Engine (SyncTeX)**: Web Worker compiles with `synctex: true`, producing `.synctex.gz`. Worker decompresses and parses coordinate blocks `[page, x, y] -> { file, line }`.
   - **Robust Fallback (Text Match)**: If SyncTeX record is missing or points to a macro/preamble, the double-clicked word or sentence from the `TextLayer` is matched against the LaTeX document lines.
   - Monaco editor focuses, scrolls line into view (`revealLineInCenter`), moves cursor, and momentarily pulses/highlights the line.

### Non-Goals
- Adding heavy 3rd-party PDF reader frameworks that require commercial licenses or have React 19 incompatibility.
- Forward sync (LaTeX cursor -> PDF box) in this phase (can be added later as an enhancement).
- PDF annotations or form editing.

---

## 3. Approaches Considered & Selected

### Approach A: Integrated Custom PDF.js Viewer + SyncTeX Worker (Selected)
- Built on `pdfjs-dist` (already installed `^4.10.38`), fully compatible with React 19 and Next.js 16 static exports.
- Direct control over canvas resolution, text layer overlays, and event handlers.
- Fast, zero extra npm bundle weight, 100% IntelliJ IDEA design language matching.
- Native SyncTeX extraction in `compiler.worker.ts` with coordinate resolution.

### Approach B: `react-pdf` Wrapper
- Declarative `<Document>` and `<Page>` components.
- **Trade-off**: Requires adding new dependencies, lacks built-in SyncTeX coordinate mapping, and has peer dependency conflicts with React 19.

### Approach C: Prebuilt Mozilla PDF.js `web/viewer.html`
- Embeds Mozilla's full Firefox PDF app in an iframe.
- **Trade-off**: Difficult to wire fine-grained double-click events across iframe boundaries for SyncTeX, heavy static asset overhead, conflicting toolbar styling.

---

## 4. Architectural Implementation

### 4.1 SyncTeX Pipeline in `compiler.worker.ts`
1. Enable `synctex: true` in `engine.compile({ entry: req.entry, synctex: true })`.
2. Extract `jobname.synctex.gz` (or `entry.synctex.gz`) from `engine.output()`.
3. Decompress the gzip stream using native `DecompressionStream('gzip')` into plaintext SyncTeX.
4. Parse SyncTeX into an efficient in-memory block index:
   - Input file table: `Input:1:main.tex`, etc.
   - Page blocks: `{ page, line, x, y, width, height, file }`.
5. Return parsed SyncTeX records or mapping payload in `CompileWorkerResult`.

### 4.2 PDF to Code Navigation (`onNavigateToSource`)
1. In `PdfPreviewPane`, listen for `onDoubleClick` on the page container.
2. Compute relative PDF coordinates from click `(event.clientX, event.clientY)` relative to page canvas and viewport scale:
   - `pdfX = (clickX - rect.left) / scale`
   - `pdfY = (clickY - rect.top) / scale`
3. Lookup nearest block in SyncTeX data for `(page, pdfX, pdfY)`.
4. Fallback: If no SyncTeX block matches within tolerance, get selected text or text under cursor from `window.getSelection()` or clicked `<span>` in `TextLayer`, and locate the snippet in `workspace.files`.
5. Invoke `onNavigateToSource({ file: matchedFile, line: matchedLine })`.
6. `WorkspaceUI` / `MonacoEditor` sets active file if needed, calls `editor.revealLineInCenter(line)`, sets cursor position `{ lineNumber: line, column: 1 }`, and applies a 1-second CSS flash decoration.

### 4.3 High-DPI & TextLayer Rendering
1. Page rendering:
   ```ts
   const pixelRatio = window.devicePixelRatio || 1;
   canvas.width = Math.floor(viewport.width * pixelRatio);
   canvas.height = Math.floor(viewport.height * pixelRatio);
   canvas.style.width = `${Math.floor(viewport.width)}px`;
   canvas.style.height = `${Math.floor(viewport.height)}px`;
   const ctx = canvas.getContext('2d');
   ctx.scale(pixelRatio, pixelRatio);
   ```
2. Overlay `div.textLayer` styled identically to PDF.js TextLayer standards, with matching dimensions and font transforms, allowing precise mouse selection and double-click events.

### 4.4 Thumbnail Sidebar & Search UI
1. Collapsible sidebar toggled via toolbar icon (`Sidebar` / `Layers`).
2. Renders low-res thumbnail canvases for each page with active page indicator and click-to-scroll.
3. Search panel (`Ctrl+F`):
   - Input box with match count (`1 of 7`).
   - Cycles through matching text nodes in the TextLayer and scrolls them into view with yellow highlights.

---

## 5. What is Left to Builder
- SyncTeX parser coordinate normalization (converting TeX scaled points `sp` to PDF points `pt`: `1 pt = 65536 sp`).
- Debounced rendering on zoom slider interactions to avoid worker lag.
- Fallback search heuristic if double-clicked text contains TeX macros or punctuation differences.
