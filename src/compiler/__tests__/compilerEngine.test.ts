import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TexEngine } from 'glyphtex-engine';
import {
  parseDiagnosticFromError,
  CORE_BUNDLE_FILES,
  resolveCandidateBundleName,
} from '../compiler.worker';

describe('compilerEngine', () => {
  it('compiles standard document with geometry, amsmath, graphicx, multicol, and math in a single pass', async () => {
    const wasmBuf = fs.readFileSync('node_modules/glyphtex-engine/wasm/tectonic_wasm.wasm');
    const engine = await TexEngine.load(wasmBuf);
    const bundleDir = path.resolve('public/bundle');

    function loadBundleFile(name: string): Uint8Array | null {
      const filePath = path.join(bundleDir, name);
      if (fs.existsSync(filePath)) {
        return new Uint8Array(fs.readFileSync(filePath));
      }
      return null;
    }

    const CORE_FILES = [
      'latex.fmt',
      'article.cls',
      'size10.clo',
      'size11.clo',
      'size12.clo',
      'l3backend-xetex.def',
      'amsmath.sty',
      'amssymb.sty',
      'amstext.sty',
      'amsgen.sty',
      'amsbsy.sty',
      'amsopn.sty',
      'amsfonts.sty',
      'umsa.fd',
      'umsb.fd',
      'graphicx.sty',
      'graphics.sty',
      'graphics.cfg',
      'color.sty',
      'color.cfg',
      'xcolor.sty',
      'xetex.def',
      'trig.sty',
      'geometry.sty',
      'keyval.sty',
      'iftex.sty',
      'ifvtex.sty',
      'multicol.sty',
      'calc.sty',
      'etoolbox.sty',
      'ckx.map',
      'glyphlist.txt',
      'kanjix.map',
      'pdfglyphlist.txt',
      'pdftex.map',
      'tex-text.tec',
      'texglyphlist.txt',
      'lmroman10-regular.otf',
      'lmroman12-regular.otf',
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

    for (const file of CORE_FILES) {
      const data = loadBundleFile(file);
      if (data) {
        engine.addFile(file, data);
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

    const res = engine.compile({ entry: 'main.tex', synctex: false });
    expect(res.status).toBe('spotless');

    const pdf = engine.pdf();
    expect(pdf).toBeDefined();
    expect(pdf!.length).toBeGreaterThan(100);
    // Valid PDF starts with %PDF-
    expect(pdf![0]).toBe(0x25); // %
    expect(pdf![1]).toBe(0x50); // P
    expect(pdf![2]).toBe(0x44); // D
    expect(pdf![3]).toBe(0x46); // F
  }, 15000);

  it('compiles commutative diagrams with tikz-cd cleanly', async () => {
    const wasmBuf = fs.readFileSync('node_modules/glyphtex-engine/wasm/tectonic_wasm.wasm');
    const engine = await TexEngine.load(wasmBuf);
    const bundleDir = path.resolve('public/bundle');
    const manifest: string[] = JSON.parse(fs.readFileSync('public/bundle/manifest.json', 'utf8'));

    // Mount bundle files
    for (const f of manifest) {
      const p = path.join(bundleDir, f);
      if (fs.existsSync(p)) {
        engine.addFile(f, new Uint8Array(fs.readFileSync(p)));
      }
    }

    const doc = `\\documentclass{article}
\\usepackage{tikz-cd}
\\begin{document}
\\begin{tikzcd}
A \\arrow[r, "f"] & B
\\end{tikzcd}
\\end{document}`;

    engine.addFile('main.tex', doc);
    const res = engine.compile({ entry: 'main.tex', synctex: false });
    expect(res.status).toBe('spotless');

    const pdf = engine.pdf();
    expect(pdf).toBeDefined();
    expect(pdf!.length).toBeGreaterThan(100);
    expect(pdf![0]).toBe(0x25); // %
    expect(pdf![1]).toBe(0x50); // P
    expect(pdf![2]).toBe(0x44); // D
    expect(pdf![3]).toBe(0x46); // F
  }, 15000);

  it('compiles documents using pgfsys directly', async () => {
    const wasmBuf = fs.readFileSync('node_modules/glyphtex-engine/wasm/tectonic_wasm.wasm');
    const engine = await TexEngine.load(wasmBuf);
    const bundleDir = path.resolve('public/bundle');
    const manifest: string[] = JSON.parse(fs.readFileSync('public/bundle/manifest.json', 'utf8'));

    for (const f of manifest) {
      const p = path.join(bundleDir, f);
      if (fs.existsSync(p)) {
        engine.addFile(f, new Uint8Array(fs.readFileSync(p)));
      }
    }

    const doc = `\\documentclass{article}
\\usepackage{pgfsys}
\\begin{document}
Test pgfsys driver
\\end{document}`;

    engine.addFile('main.tex', doc);
    const res = engine.compile({ entry: 'main.tex', synctex: false });
    expect(res.status).toBe('spotless');
    expect(res.diagnostics.length).toBe(0);

    const pdf = engine.pdf();
    expect(pdf).toBeDefined();
    expect(pdf!.length).toBeGreaterThan(100);
    expect(pdf![0]).toBe(0x25); // %
    expect(pdf![1]).toBe(0x50); // P
    expect(pdf![2]).toBe(0x44); // D
    expect(pdf![3]).toBe(0x46); // F
  }, 15000);

  it('compiles standard IEEE conference template with IEEEtran document class', async () => {
    const wasmBuf = fs.readFileSync('node_modules/glyphtex-engine/wasm/tectonic_wasm.wasm');
    const engine = await TexEngine.load(wasmBuf);
    const bundleDir = path.resolve('public/bundle');
    const manifest: string[] = JSON.parse(fs.readFileSync('public/bundle/manifest.json', 'utf8'));

    for (const f of manifest) {
      const p = path.join(bundleDir, f);
      if (fs.existsSync(p)) {
        engine.addFile(f, new Uint8Array(fs.readFileSync(p)));
      }
    }

    const doc = `\\documentclass[conference]{IEEEtran}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\title{Torque: A Client-Side WebAssembly LaTeX IDE}
\\author{
  \\IEEEauthorblockN{Antigravity Agent}
  \\IEEEauthorblockA{DeepMind Systems\\\\
  Email: agent@deepmind.com}
}
\\begin{document}
\\maketitle
\\begin{abstract}
This paper introduces Torque, an open-source client-side LaTeX IDE.
\\end{abstract}
\\begin{IEEEkeywords}
LaTeX, WebAssembly, Editor, Tectonic
\\end{IEEEkeywords}
\\section{Introduction}
Modern scientific publishing demands instant local compilation.
\\[
  E = mc^2
\\]
\\end{document}`;

    engine.addFile('main.tex', doc);
    const res = engine.compile({ entry: 'main.tex', synctex: false });
    expect(res.status).toBe('spotless');
    expect(res.diagnostics.length).toBe(0);

    const pdf = engine.pdf();
    expect(pdf).toBeDefined();
    expect(pdf!.length).toBeGreaterThan(100);
    expect(pdf![0]).toBe(0x25); // %
    expect(pdf![1]).toBe(0x50); // P
    expect(pdf![2]).toBe(0x44); // D
    expect(pdf![3]).toBe(0x46); // F
  }, 15000);

  it('compiles TikZ document with paths and node positioning spotlessly using core bundle files', async () => {
    const wasmBuf = fs.readFileSync('node_modules/glyphtex-engine/wasm/tectonic_wasm.wasm');
    const engine = await TexEngine.load(wasmBuf);
    const bundleDir = path.resolve('public/bundle');

    for (const file of CORE_BUNDLE_FILES) {
      const p = path.join(bundleDir, file);
      if (fs.existsSync(p)) {
        engine.addFile(file, new Uint8Array(fs.readFileSync(p)));
      }
    }

    const doc = `\\documentclass{article}
\\usepackage{tikz}
\\usetikzlibrary{positioning,quotes,arrows.meta}
\\begin{document}
\\begin{tikzpicture}
  \\node[draw, circle] (A) {A};
  \\node[draw, rectangle, right=of A] (B) {B};
  \\draw[->] (A) to["edge"] (B);
\\end{tikzpicture}
\\end{document}`;

    engine.addFile('main.tex', doc);
    const res = engine.compile({ entry: 'main.tex', synctex: false });
    expect(res.status).toBe('spotless');
    expect(res.diagnostics.length).toBe(0);

    const pdf = engine.pdf();
    expect(pdf).toBeDefined();
    expect(pdf!.length).toBeGreaterThan(100);
    expect(pdf![0]).toBe(0x25); // %
  }, 20000);

  it('compiles documents with Latin Modern bold, italic, and optical sizes (14.4pt, 10.95pt, 8pt) without font not loadable errors', async () => {
    const wasmBuf = fs.readFileSync('node_modules/glyphtex-engine/wasm/tectonic_wasm.wasm');
    const engine = await TexEngine.load(wasmBuf);
    const bundleDir = path.resolve('public/bundle');

    for (const file of CORE_BUNDLE_FILES) {
      const p = path.join(bundleDir, file);
      if (fs.existsSync(p)) {
        engine.addFile(file, new Uint8Array(fs.readFileSync(p)));
      }
    }

    const doc = `\\documentclass[11pt]{article}
\\begin{document}
\\section{Title at 14.4pt}
\\subsection{Subsection at 12pt}
Regular 10.95pt text with \\textbf{bold text} and \\textit{italic text}.
{\\footnotesize Footnote size text at 8pt.}
{\\scriptsize Script size text at 7pt.}
{\\tiny Tiny size text at 6pt.}
\\end{document}`;

    engine.addFile('main.tex', doc);
    const res = engine.compile({ entry: 'main.tex', synctex: false });
    expect(res.status).toBe('spotless');
    expect(res.diagnostics.length).toBe(0);

    const pdf = engine.pdf();
    expect(pdf).toBeDefined();
    expect(pdf!.length).toBeGreaterThan(100);
    expect(pdf![0]).toBe(0x25);
  }, 20000);

  it('compiles pgfplots diagrams using plotmarks and tikz libraries cleanly', async () => {
    const wasmBuf = fs.readFileSync('node_modules/glyphtex-engine/wasm/tectonic_wasm.wasm');
    const engine = await TexEngine.load(wasmBuf);
    const bundleDir = path.resolve('public/bundle');

    for (const file of CORE_BUNDLE_FILES) {
      const p = path.join(bundleDir, file);
      if (fs.existsSync(p)) {
        engine.addFile(file, new Uint8Array(fs.readFileSync(p)));
      }
    }

    const doc = `\\documentclass{article}
\\usepackage{pgfplots}
\\pgfplotsset{compat=1.18}
\\begin{document}
\\begin{tikzpicture}
  \\begin{axis}
    \\addplot[mark=*] coordinates {(0,0) (1,1) (2,4) (3,9)};
  \\end{axis}
\\end{tikzpicture}
\\end{document}`;

    engine.addFile('main.tex', doc);
    const res = engine.compile({ entry: 'main.tex', synctex: false });
    expect(res.status).toBe('spotless');
    expect(res.diagnostics.length).toBe(0);

    const pdf = engine.pdf();
    expect(pdf).toBeDefined();
    expect(pdf!.length).toBeGreaterThan(100);
    expect(pdf![0]).toBe(0x25);
  }, 20000);

  describe('resolveCandidateBundleName', () => {
    const manifest = new Set<string>(JSON.parse(fs.readFileSync('public/bundle/manifest.json', 'utf8')));

    it('resolves PGF and TikZ library requests', () => {
      expect(resolveCandidateBundleName('pgflibraryplothandlers', manifest)).toBe(
        'pgflibraryplothandlers.code.tex'
      );
      expect(resolveCandidateBundleName('plothandlers', manifest)).toBe(
        'pgflibraryplothandlers.code.tex'
      );
      expect(resolveCandidateBundleName('tikzlibrarytopaths', manifest)).toBe(
        'tikzlibrarytopaths.code.tex'
      );
      expect(resolveCandidateBundleName('topaths', manifest)).toBe(
        'tikzlibrarytopaths.code.tex'
      );
      expect(resolveCandidateBundleName('tikzlibraryplotmarks', manifest)).toBe(
        'tikzlibraryplotmarks.code.tex'
      );
      expect(resolveCandidateBundleName('pgflibraryplotmarks', manifest)).toBe(
        'pgflibraryplotmarks.code.tex'
      );
      expect(resolveCandidateBundleName('plotmarks', manifest)).toBe(
        'tikzlibraryplotmarks.code.tex'
      );
    });

    it('resolves XeTeX font probes with brackets, font mappings, and options', () => {
      expect(resolveCandidateBundleName('[lmroman12-bold]:mapping=tex-text;', manifest)).toBe(
        'lmroman12-bold.otf'
      );
      expect(resolveCandidateBundleName('[lmroman10-bold]:mapping=tex-text;', manifest)).toBe(
        'lmroman10-bold.otf'
      );
      expect(resolveCandidateBundleName('[lmroman8-regular]:mapping=tex-text;', manifest)).toBe(
        'lmroman8-regular.otf'
      );
      expect(resolveCandidateBundleName('[lmroman12-bold]', manifest)).toBe(
        'lmroman12-bold.otf'
      );
      expect(resolveCandidateBundleName('[lmroman10-bold]', manifest)).toBe(
        'lmroman10-bold.otf'
      );
      expect(resolveCandidateBundleName('[lmroman8-regular]', manifest)).toBe(
        'lmroman8-regular.otf'
      );
      expect(resolveCandidateBundleName('[lmroman10-bold].tfm', manifest)).toBe(
        'lmroman10-bold.otf'
      );
      expect(resolveCandidateBundleName('lmroman10-bold.OTF', manifest)).toBe(
        'lmroman10-bold.otf'
      );
      expect(resolveCandidateBundleName('lmroman12-bold', manifest)).toBe(
        'lmroman12-bold.otf'
      );
      expect(resolveCandidateBundleName('lmroman10-regular:0-0-GID', manifest)).toBe(
        'lmroman10-regular.otf'
      );
      expect(resolveCandidateBundleName('lmroman10-regular/rsrc', manifest)).toBe(
        'lmroman10-regular.otf'
      );
    });
  });

  describe('error diagnostics and engine recovery', () => {
    it('translates bridge_core index out of bounds panic into actionable unicode diagnostic', () => {
      const err = new Error('unreachable');
      err.name = 'RuntimeError';
      const stderr =
        "thread '<unnamed>' (1) panicked at tectonic/crates/bridge_core/src/lib.rs:599:41:\nindex out of bounds: the len is 0 but the index is 0\nnote: run with RUST_BACKTRACE=1";

      const diag = parseDiagnosticFromError(err, stderr, 'main.tex');
      expect(diag.severity).toBe('error');
      expect(diag.file).toBe('main.tex');
      expect(diag.line).toBe(1);
      expect(diag.message).not.toContain('unreachable');
      expect(diag.message).toMatch(/unicode character|glyph|emoji/i);
    });

    it('translates generic Rust panic into clean diagnostic message', () => {
      const err = new Error('unreachable');
      err.name = 'RuntimeError';
      const stderr =
        "thread '<unnamed>' (1) panicked at src/lib.rs:42:10:\nsomething broke badly";

      const diag = parseDiagnosticFromError(err, stderr, 'doc.tex');
      expect(diag.file).toBe('doc.tex');
      expect(diag.message).toBe('TeX engine panic: something broke badly');
    });

    it('translates RuntimeError unreachable without stderr into descriptive reset message', () => {
      const err = new Error('unreachable');
      err.name = 'RuntimeError';

      const diag = parseDiagnosticFromError(err, '', 'main.tex');
      expect(diag.file).toBe('main.tex');
      expect(diag.message).toMatch(/trapped.*unreachable/i);
      expect(diag.message).not.toBe('unreachable');
    });

    it('recovers cleanly after a failed compile and produces valid PDF on subsequent run', async () => {
      const wasmBuf = fs.readFileSync('node_modules/glyphtex-engine/wasm/tectonic_wasm.wasm');
      const wasmModule = await WebAssembly.compile(wasmBuf);
      const manifest: string[] = JSON.parse(fs.readFileSync('public/bundle/manifest.json', 'utf8'));

      async function createEngine() {
        const eng = await TexEngine.load(wasmModule);
        for (const f of manifest) {
          const p = path.join('public/bundle', f);
          if (fs.existsSync(p)) eng.addFile(f, new Uint8Array(fs.readFileSync(p)));
        }
        return eng;
      }

      let engine = await createEngine();

      // 1. Run a failed compile with nonexistent graphic
      engine.addFile(
        'main.tex',
        '\\documentclass{article}\\usepackage{graphicx}\\begin{document}\\includegraphics{nonexistent_xyz.png}\\end{document}'
      );
      const res1 = engine.compile({ entry: 'main.tex', synctex: false });
      expect(res1.status).toBe('failed');

      // 2. Discard dirty engine and re-instantiate fresh engine
      engine = await createEngine();

      // 3. Compile clean document with emojis and math
      engine.addFile('main.tex', '\\documentclass{article}\\begin{document}Hello 🌍🚀🎉 $E=mc^2$\\end{document}');
      const res2 = engine.compile({ entry: 'main.tex', synctex: false });
      expect(res2.status).toBe('spotless');
      expect(engine.pdf()).toBeDefined();
    }, 20000);
  });
});
