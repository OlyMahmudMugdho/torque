import { TexEngine } from 'glyphtex-engine';
import type { CompileWorkerRequest, CompileWorkerResponse } from './compilerProtocol';
import type { Diagnostic, CompileStatus } from '../types/workspace';
import { getPackageFile, ALLOWED_EXTENSIONS } from '../storage/packageCache';
import { downloadSingleFile } from '../packages/packageDownloader';

let wasmModulePromise: Promise<WebAssembly.Module> | null = null;
let currentEngine: TexEngine | null = null;
let engineUsageCount = 0;
const MAX_ENGINE_USES = 25;
let bundlePreloadPromise: Promise<void> | null = null;
let bundleManifest: Set<string> | null = null;
export const cachedBundleFiles = new Map<string, Uint8Array>();
export const pendingDownloads = new Map<string, Promise<Uint8Array | null>>();
export const failedDownloads = new Set<string>();
export const JIT_DOWNLOAD_EXTENSIONS = ['.sty'] as const;

export function clearWorkerCache(): void {
  cachedBundleFiles.clear();
  pendingDownloads.clear();
  failedDownloads.clear();
}

export function setBundleManifest(manifest: Set<string> | null): void {
  bundleManifest = manifest;
}

let stderrLogs: string[] = [];
let stdoutLogs: string[] = [];

