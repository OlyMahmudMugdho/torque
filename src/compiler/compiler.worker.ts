import { TexEngine } from 'glyphtex-engine';
import type { CompileWorkerRequest, CompileWorkerResponse } from './compilerProtocol';
import type { Diagnostic } from '../types/workspace';

let wasmModulePromise: Promise<WebAssembly.Module> | null = null;
let currentEngine: TexEngine | null = null;
let engineUsageCount = 0;
const MAX_ENGINE_USES = 25;
let bundlePreloadPromise: Promise<void> | null = null;
let bundleManifest: Set<string> | null = null;
const cachedBundleFiles = new Map<string, Uint8Array>();
let stderrLogs: string[] = [];
let stdoutLogs: string[] = [];

const CORE_BUNDLE_FILES = [
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
  'trig.sty',

  // Layout, TikZ & tools
  'geometry.sty',
  'keyval.sty',
  'iftex.sty',
  'ifvtex.sty',
  'multicol.sty',
  'calc.sty',
  'etoolbox.sty',
  'pgfsys.sty',
  'pgfsys.code.tex',
  'pgfsys-xetex.def',
  'pgf.sty',
  'tikz.sty',
  'tikz.code.tex',
  'tikz-cd.sty',
  'tikzlibrarycd.code.tex',
  'tikzlibrarymatrix.code.tex',
  'pgfmodulematrix.code.tex',
  'tikzlibraryquotes.code.tex',
  'pgflibraryarrows.meta.code.tex',

  // Mappings & OpenType Fonts
  'ckx.map',
  'glyphlist.txt',
  'kanjix.map',
  'pdfglyphlist.txt',
  'pdftex.map',
  'tex-text.tec',
  'texglyphlist.txt',
  'lmroman10-regular.otf',
  'lmroman12-regular.otf',

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

function resolveCandidateBundleName(name: string): string | null {
  // Probe lookups with brackets or invalid file tokens are not bundle packages
  if (name.startsWith('[') || name.endsWith(']') || name.includes(':')) {
    return null;
  }

  if (!bundleManifest) {
    return name;
  }

  if (bundleManifest.has(name)) {
    return name;
  }

  // 1. If no extension provided, test common TeX package/font extensions
  if (!name.includes('.')) {
    const exts = ['.sty', '.cls', '.tfm', '.pfb', '.otf', '.def', '.cfg', '.fd'];
    for (const ext of exts) {
      const candidate = `${name}${ext}`;
      if (bundleManifest.has(candidate)) {
        return candidate;
      }
    }
  }

  // 2. Strip probe suffixes appended by XeTeX (e.g. .sty.aux, .sty.tex, .aux, .bbl, etc.)
  const probeRegexes = [
    /\.(?:aux|bbl|clo|cls|def|fd|ldf|sty|tex)$/,
    /\.(?:TTC|TTF|dfont|pfa|pfb|ttc|ttf|ofm)$/i,
  ];
  for (const regex of probeRegexes) {
    if (regex.test(name)) {
      const stripped = name.replace(regex, '');
      if (bundleManifest.has(stripped)) {
        return stripped;
      }
      if (!stripped.includes('.')) {
        for (const ext of ['.sty', '.cls', '.tfm', '.pfb']) {
          const candidate = `${stripped}${ext}`;
          if (bundleManifest.has(candidate)) {
            return candidate;
          }
        }
      }
    }
  }

  return null;
}

async function fetchBundleFile(
  name: string
): Promise<{ resolvedName: string; data: Uint8Array } | null> {
  if (cachedBundleFiles.has(name)) {
    return { resolvedName: name, data: cachedBundleFiles.get(name)! };
  }

  const resolvedName = resolveCandidateBundleName(name);
  if (!resolvedName) return null;

  if (cachedBundleFiles.has(resolvedName)) {
    const data = cachedBundleFiles.get(resolvedName)!;
    if (name !== resolvedName) {
      cachedBundleFiles.set(name, data);
    }
    return { resolvedName, data };
  }

  try {
    const url = `/bundle/${encodeURIComponent(resolvedName)}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn(`[compiler.worker] HTTP ${resp.status} fetching bundle file: ${resolvedName}`);
      return null;
    }
    const buf = new Uint8Array(await resp.arrayBuffer());
    cachedBundleFiles.set(resolvedName, buf);
    if (name !== resolvedName) {
      cachedBundleFiles.set(name, buf);
    }
    return { resolvedName, data: buf };
  } catch (err) {
    console.warn(`[compiler.worker] Network error fetching bundle file: ${resolvedName}`, err);
    return null;
  }
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

    // Handle missing files on-demand if the compile failed
    let passes = 0;
    while (
      compileRes.status === 'failed' &&
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

    // If compilation ended in failure, invalidate the engine instance so the next compile
    // runs with a completely fresh, uncorrupted WebAssembly state
    if (compileRes.status === 'failed') {
      currentEngine = null;
    }

    const durationMs = Math.round(performance.now() - start);

    let pdfBytes: Uint8Array | null = null;
    if (compileRes.status !== 'failed') {
      const output = engine.pdf() ?? null;
      if (output && output.length >= 4) {
        const hasPdfHeader =
          output[0] === 0x25 && // %
          output[1] === 0x50 && // P
          output[2] === 0x44 && // D
          output[3] === 0x46; // F
        if (!hasPdfHeader) {
          console.warn('[compiler.worker] Compiled output is missing valid %PDF- header');
        }
      }
      pdfBytes = output;
    }

    let diagnostics: Diagnostic[] = (compileRes.diagnostics || []).map((d) => ({
      severity: d.severity === 'error' ? 'error' : d.severity === 'warning' ? 'warning' : 'info',
      file: d.file ?? req.entry,
      line: d.line ?? undefined,
      message: d.message,
    }));

    if (compileRes.status === 'failed' && diagnostics.length === 0) {
      const rawStderr = stderrLogs.join('');
      diagnostics.push(parseDiagnosticFromError(new Error('TeX compilation failed'), rawStderr, req.entry));
    }

    const response: CompileWorkerResponse = {
      type: 'compile-result',
      requestId: req.requestId,
      result: {
        status: compileRes.status,
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
