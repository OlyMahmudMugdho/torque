import fs from 'node:fs';
import path from 'node:path';
import { TexEngine } from 'glyphtex-engine';

const wasmBuf = fs.readFileSync('node_modules/glyphtex-engine/wasm/tectonic_wasm.wasm');
const engine = await TexEngine.load(wasmBuf);

const bundleDir = path.resolve('public/bundle');
const manifest = JSON.parse(fs.readFileSync(path.join(bundleDir, 'manifest.json'), 'utf8'));
const bundleManifest = new Set(manifest);
const cachedBundleFiles = new Map();

function resolveCandidateBundleName(name) {
  if (name.startsWith('[') || name.endsWith(']') || name.includes(':')) {
    return null;
  }
  if (bundleManifest.has(name)) {
    return name;
  }

  // If no extension provided, test common TeX package/font extensions
  if (!name.includes('.')) {
    const exts = ['.sty', '.cls', '.tfm', '.pfb', '.otf', '.def', '.cfg', '.fd'];
    for (const ext of exts) {
      const candidate = `${name}${ext}`;
      if (bundleManifest.has(candidate)) {
        return candidate;
      }
    }
  }

  // Strip probe suffixes appended by XeTeX
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

function loadBundleFile(name) {
  if (cachedBundleFiles.has(name)) {
    return { resolvedName: name, data: cachedBundleFiles.get(name) };
  }
  const resolvedName = resolveCandidateBundleName(name);
  if (!resolvedName) return null;

  if (cachedBundleFiles.has(resolvedName)) {
    const data = cachedBundleFiles.get(resolvedName);
    if (name !== resolvedName) cachedBundleFiles.set(name, data);
    return { resolvedName, data };
  }

  const filePath = path.join(bundleDir, resolvedName);
  if (fs.existsSync(filePath)) {
    const buf = new Uint8Array(fs.readFileSync(filePath));
    cachedBundleFiles.set(resolvedName, buf);
    if (name !== resolvedName) cachedBundleFiles.set(name, buf);
    return { resolvedName, data: buf };
  }
  return null;
}

const CORE_BUNDLE_FILES = [
  // Core format & document classes
  'latex.fmt',
  'article.cls',
  'size10.clo',
  'size11.clo',
  'size12.clo',
  'l3backend-xetex.def',

  // Math & AMS
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

  // Layout & tools
  'geometry.sty',
  'keyval.sty',
  'iftex.sty',
  'ifvtex.sty',
  'multicol.sty',
  'calc.sty',
  'etoolbox.sty',

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
  'cmex10.tfm', 'cmex7.tfm', 'cmex8.tfm',
  'cmmi10.tfm', 'cmmi5.tfm', 'cmmi6.tfm', 'cmmi7.tfm', 'cmmi8.tfm',
  'cmr10.tfm', 'cmr5.tfm', 'cmr6.tfm', 'cmr7.tfm', 'cmr8.tfm',
  'cmsy10.tfm', 'cmsy5.tfm', 'cmsy6.tfm', 'cmsy7.tfm', 'cmsy8.tfm',
  'msam10.tfm', 'msam5.tfm', 'msam7.tfm',
  'msbm10.tfm', 'msbm5.tfm', 'msbm7.tfm',

  // Math Font Outlines (PFB)
  'cmex10.pfb', 'cmex8.pfb', 'cmex7.pfb',
  'cmmi10.pfb', 'cmmi8.pfb', 'cmmi7.pfb', 'cmmi6.pfb',
  'cmr10.pfb', 'cmr8.pfb', 'cmr7.pfb', 'cmr6.pfb', 'cmr5.pfb',
  'cmsy10.pfb', 'cmsy8.pfb', 'cmsy7.pfb', 'cmsy6.pfb',
  'msam10.pfb', 'msam7.pfb',
  'msbm10.pfb', 'msbm7.pfb',
];

for (const file of CORE_BUNDLE_FILES) {
  const res = loadBundleFile(file);
  if (res) {
    engine.addFile(res.resolvedName, res.data);
  }
}

const doc = `\\documentclass[11pt]{article}
\\usepackage[margin=1in]{geometry}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{multicol}

\\begin{document}
Test math: $E = mc^2$
\\end{document}
`;

engine.addFile('main.tex', doc);

let res = engine.compile({ entry: 'main.tex', synctex: false });
console.log('Pass 0 status:', res.status, 'missing count:', res.missingFiles?.length ?? 0);

let passes = 0;
while (res.status === 'failed' && res.missingFiles && res.missingFiles.length > 0 && passes < 25) {
  passes++;
  console.log(`\n--- Pass ${passes} ---`);
  let added = 0;
  for (const missing of res.missingFiles) {
    const fileRes = loadBundleFile(missing);
    if (fileRes) {
      engine.addFile(fileRes.resolvedName, fileRes.data);
      if (missing !== fileRes.resolvedName) {
        engine.addFile(missing, fileRes.data);
      }
      added++;
    }
  }
  if (added === 0) break;
  res = engine.compile({ entry: 'main.tex', synctex: false });
  console.log('Pass', passes, 'status:', res.status, 'missing count:', res.missingFiles?.length ?? 0);
}

console.log('\nFinal result:', res.status);
const pdf = engine.pdf();
console.log('PDF bytes produced:', pdf?.length ?? 0);
if (pdf && pdf.length >= 4) {
  console.log('PDF header valid:', pdf[0] === 0x25 && pdf[1] === 0x50 && pdf[2] === 0x44 && pdf[3] === 0x46);
}
if (res.diagnostics && res.diagnostics.length > 0) {
  console.log('Diagnostics:', res.diagnostics);
}