export const CORE_BUNDLE_FILES = [
  // Core format & document classes
  'latex.fmt',
  'article.cls',
  'IEEEtran.cls',
  'size10.clo',
  'size11.clo',
  'size12.clo',
  'l3backend-xetex.def',

  // Math & AMS packages
  'amsmath.sty',
  'amssymb.sty',
  'amstext.sty',
  'amsgen.sty',
  'amsbsy.sty',
  'amsopn.sty',
  'amsfonts.sty',
  'umsa.fd',
  'umsb.fd',

  // Graphics & color
  'graphicx.sty',
  'graphics.sty',
  'graphics.cfg',
  'color.sty',
  'color.cfg',
  'xcolor.sty',
  'xetex.def',
  'mathcolor.ltx',
  'trig.sty',

  // Citations & Bibliography
  'cite.sty',

  // Layout & tools
  'geometry.sty',
  'fullpage.sty',
  'fontspec.sty',
  'keyval.sty',
  'iftex.sty',
  'ifvtex.sty',
  'multicol.sty',
  'calc.sty',
  'etoolbox.sty',

  // European Computer Modern (T1/Cork) metrics for IEEEtran & fontenc
  'ecrm1000.tfm',
  'ecrm0900.tfm',
  'ecrm0800.tfm',
  'ecrm0700.tfm',
  'ecrm0500.tfm',
  'ecrm1095.tfm',
  'ecrm1200.tfm',
  'ecrm1728.tfm',
  'ecbx1000.tfm',
  'ecti1000.tfm',

  // PGF & TikZ Core Engine
  'pgf.cfg',
  'pgf.revision.tex',
  'pgf.sty',
  'pgfrcs.sty',
  'pgfrcs.code.tex',
  'pgfutil-common.tex',
  'pgfutil-latex.def',
  'pgfcomp-version-0-65.sty',
  'pgfcomp-version-1-18.sty',
  'pgfcore.sty',
  'pgfcore.code.tex',
  'pgfsys.sty',
  'pgfsys.code.tex',
  'pgfsys-xetex.def',
  'pgfsys-dvipdfmx.def',
  'pgfsys-common-pdf.def',
  'pgfsys-luatex.def',
  'pgfsysprotocol.code.tex',
  'pgfsyssoftpath.code.tex',
  'pgfcorepoints.code.tex',
  'pgfcorepathconstruct.code.tex',
  'pgfcorepathusage.code.tex',
  'pgfcorescopes.code.tex',
  'pgfcoregraphicstate.code.tex',
  'pgfcoretransformations.code.tex',
  'pgfcorequick.code.tex',
  'pgfcoreobjects.code.tex',
  'pgfcorepathprocessing.code.tex',
  'pgfcorearrows.code.tex',
  'pgfcoreshade.code.tex',
  'pgfcoreimage.code.tex',
  'pgfcoreexternal.code.tex',
  'pgfcorelayers.code.tex',
  'pgfcoretransparency.code.tex',
  'pgfcorepatterns.code.tex',
  'pgfcorerdf.code.tex',
  'pgfint.code.tex',
  'pgfkeys.code.tex',
  'pgfkeys.sty',
  'pgfkeyslibraryfiltered.code.tex',
  'pgfmath.sty',
  'pgfmath.code.tex',
  'pgfmathutil.code.tex',
  'pgfmathparser.code.tex',
  'pgfmathfunctions.code.tex',
  'pgfmathfunctions.basic.code.tex',
  'pgfmathfunctions.trigonometric.code.tex',
  'pgfmathfunctions.random.code.tex',
  'pgfmathfunctions.comparison.code.tex',
  'pgfmathfunctions.base.code.tex',
  'pgfmathfunctions.round.code.tex',
  'pgfmathfunctions.misc.code.tex',
  'pgfmathfunctions.integerarithmetics.code.tex',
  'pgfmathcalc.code.tex',
  'pgfmathfloat.code.tex',
  'pgffor.sty',
  'pgffor.code.tex',
  'pgfmoduleshapes.code.tex',
  'pgfmoduleplot.code.tex',
  'pgfmodulematrix.code.tex',
  'pgfmoduledecorations.code.tex',
  'tc-pgf.def',

  // TikZ Core & Libraries
  'tikz.sty',
  'tikz.code.tex',
  'tikz-cd.sty',
  'tikzlibrarytopaths.code.tex',
  'pgflibraryplothandlers.code.tex',
  'tikzlibraryplotmarks.code.tex',
  'pgflibraryplotmarks.code.tex',
  'tikzlibrarypositioning.code.tex',
  'tikzlibraryquotes.code.tex',
  'tikzlibrarycd.code.tex',
  'tikzlibrarymatrix.code.tex',
  'tikzlibrarydecorations.code.tex',
  'tikzlibrarydecorations.pathmorphing.code.tex',
  'tikzlibrarydecorations.pathreplacing.code.tex',
  'tikzlibraryfill.image.code.tex',
  'pgflibraryarrows.meta.code.tex',
  'pgflibrarydecorations.pathmorphing.code.tex',
  'pgflibrarydecorations.pathreplacing.code.tex',
  'pgflibraryfpu.code.tex',

  // PGFPlots Core & Libraries
  'pgfplots.sty',
  'pgfplots.code.tex',
  'pgfplotscore.code.tex',
  'pgfplotsarray.code.tex',
  'pgfplotsbinary.code.tex',
  'pgfplotsbinary.data.code.tex',
  'pgfplotscolor.code.tex',
  'pgfplotscolormap.code.tex',
  'pgfplotscoordprocessing.code.tex',
  'pgfplotsdeque.code.tex',
  'pgfplots.errorbars.code.tex',
  'pgfplotslibrary.code.tex',
  'pgfplotsliststructure.code.tex',
  'pgfplotsliststructureext.code.tex',
  'pgfplots.markers.code.tex',
  'pgfplotsmatrix.code.tex',
  'pgfplotsmeshplotimage.code.tex',
  'pgfplotsmeshplothandler.code.tex',
  'pgfplotsoldpgfsupp_loader.code.tex',
  'pgfplotsoldpgfsupp_pgflibraryfpu.code.tex',
  'pgfplotsoldpgfsupp_pgfutil-common-lists.tex',
  'pgfplots.paths.code.tex',
  'pgfplotsplothandlers.code.tex',
  'pgfplots.revision.tex',
  'pgfplots.scaling.code.tex',
  'pgfplotsstackedplots.code.tex',
  'pgfplotssysgeneric.code.tex',
  'pgfplotstableshared.code.tex',
  'pgfplotsticks.code.tex',
  'pgfplotsutil.code.tex',
  'pgfplotsutil.verb.code.tex',
  'pgflibrarypgfplots.surfshading.code.tex',
  'pgflibrarypgfplots.surfshading.pgfsys-xetex.def',
  'pgflibrarypgfplots.surfshading.pgfsys-dvipdfmx.def',
  'tikzlibrarypgfplots.contourlua.code.tex',

  // Mappings & OpenType Fonts
  'ckx.map',
  'glyphlist.txt',
  'kanjix.map',
  'pdfglyphlist.txt',
  'pdftex.map',
  'tex-text.tec',
  'texglyphlist.txt',

  // Latin Modern Roman Fonts (Full Optical & Style Family)
  'lmroman10-regular.otf',
  'lmroman10-bold.otf',
  'lmroman10-italic.otf',
  'lmroman10-bolditalic.otf',
  'lmroman12-regular.otf',
  'lmroman12-bold.otf',
  'lmroman12-italic.otf',
  'lmroman17-regular.otf',
  'lmroman9-regular.otf',
  'lmroman9-bold.otf',
  'lmroman9-italic.otf',
  'lmroman8-regular.otf',
  'lmroman8-bold.otf',
  'lmroman8-italic.otf',
  'lmroman7-regular.otf',
  'lmroman7-bold.otf',
  'lmroman7-italic.otf',
  'lmroman6-regular.otf',
  'lmroman6-bold.otf',
  'lmroman5-regular.otf',
  'lmroman5-bold.otf',
  'lmromancaps10-regular.otf',
  'lmromancaps10-oblique.otf',
  'lmromandemi10-regular.otf',
  'lmromandemi10-oblique.otf',
  'lmromandunh10-regular.otf',
  'lmromandunh10-oblique.otf',
  'lmromanslant8-regular.otf',
  'lmromanslant9-regular.otf',
  'lmromanslant10-regular.otf',
  'lmromanslant10-bold.otf',
  'lmromanslant12-regular.otf',
  'lmromanslant17-regular.otf',
  'lmromanunsl10-regular.otf',

  // Latin Modern Sans & Monospace Fonts
  'lmsans10-regular.otf',
  'lmsans10-bold.otf',
  'lmsans10-oblique.otf',
  'lmsans10-boldoblique.otf',
  'lmsans12-regular.otf',
  'lmsans12-oblique.otf',
  'lmsans17-regular.otf',
  'lmsans17-oblique.otf',
  'lmsans8-regular.otf',
  'lmsans8-oblique.otf',
  'lmsans9-regular.otf',
  'lmsans9-oblique.otf',
  'lmmono10-regular.otf',
  'lmmono10-italic.otf',
  'lmmono12-regular.otf',
  'lmmono8-regular.otf',
  'lmmono9-regular.otf',

  // Common Math Font Metrics (TFM)
  'cmex10.tfm',
  'cmex7.tfm',
  'cmex8.tfm',
  'cmmi10.tfm',
  'cmmi5.tfm',
  'cmmi6.tfm',
  'cmmi7.tfm',
  'cmmi8.tfm',
  'cmr10.tfm',
  'cmr5.tfm',
  'cmr6.tfm',
  'cmr7.tfm',
  'cmr8.tfm',
  'cmsy10.tfm',
  'cmsy5.tfm',
  'cmsy6.tfm',
  'cmsy7.tfm',
  'cmsy8.tfm',
  'msam10.tfm',
  'msam5.tfm',
  'msam7.tfm',
  'msbm10.tfm',
  'msbm5.tfm',
  'msbm7.tfm',

  // Common Math Font Outlines (PFB)
  'cmex10.pfb',
  'cmex8.pfb',
  'cmex7.pfb',
  'cmmi10.pfb',
  'cmmi8.pfb',
  'cmmi7.pfb',
  'cmmi6.pfb',
  'cmr10.pfb',
  'cmr8.pfb',
  'cmr7.pfb',
  'cmr6.pfb',
  'cmr5.pfb',
  'cmsy10.pfb',
  'cmsy8.pfb',
  'cmsy7.pfb',
  'cmsy6.pfb',
  'msam10.pfb',
  'msam7.pfb',
  'msbm10.pfb',
  'msbm7.pfb',
];

