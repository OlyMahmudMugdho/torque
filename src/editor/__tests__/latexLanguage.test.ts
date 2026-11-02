import { describe, it, expect, vi } from 'vitest';
import { diagnosticsToMarkers, applyTextDiff, registerLatexLanguage } from '../latexLanguage';
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

describe('registerLatexLanguage', () => {
  it('does nothing when monacoInstance is undefined or missing languages', () => {
    expect(() => registerLatexLanguage(undefined as any)).not.toThrow();
    expect(() => registerLatexLanguage({} as any)).not.toThrow();
  });

  it('defines both intellij-dark and intellij-light themes with correct base and syntax tokens', () => {
    const definedThemes: Record<string, any> = {};
    const mockMonaco = {
      languages: {
        getLanguages: vi.fn().mockReturnValue([]),
        register: vi.fn(),
        setMonarchTokensProvider: vi.fn(),
        setLanguageConfiguration: vi.fn(),
      },
      editor: {
        defineTheme: vi.fn((name: string, data: any) => {
          definedThemes[name] = data;
        }),
      },
    };

    registerLatexLanguage(mockMonaco);

    expect(mockMonaco.editor.defineTheme).toHaveBeenCalledWith(
      'intellij-dark',
      expect.any(Object)
    );
    expect(mockMonaco.editor.defineTheme).toHaveBeenCalledWith(
      'intellij-light',
      expect.any(Object)
    );

    const darkTheme = definedThemes['intellij-dark'];
    expect(darkTheme).toBeDefined();
    expect(darkTheme.base).toBe('vs-dark');
    expect(darkTheme.colors['editor.background']).toBe('#1e1f22');

    const lightTheme = definedThemes['intellij-light'];
    expect(lightTheme).toBeDefined();
    expect(lightTheme.base).toBe('vs');
    expect(lightTheme.colors['editor.background']).toBe('#ffffff');

    // Verify Darcula light syntax tokens
    const lightRules = lightTheme.rules;
    const findRule = (token: string) => lightRules.find((r: any) => r.token === token);

    expect(findRule('keyword')?.foreground?.toLowerCase()).toMatch(/0033b3/);
    expect(findRule('number')?.foreground?.toLowerCase()).toMatch(/1750eb/);
    expect(findRule('comment')?.foreground?.toLowerCase()).toMatch(/8c8c8c/);
    const stringRule = findRule('string') || findRule('string.math');
    expect(stringRule?.foreground?.toLowerCase()).toMatch(/067d17/);
  });
});

