import type { Diagnostic } from '../types/workspace';
import { normalizeFilePath } from '../storage/projectStore';

export interface MonacoMarkerPayload {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  message: string;
  severity: 8 | 4 | 2; // 8 = Error, 4 = Warning, 2 = Info (monaco.MarkerSeverity)
}

export function diagnosticsToMarkers(
  diagnostics: Diagnostic[],
  activeFilePath: string,
  rootEntry: string
): MonacoMarkerPayload[] {
  const normActive = normalizeFilePath(activeFilePath);
  const normRoot = normalizeFilePath(rootEntry);
  const markers: MonacoMarkerPayload[] = [];

  for (const d of diagnostics) {
    let fileMatch = false;
    if (d.file) {
      try {
        const normFile = normalizeFilePath(d.file);
        fileMatch = normFile === normActive;
      } catch {
        fileMatch = false;
      }
    } else {
      // Diagnostic without file defaults to root entry
      fileMatch = normActive === normRoot;
    }

    if (!fileMatch) continue;

    const line = Math.max(1, d.line ?? 1);
    const severity: 8 | 4 | 2 =
      d.severity === 'error' ? 8 : d.severity === 'warning' ? 4 : 2;

    markers.push({
      startLineNumber: line,
      startColumn: 1,
      endLineNumber: line,
      endColumn: 1000,
      message: d.message,
      severity,
    });
  }

  return markers;
}

export function applyTextDiff(content: string, original: string, modified: string): string {
  if (!content.includes(original)) {
    throw new Error('Target original text not found in document content.');
  }
  return content.replace(original, modified);
}

export function registerLatexLanguage(monacoInstance: any): void {
  if (!monacoInstance || !monacoInstance.languages) return;

  const languages = monacoInstance.languages.getLanguages();
  if (languages.some((l: any) => l.id === 'latex')) {
    return;
  }

  monacoInstance.languages.register({ id: 'latex', extensions: ['.tex', '.sty', '.cls', '.bib'] });

  monacoInstance.languages.setMonarchTokensProvider('latex', {
    defaultToken: '',
    tokenPostfix: '.latex',

    tokenizer: {
      root: [
        // Comments
        [/%.*$/, 'comment'],

        // Inline math
        [/\$[^$]*\$/, 'string.math'],

        // Commands
        [/\\[a-zA-Z@]+/, 'keyword'],

        // Braces
        [/[{}]/, 'delimiter.bracket'],
        [/[[\]]/, 'delimiter.array'],

        // Numbers
        [/\d+/, 'number'],
      ],
    },
  });

  monacoInstance.languages.setLanguageConfiguration('latex', {
    comments: {
      lineComment: '%',
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '$', close: '$' },
    ],
  });
}
