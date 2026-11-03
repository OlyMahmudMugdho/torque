# Design Document: On-Demand Package Downloader & Persistent Cache (Approach 2)

## 1. Intent and Context
Torque currently ships with a pre-bundled core of over 1,370 TeX Live assets in `public/bundle/`. However, when users include CTAN packages that are not pre-bundled (e.g. `physics`, `mathtools`, `siunitx`, `booktabs`), compilation halts with `File '<package>.sty' not found`.
The goal of this feature is to allow users to download packages on demand directly into persistent browser/desktop storage, and to automatically JIT-download missing packages during compilation when online.

---

## 2. Goals & Non-Goals
### Goals:
1. **Persistent Global Cache**: Downloaded packages are cached across all projects in the browser (IndexedDB) and desktop (Tauri `~/.torque/cache/packages/`).
2. **Explicit Download in Package Manager**: Users can browse uninstalled CTAN packages in `PackageManagerModal.tsx`, click "Download", see progress feedback, and have the package installed into the cache.
3. **JIT Auto-Download during WASM Compilation**: When a `.tex` document compiles and encounters a missing `.sty` / `.cls` / `.def` file, the compiler worker automatically attempts to resolve and cache it from CTAN mirrors before failing.
4. **Offline Resilience**: Once a package is downloaded and cached, it remains accessible 100% offline with zero network requests.
5. **Clean Fallback & Diagnostics**: If offline or if a package does not exist on CTAN, fails gracefully and outputs standard diagnostic quick-fixes without crashing the WASM engine.

### Non-Goals:
- Implementing an entire server-side TeX distribution proxy.
- Altering the zero-server WebAssembly compilation invariant.

---

## 3. Approaches Considered & Trade-offs
- **Approach 1 (Manual Download Only)**: User must open modal and explicitly click download. (Clean, but interrupts compilation when a missing package is discovered).
- **Approach 2 (JIT Auto-Download + Manual Download) — [SELECTED]**: Offers seamless compilation when writing code, with the Package Manager UI providing manual inspection, download status, and cache management.
- **Approach 3 (TDS Zip Downloader)**: Downloads entire `.tds.zip` archive per package. (Overkill for single-file macro packages, higher bandwidth overhead).

---

## 4. Architecture & Technical Specification

```
┌─────────────────────────────────────────────────────────────┐
│                 UI: PackageManagerModal.tsx                 │
│  - Shows Download button & status pills                     │
│  - Calls packageDownloader.downloadPackage(pkgId)           │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             Service: src/packages/packageDownloader.ts      │
│  - Resolves CTAN mirror URLs (mirrors.ctan.org / GitHub)    │
│  - Fetches package files with CORS resilience               │
│  - Saves to packageCache                                    │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             Storage: src/storage/packageCache.ts            │
│  - Web: IndexedDB (store: 'torque_packages')                │
│  - Desktop: Tauri native fs (~/.torque/cache/packages/)     │
│  - Methods: getPackageFile, savePackageFile, listCached     │
└──────────────────────────────▲──────────────────────────────┘
                               │
                               │ Read / Cache
                               │
┌──────────────────────────────┴──────────────────────────────┐
│             Compiler: src/compiler/compiler.worker.ts       │
│  - 1. Check in-memory cache                                 │
│  - 2. Check local public/bundle/                            │
│  - 3. Check persistent packageCache                         │
│  - 4. JIT fetch from CTAN mirror if missing and cache it    │
└─────────────────────────────────────────────────────────────┘
```

### 4.1 Storage Layer: `src/storage/packageCache.ts`
- Uses IndexedDB for web browsers (`idb` key-value style or standard IndexedDB API).
- Uses Tauri IPC `write_file_binary` / `read_file_binary` under `~/.torque/cache/packages/` when running inside desktop Tauri.
- Provides standard methods:
  - `getPackageFile(filename: string): Promise<Uint8Array | null>`
  - `savePackageFile(filename: string, data: Uint8Array, packageId?: string): Promise<void>`
  - `listCachedPackageFiles(): Promise<string[]>`
  - `clearPackageCache(): Promise<void>`

### 4.2 Downloader Layer: `src/packages/packageDownloader.ts`
- URL Resolution:
  - Primary CTAN mirror: `https://mirrors.ctan.org/macros/latex/contrib/${pkg}/${file}`
  - TeX Live / GitHub CDN fallback: `https://raw.githubusercontent.com/texlive/texlive/trunk/Master/texmf-dist/tex/latex/${pkg}/${file}`
- Multi-file package support:
  - Loops over `pkg.files` defined in `DEFAULT_PACKAGE_CATALOG` (e.g. `['mathtools.sty', 'mathtools.def']`).
- Emits download status callbacks (`progress`, `success`, `error`).

### 4.3 Compiler Worker Integration: `src/compiler/compiler.worker.ts`
- In `fetchBundleFile(resolvedName)`:
  - First queries `packageCache.getPackageFile(resolvedName)`.
  - If not cached and not in bundle, triggers background JIT fetch.
  - On successful fetch, saves bytes to `packageCache` and returns `data` to Tectonic.
  - On failure, returns `null` allowing Tectonic to surface standard clean diagnostics.

### 4.4 UI Integration: `src/components/PackageManagerModal.tsx`
- Adds a **Download** button for packages with `source: 'ctan'` and not yet cached.
- Displays progress spinner while downloading.
- Shows green `Installed (Cached)` status badge when files exist in `packageCache`.

---

## 5. Verification Plan
1. **Unit Tests**:
   - `src/storage/__tests__/packageCache.test.ts`: Test saving, retrieving, listing, and clearing cached package files in IndexedDB.
   - `src/packages/__tests__/packageDownloader.test.ts`: Test URL resolution, mock fetching, and saving to cache.
   - `src/components/__tests__/PackageManagerModal.test.tsx`: Test clicking Download button, spinner state, and status transition.
2. **Integration Test**:
   - In `src/compiler/__tests__/compilerEngine.test.ts`: Test compiling a document that uses a package provided via `packageCache`.
3. **Regression Tests**:
   - `npm test` (all suites pass).
   - `npm run build` (Next.js static export succeeds).
