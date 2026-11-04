import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import type { Diagnostic } from '../types/workspace';
import type { TexLiveEnvironment } from './compilerDriver';

export interface ServerCompileRequest {
  projectId?: string;
  files:
    | Array<{ path: string; content: string; isBinary?: boolean }>
    | Record<string, string | Uint8Array | { content: string; isBinary?: boolean }>;
  entry: string;
  engine?: 'pdflatex' | 'xelatex' | 'lualatex';
  synctex?: boolean;
  buildDir?: string;
}

export interface ServerCompileResult {
  status: 'spotless' | 'warnings' | 'errors' | 'failed';
  pdf: string | null;
  synctex: string | null;
  diagnostics: Diagnostic[];
  missing_files: string[];
  missingFiles: string[];
  resolved_packages: string[];
  resolvedPackages: string[];
  duration_ms: number;
  durationMs: number;
  stdout: string;
  stderr: string;
}

export function checkBinaryAvailable(cmd: string): boolean {
  try {
    const checkArg = cmd === 'latexmk' ? '-v' : '--version';
    const res = spawnSync(cmd, [checkArg], { stdio: 'ignore', timeout: 3000 });
    return res.status === 0;
  } catch {
    return false;
  }
}

export function getTexLiveVersionString(): string | null {
  try {
    const res = spawnSync('pdflatex', ['--version'], { encoding: 'utf-8', timeout: 3000 });
    if (res.status === 0 && res.stdout) {
      const firstLine = res.stdout.split('\n')[0]?.trim();
      return firstLine || null;
    }
  } catch {
    // Ignore error
  }
  return null;
}

export function detectTexLiveEnvironment(): TexLiveEnvironment {
  const latexmk = checkBinaryAvailable('latexmk');
  const pdflatex = checkBinaryAvailable('pdflatex');
  const xelatex = checkBinaryAvailable('xelatex');
  const lualatex = checkBinaryAvailable('lualatex');
  const texhash = checkBinaryAvailable('texhash') || checkBinaryAvailable('mktexlsr');
  const synctex = checkBinaryAvailable('synctex');

  const available = latexmk && (pdflatex || xelatex || lualatex);
  const version = getTexLiveVersionString();

  return {
    available,
    latexmk,
    pdflatex,
    xelatex,
    lualatex,
    texhash,
    synctex,
    version,
  };
}

export function parseDiagnosticsFromLog(
  logContent: string,
  stdoutErr: string,
  defaultFile: string
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();

  const combined = `${logContent}\n${stdoutErr}`;
  const lines = combined.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    // 1. file-line-error format: "path/file.tex:123: message"
    const firstColon = line.indexOf(':');
    if (firstColon > 0) {
      const filePart = line.slice(0, firstColon);
      const afterFirst = line.slice(firstColon + 1);
      const secondColon = afterFirst.indexOf(':');
      if (secondColon > 0) {
        const lineStr = afterFirst.slice(0, secondColon);
        const msgPart = afterFirst.slice(secondColon + 1).trim();
        const lineNum = parseInt(lineStr, 10);

        if (!isNaN(lineNum) && filePart && !filePart.includes(' ')) {
          const cleanFile = filePart.replace(/^\.\//, '');
          const isWarning = msgPart.toLowerCase().includes('warning');
          const severity: Diagnostic['severity'] = isWarning ? 'warning' : 'error';

          const key = `${severity}:${cleanFile}:${lineNum}:${msgPart}`;
          if (!seen.has(key)) {
            seen.add(key);
            diagnostics.push({
              severity,
              file: cleanFile,
              line: lineNum,
              message: msgPart,
            });
          }
          i++;
          continue;
        }
      }
    }

    // 2. "! LaTeX Error: ..."
    if (line.startsWith('!')) {
      const errMsg = line.replace(/^!\s*/, '').trim();
      let lineNum: number | undefined;

      // Look ahead for "l.<number>"
      let lookahead = i + 1;
      while (lookahead < lines.length && lookahead <= i + 6) {
        const nextLine = lines[lookahead].trim();
        if (nextLine.startsWith('l.')) {
          const numMatch = nextLine.slice(2).match(/^\d+/);
          if (numMatch) {
            lineNum = parseInt(numMatch[0], 10);
            break;
          }
        }
        lookahead++;
      }

      const key = `error:${defaultFile}:${lineNum ?? 'none'}:${errMsg}`;
      if (!seen.has(key)) {
        seen.add(key);
        diagnostics.push({
          severity: 'error',
          file: defaultFile,
          line: lineNum,
          message: errMsg,
        });
      }
      i++;
      continue;
    }

    // 3. "LaTeX Warning: ... on input line 123."
    if (
      line.startsWith('LaTeX Warning:') ||
      line.startsWith('LaTeX Font Warning:') ||
      (line.startsWith('Package ') && line.includes('Warning:'))
    ) {
      let lineNum: number | undefined;
      const onLineMatch = line.match(/on input line\s+(\d+)/);
      if (onLineMatch) {
        lineNum = parseInt(onLineMatch[1], 10);
      }

      const key = `warning:${defaultFile}:${lineNum ?? 'none'}:${line}`;
      if (!seen.has(key)) {
        seen.add(key);
        diagnostics.push({
          severity: 'warning',
          file: defaultFile,
          line: lineNum,
          message: line,
        });
      }
      i++;
      continue;
    }

    i++;
  }

  return diagnostics;
}

