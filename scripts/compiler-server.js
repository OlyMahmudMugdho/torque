#!/usr/bin/env node

/**
 * Standalone TeX Live Compilation Server for Torque IDE
 *
 * Runs a standalone lightweight HTTP server with native latexmk / pdflatex / xelatex / lualatex
 * execution, SyncTeX generation, CTAN package auto-resolution, and embedded Model Context Protocol (MCP) server.
 *
 * Usage:
 *   node scripts/compiler-server.js
 *   PORT=8080 node scripts/compiler-server.js
 */

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

export const MCP_PROTOCOL_VERSION = '2024-11-05';
export const SERVER_NAME = 'torque-latex-ide';
export const SERVER_VERSION = '0.2.2';
export const DEFAULT_MCP_PORT = 3030;
export const FALLBACK_MCP_PORT = 3031;

/** Discover common TeX install dirs (macOS texbin, TeX Live, MiKTeX) and prepend them to PATH. */
export function ensureTexPath() {
  const dirs = [];
  const exists = (d) => { try { return fs.statSync(d).isDirectory(); } catch { return false; } };
  const listDirs = (base) => { try { return fs.readdirSync(base).map((n) => path.join(base, n)); } catch { return []; } };
  if (process.platform === 'win32') {
    if (process.env.LOCALAPPDATA) dirs.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'MiKTeX', 'miktex', 'bin', 'x64'));
    dirs.push('C:\\Program Files\\MiKTeX\\miktex\\bin\\x64');
    for (const y of listDirs('C:\\texlive')) dirs.push(path.join(y, 'bin', 'windows'), path.join(y, 'bin', 'win64'));
  } else {
    dirs.push('/Library/TeX/texbin', '/opt/homebrew/bin', '/usr/local/bin');
    for (const y of listDirs('/usr/local/texlive')) for (const a of listDirs(path.join(y, 'bin'))) dirs.push(a);
  }
  const sep = path.delimiter;
  const current = (process.env.PATH || '').split(sep);
  const add = dirs.filter((d, i) => exists(d) && !current.includes(d) && dirs.indexOf(d) === i);
  if (add.length) process.env.PATH = [...add, ...current].filter(Boolean).join(sep);
}

/** Pure requirement check; returns list of missing requirements for the chosen engine. */
export function computeMissingRequirements(env, engine) {
  const missing = [];
  if (!env.latexmk) missing.push('latexmk');
  if (!(env.pdflatex || env.xelatex || env.lualatex)) {
    missing.push('a TeX engine (pdflatex, xelatex or lualatex)');
  } else if (!env[engine === 'xelatex' || engine === 'lualatex' ? engine : 'pdflatex']) {
    missing.push(engine === 'xelatex' || engine === 'lualatex' ? engine : 'pdflatex');
  }
  return missing;
}

export function missingRequirementsMessage(missing) {
  return `TeX Live is not fully installed. Missing: ${missing.join(', ')}. Setup: install TeX Live (or MiKTeX on Windows) with latexmk and make sure it is on your PATH, then re-check.`;
}

export function checkBinaryAvailable(cmd) {
  ensureTexPath();
  try {
    const checkArg = cmd === 'latexmk' ? '-v' : '--version';
    const res = spawnSync(cmd, [checkArg], { stdio: 'ignore', timeout: 3000 });
    return res.status === 0;
  } catch {
    return false;
  }
}

