import type { LatexPackage, PackageCategory } from './packageTypes';

export const PACKAGE_STORAGE_KEY = 'torque_installed_packages';

export const DEFAULT_PACKAGE_CATALOG: readonly LatexPackage[] = [
  // Math
  {
    id: 'amsmath',
    name: 'amsmath',
    description: 'AMS mathematical facilities for LaTeX, providing environments for displayed equations, matrix layouts, and advanced math structures.',
    category: 'Math',
    version: '2.17o',
    files: ['amsmath.sty', 'amstext.sty', 'amsgen.sty', 'amsbsy.sty', 'amsopn.sty'],
    isInstalled: true,
    source: 'bundle',
    documentationUrl: 'https://ctan.org/pkg/amsmath',
  },
  {
    id: 'amssymb',
    name: 'amssymb',
    description: 'Higher mathematics symbols and fonts from the American Mathematical Society font collection.',
    category: 'Math',
    version: '3.02',
    files: ['amssymb.sty', 'amsfonts.sty'],
    isInstalled: true,
    source: 'bundle',
    documentationUrl: 'https://ctan.org/pkg/amssymb',
  },
  {
    id: 'amsthm',
    name: 'amsthm',
    description: 'Typesetting theorems and proof environments with AMS formatting styles and numbered theorem layouts.',
    category: 'Math',
    version: '2.20.6',
    files: ['amsthm.sty'],
    isInstalled: true,
    source: 'bundle',
    documentationUrl: 'https://ctan.org/pkg/amsthm',
  },
  {
    id: 'mathtools',
    name: 'mathtools',
    description: 'Extensions to amsmath including paired delimiters, matrix enhancements, and equation spacing.',
    category: 'Math',
    version: '1.30',
    files: ['mathtools.sty'],
    isInstalled: false,
    source: 'ctan',
    documentationUrl: 'https://ctan.org/pkg/mathtools',
  },
  {
    id: 'tikz-cd',
    name: 'tikz-cd',
    description: 'Create commutative diagrams and categorical graphs with a simple matrix syntax powered by TikZ.',
    category: 'Math',
    version: '1.0.1',
    files: ['tikz-cd.sty', 'tikzlibrarycd.code.tex'],
    isInstalled: true,
    source: 'bundle',
    documentationUrl: 'https://ctan.org/pkg/tikz-cd',
  },

  // Physics
  {
    id: 'physics',
    name: 'physics',
    description: 'Flexible macros for typesetting physical quantities, derivatives, vectors, matrices, and bra-ket notation.',
    category: 'Physics',
    version: '1.3',
    files: ['physics.sty'],
    isInstalled: false,
    source: 'ctan',
    documentationUrl: 'https://ctan.org/pkg/physics',
  },
  {
    id: 'siunitx',
    name: 'siunitx',
    description: 'A comprehensive (SI) units package providing consistent formatting of numbers, quantities, and physical units.',
    category: 'Physics',
    version: '3.3.4',
    files: ['siunitx.sty'],
    isInstalled: false,
    source: 'ctan',
    documentationUrl: 'https://ctan.org/pkg/siunitx',
  },

  // Graphics
  {
    id: 'graphicx',
    name: 'graphicx',
    description: 'Enhanced support for graphics and figure inclusion with scaling, rotation, and file format resolution.',
    category: 'Graphics',
    version: '1.2d',
    files: ['graphicx.sty', 'graphics.sty'],
    isInstalled: true,
    source: 'bundle',
    documentationUrl: 'https://ctan.org/pkg/graphicx',
  },
  {
    id: 'tikz',
    name: 'tikz',
    description: 'Create sophisticated vector graphics, technical drawings, flowcharts, and diagrams directly in LaTeX.',
    category: 'Graphics',
    version: '3.1.10',
    files: ['tikz.sty', 'tikz.code.tex'],
    isInstalled: true,
    source: 'bundle',
    documentationUrl: 'https://ctan.org/pkg/pgf',
  },
  {
    id: 'pgfplots',
    name: 'pgfplots',
    description: 'Loads, computes, and draws publication-quality 2D and 3D plots directly in LaTeX documents.',
    category: 'Graphics',
    version: '1.18.1',
    files: ['pgfplots.sty'],
    isInstalled: false,
    source: 'ctan',
    documentationUrl: 'https://ctan.org/pkg/pgfplots',
  },
  {
    id: 'pgfsys',
    name: 'pgfsys',
    description: 'Portable Graphics Format system layer driver providing low-level drawing primitives, coordinate transforms, and backend specials.',
    category: 'Graphics',
    version: '3.1.10',
    files: ['pgfsys.sty', 'pgfsys.code.tex', 'pgfsys-xetex.def'],
    isInstalled: true,
    source: 'bundle',
    documentationUrl: 'https://ctan.org/pkg/pgf',
  },
  {
    id: 'pgf',
    name: 'pgf',
    description: 'Portable Graphics Format macro package providing path drawing, transformations, plotting, and shading.',
    category: 'Graphics',
    version: '3.1.10',
    files: ['pgf.sty', 'pgfcore.sty', 'pgfkeys.sty', 'pgfmath.sty'],
    isInstalled: true,
    source: 'bundle',
    documentationUrl: 'https://ctan.org/pkg/pgf',
  },
  {
    id: 'xcolor',
    name: 'xcolor',
    description: 'Driver-independent color extensions supporting rgb, cmyk, html hexadecimal colors, and tinted shades.',
    category: 'Graphics',
    version: '3.01',
    files: ['xcolor.sty'],
    isInstalled: true,
    source: 'bundle',
    documentationUrl: 'https://ctan.org/pkg/xcolor',
  },

  // Layout
  {
    id: 'ieeetran',
    name: 'IEEEtran',
    description: 'Official LaTeX document class and template for IEEE conference papers, transactions, and symposiums.',
    category: 'Layout',
    version: '1.8b',
    files: ['IEEEtran.cls', 'IEEEtran.bst'],
    isInstalled: true,
    source: 'bundle',
    documentationUrl: 'https://ctan.org/pkg/ieeetran',
  },
  {
    id: 'geometry',
    name: 'geometry',
    description: 'Flexible and complete interface for customizing document page layout, margins, paper sizes, and orientation.',
    category: 'Layout',
    version: '5.9',
    files: ['geometry.sty'],
    isInstalled: true,
    source: 'bundle',
    documentationUrl: 'https://ctan.org/pkg/geometry',
  },
  {
    id: 'fullpage',
    name: 'fullpage',
    description: 'Simple package to set page margins to 1 inch or 1.5 cm for maximum printable area.',
    category: 'Layout',
    version: '1.1',
    files: ['fullpage.sty'],
    isInstalled: true,
    source: 'bundle',
    documentationUrl: 'https://ctan.org/pkg/fullpage',
  },
  {
    id: 'multicol',
    name: 'multicol',
    description: 'Intermix single and multiple columns on all or part of the page with balanced column heights.',
    category: 'Layout',
    version: '1.9b',
    files: ['multicol.sty'],
    isInstalled: true,
    source: 'bundle',
    documentationUrl: 'https://ctan.org/pkg/multicol',
  },
  {
    id: 'fancyhdr',
    name: 'fancyhdr',
    description: 'Extensive control and custom design of running page headers and footers in LaTeX.',
    category: 'Layout',
    version: '4.1',
    files: ['fancyhdr.sty'],
    isInstalled: false,
    source: 'ctan',
    documentationUrl: 'https://ctan.org/pkg/fancyhdr',
  },
  {
    id: 'setspace',
    name: 'setspace',
    description: 'Set space between lines (single, onehalfspacing, doublespacing) dynamically in LaTeX documents.',
    category: 'Layout',
    version: '6.7a',
    files: ['setspace.sty'],
    isInstalled: false,
    source: 'ctan',
    documentationUrl: 'https://ctan.org/pkg/setspace',
  },

  // Typography
  {
    id: 'fontspec',
    name: 'fontspec',
    description: 'Advanced font selection and OpenType font management package for modern TeX engines.',
    category: 'Typography',
    version: '2.9',
    files: ['fontspec.sty'],
    isInstalled: true,
    source: 'bundle',
    documentationUrl: 'https://ctan.org/pkg/fontspec',
  },
  {
    id: 'microtype',
    name: 'microtype',
    description: 'Subliminal typographic enhancements including character protrusion, font expansion, and kerning.',
    category: 'Typography',
    version: '3.1b',
    files: ['microtype.sty'],
    isInstalled: false,
    source: 'ctan',
    documentationUrl: 'https://ctan.org/pkg/microtype',
  },
  {
    id: 'fontenc',
    name: 'fontenc',
    description: 'Standard package for selecting font encodings (e.g. T1, OT1) for proper hyphenation and accented glyphs.',
    category: 'Typography',
    version: '2.0v',
    files: ['fontenc.sty'],
    isInstalled: true,
    source: 'bundle',
    documentationUrl: 'https://ctan.org/pkg/fontenc',
  },
  {
    id: 'babel',
    name: 'babel',
    description: 'Multilingual support for document internationalization, hyphenation, and localized section headers.',
    category: 'Typography',
    version: '3.98',
    files: ['babel.sty'],
    isInstalled: false,
    source: 'ctan',
    documentationUrl: 'https://ctan.org/pkg/babel',
  },
  {
    id: 'fontspec',
    name: 'fontspec',
    description: 'Advanced OpenType and TrueType font selection and feature control in XeLaTeX and LuaLaTeX.',
    category: 'Typography',
    version: '2.9a',
    files: ['fontspec.sty'],
    isInstalled: false,
    source: 'ctan',
    documentationUrl: 'https://ctan.org/pkg/fontspec',
  },

  // Citations
  {
    id: 'biblatex',
    name: 'biblatex',
    description: 'Sophisticated bibliography and citation management system with customizable styles and sorting.',
    category: 'Citations',
    version: '3.19',
    files: ['biblatex.sty'],
    isInstalled: false,
    source: 'ctan',
    documentationUrl: 'https://ctan.org/pkg/biblatex',
  },
  {
    id: 'natbib',
    name: 'natbib',
    description: 'Flexible bibliography support for author-year and numerical citations with custom formatting.',
    category: 'Citations',
    version: '8.31b',
    files: ['natbib.sty'],
    isInstalled: false,
    source: 'ctan',
    documentationUrl: 'https://ctan.org/pkg/natbib',
  },
  {
    id: 'hyperref',
    name: 'hyperref',
    description: 'Extensive support for clickable hyperlinks, bookmarks, URLs, and PDF document metadata.',
    category: 'Citations',
    version: '7.01f',
    files: ['hyperref.sty'],
    isInstalled: false,
    source: 'ctan',
    documentationUrl: 'https://ctan.org/pkg/hyperref',
  },
  {
    id: 'cleveref',
    name: 'cleveref',
    description: 'Intelligent cross-referencing by automatically determining type of reference (Figure, Section, Equation).',
    category: 'Citations',
    version: '0.22.2',
    files: ['cleveref.sty'],
    isInstalled: false,
    source: 'ctan',
    documentationUrl: 'https://ctan.org/pkg/cleveref',
  },

  // Tables
  {
    id: 'booktabs',
    name: 'booktabs',
    description: 'Publication quality tables in LaTeX with professional horizontal rules (toprule, midrule, bottomrule).',
    category: 'Tables',
    version: '1.61803398',
    files: ['booktabs.sty'],
    isInstalled: false,
    source: 'ctan',
    documentationUrl: 'https://ctan.org/pkg/booktabs',
  },
  {
    id: 'tabularx',
    name: 'tabularx',
    description: 'Tabulars with adjustable-width X columns that automatically expand to fill available document width.',
    category: 'Tables',
    version: '2.11c',
    files: ['tabularx.sty'],
    isInstalled: false,
    source: 'ctan',
    documentationUrl: 'https://ctan.org/pkg/tabularx',
  },
  {
    id: 'multirow',
    name: 'multirow',
    description: 'Create tabular cells spanning multiple rows with vertical centering and alignment options.',
    category: 'Tables',
    version: '2.9',
    files: ['multirow.sty'],
    isInstalled: false,
    source: 'ctan',
    documentationUrl: 'https://ctan.org/pkg/multirow',
  },
  {
    id: 'array',
    name: 'array',
    description: 'Extending the array and tabular environments with column formatting directives and math tools.',
    category: 'Tables',
    version: '2.6g',
    files: ['array.sty'],
    isInstalled: false,
    source: 'ctan',
    documentationUrl: 'https://ctan.org/pkg/array',
  },

  // Code
  {
    id: 'listings',
    name: 'listings',
    description: 'Typeset source code listings in LaTeX with language syntax highlighting and line numbering.',
    category: 'Code',
    version: '1.9',
    files: ['listings.sty'],
    isInstalled: false,
    source: 'ctan',
    documentationUrl: 'https://ctan.org/pkg/listings',
  },
  {
    id: 'algorithm2e',
    name: 'algorithm2e',
    description: 'Floating algorithm environment with structured line numbers, condition blocks, and keywords.',
    category: 'Code',
    version: '5.4',
    files: ['algorithm2e.sty'],
    isInstalled: false,
    source: 'ctan',
    documentationUrl: 'https://ctan.org/pkg/algorithm2e',
  },
  {
    id: 'minted',
    name: 'minted',
    description: 'Expressive and robust source code syntax highlighting using the Pygments formatting engine.',
    category: 'Code',
    version: '3.0.0',
    files: ['minted.sty'],
    isInstalled: false,
    source: 'ctan',
    documentationUrl: 'https://ctan.org/pkg/minted',
  },

  // General
  {
    id: 'csquotes',
    name: 'csquotes',
    description: 'Context sensitive quotation facilities with language-dependent quote styling and nested quotations.',
    category: 'General',
    version: '5.2n',
    files: ['csquotes.sty'],
    isInstalled: false,
    source: 'ctan',
    documentationUrl: 'https://ctan.org/pkg/csquotes',
  },
  {
    id: 'lipsum',
    name: 'lipsum',
    description: 'Easy generation of dummy Lorem Ipsum placeholder paragraphs for document layout prototyping.',
    category: 'General',
    version: '2.7',
    files: ['lipsum.sty'],
    isInstalled: false,
    source: 'ctan',
    documentationUrl: 'https://ctan.org/pkg/lipsum',
  },
];