export function cleanCandidateName(name: string): string | null {
  if (!name || typeof name !== 'string') return null;

  let cleaned = name.trim();

  // Strip XeTeX font options, shaper probes, or auxiliary suffixes with ':' (e.g., ":mapping=tex-text;", ":0-0-GID", ":outline=true")
  if (cleaned.includes(':')) {
    cleaned = cleaned.split(':')[0].trim();
  }

  // Strip macOS resource fork probe suffix
  if (cleaned.endsWith('/rsrc')) {
    cleaned = cleaned.slice(0, -5);
  }

  // Strip bracket enclosures used by XeTeX font probes, e.g. "[lmroman12-bold]" or "[lmroman10-bold].tfm"
  if (cleaned.includes('[') || cleaned.includes(']')) {
    cleaned = cleaned.replace(/[[\]]/g, '');
  }

  return cleaned || null;
}

export function resolveCandidateBundleName(
  name: string,
  manifest: Set<string> | null = bundleManifest
): string | null {
  const cleaned = cleanCandidateName(name);
  if (!cleaned) return null;

  if (!manifest) {
    return cleaned;
  }

  // 1. Exact match in manifest
  if (manifest.has(cleaned)) {
    return cleaned;
  }

  // 2. Case-insensitive exact match in manifest (e.g. lmroman10-bold.OTF -> lmroman10-bold.otf)
  const lowerCleaned = cleaned.toLowerCase();
  if (manifest.has(lowerCleaned)) {
    return lowerCleaned;
  }

  // 3. If no extension provided, test common TeX package/font/code extensions
  if (!cleaned.includes('.')) {
    const exts = [
      '.sty',
      '.cls',
      '.otf',
      '.ttf',
      '.code.tex',
      '.tex',
      '.def',
      '.cfg',
      '.tfm',
      '.pfb',
      '.fd',
    ];
    for (const ext of exts) {
      const candidate = `${cleaned}${ext}`;
      if (manifest.has(candidate)) {
        return candidate;
      }
      const lowerCandidate = `${lowerCleaned}${ext}`;
      if (manifest.has(lowerCandidate)) {
        return lowerCandidate;
      }
    }

    // Also check if TikZ/PGF library prefixes match
    const libPrefixes = ['tikzlibrary', 'pgflibrary', 'pgfmodule'];
    for (const prefix of libPrefixes) {
      const candidate = `${prefix}${cleaned}.code.tex`;
      if (manifest.has(candidate)) {
        return candidate;
      }
    }
  }

  // 4. Strip probe suffixes appended by XeTeX / TeX (e.g. .sty.aux, .sty.tex, .aux, .bbl, etc.)
  const probeRegexes = [
    /\.(?:aux|bbl|clo|cls|def|fd|ldf|sty|tex|tfm)$/i,
    /\.(?:TTC|TTF|OTF|dfont|pfa|pfb|ttc|ttf|otf|ofm)$/i,
  ];
  for (const regex of probeRegexes) {
    if (regex.test(cleaned)) {
      const stripped = cleaned.replace(regex, '');
      if (manifest.has(stripped)) {
        return stripped;
      }
      const lowerStripped = stripped.toLowerCase();
      if (manifest.has(lowerStripped)) {
        return lowerStripped;
      }
      if (!stripped.includes('.')) {
        for (const ext of ['.otf', '.ttf', '.code.tex', '.sty', '.cls', '.tfm', '.pfb', '.def']) {
          const candidate = `${stripped}${ext}`;
          if (manifest.has(candidate)) {
            return candidate;
          }
          const lowerCandidate = `${lowerStripped}${ext}`;
          if (manifest.has(lowerCandidate)) {
            return lowerCandidate;
          }
        }
        for (const prefix of ['tikzlibrary', 'pgflibrary', 'pgfmodule']) {
          const candidate = `${prefix}${stripped}.code.tex`;
          if (manifest.has(candidate)) {
            return candidate;
          }
        }
      }
    }
  }

  // 5. Intelligent mapping for European Computer Modern (ecrm, ecbx, ecti, ecbi) to available TFM
  const ecMatch = cleaned.match(/^(ecrm|ecbx|ecti|ecbi|ecss|ectt)(\d{4})(?:\.tfm)?$/i);
  if (ecMatch) {
    const prefix = ecMatch[1].toLowerCase();
    const size = parseInt(ecMatch[2], 10);
    const exactCandidate = `${prefix}${ecMatch[2]}.tfm`;
    if (manifest.has(exactCandidate)) return exactCandidate;
    if (size >= 1700 && manifest.has(`${prefix}1728.tfm`)) return `${prefix}1728.tfm`;
    if (size >= 1100 && manifest.has(`${prefix}1200.tfm`)) return `${prefix}1200.tfm`;
    if (size >= 950 && manifest.has(`${prefix}1000.tfm`)) return `${prefix}1000.tfm`;
    if (size >= 850 && manifest.has(`${prefix}0900.tfm`)) return `${prefix}0900.tfm`;
    if (size >= 750 && manifest.has(`${prefix}0800.tfm`)) return `${prefix}0800.tfm`;
    if (size >= 650 && manifest.has(`${prefix}0700.tfm`)) return `${prefix}0700.tfm`;
    if (manifest.has(`${prefix}0500.tfm`)) return `${prefix}0500.tfm`;
    if (manifest.has(`${prefix}1000.tfm`)) return `${prefix}1000.tfm`;
  }

  return null;
}