export function getTexLiveVersionString() {
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

export function detectEnvironment() {
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

export function parseDiagnosticsFromLog(logContent, stdoutErr, defaultFile) {
  const diagnostics = [];
  const seen = new Set();

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
          const severity = isWarning ? 'warning' : 'error';

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
      let lineNum = undefined;

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
      let lineNum = undefined;
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

export function extractMissingFilesFromLog(logContent, stdoutErr) {
  const missing = [];
  const seen = new Set();

  const combined = `${logContent}\n${stdoutErr}`;
  const lines = combined.split('\n');

  for (const line of lines) {
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

export function inferPackageCandidates(filename) {
  const clean = filename.trim();
  if (!clean) return [];

  const candidates = [];
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

export function safeResolvePath(baseDir, relativePath) {
  const resolvedBase = path.resolve(baseDir);
  const target = path.resolve(resolvedBase, relativePath);
  if (!target.startsWith(resolvedBase + path.sep) && target !== resolvedBase) {
    throw new Error(`Path traversal denied: ${relativePath}`);
  }
  return target;
}

export function tryResolveMissingPackage(pkgName, destDir) {
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
          if (downloadedFile.endsWith('.zip')) {
            spawnSync('unzip', ['-q', '-o', downloadedFile, '-d', destDir], { timeout: 10000 });
          } else if (downloadedFile.endsWith('.tar.xz')) {
            spawnSync('tar', ['-xf', downloadedFile, '-C', destDir], { timeout: 10000 });
          }
          return true;
        }
      }
    } catch {
      // Continue trying
    }
  }
  return false;
}

export function compileProject(request) {
  const startTime = Date.now();
  const projectId = request.projectId || 'torque-project';

  const buildDir = request.buildDir
    ? path.resolve(request.buildDir)
    : path.join(os.tmpdir(), 'torque-builds', `${projectId}-${Date.now()}`);

  fs.mkdirSync(buildDir, { recursive: true });

  const fileEntries = [];
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
      if (typeof val === 'string') {
        fileEntries.push({ path: p, content: val, isBinary: false });
      } else if (val && typeof val === 'object') {
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

  {
    const missing = computeMissingRequirements(
      {
        latexmk: checkBinaryAvailable('latexmk'),
        pdflatex: checkBinaryAvailable('pdflatex'),
        xelatex: checkBinaryAvailable('xelatex'),
        lualatex: checkBinaryAvailable('lualatex'),
      },
      chosenEngine,
    );
    if (missing.length > 0) {
      const elapsed = Date.now() - startTime;
      return {
        status: 'failed',
        pdf: null,
        synctex: null,
        diagnostics: [{ severity: 'error', message: missingRequirementsMessage(missing) }],
        missing_files: [],
        missingFiles: [],
        resolved_packages: [],
        resolvedPackages: [],
        missing_requirements: missing,
        missingRequirements: missing,
        duration_ms: elapsed,
        durationMs: elapsed,
        stdout: '',
        stderr: '',
      };
    }
  }

  let resolvedPackages = [];
  let allStdout = '';
  let allStderr = '';
  let missingFiles = [];

  const maxPasses = 5;
  for (let pass = 0; pass < maxPasses; pass++) {
    const args = [
      engineFlag,
      synctexFlag,
      '-interaction=nonstopmode',
      '-file-line-error',
      '-g',
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

  let pdfBase64 = null;
  if (fs.existsSync(pdfPath)) {
    const pdfBuf = fs.readFileSync(pdfPath);
    if (pdfBuf.length >= 4 && pdfBuf.subarray(0, 4).toString() === '%PDF') {
      pdfBase64 = pdfBuf.toString('base64');
    }
  }

  let synctexBase64 = null;
  if (fs.existsSync(synctexPathGz)) {
    synctexBase64 = fs.readFileSync(synctexPathGz).toString('base64');
  } else if (fs.existsSync(synctexPathPlain)) {
    synctexBase64 = fs.readFileSync(synctexPathPlain).toString('base64');
  }

  const diagnostics = parseDiagnosticsFromLog(logContent, `${allStdout}\n${allStderr}`, cleanEntry);
  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;

  let status = 'failed';
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

// ---------------------------------------------------------------------------
// Model Context Protocol (MCP) Subsystem & Tools
// ---------------------------------------------------------------------------

export class McpState {
  constructor(options = {}) {
    this.projectsDir = options.projectsDir || process.env.TORQUE_PROJECTS_DIR || path.join(os.homedir(), '.torque', 'projects');
    this.activeProjectId = options.activeProjectId || null;
    this.latestDiagnostics = new Map();
    this.sseSessions = new Map();
  }

  getProjectsDir() {
    if (!fs.existsSync(this.projectsDir)) {
      try {
        fs.mkdirSync(this.projectsDir, { recursive: true });
      } catch {
        // ignore
      }
    }
    return this.projectsDir;
  }

  setActiveProjectId(id) {
    this.activeProjectId = id ? String(id).trim() : null;
  }

  getActiveProjectId() {
    return this.activeProjectId;
  }
}

export const defaultMcpState = new McpState();

export function setProjectsDir(dir) {
  defaultMcpState.projectsDir = dir;
}

export function setActiveProject(id) {
  defaultMcpState.setActiveProjectId(id);
}

export function normalizePath(rawPath) {
  const trimmed = (rawPath || '').trim();
  if (!trimmed) {
    throw new Error('Path cannot be empty');
  }
  const normalized = trimmed.replace(/\\/g, '/');
  const segments = normalized.split('/').filter((s) => s && s !== '.');

  for (const seg of segments) {
    if (seg === '..') {
      throw new Error(`Parent traversal not allowed in path: ${rawPath}`);
    }
  }

  if (segments.length === 0) {
    throw new Error(`Invalid path resulted in empty path: ${rawPath}`);
  }

  return segments.join('/');
}

export function isBinaryFile(filePath, bytes) {
  const lower = (filePath || '').toLowerCase();
  const binaryExtensions = [
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp',
    '.pdf', '.zip', '.tar', '.gz', '.7z',
    '.woff', '.woff2', '.ttf', '.otf', '.eot',
    '.mp3', '.mp4', '.wav', '.bin',
  ];
  if (binaryExtensions.some((ext) => lower.endsWith(ext))) {
    return true;
  }
  if (!bytes) return false;
  const checkLen = Math.min(bytes.length, 8000);
  for (let i = 0; i < checkLen; i++) {
    if (bytes[i] === 0) return true;
  }
  return false;
}

export function sliceLines(content, startLine, endLine) {
  if (typeof content !== 'string') content = '';
  const lines = content === '' ? [] : content.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '' && (content.endsWith('\n') || content.endsWith('\r\n'))) {
    lines.pop();
  }

  const totalLines = lines.length;

  if (totalLines === 0) {
    const isSliced = (startLine !== null && startLine !== undefined) || (endLine !== null && endLine !== undefined);
    return {
      content: '',
      totalLines: 0,
      startLine: 1,
      endLine: 0,
      isSliced,
    };
  }

  if ((startLine === null || startLine === undefined) && (endLine === null || endLine === undefined)) {
    return {
      content,
      totalLines,
      startLine: 1,
      endLine: totalLines,
      isSliced: false,
    };
  }

  const rawStart = (startLine !== null && startLine !== undefined) ? Number(startLine) : 1;
  const rawEnd = (endLine !== null && endLine !== undefined) ? Number(endLine) : totalLines;

  const clampedStart = Math.max(1, rawStart);
  const clampedEnd = Math.min(totalLines, rawEnd);

  if (clampedStart > clampedEnd || clampedStart > totalLines || clampedEnd < 1) {
    const finalStart = Math.max(1, Math.min(totalLines, clampedStart));
    const finalEnd = Math.max(0, Math.min(totalLines, clampedEnd));
    return {
      content: '',
      totalLines,
      startLine: finalStart,
      endLine: finalEnd,
      isSliced: true,
    };
  }

  const startIdx = clampedStart - 1;
  const endIdx = clampedEnd;

  const sliced = lines.slice(startIdx, endIdx).join('\n');
  return {
    content: sliced,
    totalLines,
    startLine: clampedStart,
    endLine: clampedEnd,
    isSliced: true,
  };
}

function listProjectsFromDir(projectsDir) {
  const projects = [];
  if (!fs.existsSync(projectsDir)) return projects;

  const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const projJsonPath = path.join(projectsDir, entry.name, 'project.json');
      if (fs.existsSync(projJsonPath)) {
        try {
          const data = fs.readFileSync(projJsonPath, 'utf-8');
          const project = JSON.parse(data);
          projects.push(project);
        } catch {
          // Ignore corrupt project.json
        }
      }
    }
  }

  projects.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return projects;
}

function resolveProjectId(state, requestedId) {
  if (requestedId && typeof requestedId === 'string' && requestedId.trim()) {
    const clean = requestedId.trim();
    state.setActiveProjectId(clean);
    return clean;
  }

  const activeId = state.getActiveProjectId();
  if (activeId) return activeId;

  const projectsDir = state.getProjectsDir();
  const projects = listProjectsFromDir(projectsDir);
  if (projects.length > 0) {
    state.setActiveProjectId(projects[0].id);
    return projects[0].id;
  }

  const err = new Error('No projects found. Create or open a project first.');
  err.code = -32602;
  throw err;
}

export function handleToolCreateProject(state, args = {}) {
  const rawName = args.name;
  if (!rawName || typeof rawName !== 'string' || !rawName.trim()) {
    const err = new Error("Missing required argument 'name'");
    err.code = -32602;
    throw err;
  }
  const name = rawName.trim();

  const rawRoot = args.rootEntry && typeof args.rootEntry === 'string' ? args.rootEntry.trim() : '';
  let rootEntry = 'main.tex';
  if (rawRoot) {
    try {
      rootEntry = normalizePath(rawRoot);
    } catch (e) {
      const err = new Error(`Invalid rootEntry: ${e.message}`);
      err.code = -32602;
      throw err;
    }
  }

  const defaultContent = `\\documentclass{article}
\\usepackage{amsmath}

\\title{${name}}
\\author{}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Introduction}
Welcome to your LaTeX document!

\\end{document}
`;

  const content = typeof args.content === 'string' ? args.content : defaultContent;
  const projectId = crypto.randomUUID();
  const now = Date.now();

  const projectsDir = state.getProjectsDir();
  const projectDir = path.join(projectsDir, projectId);
  const filePath = path.join(projectDir, 'files', rootEntry);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.from(content, 'utf-8'));

  const project = {
    id: projectId,
    name,
    rootEntry,
    createdAt: now,
    updatedAt: now,
  };

  const projJsonPath = path.join(projectDir, 'project.json');
  fs.writeFileSync(projJsonPath, JSON.stringify(project, null, 2), 'utf-8');

  state.setActiveProjectId(projectId);

  return {
    id: project.id,
    name: project.name,
    rootEntry: project.rootEntry,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

export function handleToolListProjects(state) {
  const projectsDir = state.getProjectsDir();
  const projects = listProjectsFromDir(projectsDir);
  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    rootEntry: p.rootEntry || 'main.tex',
    createdAt: p.createdAt || 0,
    updatedAt: p.updatedAt || 0,
  }));
}

export function handleToolGetActiveProject(state) {
  const projectId = resolveProjectId(state);
  const projectsDir = state.getProjectsDir();
  const projectDir = path.join(projectsDir, projectId);

  if (!fs.existsSync(projectDir)) {
    const err = new Error(`Active project '${projectId}' does not exist on disk`);
    err.code = -32602;
    throw err;
  }

  const projJsonPath = path.join(projectDir, 'project.json');
  if (!fs.existsSync(projJsonPath)) {
    const err = new Error(`project.json missing in project '${projectId}'`);
    err.code = -32602;
    throw err;
  }

  let project;
  try {
    project = JSON.parse(fs.readFileSync(projJsonPath, 'utf-8'));
  } catch (e) {
    const err = new Error(`Corrupt project.json: ${e.message}`);
    err.code = -32603;
    throw err;
  }

  const filesDir = path.join(projectDir, 'files');
  const filesManifest = [];

  if (fs.existsSync(filesDir)) {
    function collectManifest(currentDir) {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          collectManifest(fullPath);
        } else if (entry.isFile()) {
          const relPath = path.relative(filesDir, fullPath).replace(/\\/g, '/');
          const bytes = fs.readFileSync(fullPath);
          const stat = fs.statSync(fullPath);
          const binary = isBinaryFile(relPath, bytes);
          filesManifest.push({
            path: relPath,
            isBinary: binary,
            updatedAt: Math.floor(stat.mtimeMs),
          });
        }
      }
    }
    collectManifest(filesDir);
    filesManifest.sort((a, b) => a.path.localeCompare(b.path));
  }

  return {
    id: project.id,
    name: project.name,
    rootEntry: project.rootEntry || 'main.tex',
    createdAt: project.createdAt || 0,
    updatedAt: project.updatedAt || 0,
    files: filesManifest,
  };
}

