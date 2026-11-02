import { describe, it, expect, beforeEach } from 'vitest';
import {
  getPackageCatalog,
  searchPackages,
  getPackageByName,
  isPackageInstalled,
  setPackageInstalled,
  insertPackageDeclaration,
  getInstalledPackages,
  resetPackageManagerState,
  PACKAGE_STORAGE_KEY,
} from '../packageManager';

describe('packageManager service', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    resetPackageManagerState();
  });

  describe('catalog queries', () => {
    it('returns a populated list of default packages', () => {
      const catalog = getPackageCatalog();
      expect(catalog.length).toBeGreaterThanOrEqual(25);

      const mathPkgs = catalog.filter((pkg) => pkg.category === 'Math');
      expect(mathPkgs.map((p) => p.name)).toEqual(
        expect.arrayContaining(['amsmath', 'amssymb', 'amsthm', 'mathtools', 'tikz-cd'])
      );

      const graphicsPkgs = catalog.filter((pkg) => pkg.category === 'Graphics');
      expect(graphicsPkgs.map((p) => p.name)).toEqual(
        expect.arrayContaining(['graphicx', 'tikz', 'pgfplots', 'xcolor'])
      );

      const layoutPkgs = catalog.filter((pkg) => pkg.category === 'Layout');
      expect(layoutPkgs.map((p) => p.name)).toEqual(
        expect.arrayContaining(['geometry', 'multicol', 'fancyhdr', 'setspace'])
      );

      const citationsPkgs = catalog.filter((pkg) => pkg.category === 'Citations');
      expect(citationsPkgs.map((p) => p.name)).toEqual(
        expect.arrayContaining(['biblatex', 'natbib', 'hyperref', 'cleveref'])
      );

      const tablesPkgs = catalog.filter((pkg) => pkg.category === 'Tables');
      expect(tablesPkgs.map((p) => p.name)).toEqual(
        expect.arrayContaining(['booktabs', 'tabularx', 'multirow', 'array'])
      );

      const codePkgs = catalog.filter((pkg) => pkg.category === 'Code');
      expect(codePkgs.map((p) => p.name)).toEqual(
        expect.arrayContaining(['listings', 'algorithm2e', 'minted'])
      );
    });

    it('identifies pre-bundled packages as installed by default', () => {
      const amsmath = getPackageByName('amsmath');
      expect(amsmath).toBeDefined();
      expect(amsmath?.isInstalled).toBe(true);
      expect(amsmath?.source).toBe('bundle');

      const geometry = getPackageByName('geometry');
      expect(geometry?.isInstalled).toBe(true);
      expect(geometry?.source).toBe('bundle');

      const graphicx = getPackageByName('graphicx');
      expect(graphicx?.isInstalled).toBe(true);
      expect(graphicx?.source).toBe('bundle');
    });

    it('identifies external CTAN packages as not installed by default', () => {
      const mathtools = getPackageByName('mathtools');
      expect(mathtools).toBeDefined();
      expect(mathtools?.isInstalled).toBe(false);
      expect(mathtools?.source).toBe('ctan');

      const pgfplots = getPackageByName('pgfplots');
      expect(pgfplots?.isInstalled).toBe(false);
      expect(pgfplots?.source).toBe('ctan');
    });
  });

  describe('getPackageByName', () => {
    it('retrieves package by exact name', () => {
      const pkg = getPackageByName('booktabs');
      expect(pkg).toBeDefined();
      expect(pkg?.name).toBe('booktabs');
      expect(pkg?.category).toBe('Tables');
    });

    it('retrieves package case-insensitively', () => {
      const pkg = getPackageByName('MiCrOtYpE');
      expect(pkg).toBeDefined();
      expect(pkg?.name).toBe('microtype');
    });

    it('retrieves package by .sty file name', () => {
      const pkg = getPackageByName('booktabs.sty');
      expect(pkg).toBeDefined();
      expect(pkg?.name).toBe('booktabs');

      const tikzCd = getPackageByName('tikz-cd.sty');
      expect(tikzCd?.name).toBe('tikz-cd');
    });

    it('returns undefined for nonexistent package', () => {
      expect(getPackageByName('nonexistent-latex-pkg-xyz')).toBeUndefined();
    });
  });

  describe('searchPackages', () => {
    it('returns all packages when query is empty and category is All', () => {
      const all = searchPackages('', 'All');
      const catalog = getPackageCatalog();
      expect(all.length).toBe(catalog.length);
    });

    it('filters packages by name or description keyword', () => {
      const results = searchPackages('matrix');
      expect(results.length).toBeGreaterThan(0);
      const names = results.map((r) => r.name);
      expect(names).toEqual(expect.arrayContaining(['amsmath', 'mathtools']));
    });

    it('filters packages by category', () => {
      const mathPkgs = searchPackages('', 'Math');
      expect(mathPkgs.every((p) => p.category === 'Math')).toBe(true);
      expect(mathPkgs.some((p) => p.name === 'amsmath')).toBe(true);
      expect(mathPkgs.some((p) => p.name === 'graphicx')).toBe(false);
    });

    it('filters by both search query and category', () => {
      const mathPlot = searchPackages('plot', 'Math');
      expect(mathPlot).toEqual([]);

      const graphicsPlot = searchPackages('plot', 'Graphics');
      expect(graphicsPlot.length).toBeGreaterThan(0);
      expect(graphicsPlot.some((p) => p.name === 'pgfplots')).toBe(true);
    });

    it('matches query against package file names', () => {
      const results = searchPackages('amstext.sty');
      expect(results.some((p) => p.name === 'amsmath')).toBe(true);
    });
  });

  describe('installation toggle and persistence', () => {
    it('toggles installation state and persists to storage', () => {
      expect(isPackageInstalled('mathtools')).toBe(false);

      setPackageInstalled('mathtools', true);
      expect(isPackageInstalled('mathtools')).toBe(true);
      expect(getPackageByName('mathtools')?.isInstalled).toBe(true);

      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem(PACKAGE_STORAGE_KEY);
        expect(stored).toBeTruthy();
        const parsed = JSON.parse(stored!);
        expect(parsed.mathtools).toBe(true);
      }

      setPackageInstalled('mathtools', false);
      expect(isPackageInstalled('mathtools')).toBe(false);
      expect(getPackageByName('mathtools')?.isInstalled).toBe(false);
    });

    it('registers and marks dynamic package if not already in catalog', () => {
      expect(getPackageByName('custom-chem')).toBeUndefined();

      setPackageInstalled('custom-chem', true);
      const pkg = getPackageByName('custom-chem');
      expect(pkg).toBeDefined();
      expect(pkg?.name).toBe('custom-chem');
      expect(pkg?.isInstalled).toBe(true);
      expect(pkg?.source).toBe('ctan');
      expect(pkg?.files).toContain('custom-chem.sty');
    });

    it('returns list of installed packages', () => {
      const installed = getInstalledPackages();
      expect(installed.length).toBeGreaterThan(0);
      expect(installed.every((p) => p.isInstalled)).toBe(true);
      expect(installed.some((p) => p.name === 'amsmath')).toBe(true);
    });

    it('resets package manager state properly', () => {
      setPackageInstalled('mathtools', true);
      expect(isPackageInstalled('mathtools')).toBe(true);

      resetPackageManagerState();
      expect(isPackageInstalled('mathtools')).toBe(false);
      if (typeof localStorage !== 'undefined') {
        expect(localStorage.getItem(PACKAGE_STORAGE_KEY)).toBeNull();
      }
    });
  });

  describe('insertPackageDeclaration', () => {
    it('inserts simple package into standard document with existing packages', () => {
      const code = `\\documentclass{article}
\\usepackage{amsmath}

\\begin{document}
Hello World
\\end{document}`;

      const updated = insertPackageDeclaration(code, 'graphicx');
      expect(updated).toBe(`\\documentclass{article}
\\usepackage{amsmath}
\\usepackage{graphicx}

\\begin{document}
Hello World
\\end{document}`);
    });

    it('inserts package with options', () => {
      const code = `\\documentclass{article}

\\begin{document}
Hello World
\\end{document}`;

      const updated = insertPackageDeclaration(code, 'geometry', 'margin=1in');
      expect(updated).toBe(`\\documentclass{article}
\\usepackage[margin=1in]{geometry}

\\begin{document}
Hello World
\\end{document}`);
    });

    it('normalizes options containing brackets', () => {
      const code = `\\documentclass{article}

\\begin{document}
Hello World
\\end{document}`;

      const updated = insertPackageDeclaration(code, 'geometry', '[margin=1in]');
      expect(updated).toBe(`\\documentclass{article}
\\usepackage[margin=1in]{geometry}

\\begin{document}
Hello World
\\end{document}`);
    });

    it('does not duplicate package if already declared in preamble', () => {
      const code = `\\documentclass{article}
\\usepackage{amsmath}

\\begin{document}
Hello World
\\end{document}`;

      const updated = insertPackageDeclaration(code, 'amsmath');
      expect(updated).toBe(code);
    });

    it('does not duplicate package if already declared with options', () => {
      const code = `\\documentclass{article}
\\usepackage[fleqn]{amsmath}

\\begin{document}
Hello World
\\end{document}`;

      const updated = insertPackageDeclaration(code, 'amsmath');
      expect(updated).toBe(code);
    });

    it('does not duplicate package if declared in multi-package declaration', () => {
      const code = `\\documentclass{article}
\\usepackage{amssymb, amsmath, tikz}

\\begin{document}
Hello World
\\end{document}`;

      const updated = insertPackageDeclaration(code, 'amsmath');
      expect(updated).toBe(code);
    });

    it('inserts package if commented-out declaration is present', () => {
      const code = `\\documentclass{article}
% \\usepackage{amsmath}

\\begin{document}
Hello World
\\end{document}`;

      const updated = insertPackageDeclaration(code, 'amsmath');
      expect(updated).toContain('\\usepackage{amsmath}');
      expect(updated).toBe(`\\documentclass{article}
% \\usepackage{amsmath}
\\usepackage{amsmath}

\\begin{document}
Hello World
\\end{document}`);
    });

    it('inserts after multi-line documentclass if no packages exist', () => {
      const code = `\\documentclass[
  12pt,
  a4paper
]{article}

\\begin{document}
Hello World
\\end{document}`;

      const updated = insertPackageDeclaration(code, 'microtype');
      expect(updated).toBe(`\\documentclass[
  12pt,
  a4paper
]{article}
\\usepackage{microtype}

\\begin{document}
Hello World
\\end{document}`);
    });

    it('inserts before begin document if no documentclass is found', () => {
      const code = `\\begin{document}
Hello World
\\end{document}`;

      const updated = insertPackageDeclaration(code, 'amsmath');
      expect(updated).toBe(`\\usepackage{amsmath}
\\begin{document}
Hello World
\\end{document}`);
    });

    it('prepends to arbitrary latex snippet without document tags', () => {
      const code = `Some raw content without header`;
      const updated = insertPackageDeclaration(code, 'xcolor');
      expect(updated).toBe(`\\usepackage{xcolor}\nSome raw content without header`);
    });

    it('handles empty string by creating declaration', () => {
      const updated = insertPackageDeclaration('', 'amsmath');
      expect(updated.trim()).toBe('\\usepackage{amsmath}');
    });

    it('preserves CRLF line endings if present in original code', () => {
      const code = '\\documentclass{article}\r\n\r\n\\begin{document}\r\nHello\r\n\\end{document}';
      const updated = insertPackageDeclaration(code, 'amsmath');
      expect(updated).toContain('\r\n\\usepackage{amsmath}\r\n');
    });
  });
});