const DISALLOWED_EXTENSIONS = /\.(exe|dll|so|dylib|sh|bat|cmd|bin|js|mjs|cjs|html|htm|php|py)$/i;

export async function fetchBundleFile(
  name: string
): Promise<{ resolvedName: string; data: Uint8Array } | null> {
  // Priority 1: Check in-memory cache cachedBundleFiles
  if (cachedBundleFiles.has(name)) {
    return { resolvedName: name, data: cachedBundleFiles.get(name)! };
  }

  const resolvedName = resolveCandidateBundleName(name) || cleanCandidateName(name);
  if (!resolvedName || DISALLOWED_EXTENSIONS.test(resolvedName)) return null;

  if (cachedBundleFiles.has(resolvedName)) {
    const data = cachedBundleFiles.get(resolvedName)!;
    if (name !== resolvedName) {
      cachedBundleFiles.set(name, data);
    }
    return { resolvedName, data };
  }

  // Priority 2: Check local pre-bundled assets /bundle/${resolvedName}
  const shouldTryBundle = !bundleManifest || bundleManifest.has(resolvedName);
  if (shouldTryBundle) {
    try {
      const url = `/bundle/${encodeURIComponent(resolvedName)}`;
      const resp = await fetch(url);
      if (resp && resp.ok) {
        const buf = new Uint8Array(await resp.arrayBuffer());
        cachedBundleFiles.set(resolvedName, buf);
        if (name !== resolvedName) {
          cachedBundleFiles.set(name, buf);
        }
        return { resolvedName, data: buf };
      }
    } catch {
      // Local fetch error or not bundled, continue to Priority 3
    }
  }

  const lowerResolved = resolvedName.toLowerCase();

  // Priority 3: Check persistent global storage via getPackageFile(resolvedName)
  const isCacheEligible = ALLOWED_EXTENSIONS.some((ext) => lowerResolved.endsWith(ext));
  if (isCacheEligible) {
    try {
      const cached = await getPackageFile(resolvedName);
      if (cached) {
        cachedBundleFiles.set(resolvedName, cached);
        if (name !== resolvedName) {
          cachedBundleFiles.set(name, cached);
        }
        return { resolvedName, data: cached };
      }
    } catch (err) {
      console.warn(`[compiler.worker] Error querying packageCache for ${resolvedName}:`, err);
    }
  }

  // Priority 4 (JIT Download): If still not found and the file is an eligible package (.sty),
  // invoke downloadSingleFile(resolvedName) with in-flight deduplication and short timeout.
  if (failedDownloads.has(resolvedName)) {
    return null;
  }

  const isJitEligible = JIT_DOWNLOAD_EXTENSIONS.some((ext) => lowerResolved.endsWith(ext));
  if (!isJitEligible) {
    return null;
  }

  try {
    let downloadPromise = pendingDownloads.get(resolvedName);
    if (!downloadPromise) {
      downloadPromise = (async () => {
        try {
          // Fast timeout (2000ms) during interactive compilation to prevent spinner hangs
          const res = await downloadSingleFile(resolvedName, undefined, { timeoutMs: 2000 });
          if (res && res.success && res.data) {
            return res.data;
          }
          failedDownloads.add(resolvedName);
          return null;
        } catch (downloadErr) {
          console.warn(`[compiler.worker] JIT download failed for ${resolvedName}:`, downloadErr);
          failedDownloads.add(resolvedName);
          return null;
        } finally {
          pendingDownloads.delete(resolvedName);
        }
      })();
      pendingDownloads.set(resolvedName, downloadPromise);
    }

    const downloadedData = await downloadPromise;
    if (downloadedData) {
      cachedBundleFiles.set(resolvedName, downloadedData);
      if (name !== resolvedName) {
        cachedBundleFiles.set(name, downloadedData);
      }
      return { resolvedName, data: downloadedData };
    }
  } catch (err) {
    console.warn(`[compiler.worker] Unexpected error during JIT download of ${resolvedName}:`, err);
    failedDownloads.add(resolvedName);
  }

  return null;
}