export function handleToolReadFile(state, args = {}) {
  const rawPath = args.path;
  if (!rawPath || typeof rawPath !== 'string') {
    const err = new Error("Missing required argument 'path'");
    err.code = -32602;
    throw err;
  }

  let cleanPath;
  try {
    cleanPath = normalizePath(rawPath);
  } catch (e) {
    const err = new Error(`Invalid path: ${e.message}`);
    err.code = -32602;
    throw err;
  }

  const projectId = resolveProjectId(state, args.projectId);
  const projectsDir = state.getProjectsDir();
  const filePath = path.join(projectsDir, projectId, 'files', cleanPath);

  if (!fs.existsSync(filePath)) {
    const err = new Error(`File not found: ${rawPath}`);
    err.code = -32602;
    throw err;
  }

  const bytes = fs.readFileSync(filePath);
  if (isBinaryFile(cleanPath, bytes)) {
    const err = new Error(`Cannot read binary file as text: ${rawPath}`);
    err.code = -32602;
    throw err;
  }

  const content = bytes.toString('utf-8');
  const sliced = sliceLines(content, args.startLine, args.endLine);

  return {
    content: sliced.content,
    totalLines: sliced.totalLines,
    startLine: sliced.startLine,
    endLine: sliced.endLine,
    isSliced: sliced.isSliced,
  };
}

