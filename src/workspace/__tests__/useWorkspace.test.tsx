// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useWorkspace } from '../useWorkspace';
import { ProjectStore } from '../../storage/projectStore';
import { CompilerClient } from '../../compiler/compilerClient';

describe('useWorkspace', () => {
  it('initializes with a default project and exposes WorkspaceActions for compiling and diffing', async () => {
    const store = new ProjectStore(`ws-test-${crypto.randomUUID()}`);
    const mockCompiler = {
      isCompiling: () => false,
      compile: vi.fn().mockResolvedValue({
        status: 'spotless',
        pdfBytes: new Uint8Array([1, 2, 3]),
        diagnostics: [{ severity: 'warning', file: 'main.tex', line: 3, message: 'Test warning' }],
        missingFiles: [],
        durationMs: 55,
      }),
      dispose: vi.fn(),
    } as unknown as CompilerClient;

    const { result } = renderHook(() => useWorkspace({ store, compiler: mockCompiler }));

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.activeProject?.name).toBe('Untitled Project');
    expect(result.current.activeFilePath).toBe('main.tex');

    await act(async () => {
      await result.current.actions.setFileContent(
        'main.tex',
        '\\documentclass{article}\n\\begin{document}\nOld text\n\\end{document}'
      );
      await result.current.actions.applyDiff('main.tex', 'Old text', 'New AI edited text');
    });

    const updatedContent = await result.current.actions.getFileContent('main.tex');
    expect(updatedContent).toContain('New AI edited text');

    await act(async () => {
      const compileRes = await result.current.actions.compile();
      expect(compileRes.status).toBe('spotless');
    });

    expect(result.current.actions.getDiagnostics()).toHaveLength(1);
    expect(mockCompiler.compile).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ path: 'main.tex' })]),
      'main.tex'
    );
  });
});
