import { TexEngine } from 'glyphtex-engine';
import type { CompileWorkerRequest, CompileWorkerResponse } from './compilerProtocol';
import type { Diagnostic, CompileStatus } from '../types/workspace';
import { getPackageFile, ALLOWED_EXTENSIONS } from '../storage/packageCache';
import { downloadSingleFile } from '../packages/packageDownloader';
import { decompressGzip } from './synctexParser';
import { parser as syncTexJsParser } from 'synctex-js';

let wasmModulePromise: Promise<WebAssembly.Module> | null = null;
let currentEngine: TexEngine | null = null;
let engineUsageCount = 0;
const MAX_ENGINE_USES = 25;
let bundlePreloadPromise: Promise<void> | null = null;
let bundleManifest: Set<string> | null = null;
export const cachedBundleFiles = new Map<string, Uint8Array>();
export const pendingDownloads = new Map<string, Promise<Uint8Array | null>>();
export const failedDownloads = new Set<string>();
export const JIT_DOWNLOAD_EXTENSIONS = ['.sty', '.cls', '.def', '.fd', '.tfm'] as const;
export const JIT_PACKAGE_FILENAME_REGEX = /^[a-zA-Z0-9_-]+\.(?:sty|cls|def|fd|tfm)$/i;

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

function parseSyncTexWithLibrary(rawText: string, fallbackFile: string) {
  const parsed = syncTexJsParser.parseSyncTex(rawText);
  const files = new Map<number, string>();
  for (const [tag, file] of Object.entries(parsed.files)) {
    files.set(Number(tag), file.name === 'texput' ? fallbackFile : file.name);
  }

  const blocks = [];
  for (const lines of Object.values(parsed.blockNumberLine)) {
    for (const [lineNumber, pages] of Object.entries(lines)) {
      for (const [pageNumber, elements] of Object.entries(pages)) {
        for (const element of elements) {
          blocks.push({
            file: element.file?.name === 'texput' || !element.file?.name
              ? fallbackFile
              : element.file.name,
            line: element.line || Number(lineNumber),
            x: element.left,
            y: element.bottom,
            width: element.width ?? 0,
            height: element.height ?? 0,
            page: element.page || Number(pageNumber),
          });
        }
      }
    }
  }

  return { files, blocks };
}

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
  'dvipsnam.def',
  'xcolor.sty',
  'xetex.def',
  'mathcolor.ltx',
  'trig.sty',

  // Citations & Bibliography
  'cite.sty',

  // Algorithms & Conditionals
  'algorithm.sty',
  'algorithmic.sty',
  'ifthen.sty',

  // Tables & Formatting
  'booktabs.sty',
  'multirow.sty',

  // Font Encoding & Text Symbols
  'fontenc.sty',
  't1enc.def',
  'textcomp.sty',

  // Hyperref Suite & Dependencies
  'hyperref.sty',
  'hxetex.def',
  'rerunfilecheck.sty',
  'uniquecounter.sty',
  'nameref.sty',
  'refcount.sty',
  'gettitlestring.sty',
  'kvoptions.sty',
  'pdfescape.sty',
  'pdftexcmds.sty',
  'infwarerr.sty',
  'ltxcmds.sty',
  'kvsetkeys.sty',
  'kvdefinekeys.sty',
  'hycolor.sty',
  'stringenc.sty',
  'intcalc.sty',
  'bigintcalc.sty',
  'bitset.sty',
  'url.sty',
  'puenc.def',
  'pd1enc.def',
  'pzdr.tfm',

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

/** Font file extensions that may be uploaded alongside packages and resolved by the compiler. */
const FONT_FILE_EXTENSIONS = ['.otf', '.ttf', '.pfb', '.pfa', '.ttc', '.dfont', '.enc', '.map', '.vf'] as const;

/**
 * Compatibility stubs for packages that use engine primitives incompatible
 * with the client-side WebAssembly TeX engine.
 *
 * fontawesome5-utex-helper.sty calls \tex_XeTeXcountglyphs:D at package load
 * time (via __fontawesome_analyze_font:nn), which causes a WASM memory access
 * trap. This stub provides the same icon commands using TeX-native font
 * switching (\usefont + \char) instead of XeTeX glyph introspection.
 */