export function handleToolWriteFile(state, args = {}) {
  const rawPath = args.path;
  if (!rawPath || typeof rawPath !== 'string') {
    const err = new Error("Missing required argument 'path'");
    err.code = -32602;
    throw err;
  }

  const content = args.content;
  if (content === undefined || content === null) {
    const err = new Error("Missing required argument 'content'");
    err.code = -32602;
    throw err;
  }

  let cleanPath;
  try {
    cleanPath = normalizePath(rawPath);
  } catch (e) {
    const err = new Error(`Invalid path: ${e.message}`);
    err.code = -32602;
    throw err;
  }

  const projectId = resolveProjectId(state, args.projectId);
  const projectsDir = state.getProjectsDir();
  const projectDir = path.join(projectsDir, projectId);
  const filePath = path.join(projectDir, 'files', cleanPath);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const buf = Buffer.from(String(content), 'utf-8');
  fs.writeFileSync(filePath, buf);

  // Update project updatedAt or auto-generate project.json
  const now = Date.now();
  const projJsonPath = path.join(projectDir, 'project.json');
  if (fs.existsSync(projJsonPath)) {
    try {
      const proj = JSON.parse(fs.readFileSync(projJsonPath, 'utf-8'));
      proj.updatedAt = now;
      fs.writeFileSync(projJsonPath, JSON.stringify(proj, null, 2), 'utf-8');
    } catch {
      // Ignore
    }
  } else {
    const rootEntry = cleanPath.endsWith('.tex') ? cleanPath : 'main.tex';
    const project = {
      id: projectId,
      name: projectId,
      rootEntry,
      createdAt: now,
      updatedAt: now,
    };
    try {
      fs.writeFileSync(projJsonPath, JSON.stringify(project, null, 2), 'utf-8');
    } catch {
      // Ignore
    }
  }

  return {
    success: true,
    path: cleanPath,
    bytesWritten: buf.length,
  };
}

