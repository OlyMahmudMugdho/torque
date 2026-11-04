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
        pdfBytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x35]),
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
      'main.tex',
      expect.objectContaining({
        engine: 'pdflatex',
        synctex: true,
      })
    );
  });

  it('supports selecting TeX engine and passing engine to compilation', async () => {
    const store = new ProjectStore(`ws-test-eng-${crypto.randomUUID()}`);
    const mockCompiler = {
      isCompiling: () => false,
      compile: vi.fn().mockResolvedValue({
        status: 'spotless',
        pdfBytes: new Uint8Array([1, 2, 3]),
        diagnostics: [],
        missingFiles: [],
        resolvedPackages: ['tikz'],
        durationMs: 40,
      }),
      dispose: vi.fn(),
    } as unknown as CompilerClient;

    const { result } = renderHook(() => useWorkspace({ store, compiler: mockCompiler }));

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.selectedEngine).toBe('pdflatex');

    act(() => {
      result.current.setSelectedEngine('xelatex');
    });
    expect(result.current.selectedEngine).toBe('xelatex');

    await act(async () => {
      await result.current.actions.compile();
    });

    expect(mockCompiler.compile).toHaveBeenCalledWith(
      expect.any(Array),
      'main.tex',
      expect.objectContaining({
        engine: 'xelatex',
      })
    );

    // Verify resolved packages are stored in state
    expect(result.current.resolvedPackages).toEqual(['tikz']);

    act(() => {
      result.current.clearResolvedPackages();
    });
    expect(result.current.resolvedPackages).toEqual([]);
  });

  it('wires into CompilerDriver via options.driver', async () => {
    const store = new ProjectStore(`ws-test-drv-${crypto.randomUUID()}`);
    const mockDriver = {
      detectEnvironment: vi.fn().mockResolvedValue({ available: true, latexmk: true }),
      compile: vi.fn().mockResolvedValue({
        status: 'spotless',
        pdfBytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
        synctexBytes: null,
        diagnostics: [],
        missingFiles: [],
        resolvedPackages: ['amsmath'],
        durationMs: 30,
        stdout: '',
        stderr: '',
      }),
    };

    const { result } = renderHook(() => useWorkspace({ store, driver: mockDriver as any }));

    await waitFor(() => expect(result.current.ready).toBe(true));

    await act(async () => {
      await result.current.actions.compile();
    });

    expect(mockDriver.compile).toHaveBeenCalledWith(
      expect.objectContaining({
        entry: 'main.tex',
        engine: 'pdflatex',
      })
    );
    expect(result.current.resolvedPackages).toEqual(['amsmath']);
  });

  it('supports autosave enabled vs disabled and manual save', async () => {
    const store = new ProjectStore(`ws-test-as-${crypto.randomUUID()}`);
    const { result } = renderHook(() => useWorkspace({ store }));

    await waitFor(() => expect(result.current.ready).toBe(true));
    const activeProject = result.current.activeProject!;
    expect(result.current.autoSave).toBe(true);

    // 1. With autoSave enabled: changes write through to store immediately
    await act(async () => {
      await result.current.updateFileContent('main.tex', 'Autosaved content');
    });

    let storedFile = await store.getFile(activeProject.id, 'main.tex');
    expect(storedFile?.content).toBe('Autosaved content');

    // 2. Disable autosave
    act(() => {
      result.current.setAutoSave(false);
    });
    expect(result.current.autoSave).toBe(false);

    // Edits when autosave is disabled: in-memory state updates, but store stays unchanged
    await act(async () => {
      await result.current.updateFileContent('main.tex', 'In-memory unpersisted edit');
    });

    expect(result.current.files.find((f) => f.path === 'main.tex')?.content).toBe(
      'In-memory unpersisted edit'
    );
    storedFile = await store.getFile(activeProject.id, 'main.tex');
    expect(storedFile?.content).toBe('Autosaved content'); // Not written to store yet!

    // 3. Manual save writes dirty in-memory files to store
    await act(async () => {
      await result.current.actions.manualSave();
    });

    storedFile = await store.getFile(activeProject.id, 'main.tex');
    expect(storedFile?.content).toBe('In-memory unpersisted edit');

    // 4. Enabling autosave also flushes dirty files
    await act(async () => {
      await result.current.updateFileContent('main.tex', 'Another unpersisted edit');
    });
    storedFile = await store.getFile(activeProject.id, 'main.tex');
    expect(storedFile?.content).toBe('In-memory unpersisted edit'); // not yet

    await act(async () => {
      result.current.setAutoSave(true);
    });
    storedFile = await store.getFile(activeProject.id, 'main.tex');
    expect(storedFile?.content).toBe('Another unpersisted edit');
  });
});