const COMPAT_STUBS: Record<string, string> = {
  'fontawesome5-utex-helper.sty': [
    '% fontawesome5-utex-helper.sty — WASM-compatible stub',
    '% Provides fontawesome5 icon support without XeTeX glyph introspection',
    '% primitives (\tex_XeTeXcountglyphs:D) that trap in WebAssembly.',
    '\\ProvidesExplPackage{fontawesome5-utex-helper}{2022/05/02}{5.15.4}{WASM-compatible stub}',
    '\\RequirePackage{expl3}',
    '',
    '% Define the icon slot macro before loading the mapping (mirrors generic-helper)',
    '\\cs_new_protected:Nn \\__fontawesome_def_icon:nnnnn {',
    '  \\tl_if_empty:nF { #1 } {',
    '    \\cs_new_protected:Npn #1 { \\faPreselectedIcon { #2 } }',
    '  }',
    '  \\tl_const:cn { c__fontawesome_slot_#2_tl } { { #3 } { #4 } }',
    '}',
    '',
    '% Load icon-to-glyph mapping from the uploaded package files',
    '\\file_input:n{fontawesome5-mapping.def}',
    '',
    '% Icon command using TeX-native font switching (no XeTeX primitives)',
    '\\cs_new_protected:Nn \\__fontawesome_icon_at:nnnn {',
    '  {',
    '    \\usefont { U } { fontawesome#1 } { #3 } { n }',
    '    \\unless \\iffontchar \\font #2',
    '      \\fontseries { solid } \\selectfont',
    '      \\iffontchar \\font #2',
    '        \\msg_warning:nnxx { fontawesome5 } { style-substitution } { #4 } { #3 }',
    '      \\else',
    '        \\msg_error:nnxx { fontawesome5 } { icon-not-found } { #4 } { #3 }',
    '      \\fi',
    '    \\fi',
    '    \\char #2',
    '  }',
    '}',
    '\\cs_new_protected:Nn \\fontawesome_use_icon:nn {',
    '  \\cs_if_exist:cTF { c__fontawesome_slot_#2_tl } {',
    '    \\bool_if:NTF \\c__fontawesome_fixed_bool {',
    '      \\makebox [ 1.5em ] [ c ]',
    '    } {',
    '      \\use:n',
    '    }',
    '    {',
    '      \\exp_last_unbraced:Nv',
    '        \\__fontawesome_icon_at:nnnn',
    '        { c__fontawesome_slot_#2_tl }',
    '          { #1 } { #2 }',
    '    }',
    '  } {',
    '    \\msg_error:nnxx { fontawesome5 } { icon-not-found } { #2 } { #1 }',
    '  }',
    '}',
  ].join('\n'),
};

/**
 * Tries to find an uploaded font file in the persistent package cache by
 * basename. This handles uploaded package zips where font files were stored
 * by basename (e.g. "FontAwesome5Free-Regular-400.otf") but the engine may
 * request them either by basename or with their original subdirectory path
 * (e.g. "opentype/FontAwesome5Free-Regular-400.otf").
 */
async function resolveUploadedFontFromCache(
  requestedName: string
): Promise<{ resolvedName: string; data: Uint8Array } | null> {
  const basename = requestedName.split('/').pop()!;
  if (!basename) return null;

  const lower = basename.toLowerCase();

  // Determine if this could be a font file: either it has a known font
  // extension, or it has no extension (a bare font name from a .fd file
  // declaration, e.g. "fa5free0solid").
  const hasFontExt = FONT_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext));
  const noExtension = !basename.includes('.');
  if (!hasFontExt && !noExtension) return null;

  // Try exact basename first (e.g. "FontAwesome5Free-Regular-400.otf")
  try {
    const cached = await getPackageFile(basename);
    if (cached) {
      return { resolvedName: basename, data: cached };
    }
  } catch {
    // Fall through
  }

  // If the requested name has no extension (e.g. "fa5free0solid" from a .fd
  // font shape declaration), try appending known font extensions.
  if (noExtension) {
    for (const ext of ['.tfm', '.pfb', '.pfa', '.enc', '.map', '.vf', '.otf', '.ttf', '.ttc', '.dfont']) {
      const candidate = basename + ext;
      try {
        const cached = await getPackageFile(candidate);
        if (cached) {
          return { resolvedName: candidate, data: cached };
        }
      } catch {
        // Continue through extensions
      }
    }
  }

  return null;
}