export function handleToolEditFile(state, args = {}) {
  const rawPath = args.path;
  if (!rawPath || typeof rawPath !== 'string') {
    const err = new Error("Missing required argument 'path'");
    err.code = -32602;
    throw err;
  }

  const target = args.target !== undefined ? args.target : args.search;
  if (target === undefined || target === null || typeof target !== 'string' || target.length === 0) {
    const err = new Error("Argument 'target' cannot be empty");
    err.code = -32602;
    throw err;
  }

  const replacement = args.replacement !== undefined ? args.replacement : args.replace;
  if (replacement === undefined || replacement === null) {
    const err = new Error("Missing required argument 'replacement'");
    err.code = -32602;
    throw err;
  }

  let cleanPath;
  try {
    cleanPath = normalizePath(rawPath);
  } catch (e) {
    const err = new Error(`Invalid path: ${e.message}`);
    err.code = -32602;
    throw err;
  }

  const projectId = resolveProjectId(state, args.projectId);
  const projectsDir = state.getProjectsDir();
  const projectDir = path.join(projectsDir, projectId);
  const filePath = path.join(projectDir, 'files', cleanPath);

  if (!fs.existsSync(filePath)) {
    const err = new Error(`File not found: ${rawPath}`);
    err.code = -32602;
    throw err;
  }

  const bytes = fs.readFileSync(filePath);
  if (isBinaryFile(cleanPath, bytes)) {
    const err = new Error(`Cannot edit binary file: ${rawPath}`);
    err.code = -32602;
    throw err;
  }

  const content = bytes.toString('utf-8');
  let occurrences = 0;
  let pos = 0;
  while ((pos = content.indexOf(target, pos)) !== -1) {
    occurrences++;
    pos += target.length;
  }

  if (occurrences === 0) {
    const err = new Error(`Target text not found in file: '${target}'`);
    err.code = -32602;
    throw err;
  }

  const newContent = content.replaceAll(target, String(replacement));
  fs.writeFileSync(filePath, Buffer.from(newContent, 'utf-8'));

  // Update project updatedAt
  const projJsonPath = path.join(projectDir, 'project.json');
  if (fs.existsSync(projJsonPath)) {
    try {
      const proj = JSON.parse(fs.readFileSync(projJsonPath, 'utf-8'));
      proj.updatedAt = Date.now();
      fs.writeFileSync(projJsonPath, JSON.stringify(proj, null, 2), 'utf-8');
    } catch {
      // Ignore
    }
  }

  return {
    success: true,
    path: cleanPath,
    occurrencesReplaced: occurrences,
  };
}

export function handleToolCompile(state, args = {}) {
  const projectId = resolveProjectId(state, args.projectId);
  const engine = args.engine || 'pdflatex';

  const projectsDir = state.getProjectsDir();
  const projectDir = path.join(projectsDir, projectId);

  if (!fs.existsSync(projectDir)) {
    const err = new Error(`Project '${projectId}' not found`);
    err.code = -32602;
    throw err;
  }

  const projJsonPath = path.join(projectDir, 'project.json');
  let project = { id: projectId, rootEntry: 'main.tex' };
  if (fs.existsSync(projJsonPath)) {
    try {
      project = JSON.parse(fs.readFileSync(projJsonPath, 'utf-8'));
    } catch {
      // fallback
    }
  }

  const filesDir = path.join(projectDir, 'files');
  const files = [];

  if (fs.existsSync(filesDir)) {
    function collectFiles(currentDir) {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          collectFiles(fullPath);
        } else if (entry.isFile()) {
          const relPath = path.relative(filesDir, fullPath).replace(/\\/g, '/');
          const bytes = fs.readFileSync(fullPath);
          const binary = isBinaryFile(relPath, bytes);
          files.push({
            path: relPath,
            content: binary ? bytes.toString('base64') : bytes.toString('utf-8'),
            isBinary: binary,
          });
        }
      }
    }
    collectFiles(filesDir);
  }

  const compileRes = compileProject({
    projectId,
    entry: project.rootEntry || 'main.tex',
    files,
    engine,
    synctex: true,
  });

  state.latestDiagnostics.set(projectId, {
    status: compileRes.status,
    diagnostics: compileRes.diagnostics || [],
  });

  return {
    status: compileRes.status,
    durationMs: compileRes.durationMs || compileRes.duration_ms || 0,
    diagnostics: compileRes.diagnostics || [],
    missingPackages: compileRes.missingFiles || compileRes.missing_files || [],
    pdfGenerated: Boolean(compileRes.pdf),
  };
}

