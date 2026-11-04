import { describe, it, expect, vi } from 'vitest';
import {
  TauriCompilerDriver,
  HttpCompilerDriver,
  getCompilerDriver,
  setCompilerDriver,
  getActiveCompilerDriver,
  type CompileDriverRequest,
} from '../compilerDriver';
import {
  parseDiagnosticsFromLog,
  extractMissingFilesFromLog,
  inferPackageCandidates,
  safeResolvePath,
  compileLatexNative,
  detectTexLiveEnvironment,
} from '../serverCompiler';
import { uint8ArrayToBase64 } from '../../storage/tauriStorage';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

describe('TauriCompilerDriver', () => {
  it('detects environment via tauri_detect_texlive command', async () => {
    const mockInvoke = vi.fn().mockResolvedValue({
      available: true,
      latexmk: true,
      pdflatex: true,
      xelatex: true,
      lualatex: false,
      texhash: true,
      synctex: true,
      version: 'pdfTeX 3.141592653-2.6-1.40.24',
    });

    const driver = new TauriCompilerDriver(mockInvoke);
    const env = await driver.detectEnvironment();

    expect(mockInvoke).toHaveBeenCalledWith('tauri_detect_texlive');
    expect(env.available).toBe(true);
    expect(env.latexmk).toBe(true);
    expect(env.version).toBe('pdfTeX 3.141592653-2.6-1.40.24');
  });

  it('handles detectEnvironment error gracefully', async () => {
    const mockInvoke = vi.fn().mockRejectedValue(new Error('Tauri IPC failed'));
    const driver = new TauriCompilerDriver(mockInvoke);
    const env = await driver.detectEnvironment();

    expect(env.available).toBe(false);
    expect(env.latexmk).toBe(false);
  });

  it('compiles files and decodes base64 PDF and synctex', async () => {
    const samplePdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x35]);
    const samplePdfBase64 = uint8ArrayToBase64(samplePdfBytes);
    const sampleSyncTexBytes = new Uint8Array([0x53, 0x79, 0x6e, 0x63]);
    const sampleSyncTexBase64 = uint8ArrayToBase64(sampleSyncTexBytes);

    const mockInvoke = vi.fn().mockResolvedValue({
      status: 'spotless',
      pdf: samplePdfBase64,
      synctex: sampleSyncTexBase64,
      diagnostics: [],
      missing_files: [],
      resolved_packages: ['amsmath'],
      duration_ms: 120,
      stdout: 'Latexmk: All targets up-to-date',
      stderr: '',
    });

    const driver = new TauriCompilerDriver(mockInvoke);
    const request: CompileDriverRequest = {
      projectId: 'proj-123',
      files: {
        'main.tex': '\\documentclass{article}\\begin{document}Hello\\end{document}',
        'image.png': new Uint8Array([1, 2, 3]),
      },
      entry: 'main.tex',
      engine: 'pdflatex',
      synctex: true,
    };

    const res = await driver.compile(request);

    expect(mockInvoke).toHaveBeenCalledWith(
      'tauri_compile_latex',
      expect.objectContaining({
        projectId: 'proj-123',
        entry: 'main.tex',
        engine: 'pdflatex',
        synctex: true,
      })
    );

    expect(res.status).toBe('spotless');
    expect(res.pdfBytes).toEqual(samplePdfBytes);
    expect(res.synctexBytes).toEqual(sampleSyncTexBytes);
    expect(res.resolvedPackages).toEqual(['amsmath']);
    expect(res.durationMs).toBe(120);
  });

  it('handles compile errors and missing files', async () => {
    const mockInvoke = vi.fn().mockResolvedValue({
      status: 'errors',
      pdf: null,
      synctex: null,
      diagnostics: [
        {
          severity: 'error',
          file: 'main.tex',
          line: 5,
          message: 'Undefined control sequence',
        },
      ],
      missing_files: ['missing.sty'],
      duration_ms: 85,
      stdout: '',
      stderr: 'LaTeX error',
    });

    const driver = new TauriCompilerDriver(mockInvoke);
    const res = await driver.compile({
      projectId: 'proj-error',
      files: { 'main.tex': 'bad' },
      entry: 'main.tex',
    });

    expect(res.status).toBe('errors');
    expect(res.pdfBytes).toBeNull();
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0].line).toBe(5);
    expect(res.missingFiles).toEqual(['missing.sty']);
  });
});

describe('HttpCompilerDriver', () => {
  it('detects environment via GET /api/compile?action=detect', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        available: true,
        latexmk: true,
        pdflatex: true,
        xelatex: false,
        lualatex: false,
        texhash: true,
        synctex: true,
        version: 'pdfTeX 2024',
      }),
    });

    const driver = new HttpCompilerDriver('/api/compile', mockFetch as any);
    const env = await driver.detectEnvironment();

    expect(mockFetch).toHaveBeenCalledWith('/api/compile?action=detect', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    expect(env.available).toBe(true);
    expect(env.pdflatex).toBe(true);
  });

  it('handles detectEnvironment network failure', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const driver = new HttpCompilerDriver('/api/compile', mockFetch as any);
    const env = await driver.detectEnvironment();

    expect(env.available).toBe(false);
    expect(env.version).toBeNull();
  });

  it('sends POST request and decodes returned PDF', async () => {
    const samplePdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const samplePdfBase64 = uint8ArrayToBase64(samplePdfBytes);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'spotless',
        pdf: samplePdfBase64,
        synctex: null,
        diagnostics: [],
        missingFiles: [],
        resolvedPackages: [],
        durationMs: 45,
        stdout: 'Success',
        stderr: '',
      }),
    });

    const driver = new HttpCompilerDriver('https://remote.torque.dev/api/compile', mockFetch as any);
    const res = await driver.compile({
      projectId: 'p1',
      files: {
        'main.tex': 'content',
        'data.bin': new Uint8Array([10, 20]),
      },
      entry: 'main.tex',
      engine: 'xelatex',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://remote.torque.dev/api/compile',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      })
    );

    expect(res.status).toBe('spotless');
    expect(res.pdfBytes).toEqual(samplePdfBytes);
    expect(res.durationMs).toBe(45);
  });

  it('handles HTTP error status codes gracefully', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Latexmk crashed' }),
    });

    const driver = new HttpCompilerDriver('/api/compile', mockFetch as any);
    const res = await driver.compile({
      projectId: 'p2',
      files: { 'main.tex': 'bad' },
      entry: 'main.tex',
    });

    expect(res.status).toBe('failed');
    expect(res.pdfBytes).toBeNull();
    expect(res.diagnostics[0].message).toContain('HTTP compiler error (500)');
  });
});