export function parseDiagnosticFromError(
  error: unknown,
  stderr: string,
  defaultFile: string = 'main.tex'
): Diagnostic {
  const errMessage = error instanceof Error ? error.message : String(error);
  const isTrap =
    errMessage.includes('unreachable') ||
    (error instanceof Error && error.name === 'RuntimeError');
  const isPoisoned =
    errMessage.includes('poisoned') ||
    errMessage.includes('-4') ||
    (error instanceof Error && error.name === 'EnginePoisonedError');

  // Check stderr for Rust panic or fatal assertions
  if (stderr) {
    const panicMatch = stderr.match(/panicked at [^:]+:\d+:\d+:\s*([^\n]+)/);
    if (panicMatch) {
      const rawReason = panicMatch[1].trim();
      if (rawReason.includes('index out of bounds')) {
        return {
          severity: 'error',
          file: defaultFile,
          line: 1,
          message:
            'LaTeX font/shaper error: Unsupported unicode character or glyph in document (index out of bounds in bridge_core). Try removing emojis or unusual unicode characters.',
        };
      }
      return {
        severity: 'error',
        file: defaultFile,
        line: 1,
        message: `TeX engine panic: ${rawReason}`,
      };
    }

    const fatalMatch = stderr.match(/fatal runtime error:\s*([^\n]+)/);
    if (fatalMatch) {
      return {
        severity: 'error',
        file: defaultFile,
        line: 1,
        message: `Fatal TeX runtime error: ${fatalMatch[1].trim()}`,
      };
    }

    const abortMatch = stderr.match(/\*\*\*\s*\((job aborted[^\)]*)\)/);
    if (abortMatch) {
      return {
        severity: 'error',
        file: defaultFile,
        line: 1,
        message: `LaTeX job aborted: ${abortMatch[1]}`,
      };
    }
  }

  if (isPoisoned) {
    return {
      severity: 'error',
      file: defaultFile,
      line: 1,
      message:
        'TeX engine session was spent from an earlier crash and has been reinitialized. Please compile again.',
    };
  }

  if (isTrap) {
    return {
      severity: 'error',
      file: defaultFile,
      line: 1,
      message:
        'TeX engine execution trapped (unreachable). The compiler engine has been automatically reset.',
    };
  }

  return {
    severity: 'error',
    file: defaultFile,
    line: 1,
    message: errMessage || 'Compilation failed due to an internal TeX engine error.',
  };
}