export function handleToolGetDiagnostics(state, args = {}) {
  const projectId = resolveProjectId(state, args.projectId);

  if (state.latestDiagnostics.has(projectId)) {
    const cached = state.latestDiagnostics.get(projectId);
    return {
      status: cached.status,
      diagnostics: cached.diagnostics,
    };
  }

  return {
    status: 'idle',
    diagnostics: [],
  };
}

export function getToolsCatalog() {
  return {
    tools: [
      {
        name: 'torque_create_project',
        description: 'Create a new LaTeX project in Torque with a default or custom root entry document.',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the new LaTeX project',
            },
            rootEntry: {
              type: 'string',
              description: "Optional root LaTeX document path (defaults to 'main.tex')",
            },
            content: {
              type: 'string',
              description: 'Optional initial LaTeX document content for rootEntry',
            },
          },
          required: ['name'],
        },
      },
      {
        name: 'torque_list_projects',
        description: 'List all LaTeX projects available in Torque.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'torque_get_active_project',
        description: 'Get the currently active LaTeX project in Torque, including file manifest and root entry file.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'torque_read_file',
        description: 'Read full or partial text content of a file in a Torque project with optional line-range slicing.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Relative path of the file to read',
            },
            startLine: {
              type: 'integer',
              description: 'Optional 1-based start line (inclusive)',
            },
            endLine: {
              type: 'integer',
              description: 'Optional 1-based end line (inclusive)',
            },
            projectId: {
              type: 'string',
              description: 'Optional; defaults to active project',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'torque_write_file',
        description: 'Create or update a file in a Torque project. If the file is open in the Torque editor, its contents will update live.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Relative path of the file to write',
            },
            content: {
              type: 'string',
              description: 'File content to write',
            },
            projectId: {
              type: 'string',
              description: 'Optional; defaults to active project',
            },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'torque_edit_file',
        description: 'Surgically edit a specific section or block of text within a file without overwriting the entire file.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Relative path of the file to edit',
            },
            target: {
              type: 'string',
              description: 'Exact text string or block to find and replace (alias: search)',
            },
            search: {
              type: 'string',
              description: 'Alias for target: exact text string or block to find and replace',
            },
            replacement: {
              type: 'string',
              description: 'New text to substitute in place of target (alias: replace)',
            },
            replace: {
              type: 'string',
              description: 'Alias for replacement: new text to substitute in place of target',
            },
            projectId: {
              type: 'string',
              description: 'Optional; defaults to active project',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'torque_compile',
        description: 'Compile the LaTeX project using native TeX Live (latexmk) and return status and structured diagnostics.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'Optional; defaults to active project',
            },
            engine: {
              type: 'string',
              description: 'TeX engine to compile with',
              enum: ['pdflatex', 'xelatex', 'lualatex'],
            },
          },
          required: [],
        },
      },
      {
        name: 'torque_get_diagnostics',
        description: 'Retrieve the latest compilation diagnostics, warnings, and errors for the project.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'Optional; defaults to active project',
            },
          },
          required: [],
        },
      },
    ],
  };
}

