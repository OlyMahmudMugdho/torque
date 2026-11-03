# Package Downloader & Persistent Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable on-demand package downloading from CTAN mirrors into persistent browser/desktop storage, with automatic JIT compilation resolution and interactive Package Manager download UI.

**Architecture:** A unified storage layer (`packageCache.ts`) persists package files across projects via IndexedDB (web) and `~/.torque/cache/packages/` (Tauri desktop). A downloader service (`packageDownloader.ts`) fetches `.sty` / `.cls` / `.def` files from CTAN and TeX Live mirrors with CORS fallback. The Web Worker (`compiler.worker.ts`) reads cached packages and auto-resolves missing dependencies on the fly during WebAssembly compilation. `PackageManagerModal.tsx` provides visual download buttons, loading spinners, and cached package status.

**Tech Stack:** TypeScript, Next.js, WebAssembly (Tectonic / glyphtex-engine), IndexedDB, Tauri Rust IPC, Vitest, React 19.

**Spec:** [`docs/superpowers/specs/2026-11-03-package-download-cache-design.md`](file:///home/mugdho/codes/torque/docs/superpowers/specs/2026-11-03-package-download-cache-design.md)

## Global Constraints
- Client-side WebAssembly execution only; no server-side compilation proxy.
- Maintain SemVer compliance in `src/version.ts` and `package.json`.
- Zero persistent space footprint in diagnostics / UI panels.
- Fallback seamlessly between Tauri desktop native disk and browser IndexedDB.
- All tasks must pass `npm test` and `npm run build` with zero regressions.

## Review Focus
1. Corrupted or truncated HTTP responses when fetching packages from CTAN mirror — ensure empty or HTML error pages are not cached as valid `.sty` files.
2. Concurrent compiles requesting the same missing package — ensure single in-flight fetch promise deduplication.
3. Offline compilation with previously downloaded packages — verify Web Worker resolves packages directly from persistent cache without attempting network requests.
4. Multi-file package installations (e.g. `mathtools` needing both `mathtools.sty` and auxiliary `.def` files) — ensure all required assets in `pkg.files` are fetched and cached together.
5. Path traversal or malicious filenames in package download requests — normalize filenames to alphanumeric basenames with allowed extensions (`.sty`, `.cls`, `.def`, `.fd`, `.tfm`).

---

### Task 1: Persistent Global Package Storage Layer
**Files:**
- Create: `src/storage/packageCache.ts`
- Test: `src/storage/__tests__/packageCache.test.ts`

**Interfaces:**
- Produces:
  - `getPackageFile(filename: string): Promise<Uint8Array | null>`
  - `savePackageFile(filename: string, data: Uint8Array, packageId?: string): Promise<void>`
  - `listCachedPackageFiles(): Promise<string[]>`
  - `isPackageFileCached(filename: string): Promise<boolean>`
  - `clearPackageCache(): Promise<void>`

- [ ] **Step 1: Write failing tests in `src/storage/__tests__/packageCache.test.ts`**
  Cover `savePackageFile`, `getPackageFile`, `listCachedPackageFiles`, `isPackageFileCached`, and `clearPackageCache` in browser-like environment (mocking IndexedDB or using fake-indexeddb / in-memory map fallback).
- [ ] **Step 2: Run test to verify failure**
  Run: `npx vitest run src/storage/__tests__/packageCache.test.ts`
  Expected: FAIL (module not found).
- [ ] **Step 3: Implement `src/storage/packageCache.ts`**
  Implement IndexedDB database `'torque_cache'` with object store `'packages'`. Include Tauri desktop filesystem fallback if `isTauri()` is true (`~/.torque/cache/packages/`). Include filename sanitization (`sanitizePackageFilename`).
- [ ] **Step 4: Run test to verify it passes**
  Run: `npx vitest run src/storage/__tests__/packageCache.test.ts`
  Expected: PASS.
- [ ] **Step 5: Commit**
  `git add src/storage/packageCache.ts src/storage/__tests__/packageCache.test.ts && git commit -m "feat(storage): implement persistent packageCache for browser and desktop"`

---

### Task 2: Package Downloader Service
**Files:**
- Create: `src/packages/packageDownloader.ts`
- Test: `src/packages/__tests__/packageDownloader.test.ts`

**Interfaces:**
- Consumes: `packageCache` functions (`savePackageFile`, `isPackageFileCached`).
- Produces:
  - `downloadPackage(packageId: string, onProgress?: (msg: string) => void): Promise<{ success: boolean; files: string[]; error?: string }>`
  - `downloadSingleFile(filename: string): Promise<{ success: boolean; data?: Uint8Array; error?: string }>`
  - `resolveCtanUrls(filename: string, packageId?: string): string[]`

- [ ] **Step 1: Write failing tests in `src/packages/__tests__/packageDownloader.test.ts`**
  Test URL generation across mirrors (CTAN primary mirror `https://mirrors.ctan.org/macros/latex/contrib/`, TeX Live raw CDN fallback), successful file downloads, error handling on 404, and multi-file package saving to cache.
- [ ] **Step 2: Run test to verify failure**
  Run: `npx vitest run src/packages/__tests__/packageDownloader.test.ts`
  Expected: FAIL.
- [ ] **Step 3: Implement `src/packages/packageDownloader.ts`**
  Implement fetch logic with mirror failover, content verification (reject HTML error pages or empty payloads), and integration with `packageCache`.
- [ ] **Step 4: Run test to verify it passes**
  Run: `npx vitest run src/packages/__tests__/packageDownloader.test.ts`
  Expected: PASS.
- [ ] **Step 5: Commit**
  `git add src/packages/packageDownloader.ts src/packages/__tests__/packageDownloader.test.ts && git commit -m "feat(packages): implement packageDownloader service with mirror fallback"`

---

### Task 3: Compiler Worker Cache & JIT Integration
**Files:**
- Modify: `src/compiler/compiler.worker.ts`
- Test: `src/compiler/__tests__/compilerEngine.test.ts`

**Interfaces:**
- Consumes: `packageCache.getPackageFile`, `packageDownloader.downloadSingleFile`.
- Behavior:
  - In `fetchBundleFile(resolvedName)`:
    1. Check `cachedBundleFiles` in-memory.
    2. Check `/bundle/${resolvedName}` local bundle.
    3. Check `packageCache.getPackageFile(resolvedName)`.
    4. If not found and online, attempt JIT `downloadSingleFile(resolvedName)` and save to `packageCache`.
    5. Return bytes to WASM engine or `null` if unreachable.

- [ ] **Step 1: Write failing test in `src/compiler/__tests__/compilerEngine.test.ts`**
  Test compiling a document using an unbundled package (e.g. `mathtools` or mock package) resolved via `packageCache` and JIT resolution.
- [ ] **Step 2: Run test to verify failure or need for integration**
  Run: `npx vitest run src/compiler/__tests__/compilerEngine.test.ts -t "packageCache"`
- [ ] **Step 3: Modify `src/compiler/compiler.worker.ts`**
  Integrate `packageCache` lookups and deduplicated JIT download fetches into `fetchBundleFile`.
- [ ] **Step 4: Run test to verify it passes**
  Run: `npx vitest run src/compiler/__tests__/compilerEngine.test.ts`
  Expected: PASS.
- [ ] **Step 5: Commit**
  `git add src/compiler/compiler.worker.ts src/compiler/__tests__/compilerEngine.test.ts && git commit -m "feat(compiler): integrate persistent package cache and JIT auto-download into worker"`

---

### Task 4: IntelliJ Package Manager UI Download Button & Status
**Files:**
- Modify: `src/components/PackageManagerModal.tsx`
- Modify: `src/packages/packageManager.ts`
- Test: `src/components/__tests__/PackageManagerModal.test.tsx`

**Interfaces:**
- Consumes: `packageDownloader.downloadPackage`, `packageCache.isPackageFileCached`, `packageCache.listCachedPackageFiles`.
- Behavior:
  - Displays "Download" button on CTAN packages.
  - Shows progress spinner during download.
  - Updates status pill to "Installed (Cached)" once cached.
  - Allows quick insertion of `\usepackage` statement into editor.

- [ ] **Step 1: Write failing UI tests in `src/components/__tests__/PackageManagerModal.test.tsx`**
  Test download button rendering, click handler invoking `downloadPackage`, loading spinner during download, and status badge update.
- [ ] **Step 2: Run test to verify failure**
  Run: `npx vitest run src/components/__tests__/PackageManagerModal.test.tsx -t "Download"`
- [ ] **Step 3: Update `PackageManagerModal.tsx` and `packageManager.ts`**
  Add download state management, progress indicator, and cached status sync with `packageCache`.
- [ ] **Step 4: Run test to verify it passes**
  Run: `npx vitest run src/components/__tests__/PackageManagerModal.test.tsx`
  Expected: PASS.
- [ ] **Step 5: Commit**
  `git add src/components/PackageManagerModal.tsx src/packages/packageManager.ts src/components/__tests__/PackageManagerModal.test.tsx && git commit -m "feat(ui): add download button and cached status pill to package manager modal"`

---

### Task 5: End-to-End Verification Pipeline & Map Update
**Files:**
- Modify: `MAP.md`
- Verify: Full pipeline (`npm test`, `npm run build`)

- [ ] **Step 1: Update `MAP.md`**
  Document `src/storage/packageCache.ts` and `src/packages/packageDownloader.ts`.
- [ ] **Step 2: Run full Vitest suite**
  Run: `npm test`
  Expected: All suites pass (zero failures).
- [ ] **Step 3: Run static export build**
  Run: `npm run build`
  Expected: Compiled successfully with zero TypeScript or bundling errors.
- [ ] **Step 4: Commit**
  `git add MAP.md && git commit -m "docs: update MAP.md with packageCache and packageDownloader"`
