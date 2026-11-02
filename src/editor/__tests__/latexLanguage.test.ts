import { describe, it, expect } from 'vitest';
import { diagnosticsToMarkers, applyTextDiff } from '../latexLanguage';
import type { Diagnostic } from '../../types/workspace';

describe('diagnosticsToMarkers', () => {
  it('maps error and warning diagnostics for the active file and clamps invalid line numbers to >= 1', () => {
    const diagnostics: Diagnostic[] = [
      { severity: 'error', file: 'main.tex', line: 12, message: 'Undefined control sequence \\foo' },
      { severity: 'warning', file: undefined, line: 0, message: 'Overfull \\hbox' },
      { severity: 'error', file: 'chapters/other.tex', line: 5, message: 'Missing $ inserted' },
    ];

    const mainMarkers = diagnosticsToMarkers(diagnostics, 'main.tex', 'main.tex');
    expect(mainMarkers).toEqual([
      {
        startLineNumber: 12,
        startColumn: 1,
        endLineNumber: 12,
        endColumn: 1000,
        message: 'Undefined control sequence \\foo',
        severity: 8,
      },
      {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 1000,
        message: 'Overfull \\hbox',
        severity: 4,
      },
    ]);

    const otherMarkers = diagnosticsToMarkers(diagnostics, 'chapters/other.tex', 'main.tex');
    expect(otherMarkers).toHaveLength(1);
    expect(otherMarkers[0].startLineNumber).toBe(5);
  });
});

describe('applyTextDiff', () => {
  it('replaces the target snippet with modified text and throws when original snippet is not found', () => {
    const doc = '\\section{Intro}\nHello world\n\\end{document}';
    expect(applyTextDiff(doc, 'Hello world', 'Hello Quantum World')).toBe(
      '\\section{Intro}\nHello Quantum World\n\\end{document}'
    );
    expect(() => applyTextDiff(doc, 'Nonexistent snippet', 'Replacement')).toThrow(/not found/i);
  });
});