export function dispatchJsonRpc(requestInput, state = defaultMcpState) {
  let req;
  if (typeof requestInput === 'string') {
    try {
      req = JSON.parse(requestInput);
    } catch {
      return {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: 'Parse error',
        },
      };
    }
  } else {
    req = requestInput;
  }

  if (!req || typeof req !== 'object') {
    return {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32600,
        message: 'Invalid Request: expected object',
      },
    };
  }

  const id = req.id !== undefined ? req.id : null;
  const method = req.method;

  if (typeof method !== 'string') {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32600,
        message: 'Invalid Request: missing method',
      },
    };
  }

  // Notification handling (no response)
  if (method === 'notifications/initialized') {
    return null;
  }

  switch (method) {
    case 'initialize': {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: SERVER_NAME,
            version: SERVER_VERSION,
          },
        },
      };
    }
    case 'tools/list': {
      return {
        jsonrpc: '2.0',
        id,
        result: getToolsCatalog(),
      };
    }
    case 'tools/call': {
      const params = req.params || {};
      const toolName = params.name || '';
      const toolArgs = params.arguments || {};

      try {
        let toolRes;
        switch (toolName) {
          case 'torque_create_project':
            toolRes = handleToolCreateProject(state, toolArgs);
            break;
          case 'torque_list_projects':
            toolRes = handleToolListProjects(state);
            break;
          case 'torque_get_active_project':
            toolRes = handleToolGetActiveProject(state);
            break;
          case 'torque_read_file':
            toolRes = handleToolReadFile(state, toolArgs);
            break;
          case 'torque_write_file':
            toolRes = handleToolWriteFile(state, toolArgs);
            break;
          case 'torque_edit_file':
            toolRes = handleToolEditFile(state, toolArgs);
            break;
          case 'torque_compile':
            toolRes = handleToolCompile(state, toolArgs);
            break;
          case 'torque_get_diagnostics':
            toolRes = handleToolGetDiagnostics(state, toolArgs);
            break;
          default: {
            const err = new Error(`Tool not found: ${toolName}`);
            err.code = -32601;
            throw err;
          }
        }

        const text = typeof toolRes === 'string' ? toolRes : JSON.stringify(toolRes);
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text,
              },
            ],
            isError: false,
          },
        };
      } catch (err) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: typeof err.code === 'number' ? err.code : -32603,
            message: err.message,
          },
        };
      }
    }
    case 'torque_create_project': {
      try {
        const val = handleToolCreateProject(state, req.params || {});
        return { jsonrpc: '2.0', id, result: val };
      } catch (err) {
        return { jsonrpc: '2.0', id, error: { code: typeof err.code === 'number' ? err.code : -32603, message: err.message } };
      }
    }
    case 'torque_list_projects': {
      try {
        const val = handleToolListProjects(state);
        return { jsonrpc: '2.0', id, result: val };
      } catch (err) {
        return { jsonrpc: '2.0', id, error: { code: typeof err.code === 'number' ? err.code : -32603, message: err.message } };
      }
    }
    case 'torque_get_active_project': {
      try {
        const val = handleToolGetActiveProject(state);
        return { jsonrpc: '2.0', id, result: val };
      } catch (err) {
        return { jsonrpc: '2.0', id, error: { code: typeof err.code === 'number' ? err.code : -32603, message: err.message } };
      }
    }
    case 'torque_read_file': {
      try {
        const val = handleToolReadFile(state, req.params || {});
        return { jsonrpc: '2.0', id, result: val };
      } catch (err) {
        return { jsonrpc: '2.0', id, error: { code: typeof err.code === 'number' ? err.code : -32603, message: err.message } };
      }
    }
    case 'torque_write_file': {
      try {
        const val = handleToolWriteFile(state, req.params || {});
        return { jsonrpc: '2.0', id, result: val };
      } catch (err) {
        return { jsonrpc: '2.0', id, error: { code: typeof err.code === 'number' ? err.code : -32603, message: err.message } };
      }
    }
    case 'torque_edit_file': {
      try {
        const val = handleToolEditFile(state, req.params || {});
        return { jsonrpc: '2.0', id, result: val };
      } catch (err) {
        return { jsonrpc: '2.0', id, error: { code: typeof err.code === 'number' ? err.code : -32603, message: err.message } };
      }
    }
    case 'torque_compile': {
      try {
        const val = handleToolCompile(state, req.params || {});
        return { jsonrpc: '2.0', id, result: val };
      } catch (err) {
        return { jsonrpc: '2.0', id, error: { code: typeof err.code === 'number' ? err.code : -32603, message: err.message } };
      }
    }
    case 'torque_get_diagnostics': {
      try {
        const val = handleToolGetDiagnostics(state, req.params || {});
        return { jsonrpc: '2.0', id, result: val };
      } catch (err) {
        return { jsonrpc: '2.0', id, error: { code: typeof err.code === 'number' ? err.code : -32603, message: err.message } };
      }
    }
    default: {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: `Method not found: ${method}`,
        },
      };
    }
  }
}

