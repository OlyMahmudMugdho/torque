import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TexEngine } from 'glyphtex-engine';

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
});