describe('getCompilerDriver factory', () => {
  it('creates TauriCompilerDriver when forced', () => {
    const driver = getCompilerDriver({ forceDriver: 'tauri' });
    expect(driver).toBeInstanceOf(TauriCompilerDriver);
  });

  it('creates HttpCompilerDriver when remoteUrl or forceDriver is specified', () => {
    const driver = getCompilerDriver({ remoteUrl: 'https://tex.example.com' });
    expect(driver).toBeInstanceOf(HttpCompilerDriver);
  });

  it('allows overriding active driver via setCompilerDriver', () => {
    const customDriver = new HttpCompilerDriver('https://custom.com');
    setCompilerDriver(customDriver);
    expect(getActiveCompilerDriver()).toBe(customDriver);
    setCompilerDriver(null);
  });
});

describe('serverCompiler diagnostic & package helpers', () => {
  it('parses file-line-error format into diagnostics', () => {
    const log = `
./main.tex:42: Undefined control sequence.
./chapter.tex:15: LaTeX Warning: Reference 'fig:1' undefined on input line 15.
`;
    const diags = parseDiagnosticsFromLog(log, '', 'main.tex');
    expect(diags).toHaveLength(2);

    expect(diags[0]).toEqual({
      severity: 'error',
      file: 'main.tex',
      line: 42,
      message: 'Undefined control sequence.',
    });

    expect(diags[1]).toEqual({
      severity: 'warning',
      file: 'chapter.tex',
      line: 15,
      message: "LaTeX Warning: Reference 'fig:1' undefined on input line 15.",
    });
  });

  it('parses ! LaTeX Error with lookahead line numbers', () => {
    const log = `
! LaTeX Error: Something went wrong.

See the LaTeX manual for explanation.
Type  H <return>  for immediate help.
 ...                                              
                                                  
l.18 \\unknowncommand
`;
    const diags = parseDiagnosticsFromLog(log, '', 'doc.tex');
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe('error');
    expect(diags[0].file).toBe('doc.tex');
    expect(diags[0].line).toBe(18);
    expect(diags[0].message).toBe('LaTeX Error: Something went wrong.');
  });

  it('extracts missing files from LaTeX output patterns', () => {
    const log = `
! LaTeX Error: File \`tcolorbox.sty' not found.
Latexmk: Missing input file 'algorithm2e.sty' (or dependence on it)
! I can't find file \`customfig.tex'.
! Font \\TU/lmr/m/n/10=ecrm1000 at 10.0pt not loadable: Metric (TFM) file not found.
`;
    const missing = extractMissingFilesFromLog(log, '');
    expect(missing).toContain('tcolorbox.sty');
    expect(missing).toContain('algorithm2e.sty');
    expect(missing).toContain('customfig.tex');
    expect(missing).toContain('ecrm1000.tfm');
  });

  it('infers package candidates from missing file names', () => {
    expect(inferPackageCandidates('tikz.sty')).toContain('pgf');
    expect(inferPackageCandidates('algorithm2e.sty')).toContain('algorithm2e');
    expect(inferPackageCandidates('algorithmic.sty')).toContain('algorithms');
    expect(inferPackageCandidates('ecrm1000.tfm')).toContain('ec');
    expect(inferPackageCandidates('lmroman10-regular.otf')).toContain('lmroman10-regular');
    expect(inferPackageCandidates('mystyle.sty')).toContain('mystyle');
  });

  it('prevents path traversal outside base directory', () => {
    const baseDir = '/tmp/test-torque';
    expect(() => safeResolvePath(baseDir, '../../etc/passwd')).toThrow(/path traversal/i);
  });

  it('detects native TeX Live installation', () => {
    const env = detectTexLiveEnvironment();
    expect(typeof env.available).toBe('boolean');
    expect(typeof env.latexmk).toBe('boolean');
  });

  it('compiles a real document natively if latexmk is available', () => {
    const env = detectTexLiveEnvironment();
    if (!env.latexmk || !env.pdflatex) {
      // Skip if environment doesn't have tools
      return;
    }

    const testDir = path.join(os.tmpdir(), `torque-unit-test-${Date.now()}`);
    const result = compileLatexNative({
      projectId: 'unit-test',
      buildDir: testDir,
      files: [
        {
          path: 'main.tex',
          content: `
\\documentclass{article}
\\begin{document}
Torque Native TeX Live Test Document
\\end{document}
`,
          isBinary: false,
        },
      ],
      entry: 'main.tex',
      engine: 'pdflatex',
      synctex: true,
    });

    expect(result.status).toBe('spotless');
    expect(result.pdf).not.toBeNull();
    expect(typeof result.pdf).toBe('string');
    expect(result.pdf!.length).toBeGreaterThan(100);
    expect(result.diagnostics).toHaveLength(0);

    // Clean up test directory
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });
});