export function createCompilerServer(options = {}) {
  const state = options.state || (options.projectsDir || options.activeProjectId ? new McpState(options) : defaultMcpState);

  return http.createServer((req, res) => {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // 1. Existing GET / and GET /api/compile
    if (req.method === 'GET' && (pathname === '/' || pathname === '/api/compile')) {
      const env = detectEnvironment();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(env));
      return;
    }

    // AI Config: GET /api/ai-config
    if (req.method === 'GET' && pathname === '/api/ai-config') {
      try {
        const aiConfigFile = path.join(os.homedir(), '.torque', 'ai_config.json');
        if (!fs.existsSync(aiConfigFile)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `AI config file not found at ${aiConfigFile}` }));
          return;
        }
        const content = fs.readFileSync(aiConfigFile, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(content);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(err?.message || err) }));
      }
      return;
    }

    // AI Config: POST /api/ai-config
    if (req.method === 'POST' && pathname === '/api/ai-config') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });

      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (!parsed || typeof parsed !== 'object') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
            return;
          }
          const torqueDir = path.join(os.homedir(), '.torque');
          if (!fs.existsSync(torqueDir)) {
            fs.mkdirSync(torqueDir, { recursive: true });
          }
          const aiConfigFile = path.join(torqueDir, 'ai_config.json');
          fs.writeFileSync(aiConfigFile, JSON.stringify(parsed, null, 2), 'utf8');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(err?.message || err) }));
        }
      });
      return;
    }

    // AI Proxy: POST /api/ai-proxy
    if (req.method === 'POST' && pathname === '/api/ai-proxy') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });

      req.on('end', async () => {
        try {
          const payload = JSON.parse(body);
          const { url, method = 'POST', headers = {}, body: reqBody, stream = false } = payload || {};

          if (!url || typeof url !== 'string') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing required field: url' }));
            return;
          }

          const forwardHeaders = {};
          if (headers && typeof headers === 'object') {
            for (const [k, v] of Object.entries(headers)) {
              if (k.toLowerCase() !== 'host') {
                forwardHeaders[k] = String(v);
              }
            }
          }

          const fetchOptions = {
            method,
            headers: forwardHeaders,
          };

          if (reqBody !== undefined && method !== 'GET' && method !== 'HEAD') {
            fetchOptions.body = typeof reqBody === 'string' ? reqBody : JSON.stringify(reqBody);
          }

          const upstreamRes = await fetch(url, fetchOptions);

          if (stream && upstreamRes.body) {
            res.writeHead(upstreamRes.status, {
              'Content-Type': 'text/event-stream; charset=utf-8',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
              'Access-Control-Allow-Origin': '*',
            });

            const reader = upstreamRes.body.getReader ? upstreamRes.body.getReader() : null;
            if (reader) {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                res.write(value);
              }
              res.end();
            } else if (typeof upstreamRes.body[Symbol.asyncIterator] === 'function') {
              for await (const chunk of upstreamRes.body) {
                res.write(chunk);
              }
              res.end();
            } else {
              const text = await upstreamRes.text();
              res.end(text);
            }
            return;
          }

          const text = await upstreamRes.text();
          const contentType = upstreamRes.headers.get('content-type') || 'application/json';

          res.writeHead(upstreamRes.status, {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
          });
          res.end(text);
        } catch (err) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Proxy request failed: ${err?.message || String(err)}` }));
        }
      });
      return;
    }

    // 2. Existing POST / and POST /api/compile
    if (req.method === 'POST' && (pathname === '/' || pathname === '/api/compile')) {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });

      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          if (!payload || !payload.entry) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing required field: entry' }));
            return;
          }

          const result = compileProject(payload);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'failed',
            pdf: null,
            synctex: null,
            diagnostics: [{ severity: 'error', message: err.message }],
            missing_files: [],
            missingFiles: [],
            resolved_packages: [],
            resolvedPackages: [],
            duration_ms: 0,
            durationMs: 0,
            stdout: '',
            stderr: String(err.stack || err),
          }));
        }
      });
      return;
    }

    // 3. MCP SSE: GET /sse
    if (req.method === 'GET' && pathname === '/sse') {
      const sessionId = `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      state.sseSessions.set(sessionId, res);

      req.on('close', () => {
        state.sseSessions.delete(sessionId);
      });

      res.write(`event: endpoint\ndata: /message?sessionId=${sessionId}\n\n`);
      return;
    }

    // 4. MCP message: POST /message
    if (req.method === 'POST' && pathname === '/message') {
      const sessionId = parsedUrl.searchParams.get('sessionId') || '';
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });

      req.on('end', () => {
        const resp = dispatchJsonRpc(body, state);
        if (resp !== null) {
          const respStr = JSON.stringify(resp);
          if (sessionId && state.sseSessions.has(sessionId)) {
            const sseRes = state.sseSessions.get(sessionId);
            sseRes.write(`event: message\ndata: ${respStr}\n\n`);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(respStr);
        } else {
          res.writeHead(202, { 'Content-Type': 'application/json' });
          res.end();
        }
      });
      return;
    }

    // 5. MCP streamable HTTP: POST /mcp or POST /mcp/
    if (req.method === 'POST' && (pathname === '/mcp' || pathname === '/mcp/')) {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });

      req.on('end', () => {
        const resp = dispatchJsonRpc(body, state);
        if (resp !== null) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(resp));
        } else {
          res.writeHead(204);
          res.end();
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });
}

export const server = createCompilerServer();

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  server.listen(PORT, HOST, () => {
    console.log(`[Torque Compiler Server] Listening on http://${HOST}:${PORT}`);
    const env = detectEnvironment();
    console.log(`[Torque Compiler Server] TeX Live available: ${env.available} (version: ${env.version || 'none'})`);
  });
}