async function getWasmModule(): Promise<WebAssembly.Module> {
  if (!wasmModulePromise) {
    wasmModulePromise = (async () => {
      console.log('[compiler.worker] Initializing Tectonic WebAssembly module...');
      const wasmResp = await fetch('/wasm/tectonic_wasm.wasm');
      if (typeof WebAssembly.compileStreaming === 'function') {
        try {
          return await WebAssembly.compileStreaming(wasmResp);
        } catch {
          const buf = await wasmResp.arrayBuffer();
          return await WebAssembly.compile(buf);
        }
      } else {
        const buf = await wasmResp.arrayBuffer();
        return await WebAssembly.compile(buf);
      }
    })();
  }
  return wasmModulePromise;
}

async function ensureCoreBundleLoaded(): Promise<void> {
  if (!bundlePreloadPromise) {
    bundlePreloadPromise = (async () => {
      try {
        const manifestResp = await fetch('/bundle/manifest.json');
        if (manifestResp.ok) {
          const list: string[] = await manifestResp.json();
          bundleManifest = new Set(list);
        }
      } catch (err) {
        console.warn('[compiler.worker] Could not load bundle manifest:', err);
      }

      await Promise.all(
        CORE_BUNDLE_FILES.map(async (file) => {
          await fetchBundleFile(file);
        })
      );
    })();
  }
  return bundlePreloadPromise;
}

