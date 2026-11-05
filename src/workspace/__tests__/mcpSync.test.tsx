// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useWorkspace } from '../useWorkspace';
import { ProjectStore } from '../../storage/projectStore';
import { CompilerClient } from '../../compiler/compilerClient';

describe('MCP live reactive synchronization in useWorkspace', () => {
  let store: ProjectStore;

  beforeEach(() => {
    store = new ProjectStore(`mcp-sync-test-${crypto.randomUUID()}`);
    vi.clearAllMocks();
  });

  it('updates file content smoothly when torque:mcp-file-changed event is dispatched', async () => {
    const mockCompiler = {
      isCompiling: () => false,
      compile: vi.fn(),
      dispose: vi.fn(),
    } as unknown as CompilerClient;

    const { result } = renderHook(() => useWorkspace({ store, compiler: mockCompiler }));
    await waitFor(() => expect(result.current.ready).toBe(true));

    const activeProject = result.current.activeProject;
    expect(activeProject).toBeTruthy();

    const changedContent = '% Updated by AI via MCP\n\\documentclass{article}\n\\begin{document}\nHello MCP!\n\\end{document}';

    act(() => {
      window.dispatchEvent(
        new CustomEvent('torque:mcp-file-changed', {
          detail: {
            projectId: activeProject!.id,
            path: 'main.tex',
            content: changedContent,
          },
        })
      );
    });

    await waitFor(() => {
      const mainFile = result.current.files.find((f) => f.path === 'main.tex');
      expect(mainFile?.content).toBe(changedContent);
    });

    const activeContent = await result.current.actions.getFileContent('main.tex');
    expect(activeContent).toBe(changedContent);
  });

  it('adds newly created file when torque:mcp-file-changed arrives for non-existent path', async () => {
    const mockCompiler = {
      isCompiling: () => false,
      compile: vi.fn(),
      dispose: vi.fn(),
    } as unknown as CompilerClient;

    const { result } = renderHook(() => useWorkspace({ store, compiler: mockCompiler }));
    await waitFor(() => expect(result.current.ready).toBe(true));

    const activeProject = result.current.activeProject;
    const newFileContent = '\\section{Chapter 1}\nSome content';

    act(() => {
      window.dispatchEvent(
        new CustomEvent('torque:mcp-file-changed', {
          detail: {
            projectId: activeProject!.id,
            path: 'chapters/ch1.tex',
            content: newFileContent,
          },
        })
      );
    });

    await waitFor(() => {
      const ch1File = result.current.files.find((f) => f.path === 'chapters/ch1.tex');
      expect(ch1File).toBeTruthy();
      expect(ch1File?.content).toBe(newFileContent);
    });
  });

  it('ignores torque:mcp-file-changed if projectId belongs to a different project', async () => {
    const mockCompiler = {
      isCompiling: () => false,
      compile: vi.fn(),
      dispose: vi.fn(),
    } as unknown as CompilerClient;

    const { result } = renderHook(() => useWorkspace({ store, compiler: mockCompiler }));
    await waitFor(() => expect(result.current.ready).toBe(true));

    const originalContent = await result.current.actions.getFileContent('main.tex');

    act(() => {
      window.dispatchEvent(
        new CustomEvent('torque:mcp-file-changed', {
          detail: {
            projectId: 'other-project-id-999',
            path: 'main.tex',
            content: '% Different project content',
          },
        })
      );
    });

    const currentContent = await result.current.actions.getFileContent('main.tex');
    expect(currentContent).toBe(originalContent);
  });

  it('updates lastResult, compileStatus, diagnostics, and resolvedPackages on torque:mcp-compile-finished', async () => {
    const mockCompiler = {
      isCompiling: () => false,
      compile: vi.fn(),
      dispose: vi.fn(),
    } as unknown as CompilerClient;

    const { result } = renderHook(() => useWorkspace({ store, compiler: mockCompiler }));
    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(result.current.compileStatus).toBe('idle');
    expect(result.current.lastResult).toBeNull();

    act(() => {
      window.dispatchEvent(
        new CustomEvent('torque:mcp-compile-finished', {
          detail: {
            status: 'spotless',
            pdfBytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
            diagnostics: [
              { severity: 'info', message: 'Compilation succeeded' },
            ],
            missingFiles: [],
            durationMs: 420,
            resolvedPackages: ['amsmath', 'geometry'],
          },
        })
      );
    });

    await waitFor(() => {
      expect(result.current.compileStatus).toBe('spotless');
      expect(result.current.lastResult).not.toBeNull();
      expect(result.current.lastResult?.durationMs).toBe(420);
      expect(result.current.lastResult?.pdfBytes).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
      expect(result.current.resolvedPackages).toEqual(['amsmath', 'geometry']);
    });
  });

  it('notifies Tauri via tauri_set_active_project when active project changes in Tauri environment', async () => {
    const mockInvoke = vi.fn().mockResolvedValue(undefined);
    (window as any).__TAURI_INTERNALS__ = {
      invoke: mockInvoke,
      transformCallback: vi.fn((_cb) => 1),
      unregisterCallback: vi.fn(),
    };

    const mockCompiler = {
      isCompiling: () => false,
      compile: vi.fn(),
      dispose: vi.fn(),
    } as unknown as CompilerClient;

    const { result } = renderHook(() => useWorkspace({ store, compiler: mockCompiler }));
    await waitFor(() => expect(result.current.ready).toBe(true));

    // Initially called with the default project ID
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'tauri_set_active_project',
        expect.objectContaining({ projectId: result.current.activeProject?.id })
      );
    });

    delete (window as any).__TAURI_INTERNALS__;
  });
});