import { describe, it, expect } from 'vitest';
import {
  computeFileDiff,
  applyFilePatch,
  type FileDiffResult,
} from '../diffUtils';

describe('diffUtils', () => {
  describe('computeFileDiff', () => {
    it('returns 0 additions and 0 deletions for identical content', () => {
      const content = '\\documentclass{article}\n\\begin{document}\nHello World\n\\end{document}';
      const result = computeFileDiff('main.tex', content, content);

      expect(result.path).toBe('main.tex');
      expect(result.originalContent).toBe(content);
      expect(result.newContent).toBe(content);
      expect(result.additions).toBe(0);
      expect(result.deletions).toBe(0);
      expect(result.diffHunks).toEqual([]);
      expect(result.unifiedDiff).toBe('');
    });

    it('accurately counts additions when creating a file from empty string', () => {
      const original = '';
      const updated = 'line 1\nline 2\nline 3';
      const result = computeFileDiff('doc.tex', original, updated);

      expect(result.additions).toBe(3);
      expect(result.deletions).toBe(0);
      expect(result.diffHunks).toHaveLength(3);
      expect(result.diffHunks[0]).toEqual({
        type: 'added',
        line: 'line 1',
        newLineNo: 1,
      });
      expect(result.diffHunks[1]).toEqual({
        type: 'added',
        line: 'line 2',
        newLineNo: 2,
      });
      expect(result.diffHunks[2]).toEqual({
        type: 'added',
        line: 'line 3',
        newLineNo: 3,
      });
      expect(result.unifiedDiff).toContain('--- a/doc.tex');
      expect(result.unifiedDiff).toContain('+++ b/doc.tex');
      expect(result.unifiedDiff).toContain('@@ -0,0 +1,3 @@');
      expect(result.unifiedDiff).toContain('+line 1');
      expect(result.unifiedDiff).toContain('+line 2');
      expect(result.unifiedDiff).toContain('+line 3');
    });

    it('accurately counts deletions when clearing a file', () => {
      const original = 'first\nsecond';
      const updated = '';
      const result = computeFileDiff('doc.tex', original, updated);

      expect(result.additions).toBe(0);
      expect(result.deletions).toBe(2);
      expect(result.diffHunks).toHaveLength(2);
      expect(result.diffHunks[0]).toEqual({
        type: 'deleted',
        line: 'first',
        oldLineNo: 1,
      });
      expect(result.diffHunks[1]).toEqual({
        type: 'deleted',
        line: 'second',
        oldLineNo: 2,
      });
      expect(result.unifiedDiff).toContain('--- a/doc.tex');
      expect(result.unifiedDiff).toContain('+++ b/doc.tex');
      expect(result.unifiedDiff).toContain('-first');
      expect(result.unifiedDiff).toContain('-second');
    });

    it('handles line modification with context and line numbers', () => {
      const original = 'header\nold text\nfooter';
      const updated = 'header\nnew text\nfooter';
      const result = computeFileDiff('section.tex', original, updated);

      expect(result.additions).toBe(1);
      expect(result.deletions).toBe(1);
      expect(result.diffHunks).toEqual([
        { type: 'context', line: 'header', oldLineNo: 1, newLineNo: 1 },
        { type: 'deleted', line: 'old text', oldLineNo: 2 },
        { type: 'added', line: 'new text', newLineNo: 2 },
        { type: 'context', line: 'footer', oldLineNo: 3, newLineNo: 3 },
      ]);
      expect(result.unifiedDiff).toContain('--- a/section.tex');
      expect(result.unifiedDiff).toContain('+++ b/section.tex');
      expect(result.unifiedDiff).toContain('@@ -1,3 +1,3 @@');
      expect(result.unifiedDiff).toContain(' header');
      expect(result.unifiedDiff).toContain('-old text');
      expect(result.unifiedDiff).toContain('+new text');
      expect(result.unifiedDiff).toContain(' footer');
    });

    it('handles multiple hunks separated by unchanged context', () => {
      const origLines = [
        'line 1',
        'line 2 (change A)',
        'line 3',
        'line 4',
        'line 5',
        'line 6',
        'line 7',
        'line 8',
        'line 9',
        'line 10',
        'line 11',
        'line 12 (change B)',
        'line 13',
      ];
      const newLines = [
        'line 1',
        'line 2 (changed A)',
        'line 3',
        'line 4',
        'line 5',
        'line 6',
        'line 7',
        'line 8',
        'line 9',
        'line 10',
        'line 11',
        'line 12 (changed B)',
        'line 13',
      ];

      const result = computeFileDiff('multi.tex', origLines.join('\n'), newLines.join('\n'));
      expect(result.additions).toBe(2);
      expect(result.deletions).toBe(2);

      // Unified diff should have 2 hunk headers @@ ... @@
      const hunkHeaders = result.unifiedDiff.match(/@@ -\d+.* \+\d+.* @@/g);
      expect(hunkHeaders).not.toBeNull();
      expect(hunkHeaders?.length).toBe(2);
    });

    it('normalizes CRLF line endings cleanly', () => {
      const original = 'alpha\r\nbeta\r\ngamma';
      const updated = 'alpha\r\nbeta modified\r\ngamma';
      const result = computeFileDiff('crlf.tex', original, updated);

      expect(result.additions).toBe(1);
      expect(result.deletions).toBe(1);
      expect(result.diffHunks.find((h) => h.type === 'added')?.line).toBe('beta modified');
    });
  });

  describe('applyFilePatch', () => {
    it('successfully replaces target with replacement', () => {
      const original = '\\title{Old Title}\n\\author{Author}';
      const target = '\\title{Old Title}';
      const replacement = '\\title{New Modern Title}';

      const result = applyFilePatch(original, target, replacement);
      expect(result.success).toBe(true);
      expect(result.content).toBe('\\title{New Modern Title}\n\\author{Author}');
      expect(result.error).toBeUndefined();
    });

    it('preserves special LaTeX characters like $, &, and backslashes', () => {
      const original = 'Before\n$x = 1$\nAfter';
      const target = '$x = 1$';
      const replacement = '$x = \\frac{a & b}{c}$';

      const result = applyFilePatch(original, target, replacement);
      expect(result.success).toBe(true);
      expect(result.content).toBe('Before\n$x = \\frac{a & b}{c}$\nAfter');
    });

    it('replaces all occurrences if target matches multiple places', () => {
      const original = 'foo bar foo baz foo';
      const target = 'foo';
      const replacement = 'qux';

      const result = applyFilePatch(original, target, replacement);
      expect(result.success).toBe(true);
      expect(result.content).toBe('qux bar qux baz qux');
    });

    it('fails when target string is not found in original content', () => {
      const original = 'Hello world';
      const target = 'Goodbye';
      const replacement = 'Hi';

      const result = applyFilePatch(original, target, replacement);
      expect(result.success).toBe(false);
      expect(result.content).toBe(original);
      expect(result.error).toMatch(/target string not found/i);
    });

    it('fails when target is empty string', () => {
      const original = 'Hello world';
      const result = applyFilePatch(original, '', 'something');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/cannot be empty/i);
    });
  });
});
