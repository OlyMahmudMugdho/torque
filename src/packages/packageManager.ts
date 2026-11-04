/**
 * Strips comments from a single LaTeX line, respecting escaped \%.
 */
function stripLineComment(line: string): string {
  let inEscape = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '\\') {
      inEscape = !inEscape;
    } else if (char === '%' && !inEscape) {
      return line.slice(0, i);
    } else {
      inEscape = false;
    }
  }
  return line;
}

/**
 * Inserts \usepackage[options]{packageName} cleanly into the LaTeX document preamble.
 * If the package is already imported in the preamble, the document is returned unchanged.
 */
export function insertPackageDeclaration(latexCode: string, packageName: string, options?: string): string {
  const cleanPkg = packageName.trim().replace(/\.sty$/, '');
  if (!cleanPkg) {
    return latexCode;
  }

  const cleanOpt = options?.trim();
  const optStr = cleanOpt ? cleanOpt.replace(/^\[/, '').replace(/\]$/, '').trim() : '';
  const declaration = optStr ? `\\usepackage[${optStr}]{${cleanPkg}}` : `\\usepackage{${cleanPkg}}`;

  if (!latexCode || !latexCode.trim()) {
    return `${declaration}\n`;
  }

  const eol = latexCode.includes('\r\n') ? '\r\n' : '\n';
  const lines = latexCode.split(/\r?\n/);

  // 1. Locate \begin{document}
  let docBeginLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const active = stripLineComment(lines[i]);
    if (/\\begin\s*\{\s*document\s*\}/.test(active)) {
      docBeginLineIdx = i;
      break;
    }
  }

  const preambleEndIdx = docBeginLineIdx !== -1 ? docBeginLineIdx : lines.length;

  // 2. Check if already declared in preamble
  const preambleActiveText = lines
    .slice(0, preambleEndIdx)
    .map(stripLineComment)
    .join('\n');

  const usePackageRegex = /\\usepackage(?:\s*\[[^\]]*\])?\s*\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = usePackageRegex.exec(preambleActiveText)) !== null) {
    const declaredNames = match[1].split(',').map((p) => p.trim().toLowerCase());
    if (declaredNames.includes(cleanPkg.toLowerCase())) {
      return latexCode;
    }
  }

  // 3. Find insertion point:
  // Prefer right after the last \usepackage, or after \documentclass, or before \begin{document}
  let lastPackageLineIdx = -1;
  let docClassEndLineIdx = -1;

  let inDocClass = false;
  let inUsePackage = false;

  for (let i = 0; i < preambleEndIdx; i++) {
    const active = stripLineComment(lines[i]);

    if (/\\documentclass/.test(active)) {
      inDocClass = true;
    }
    if (inDocClass) {
      if (active.includes('}')) {
        docClassEndLineIdx = i;
        inDocClass = false;
      }
    }

    if (/\\usepackage/.test(active)) {
      inUsePackage = true;
    }
    if (inUsePackage) {
      if (active.includes('}')) {
        lastPackageLineIdx = i;
        inUsePackage = false;
      }
    }
  }

  if (lastPackageLineIdx !== -1) {
    lines.splice(lastPackageLineIdx + 1, 0, declaration);
    return lines.join(eol);
  }

  if (docClassEndLineIdx !== -1) {
    let insertIdx = docClassEndLineIdx + 1;
    // Skip any immediate comments directly following documentclass block
    while (insertIdx < preambleEndIdx && lines[insertIdx].trim().startsWith('%')) {
      insertIdx++;
    }
    lines.splice(insertIdx, 0, declaration);
    return lines.join(eol);
  }

  if (docBeginLineIdx !== -1) {
    lines.splice(docBeginLineIdx, 0, declaration);
    return lines.join(eol);
  }

  // Fallback: prepend declaration
  lines.unshift(declaration);
  return lines.join(eol);
}