export function extractMissingFilesFromLog(logContent: string, stdoutErr: string): string[] {
  const missing: string[] = [];
  const seen = new Set<string>();

  const combined = `${logContent}\n${stdoutErr}`;
  const lines = combined.split('\n');

  for (const line of lines) {
    // Pattern 1: ! LaTeX Error: File `foo.sty' not found.
    const pattern1 = line.indexOf('! LaTeX Error: File ');
    if (pattern1 >= 0) {
      const rem = line.slice(pattern1 + '! LaTeX Error: File '.length);
      const notFoundIdx = rem.indexOf('not found');
      if (notFoundIdx >= 0) {
        const candidate = rem
          .slice(0, notFoundIdx)
          .trim()
          .replace(/^[`'"]+|[`'".\s]+$/g, '');
        if (candidate && !seen.has(candidate)) {
          seen.add(candidate);
          missing.push(candidate);
        }
      }
    }

    // Pattern 2: Latexmk: Missing input file 'foo.sty'
    const pattern2 = line.indexOf('Latexmk: Missing input file ');
    if (pattern2 >= 0) {
      const rem = line.slice(pattern2 + 'Latexmk: Missing input file '.length);
      const candidate = rem
        .trim()
        .replace(/^[`'"]+|[`'".\s]+$/g, '')
        .split(/\s+/)[0]
        .replace(/^[`'"]+|[`'".\s]+$/g, '');
      if (candidate && !seen.has(candidate)) {
        seen.add(candidate);
        missing.push(candidate);
      }
    }

    // Pattern 3: ! I can't find file `foo.tex'.
    const pattern3 = line.indexOf("! I can't find file ");
    if (pattern3 >= 0) {
      const rem = line.slice(pattern3 + "! I can't find file ".length);
      const candidate = rem
        .trim()
        .replace(/^[`'"]+|[`'".\s]+$/g, '')
        .split(/\s+/)[0]
        .replace(/^[`'"]+|[`'".\s]+$/g, '');
      if (candidate && !seen.has(candidate)) {
        seen.add(candidate);
        missing.push(candidate);
      }
    }

    // Pattern 4: ! Font ... not loadable: Metric (TFM) file not found
    if (line.includes('! Font ') && line.includes('not loadable: Metric (TFM) file not found')) {
      const eqPos = line.indexOf('=');
      if (eqPos >= 0) {
        const rest = line.slice(eqPos + 1);
        const atPos = rest.indexOf(' at ');
        if (atPos >= 0) {
          const fontName = rest.slice(0, atPos).trim();
          const fontFile = `${fontName}.tfm`;
          if (!seen.has(fontFile)) {
            seen.add(fontFile);
            missing.push(fontFile);
          }
        }
      }
    }
  }

  return missing;
}

export function inferPackageCandidates(filename: string): string[] {
  const clean = filename.trim();
  if (!clean) return [];

  const candidates: string[] = [];
  const lower = clean.toLowerCase();

  switch (lower) {
    case 'tikz.sty':
    case 'pgf.sty':
    case 'pgfcore.sty':
    case 'pgfmath.sty':
    case 'pgfsys.sty':
      candidates.push('pgf');
      break;
    case 'fontawesome5.sty':
    case 'fontawesome5-utex-helper.sty':
      candidates.push('fontawesome5', 'fontawesome');
      break;
    case 'algorithm2e.sty':
      candidates.push('algorithm2e');
      break;
    case 'algorithmicx.sty':
    case 'algpseudocode.sty':
    case 'algcompatible.sty':
    case 'algpascal.sty':
    case 'algc.sty':
      candidates.push('algorithmicx');
      break;
    case 'algorithmic.sty':
      candidates.push('algorithms', 'algorithmicx');
      break;
    case 'beamerthememetropolis.sty':
      candidates.push('beamertheme-metropolis', 'moloch', 'beamer');
      break;
    case 'beamerthememoloch.sty':
      candidates.push('moloch', 'beamer');
      break;
    case 'mathtools.sty':
      candidates.push('mathtools');
      break;
    default:
      if (lower.endsWith('.tfm') && (lower.startsWith('ec') || lower.startsWith('tc'))) {
        candidates.push('ec');
      } else if (lower.endsWith('.tfm') && lower.startsWith('lm')) {
        candidates.push('lm');
      }
      break;
  }

  const extensions = [
    '.code.tex',
    '.sty',
    '.cls',
    '.def',
    '.fd',
    '.tfm',
    '.pfb',
    '.otf',
    '.ttf',
    '.cfg',
    '.lua',
    '.bbx',
    '.cbx',
    '.lbx',
    '.tex',
  ];

  let stripped = clean;
  for (const ext of extensions) {
    if (stripped.toLowerCase().endsWith(ext)) {
      stripped = stripped.slice(0, stripped.length - ext.length);
      break;
    }
  }

  const strippedLower = stripped.toLowerCase();
  if (strippedLower && !candidates.includes(strippedLower)) {
    candidates.push(strippedLower);
  }

  return candidates;
}

export function safeResolvePath(baseDir: string, relativePath: string): string {
  const resolvedBase = path.resolve(baseDir);
  const target = path.resolve(resolvedBase, relativePath);
  if (!target.startsWith(resolvedBase + path.sep) && target !== resolvedBase) {
    throw new Error(`Path traversal denied: ${relativePath}`);
  }
  return target;
}

export function tryResolveMissingPackage(pkgName: string, destDir: string): boolean {
  // In server environments, try downloading package from CTAN mirror
  const urls = [
    `https://mirrors.ctan.org/systems/texlive/tlnet/archive/${pkgName}.tar.xz`,
    `https://mirrors.ctan.org/macros/latex/contrib/${pkgName}.zip`,
    `https://mirrors.ctan.org/macros/latex/contrib/${pkgName}/${pkgName}.sty`,
  ];

  for (const url of urls) {
    try {
      const res = spawnSync('curl', ['-f', '-s', '-S', '-L', '--max-time', '15', '-o', path.join(destDir, path.basename(url)), url], {
        timeout: 20000,
      });
      if (res.status === 0) {
        const downloadedFile = path.join(destDir, path.basename(url));
        if (fs.existsSync(downloadedFile) && fs.statSync(downloadedFile).size > 0) {
          // If zip or tar.xz, extract it
          if (downloadedFile.endsWith('.zip')) {
            spawnSync('unzip', ['-q', '-o', downloadedFile, '-d', destDir], { timeout: 10000 });
          } else if (downloadedFile.endsWith('.tar.xz')) {
            spawnSync('tar', ['-xf', downloadedFile, '-C', destDir], { timeout: 10000 });
          }
          return true;
        }
      }
    } catch {
      // Continue trying next URL
    }
  }
  return false;
}

export function compileLatexNative(request: ServerCompileRequest): ServerCompileResult {
  const startTime = Date.now();
  const projectId = request.projectId || 'torque-project';

  // 1. Resolve build directory
  const buildDir = request.buildDir
    ? path.resolve(request.buildDir)
    : path.join(os.tmpdir(), 'torque-builds', `${projectId}-${Date.now()}`);

  fs.mkdirSync(buildDir, { recursive: true });

  // 2. Normalize and write files
  const fileEntries: Array<{ path: string; content: string; isBinary: boolean }> = [];
  if (Array.isArray(request.files)) {
    for (const f of request.files) {
      fileEntries.push({
        path: f.path,
        content: f.content,
        isBinary: Boolean(f.isBinary),
      });
    }
  } else if (request.files && typeof request.files === 'object') {
    for (const [p, val] of Object.entries(request.files)) {
      if (val instanceof Uint8Array) {
        fileEntries.push({
          path: p,
          content: Buffer.from(val).toString('base64'),
          isBinary: true,
        });
      } else if (typeof val === 'string') {
        fileEntries.push({
          path: p,
          content: val,
          isBinary: false,
        });
      } else if (val && typeof val === 'object' && 'content' in val) {
        fileEntries.push({
          path: p,
          content: String(val.content),
          isBinary: Boolean(val.isBinary),
        });
      }
    }
  }

  for (const file of fileEntries) {
    const targetPath = safeResolvePath(buildDir, file.path);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });

    if (file.isBinary) {
      fs.writeFileSync(targetPath, Buffer.from(file.content, 'base64'));
    } else {
      fs.writeFileSync(targetPath, file.content, 'utf-8');
    }
  }

  const cleanEntry = path.normalize(request.entry).replace(/^(\.\.(\/|\\|$))+/, '');
  const entryPath = path.resolve(buildDir, cleanEntry);
  if (!fs.existsSync(entryPath)) {
    return {
      status: 'failed',
      pdf: null,
      synctex: null,
      diagnostics: [
        {
          severity: 'error',
          file: cleanEntry,
          message: `Entry file '${cleanEntry}' not found in project`,
        },
      ],
      missing_files: [],
      missingFiles: [],
      resolved_packages: [],
      resolvedPackages: [],
      duration_ms: Date.now() - startTime,
      durationMs: Date.now() - startTime,
      stdout: '',
      stderr: `Entry file '${cleanEntry}' does not exist`,
    };
  }

  const stem = path.basename(cleanEntry, path.extname(cleanEntry)) || 'document';
  const chosenEngine = (request.engine || 'pdflatex').toLowerCase();
  const engineFlag = chosenEngine === 'xelatex' ? '-xelatex' : chosenEngine === 'lualatex' ? '-lualatex' : '-pdf';
  const synctexFlag = request.synctex !== false ? '-synctex=1' : '-synctex=0';

  let resolvedPackages: string[] = [];
  let allStdout = '';
  let allStderr = '';
  let missingFiles: string[] = [];

  const maxPasses = 5;
  for (let pass = 0; pass < maxPasses; pass++) {
    const args = [
      engineFlag,
      synctexFlag,
      '-interaction=nonstopmode',
      '-file-line-error',
      cleanEntry,
    ];

    const env = {
      ...process.env,
      TEXINPUTS: `.:${buildDir}//:${process.env.TEXINPUTS || ''}`,
    };

    const res = spawnSync('latexmk', args, {
      cwd: buildDir,
      env,
      encoding: 'utf-8',
      timeout: 60000,
    });

    const stdout = res.stdout || '';
    const stderr = res.stderr || '';
    allStdout = stdout;
    allStderr = stderr;

    const logPath = path.join(buildDir, `${stem}.log`);
    const logContent = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf-8') : '';

    const currentMissing = extractMissingFilesFromLog(logContent, `${stdout}\n${stderr}`);
    missingFiles = currentMissing;

    if (currentMissing.length === 0) {
      break;
    }

    let newlyResolved = 0;
    for (const missingFile of currentMissing) {
      const candidates = inferPackageCandidates(missingFile);
      for (const candidate of candidates) {
        if (!resolvedPackages.includes(candidate)) {
          const success = tryResolveMissingPackage(candidate, buildDir);
          if (success) {
            resolvedPackages.push(candidate);
            newlyResolved++;
            break;
          }
        }
      }
    }

    if (newlyResolved === 0) {
      break;
    }
  }

  const pdfPath = path.join(buildDir, `${stem}.pdf`);
  const synctexPathGz = path.join(buildDir, `${stem}.synctex.gz`);
  const synctexPathPlain = path.join(buildDir, `${stem}.synctex`);
  const logPath = path.join(buildDir, `${stem}.log`);
  const logContent = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf-8') : '';

  let pdfBase64: string | null = null;
  if (fs.existsSync(pdfPath)) {
    const pdfBuf = fs.readFileSync(pdfPath);
    if (pdfBuf.length >= 4 && pdfBuf.subarray(0, 4).toString() === '%PDF') {
      pdfBase64 = pdfBuf.toString('base64');
    }
  }

  let synctexBase64: string | null = null;
  if (fs.existsSync(synctexPathGz)) {
    synctexBase64 = fs.readFileSync(synctexPathGz).toString('base64');
  } else if (fs.existsSync(synctexPathPlain)) {
    synctexBase64 = fs.readFileSync(synctexPathPlain).toString('base64');
  }

  const diagnostics = parseDiagnosticsFromLog(logContent, `${allStdout}\n${allStderr}`, cleanEntry);
  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;

  let status: ServerCompileResult['status'] = 'failed';
  if (pdfBase64) {
    if (errorCount === 0) {
      status = warningCount > 0 ? 'warnings' : 'spotless';
    } else {
      status = 'errors';
    }
  } else {
    status = 'failed';
  }

  const durationMs = Date.now() - startTime;

  return {
    status,
    pdf: pdfBase64,
    synctex: synctexBase64,
    diagnostics,
    missing_files: missingFiles,
    missingFiles,
    resolved_packages: resolvedPackages,
    resolvedPackages,
    duration_ms: durationMs,
    durationMs,
    stdout: allStdout,
    stderr: allStderr,
  };
}