// In-memory state tracking overrides and dynamically registered packages
let installedOverrides: Record<string, boolean> = {};
let dynamicPackages: LatexPackage[] = [];
let hasLoadedStorage = false;

function loadStorageOverrides(): void {
  if (hasLoadedStorage) return;
  hasLoadedStorage = true;

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = localStorage.getItem(PACKAGE_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed === 'object' && parsed !== null) {
          installedOverrides = { ...parsed };
        }
      }
    } catch {
      // Fallback if localStorage access is restricted
    }
  }
}

function persistStorageOverrides(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(PACKAGE_STORAGE_KEY, JSON.stringify(installedOverrides));
    } catch {
      // Fallback if localStorage access is restricted
    }
  }
}

/**
 * Returns a cloned list of all available packages with their current installed state.
 */
export function getPackageCatalog(): LatexPackage[] {
  loadStorageOverrides();

  const catalog: LatexPackage[] = DEFAULT_PACKAGE_CATALOG.map((pkg) => ({
    ...pkg,
    isInstalled: installedOverrides[pkg.name] !== undefined ? installedOverrides[pkg.name] : pkg.isInstalled,
  }));

  for (const dyn of dynamicPackages) {
    catalog.push({
      ...dyn,
      isInstalled: installedOverrides[dyn.name] !== undefined ? installedOverrides[dyn.name] : dyn.isInstalled,
    });
  }

  return catalog;
}

