import { describe, it, expect } from 'vitest';
import { insertPackageDeclaration } from '../packageManager';

describe('packageManager helpers', () => {
  describe('insertPackageDeclaration', () => {
    it('inserts a package declaration after existing usepackage declarations', () => {
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