async function createFreshEngine(): Promise<TexEngine> {
  const module = await getWasmModule();
  stderrLogs = [];
  stdoutLogs = [];

  const engine = await TexEngine.load(module, {
    onStdout: (text: string) => {
      stdoutLogs.push(text);
    },
    onStderr: (text: string) => {
      stderrLogs.push(text);
    },
  });

  // Mount all cached bundle files into the virtual filesystem
  for (const [name, data] of cachedBundleFiles.entries()) {
    engine.addFile(name, data);
  }

  engineUsageCount = 0;
  return engine;
}

async function getEngine(): Promise<TexEngine> {
  await ensureCoreBundleLoaded();

  if (!currentEngine || engineUsageCount >= MAX_ENGINE_USES) {
    currentEngine = await createFreshEngine();
  }
  return currentEngine;
}

self.addEventListener('message', async (event: MessageEvent<CompileWorkerRequest>) => {
  const req = event.data;
  if (!req || req.type !== 'compile') return;

  const start = performance.now();

  try {
    let engine = await getEngine();
    stderrLogs = [];
    stdoutLogs = [];

    // Clear auxiliary outputs from previous compilation jobs
    try {
      engine.clearOutputs();
    } catch {
      currentEngine = await createFreshEngine();
      engine = currentEngine;
    }

    // Reset project files in engine for clean build
    try {
      engine.clearFiles();
      for (const [name, data] of cachedBundleFiles.entries()) {
        engine.addFile(name, data);
      }
    } catch {
      currentEngine = await createFreshEngine();
      engine = currentEngine;
    }

    // Mount all project files (main.tex, chapters, bib, images)
    for (const file of req.files) {
      engine.addFile(file.path, file.content);
    }

    engineUsageCount++;

    let compileRes = engine.compile({
      entry: req.entry,
      synctex: false,
    });

    // Handle missing files on-demand if the compile failed or encountered recoverable missing file errors
    let passes = 0;
    while (
      (compileRes.status === 'failed' || compileRes.status === 'errors') &&
      compileRes.missingFiles &&
      compileRes.missingFiles.length > 0 &&
      passes < 25
    ) {
      passes++;
      let added = 0;
      for (const missing of compileRes.missingFiles) {
        const res = await fetchBundleFile(missing);
        if (res) {
          added++;
        }
      }
      if (added === 0) break;

      // Because a failed compile leaves Tectonic in a dirty internal state that can cause
      // bridge_core panics (index out of bounds / unreachable) on subsequent passes,
      // recreate a fresh engine with the newly fetched bundle files mounted cleanly.
      currentEngine = await createFreshEngine();
      engine = currentEngine;

      for (const file of req.files) {
        engine.addFile(file.path, file.content);
      }

      compileRes = engine.compile({
        entry: req.entry,
        synctex: false,
      });
    }

    const durationMs = Math.round(performance.now() - start);

    // Extract PDF output from engine if generated
    let pdfBytes: Uint8Array | null = null;
    try {
      const output = engine.pdf() ?? null;
      if (output && output.length >= 4) {
        const hasPdfHeader =
          output[0] === 0x25 && // %
          output[1] === 0x50 && // P
          output[2] === 0x44 && // D
          output[3] === 0x46; // F
        if (hasPdfHeader) {
          pdfBytes = output;
        } else {
          console.warn('[compiler.worker] Compiled output is missing valid %PDF- header');
        }
      }
    } catch (e) {
      console.warn('[compiler.worker] Error extracting PDF output from engine:', e);
    }

    let diagnostics: Diagnostic[] = (compileRes.diagnostics || []).map((d) => ({
      severity: d.severity === 'error' ? 'error' : d.severity === 'warning' ? 'warning' : 'info',
      file: d.file ?? req.entry,
      line: d.line ?? undefined,
      message: d.message,
    }));

    const hasErrorDiagnostic = diagnostics.some((d) => d.severity === 'error');
    const hasWarningDiagnostic = diagnostics.some((d) => d.severity === 'warning');

    let finalStatus: Exclude<CompileStatus, 'idle' | 'compiling'> = compileRes.status;

    // If compileRes.status is 'failed' but engine.pdf() produced a valid PDF,
    // or if diagnostics only contain warnings/info, do not treat as a total failure
    if (finalStatus === 'failed') {
      if (pdfBytes) {
        finalStatus = hasErrorDiagnostic ? 'errors' : hasWarningDiagnostic ? 'warnings' : 'spotless';
      } else if (!hasErrorDiagnostic && diagnostics.length > 0) {
        finalStatus = hasWarningDiagnostic ? 'warnings' : 'spotless';
      }
    } else if (finalStatus === 'errors') {
      // If status is 'errors' but there are no actual error diagnostics (only warnings/info)
      if (!hasErrorDiagnostic) {
        finalStatus = hasWarningDiagnostic ? 'warnings' : 'spotless';
      }
    }

    // Invalidate the engine instance on failed or error compilations, or if no PDF was produced,
    // so subsequent compilations run with completely fresh WebAssembly linear memory
    if (finalStatus === 'failed' || finalStatus === 'errors' || !pdfBytes) {
      currentEngine = null;
    }

    if (finalStatus === 'failed' && diagnostics.length === 0) {
      const rawStderr = stderrLogs.join('');
      diagnostics.push(parseDiagnosticFromError(new Error('TeX compilation failed'), rawStderr, req.entry));
    }

    const response: CompileWorkerResponse = {
      type: 'compile-result',
      requestId: req.requestId,
      result: {
        status: finalStatus,
        pdfBytes,
        diagnostics,
        missingFiles: compileRes.missingFiles ?? [],
        durationMs,
      },
    };

    if (pdfBytes) {
      (self as unknown as Worker).postMessage(response, [pdfBytes.buffer as ArrayBuffer]);
    } else {
      self.postMessage(response);
    }
  } catch (error) {
    // If the engine crashed, trapped, or was poisoned, discard it completely
    currentEngine = null;

    const durationMs = Math.round(performance.now() - start);
    const rawStderr = stderrLogs.join('');
    const diagnostic = parseDiagnosticFromError(error, rawStderr, req.entry);

    const response: CompileWorkerResponse = {
      type: 'compile-result',
      requestId: req.requestId,
      result: {
        status: 'failed',
        pdfBytes: null,
        diagnostics: [diagnostic],
        missingFiles: [],
        durationMs,
      },
      error: diagnostic.message,
    };
    self.postMessage(response);
  }
});