/**
 * Looks up a package by name or sty filename, case-insensitively.
 */
export function getPackageByName(name: string): LatexPackage | undefined {
  if (!name || typeof name !== 'string') return undefined;

  const normalized = name.trim().toLowerCase();
  const cleanName = normalized.endsWith('.sty') ? normalized.slice(0, -4) : normalized;

  const catalog = getPackageCatalog();
  return catalog.find(
    (pkg) =>
      pkg.name.toLowerCase() === normalized ||
      pkg.id.toLowerCase() === normalized ||
      pkg.name.toLowerCase() === cleanName ||
      pkg.id.toLowerCase() === cleanName ||
      pkg.files.some((f) => f.toLowerCase() === normalized || f.toLowerCase() === `${cleanName}.sty`)
  );
}

/**
 * Checks whether a package is installed.
 */
export function isPackageInstalled(name: string): boolean {
  const pkg = getPackageByName(name);
  return pkg ? pkg.isInstalled : false;
}

/**
 * Sets the installed status of a package and persists the change.
 */
export function setPackageInstalled(name: string, installed: boolean): void {
  loadStorageOverrides();

  const trimmed = name.trim();
  const cleanName = trimmed.endsWith('.sty') ? trimmed.slice(0, -4) : trimmed;

  const existing = getPackageByName(cleanName);
  if (existing) {
    installedOverrides[existing.name] = installed;
  } else {
    // Register dynamically
    const newPkg: LatexPackage = {
      id: cleanName.toLowerCase(),
      name: cleanName,
      description: `Custom package ${cleanName}`,
      category: 'General',
      files: [`${cleanName}.sty`],
      isInstalled: installed,
      source: 'ctan',
    };
    dynamicPackages.push(newPkg);
    installedOverrides[cleanName] = installed;
  }

  persistStorageOverrides();
}

/**
 * Returns all currently installed packages.
 */
export function getInstalledPackages(): LatexPackage[] {
  return getPackageCatalog().filter((pkg) => pkg.isInstalled);
}

/**
 * Searches and filters packages by query and category.
 */
export function searchPackages(query: string, category?: PackageCategory | 'All'): LatexPackage[] {
  const catalog = getPackageCatalog();
  const q = query.trim().toLowerCase();

  return catalog.filter((pkg) => {
    // Category match
    if (category && category !== 'All' && pkg.category !== category) {
      return false;
    }

    // Query match
    if (!q) {
      return true;
    }

    return (
      pkg.name.toLowerCase().includes(q) ||
      pkg.id.toLowerCase().includes(q) ||
      pkg.description.toLowerCase().includes(q) ||
      pkg.files.some((f) => f.toLowerCase().includes(q))
    );
  });
}

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

/**
 * Resets in-memory package manager state and clears storage.
 */
export function resetPackageManagerState(): void {
  installedOverrides = {};
  dynamicPackages = [];
  hasLoadedStorage = false;

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.removeItem(PACKAGE_STORAGE_KEY);
    } catch {
      // Fallback if localStorage access is restricted
    }
  }
}