export async function fetchBundleFile(
  name: string
): Promise<{ resolvedName: string; data: Uint8Array } | null> {
  // Priority 0: Compatibility stubs for packages with engine-incompatible primitives
  const stub = COMPAT_STUBS[name];
  if (stub) {
    const data = new TextEncoder().encode(stub);
    cachedBundleFiles.set(name, data);
    return { resolvedName: name, data };
  }

  // Priority 1: Check in-memory cache cachedBundleFiles
  if (cachedBundleFiles.has(name)) {
    return { resolvedName: name, data: cachedBundleFiles.get(name)! };
  }

  // Priority 1b: Uploaded font files may have been stored by basename while
  // the engine requests them with their original subdirectory path.
  const uploadedFont = await resolveUploadedFontFromCache(name);
  if (uploadedFont) {
    cachedBundleFiles.set(name, uploadedFont.data);
    return uploadedFont;
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

  // Priority 4 (JIT Download): If still not found and the file is an eligible
  // TeX package asset, download it with in-flight deduplication.
  if (failedDownloads.has(resolvedName)) {
    return null;
  }

  const isJitEligible =
    JIT_PACKAGE_FILENAME_REGEX.test(resolvedName) &&
    JIT_DOWNLOAD_EXTENSIONS.some((ext) => lowerResolved.endsWith(ext));
  if (!isJitEligible) {
    return null;
  }

  try {
    let downloadPromise = pendingDownloads.get(resolvedName);
    if (!downloadPromise) {
      downloadPromise = (async () => {
        try {
          console.log(`[compiler.worker] Downloading missing package file: ${resolvedName}`);
          const res = await downloadSingleFile(resolvedName, undefined, {
            timeoutMs: 10000,
            enableCtanApi: true,
          });
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
      try {
        console.log('[compiler.worker] Initializing Tectonic WebAssembly module...');
        const wasmResp = await fetch('/wasm/tectonic_wasm.wasm');
        if (!wasmResp.ok) {
          throw new Error(`Failed to fetch tectonic_wasm.wasm: HTTP ${wasmResp.status} ${wasmResp.statusText}`);
        }

        const contentType = wasmResp.headers.get('content-type') || '';
        let mod: WebAssembly.Module;

        if (typeof WebAssembly.compileStreaming === 'function' && contentType.includes('application/wasm')) {
          try {
            mod = await WebAssembly.compileStreaming(wasmResp);
          } catch (streamingErr) {
            console.warn('[compiler.worker] compileStreaming failed, falling back to arrayBuffer:', streamingErr);
            const arrayResp = await fetch('/wasm/tectonic_wasm.wasm');
            const buf = await arrayResp.arrayBuffer();
            mod = await WebAssembly.compile(buf);
          }
        } else {
          const buf = await wasmResp.arrayBuffer();
          mod = await WebAssembly.compile(buf);
        }

        console.log('[compiler.worker] Tectonic WebAssembly module initialized successfully.');
        return mod;
      } catch (err) {
        wasmModulePromise = null;
        throw err;
      }
    })();
  }
  return wasmModulePromise;
}

async function ensureCoreBundleLoaded(): Promise<void> {
  if (!bundlePreloadPromise) {
    bundlePreloadPromise = (async () => {
      console.log('[compiler.worker] Preloading core bundle files...');
      try {
        const manifestResp = await fetch('/bundle/manifest.json');
        if (manifestResp.ok) {
          const list: string[] = await manifestResp.json();
          bundleManifest = new Set(list);
        }
      } catch (err) {
        console.warn('[compiler.worker] Could not load bundle manifest:', err);
      }

      // Preload in batches of 25 to prevent connection starvation while maximizing throughput
      const batchSize = 25;
      for (let i = 0; i < CORE_BUNDLE_FILES.length; i += batchSize) {
        const batch = CORE_BUNDLE_FILES.slice(i, i + batchSize);
        await Promise.all(batch.map((file) => fetchBundleFile(file)));
      }
      console.log(`[compiler.worker] Core bundle preloaded successfully (${cachedBundleFiles.size} files in memory).`);
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
  // Ensure WebAssembly module is compiled first before queueing bundle assets
  await getWasmModule();
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
    // A previous network failure must not prevent a later compile from retrying
    // the package download.
    failedDownloads.clear();

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
      synctex: true,
    });

    // Resolve missing package files on-demand before returning any compile result.
    let passes = 0;
    while (
      compileRes.missingFiles &&
      compileRes.missingFiles.length > 0 &&
      passes < 10
    ) {
      passes++;
      let newFilesAdded = 0;
      for (const missing of compileRes.missingFiles) {
        const resolved = resolveCandidateBundleName(missing) || cleanCandidateName(missing);
        const alreadyHad = (resolved && cachedBundleFiles.has(resolved)) || cachedBundleFiles.has(missing);
        if (!alreadyHad) {
          const res = await fetchBundleFile(missing);
          if (res) {
            newFilesAdded++;
          }
        }
      }
      if (newFilesAdded === 0) break;

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
        synctex: true,
      });
    }

    const durationMs = Math.round(performance.now() - start);

    let syncTexIndex;
    try {
      const syncTexOutput = compileRes.outputs?.find((output) => output.kind === 'synctex');
      const syncTexBytes = syncTexOutput ? engine.output(syncTexOutput.name) : undefined;
      if (syncTexBytes && syncTexBytes.length > 0) {
        const rawSyncTex = syncTexBytes[0] === 0x1f && syncTexBytes[1] === 0x8b
          ? await decompressGzip(syncTexBytes)
          : new TextDecoder().decode(syncTexBytes);
        syncTexIndex = parseSyncTexWithLibrary(rawSyncTex, req.entry);
      }
    } catch (error) {
      console.warn('[compiler.worker] Failed to parse SyncTeX output:', error);
    }

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
        syncTexIndex,
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

// Eagerly pre-warm WebAssembly module and core bundle in background upon worker creation
if (
  typeof self !== 'undefined' &&
  typeof (self as any).WorkerGlobalScope !== 'undefined' &&
  self instanceof (self as any).WorkerGlobalScope
) {
  getWasmModule().catch((err) => {
    console.warn('[compiler.worker] Background WASM pre-warm error:', err);
  });
  ensureCoreBundleLoaded().catch((err) => {
    console.warn('[compiler.worker] Background bundle pre-warm error:', err);
  });
}
