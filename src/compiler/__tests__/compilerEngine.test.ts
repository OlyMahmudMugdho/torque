import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TexEngine } from 'glyphtex-engine';
import {
  parseDiagnosticFromError,
  CORE_BUNDLE_FILES,
  resolveCandidateBundleName,
  fetchBundleFile,
  cachedBundleFiles,
  pendingDownloads,
  clearWorkerCache,
  setBundleManifest,
} from '../compiler.worker';
import {
  savePackageFile,
  clearPackageCache,
  getPackageFile,
} from '../../storage/packageCache';

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

  it('compiles standard document using cite package cleanly to a valid PDF', async () => {
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
\\usepackage{cite}
\\begin{document}
Testing cite package \\cite{test}.
\\begin{thebibliography}{1}
\\bibitem{test} Test Citation, 2026.
\\end{thebibliography}
\\end{document}`;

    engine.addFile('main.tex', doc);
    const res = engine.compile({ entry: 'main.tex', synctex: false });
    expect(res.status).toBe('spotless');
    expect(res.diagnostics.filter((d) => d.severity === 'error').length).toBe(0);

    const pdf = engine.pdf();
    expect(pdf).toBeDefined();
    expect(pdf!.length).toBeGreaterThan(100);
    expect(pdf![0]).toBe(0x25); // %
    expect(pdf![1]).toBe(0x50); // P
    expect(pdf![2]).toBe(0x44); // D
    expect(pdf![3]).toBe(0x46); // F
  }, 15000);

  it('compiles standard document using algorithm and algorithmic packages cleanly to a valid PDF', async () => {
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
\\usepackage{algorithm}
\\usepackage{algorithmic}
\\begin{document}
\\begin{algorithm}
\\caption{Euclid's algorithm}
\\begin{algorithmic}[1]
\\STATE \\textbf{input:} integers $a$ and $b$
\\WHILE{$b \\neq 0$}
  \\STATE $r \\leftarrow a \\bmod b$
  \\STATE $a \\leftarrow b$
  \\STATE $b \\leftarrow r$
\\ENDWHILE
\\STATE \\textbf{return} $a$
\\end{algorithmic}
\\end{algorithm}
\\end{document}`;

    engine.addFile('main.tex', doc);
    const res = engine.compile({ entry: 'main.tex', synctex: false });
    expect(res.status).toBe('spotless');
    expect(res.diagnostics.filter((d) => d.severity === 'error').length).toBe(0);

    const pdf = engine.pdf();
    expect(pdf).toBeDefined();
    expect(pdf!.length).toBeGreaterThan(100);
    expect(pdf![0]).toBe(0x25); // %
    expect(pdf![1]).toBe(0x50); // P
    expect(pdf![2]).toBe(0x44); // D
    expect(pdf![3]).toBe(0x46); // F
  }, 15000);

  it('compiles IEEEtran conference document with cite package cleanly to a valid PDF', async () => {
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
\\usepackage{cite}
\\begin{document}
\\title{Test Conference Paper}
\\author{\\IEEEauthorblockN{Author Name}}
\\maketitle
\\begin{abstract}
Abstract text.
\\end{abstract}
\\section{Introduction}
Citation test \\cite{ref1,ref2}.
\\begin{thebibliography}{2}
\\bibitem{ref1} First Reference.
\\bibitem{ref2} Second Reference.
\\end{thebibliography}
\\end{document}`;

    engine.addFile('main.tex', doc);
    const res = engine.compile({ entry: 'main.tex', synctex: false });
    expect(res.status).toBe('spotless');
    expect(res.diagnostics.filter((d) => d.severity === 'error').length).toBe(0);

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
      expect(resolveCandidateBundleName('fullpage', manifest)).toBe('fullpage.sty');
      expect(resolveCandidateBundleName('fontspec', manifest)).toBe('fontspec.sty');
      expect(resolveCandidateBundleName('ecrm1000', manifest)).toBe('ecrm1000.tfm');
      expect(resolveCandidateBundleName('ecrm0900.tfm', manifest)).toBe('ecrm0900.tfm');
      expect(resolveCandidateBundleName('ecrm1095', manifest)).toBe('ecrm1095.tfm');
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

    it('produces valid PDF and warnings status when compiling document with LaTeX warnings', async () => {
      const wasmBuf = fs.readFileSync('node_modules/glyphtex-engine/wasm/tectonic_wasm.wasm');
      const wasmModule = await WebAssembly.compile(wasmBuf);
      const manifest: string[] = JSON.parse(fs.readFileSync('public/bundle/manifest.json', 'utf8'));

      const engine = await TexEngine.load(wasmModule);
      for (const f of manifest) {
        const p = path.join('public/bundle', f);
        if (fs.existsSync(p)) engine.addFile(f, new Uint8Array(fs.readFileSync(p)));
      }

      // Overfull hbox and pgfplots backwards compatibility warning
      const docWithWarnings = `\\documentclass{article}
\\usepackage{pgfplots}
\\begin{document}
\\hbox to 1cm{This is a deliberately overfull hbox that exceeds one centimeter by a large margin}
\\begin{tikzpicture}
\\begin{axis}
\\addplot coordinates {(0,0) (1,1)};
\\end{axis}
\\end{tikzpicture}
\\end{document}
`;
      engine.addFile('main.tex', docWithWarnings);
      const res = engine.compile({ entry: 'main.tex', synctex: false });

      expect(res.status).toBe('warnings');
      expect(res.diagnostics.length).toBeGreaterThan(0);
      const pdf = engine.pdf();
      expect(pdf).toBeDefined();
      expect(pdf!.length).toBeGreaterThan(100);
      expect(pdf![0]).toBe(0x25); // %
      expect(pdf![1]).toBe(0x50); // P
      expect(pdf![2]).toBe(0x44); // D
      expect(pdf![3]).toBe(0x46); // F
    }, 20000);

    it('produces valid PDF and errors status when document has recoverable TeX error', async () => {
      const wasmBuf = fs.readFileSync('node_modules/glyphtex-engine/wasm/tectonic_wasm.wasm');
      const wasmModule = await WebAssembly.compile(wasmBuf);
      const manifest: string[] = JSON.parse(fs.readFileSync('public/bundle/manifest.json', 'utf8'));

      const engine = await TexEngine.load(wasmModule);
      for (const f of manifest) {
        const p = path.join('public/bundle', f);
        if (fs.existsSync(p)) engine.addFile(f, new Uint8Array(fs.readFileSync(p)));
      }

      const docWithError = `\\documentclass{article}
\\begin{document}
Hello World
\\undefinedcontrolsequence
Valid Text Afterwards
\\end{document}
`;
      engine.addFile('main.tex', docWithError);
      const res = engine.compile({ entry: 'main.tex', synctex: false });

      expect(res.status).toBe('errors');
      const pdf = engine.pdf();
      expect(pdf).toBeDefined();
      expect(pdf!.length).toBeGreaterThan(100);
      expect(pdf![0]).toBe(0x25); // %
      expect(pdf![1]).toBe(0x50); // P
      expect(pdf![2]).toBe(0x44); // D
      expect(pdf![3]).toBe(0x46); // F
    }, 20000);

    it('compiles documents using fullpage and fontspec spotlessly', async () => {
      const wasmBuf = fs.readFileSync('node_modules/glyphtex-engine/wasm/tectonic_wasm.wasm');
      const wasmModule = await WebAssembly.compile(wasmBuf);
      const manifest: string[] = JSON.parse(fs.readFileSync('public/bundle/manifest.json', 'utf8'));

      const engine = await TexEngine.load(wasmModule);
      for (const f of manifest) {
        const p = path.join('public/bundle', f);
        if (fs.existsSync(p)) engine.addFile(f, new Uint8Array(fs.readFileSync(p)));
      }

      const doc = `\\documentclass{article}
\\usepackage{fullpage}
\\usepackage{fontspec}
\\setmainfont{Latin Modern Roman}

\\begin{document}
\\section{Testing fullpage and fontspec}
This document compiles cleanly with fullpage margins and fontspec commands.
\\end{document}
`;
      engine.addFile('main.tex', doc);
      const res = engine.compile({ entry: 'main.tex', synctex: false });

      expect(res.status).toBe('spotless');
      const pdf = engine.pdf();
      expect(pdf).toBeDefined();
      expect(pdf!.length).toBeGreaterThan(100);
    }, 20000);

    it('compiles IEEEtran conference document with T1 fontenc and EC Cork fonts without metric errors', async () => {
      const wasmBuf = fs.readFileSync('node_modules/glyphtex-engine/wasm/tectonic_wasm.wasm');
      const wasmModule = await WebAssembly.compile(wasmBuf);
      const manifest: string[] = JSON.parse(fs.readFileSync('public/bundle/manifest.json', 'utf8'));

      const engine = await TexEngine.load(wasmModule);
      for (const f of manifest) {
        const p = path.join('public/bundle', f);
        if (fs.existsSync(p)) engine.addFile(f, new Uint8Array(fs.readFileSync(p)));
      }

      const ieeeDoc = `\\documentclass[conference]{IEEEtran}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath}

\\title{Conference Paper with Cork T1 Fonts}
\\author{\\IEEEauthorblockN{Author Name}}

\\begin{document}
\\maketitle

\\begin{abstract}
Abstract text using European Computer Modern T1 fonts.
\\end{abstract}

\\section{Introduction}
Testing IEEEtran fonts across 10pt, 9pt, 8pt, 7pt, 5pt sizes.
{\\small Small text at 9pt.}
{\\footnotesize Footnote text at 8pt.}
{\\scriptsize Script text at 7pt.}
{\\tiny Tiny text at 5pt.}

\\end{document}
`;
      engine.addFile('main.tex', ieeeDoc);
      const res = engine.compile({ entry: 'main.tex', synctex: false });

      // Build must succeed (spotless or warnings), generating valid PDF without TFM not loadable errors
      expect(['spotless', 'warnings']).toContain(res.status);
      const pdf = engine.pdf();
      expect(pdf).toBeDefined();
      expect(pdf!.length).toBeGreaterThan(100);
    }, 25000);
  });

  describe('persistent packageCache and JIT downloader integration', () => {
    beforeEach(async () => {
      clearWorkerCache();
      const manifestList: string[] = JSON.parse(fs.readFileSync('public/bundle/manifest.json', 'utf8'));
      setBundleManifest(new Set(manifestList));
      await clearPackageCache();
      vi.restoreAllMocks();
    });

    it('resolves package from packageCache when an unbundled package is requested', async () => {
      const demoSty = new TextEncoder().encode('\\newcommand{\\customdemo}{Hello From Cached Package}\\endinput\n');
      await savePackageFile('customdemo.sty', demoSty);

      const res = await fetchBundleFile('customdemo.sty');
      expect(res).not.toBeNull();
      expect(res?.resolvedName).toBe('customdemo.sty');
      expect(Array.from(res?.data!)).toEqual(Array.from(demoSty));
      expect(cachedBundleFiles.has('customdemo.sty')).toBe(true);
    });

    it('compiles document using custom package stored in packageCache cleanly to a valid PDF', async () => {
      const boxSty = new TextEncoder().encode(
        '\\ProvidesPackage{custombox}[2026/11/03 Custom Box Package]\n\\newcommand{\\custombox}[1]{\\textbf{[#1]}}\n\\endinput\n'
      );
      await savePackageFile('custombox.sty', boxSty);

      const wasmBuf = fs.readFileSync('node_modules/glyphtex-engine/wasm/tectonic_wasm.wasm');
      const wasmModule = await WebAssembly.compile(wasmBuf);
      const bundleDir = path.resolve('public/bundle');

      // 1. Initial pass without custombox in memory -> compile should report missing custombox.sty
      let engine = await TexEngine.load(wasmModule);
      for (const f of CORE_BUNDLE_FILES) {
        const p = path.join(bundleDir, f);
        if (fs.existsSync(p)) engine.addFile(f, new Uint8Array(fs.readFileSync(p)));
      }

      const doc = `\\documentclass{article}
\\usepackage{custombox}
\\begin{document}
Testing custom cached package: \\custombox{Success!}
\\end{document}
`;
      engine.addFile('main.tex', doc);
      let compileRes = engine.compile({ entry: 'main.tex', synctex: false });
      expect(compileRes.status).toBe('failed');
      expect(compileRes.missingFiles).toContain('custombox.sty');

      // 2. Fetch missing files via fetchBundleFile (resolves custombox.sty from packageCache)
      let added = 0;
      for (const missing of compileRes.missingFiles!) {
        const fetched = await fetchBundleFile(missing);
        if (fetched) {
          added++;
        }
      }
      expect(added).toBeGreaterThan(0);
      expect(cachedBundleFiles.has('custombox.sty')).toBe(true);

      // 3. Re-instantiate fresh engine with cached files mounted
      engine = await TexEngine.load(wasmModule);
      for (const f of CORE_BUNDLE_FILES) {
        const p = path.join(bundleDir, f);
        if (fs.existsSync(p)) engine.addFile(f, new Uint8Array(fs.readFileSync(p)));
      }
      for (const [name, data] of cachedBundleFiles.entries()) {
        engine.addFile(name, data);
      }

      engine.addFile('main.tex', doc);
      compileRes = engine.compile({ entry: 'main.tex', synctex: false });
      expect(compileRes.status).toBe('spotless');
      expect(compileRes.diagnostics.length).toBe(0);

      const pdf = engine.pdf();
      expect(pdf).toBeDefined();
      expect(pdf!.length).toBeGreaterThan(100);
      expect(pdf![0]).toBe(0x25); // %
      expect(pdf![1]).toBe(0x50); // P
      expect(pdf![2]).toBe(0x44); // D
      expect(pdf![3]).toBe(0x46); // F
    }, 25000);

    it('JIT auto-downloads unbundled package from CTAN and persists to cache', async () => {
      const mockStyContent = new TextEncoder().encode(
        '\\ProvidesPackage{autodemo}[2026/11/03 Auto Demo]\n\\newcommand{\\autoval}{99}\n\\endinput\n'
      );

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        const urlStr = String(input);
        if (urlStr.includes('autodemo.sty')) {
          return new Response(mockStyContent, {
            status: 200,
            headers: { 'Content-Type': 'application/x-tex' },
          });
        }
        return new Response('Not found', { status: 404 });
      });

      const res = await fetchBundleFile('autodemo.sty');
      expect(res).not.toBeNull();
      expect(res?.resolvedName).toBe('autodemo.sty');
      expect(Array.from(res?.data!)).toEqual(Array.from(mockStyContent));

      // Verify persisted to packageCache
      const cached = await getPackageFile('autodemo.sty');
      expect(cached).not.toBeNull();
      expect(Array.from(cached!)).toEqual(Array.from(mockStyContent));
      expect(cachedBundleFiles.has('autodemo.sty')).toBe(true);

      fetchSpy.mockRestore();
    });

    it('deduplicates concurrent JIT download requests for the same package', async () => {
      const mockStyContent = new TextEncoder().encode(
        '\\ProvidesPackage{dedupdemo}[2026/11/03 Dedup Demo]\n\\endinput\n'
      );

      let fetchCount = 0;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        const urlStr = String(input);
        if (urlStr.includes('dedupdemo.sty')) {
          fetchCount++;
          // Simulate slight network latency
          await new Promise((r) => setTimeout(r, 20));
          return new Response(mockStyContent, {
            status: 200,
            headers: { 'Content-Type': 'application/x-tex' },
          });
        }
        return new Response('Not found', { status: 404 });
      });

      // Fire 2 concurrent fetch requests
      const [res1, res2] = await Promise.all([
        fetchBundleFile('dedupdemo.sty'),
        fetchBundleFile('dedupdemo.sty'),
      ]);

      expect(res1).not.toBeNull();
      expect(res2).not.toBeNull();
      expect(Array.from(res1?.data!)).toEqual(Array.from(mockStyContent));
      expect(Array.from(res2?.data!)).toEqual(Array.from(mockStyContent));
      // Even though called concurrently twice, fetch must only have occurred once
      expect(fetchCount).toBe(1);

      fetchSpy.mockRestore();
    });

    it('handles JIT download failure gracefully by returning null without throwing', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        return new Response('404 Not Found', { status: 404 });
      });

      const res = await fetchBundleFile('missingnonexistent.sty');
      expect(res).toBeNull();
      expect(pendingDownloads.has('missingnonexistent.sty')).toBe(false);

      fetchSpy.mockRestore();
    });

    it('ignores files not eligible for JIT download (e.g. non-macro extensions)', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const res = await fetchBundleFile('malicious.exe');
      expect(res).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();

      fetchSpy.mockRestore();
    });
  });
});
