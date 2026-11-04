// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import * as pdfjsLib from 'pdfjs-dist';
import { FileTreeSidebar } from '../FileTreeSidebar';
import { DiagnosticsLogPanel, extractMissingPackageName } from '../DiagnosticsLogPanel';
import { ProjectTopBar } from '../ProjectTopBar';
import { PdfPreviewPane } from '../PdfPreviewPane';
import { ThemeProvider } from '../../context/ThemeContext';
import { WorkspaceUI } from '../../App';
import type { Project, ProjectFile, Diagnostic } from '../../types/workspace';

vi.mock('@monaco-editor/react', () => ({
  default: () => <div data-testid="monaco-editor-mock" />,
  useMonaco: () => null,
}));

vi.mock('pdfjs-dist', () => {
  return {
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument: vi.fn().mockImplementation(({ data }: { data: Uint8Array }) => {
      // Detach data.buffer to simulate PDF.js worker transfer
      try {
        structuredClone(data.buffer, { transfer: [data.buffer] });
      } catch {
        // Fallback if transfer not supported in test environment
      }
      return {
        promise: Promise.resolve({
          numPages: 1,
          getPage: vi.fn().mockResolvedValue({
            getViewport: vi.fn().mockReturnValue({ width: 100, height: 100 }),
            render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
          }),
        }),
      };
    }),
  };
});

HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({}) as any;

const sampleProject: Project = {
  id: 'p1',
  name: 'Relativity Paper',
  rootEntry: 'main.tex',
  createdAt: 1,
  updatedAt: 1,
};

const sampleFiles: ProjectFile[] = [
  { projectId: 'p1', path: 'main.tex', content: '...', isBinary: false, updatedAt: 1 },
  { projectId: 'p1', path: 'sections/intro.tex', content: '...', isBinary: false, updatedAt: 1 },
];

let mockWorkspaceState: any;

vi.mock('../../workspace/useWorkspace', () => ({
  useWorkspace: () => mockWorkspaceState,
}));

describe('Workspace UI Components', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    window.history.replaceState({}, '', '/?project=p1');
    mockWorkspaceState = {
      ready: true,
      projects: [sampleProject],
      activeProject: sampleProject,
      activeFilePath: 'main.tex',
      files: sampleFiles,
      openTabs: ['main.tex'],
      compileStatus: 'spotless',
      lastResult: null,
      selectedEngine: 'pdflatex',
      setSelectedEngine: vi.fn(),
      resolvingPackage: null,
      resolvedPackages: [],
      clearResolvedPackages: vi.fn(),
      actions: { compile: vi.fn() },
      selectProject: vi.fn().mockResolvedValue(undefined),
      createNewProject: vi.fn().mockResolvedValue(sampleProject),
      renameActiveProject: vi.fn().mockResolvedValue(undefined),
      deleteProjectById: vi.fn().mockResolvedValue(undefined),
      selectFile: vi.fn(),
      closeTab: vi.fn(),
      createFile: vi.fn(),
      renameFilePath: vi.fn(),
      deleteFilePath: vi.fn(),
      setProjectRootEntry: vi.fn(),
      updateFileContent: vi.fn(),
      updateActiveFileContent: vi.fn(),
      exportActiveProjectZip: vi.fn(),
      importZipAsProject: vi.fn(),
    };
  });

  it('renders FileTreeSidebar with ROOT badge and triggers file selection and root entry changes', () => {
    const onSelectFile = vi.fn();
    const onSetRoot = vi.fn();

    render(
      <FileTreeSidebar
        files={sampleFiles}
        activeFilePath="main.tex"
        rootEntry="main.tex"
        onSelectFile={onSelectFile}
        onCreateFile={vi.fn()}
        onUploadFiles={vi.fn()}
        onRenameFile={vi.fn()}
        onDeleteFile={vi.fn()}
        onSetRootEntry={onSetRoot}
      />
    );

    expect(screen.getByText('main.tex')).toBeInTheDocument();
    expect(screen.getByText('ROOT')).toBeInTheDocument();

    fireEvent.click(screen.getByText('sections/intro.tex'));
    expect(onSelectFile).toHaveBeenCalledWith('sections/intro.tex');
  });

  it('triggers compile when Compile button is clicked in ProjectTopBar', () => {
    const onCompile = vi.fn();
    render(
      <ProjectTopBar
        projects={[sampleProject]}
        activeProject={sampleProject}
        compileStatus="spotless"
        lastDurationMs={120}
        onSelectProject={vi.fn()}
        onCreateProject={vi.fn()}
        onRenameProject={vi.fn()}
        onDeleteProject={vi.fn()}
        onExportZip={vi.fn()}
        onImportZip={vi.fn()}
        onCompile={onCompile}
      />
    );

    expect(screen.getByText(/120ms/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /compile/i }));
    expect(onCompile).toHaveBeenCalledTimes(1);
  });

  it('renders correct status badges in ProjectTopBar for warnings, errors, failed, and spotless', () => {
    const { rerender } = render(
      <ProjectTopBar
        projects={[sampleProject]}
        activeProject={sampleProject}
        compileStatus="spotless"
        onSelectProject={vi.fn()}
        onCreateProject={vi.fn()}
        onRenameProject={vi.fn()}
        onDeleteProject={vi.fn()}
        onExportZip={vi.fn()}
        onImportZip={vi.fn()}
        onCompile={vi.fn()}
      />
    );
    expect(screen.getByText('Build Success')).toBeInTheDocument();

    rerender(
      <ProjectTopBar
        projects={[sampleProject]}
        activeProject={sampleProject}
        compileStatus="warnings"
        onSelectProject={vi.fn()}
        onCreateProject={vi.fn()}
        onRenameProject={vi.fn()}
        onDeleteProject={vi.fn()}
        onExportZip={vi.fn()}
        onImportZip={vi.fn()}
        onCompile={vi.fn()}
      />
    );
    expect(screen.getByText('Warnings')).toBeInTheDocument();

    rerender(
      <ProjectTopBar
        projects={[sampleProject]}
        activeProject={sampleProject}
        compileStatus="errors"
        onSelectProject={vi.fn()}
        onCreateProject={vi.fn()}
        onRenameProject={vi.fn()}
        onDeleteProject={vi.fn()}
        onExportZip={vi.fn()}
        onImportZip={vi.fn()}
        onCompile={vi.fn()}
      />
    );
    expect(screen.getByText('Built with Warnings')).toBeInTheDocument();

    rerender(
      <ProjectTopBar
        projects={[sampleProject]}
        activeProject={sampleProject}
        compileStatus="failed"
        onSelectProject={vi.fn()}
        onCreateProject={vi.fn()}
        onRenameProject={vi.fn()}
        onDeleteProject={vi.fn()}
        onExportZip={vi.fn()}
        onImportZip={vi.fn()}
        onCompile={vi.fn()}
      />
    );
    expect(screen.getByText('Build Failed')).toBeInTheDocument();
  });

  it('renders compiler diagnostics in DiagnosticsLogPanel and invokes onSelectDiagnostic on click', () => {
    const onSelect = vi.fn();
    const diagnostics: Diagnostic[] = [
      { severity: 'error', file: 'main.tex', line: 18, message: 'Undefined control sequence \\badmacro' },
    ];

    render(<DiagnosticsLogPanel diagnostics={diagnostics} onSelectDiagnostic={onSelect} />);
    const item = screen.getByText(/Undefined control sequence/i);
    expect(item).toBeInTheDocument();

    fireEvent.click(item);
    expect(onSelect).toHaveBeenCalledWith(diagnostics[0]);
  });

  it('renders quick-fix action button for missing package and triggers onQuickFixMissingPackage', () => {
    const onQuickFix = vi.fn();
    const onSelect = vi.fn();
    const diagnostics: Diagnostic[] = [
      { severity: 'error', file: 'main.tex', line: 5, message: "LaTeX Error: File 'tcolorbox.sty' not found." },
    ];

    render(
      <DiagnosticsLogPanel
        diagnostics={diagnostics}
        onSelectDiagnostic={onSelect}
        onQuickFixMissingPackage={onQuickFix}
      />
    );

    const quickFixBtn = screen.getByRole('button', { name: /install package "tcolorbox"/i });
    expect(quickFixBtn).toBeInTheDocument();

    fireEvent.click(quickFixBtn);
    expect(onQuickFix).toHaveBeenCalledWith('tcolorbox');
    // Ensure clicking quick-fix button does not trigger selectDiagnostic due to stopPropagation
    expect(onSelect).not.toHaveBeenCalled();
  });

  describe('extractMissingPackageName helper', () => {
    it('correctly extracts package and documentclass names from error messages', () => {
      expect(extractMissingPackageName("LaTeX Error: File 'tcolorbox.sty' not found.")).toBe('tcolorbox');
      expect(extractMissingPackageName("! LaTeX Error: File `tikz-cd.sty' not found.")).toBe('tikz-cd');
      expect(extractMissingPackageName("File 'beamer.cls' not found")).toBe('beamer');
      expect(extractMissingPackageName('File "siunitx.sty" not found')).toBe('siunitx');
      expect(extractMissingPackageName("! I can't find file 'physics.sty'.")).toBe('physics');
      expect(extractMissingPackageName('Undefined control sequence \\textbf')).toBeNull();
      expect(extractMissingPackageName('')).toBeNull();
    });
  });

  it('returns null and takes zero space when DiagnosticsLogPanel has isOpen={false}', () => {
    const diagnostics: Diagnostic[] = [
      { severity: 'error', file: 'main.tex', line: 18, message: 'Syntax error' },
    ];
    const { container } = render(
      <DiagnosticsLogPanel diagnostics={diagnostics} isOpen={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('invokes onClose when close button in DiagnosticsLogPanel is clicked', () => {
    const onClose = vi.fn();
    const diagnostics: Diagnostic[] = [
      { severity: 'error', file: 'main.tex', line: 18, message: 'Syntax error' },
    ];
    render(
      <DiagnosticsLogPanel diagnostics={diagnostics} isOpen={true} onClose={onClose} />
    );
    const closeBtn = screen.getByRole('button', { name: /close problems panel/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders PdfPreviewPane with empty state when no pdfBytes provided', () => {
    render(<PdfPreviewPane pdfBytes={null} compiling={false} />);
    const downloadBtn = screen.getByRole('button', { name: /export \/ download pdf/i });
    expect(downloadBtn).toBeDisabled();
    expect(screen.getByText(/no pdf compiled/i)).toBeInTheDocument();
  });

  it('renders PdfPreviewPane with Build Failed empty state when compileStatus is failed and no pdfBytes', () => {
    render(<PdfPreviewPane pdfBytes={null} compiling={false} compileStatus="failed" />);
    expect(screen.getByText(/build failed/i)).toBeInTheDocument();
    expect(screen.getByText(/check the problems panel/i)).toBeInTheDocument();
  });

  it('renders PdfPreviewPane with preview and status badge when compileStatus is warnings or errors with pdfBytes', async () => {
    const rawBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x35]);
    let rerenderFn: any;
    await act(async () => {
      const { rerender } = render(
        <PdfPreviewPane pdfBytes={rawBytes} compiling={false} compileStatus="warnings" projectName="Paper" />
      );
      rerenderFn = rerender;
    });
    expect(screen.queryByText(/no pdf compiled/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/build failed/i)).not.toBeInTheDocument();
    expect(screen.getByText('Warnings')).toBeInTheDocument();

    await act(async () => {
      rerenderFn(
        <PdfPreviewPane pdfBytes={rawBytes} compiling={false} compileStatus="errors" projectName="Paper" />
      );
    });
    expect(screen.queryByText(/no pdf compiled/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/build failed/i)).not.toBeInTheDocument();
    expect(screen.getByText('Built with Warnings')).toBeInTheDocument();
  });

  it('clones pdfBytes buffer when loading in pdfjs to prevent detachment of original buffer', async () => {
    const rawBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x35]);
    await act(async () => {
      render(<PdfPreviewPane pdfBytes={rawBytes} compiling={false} projectName="Document" />);
    });

    expect(pdfjsLib.getDocument).toHaveBeenCalled();
    const lastCall = vi.mocked(pdfjsLib.getDocument).mock.calls.at(-1)?.[0] as { data: Uint8Array };
    expect(lastCall.data).toBeDefined();
    expect(lastCall.data.buffer).not.toBe(rawBytes.buffer);
    expect(rawBytes.byteLength).toBe(8);
    expect(Array.from(rawBytes)).toEqual([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x35]);
  });

  it('updates rendered pages when recompiled with same page count', async () => {
    const rawBytes1 = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x35, 0x01]);
    const rawBytes2 = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x35, 0x02]);

    const pageMock1 = {
      getViewport: vi.fn().mockReturnValue({ width: 100, height: 100 }),
      render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
    };
    const doc1 = {
      numPages: 1,
      getPage: vi.fn().mockResolvedValue(pageMock1),
    };

    const pageMock2 = {
      getViewport: vi.fn().mockReturnValue({ width: 100, height: 100 }),
      render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
    };
    const doc2 = {
      numPages: 1,
      getPage: vi.fn().mockResolvedValue(pageMock2),
    };

    vi.mocked(pdfjsLib.getDocument)
      .mockReturnValueOnce({ promise: Promise.resolve(doc1) } as any)
      .mockReturnValueOnce({ promise: Promise.resolve(doc2) } as any);

    let rerenderFn: any;
    await act(async () => {
      const { rerender } = render(
        <PdfPreviewPane pdfBytes={rawBytes1} compiling={false} projectName="Document" />
      );
      rerenderFn = rerender;
    });

    expect(doc1.getPage).toHaveBeenCalledWith(1);

    await act(async () => {
      rerenderFn(
        <PdfPreviewPane pdfBytes={rawBytes2} compiling={false} projectName="Document" />
      );
    });

    // doc2 has the exact same page count (1), but must be re-fetched and re-rendered
    expect(doc2.getPage).toHaveBeenCalledWith(1);
  });

  it('maps a PDF double-click to the matching SyncTeX source location', async () => {
    const onNavigateToSource = vi.fn();
    const rawBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x35]);

    await act(async () => {
      render(
        <PdfPreviewPane
          pdfBytes={rawBytes}
          compiling={false}
          syncTexIndex={{
            files: new Map([[1, 'chapters/intro.tex']]),
            blocks: [{ file: 'chapters/intro.tex', line: 27, page: 1, x: 18, y: 18, width: 40, height: 12 }],
          }}
          onNavigateToSource={onNavigateToSource}
        />
      );
    });

    fireEvent.doubleClick(screen.getByTestId('pdf-page-1'), { clientX: 20, clientY: 20 });

    expect(onNavigateToSource).toHaveBeenCalledWith({ file: 'chapters/intro.tex', line: 27 });
  });

  it('downloads PDF as a valid application/pdf Blob and safely defers URL revocation', async () => {
    const createObjectURLMock = vi.fn().mockReturnValue('blob:http://localhost/test-uuid');
    const revokeObjectURLMock = vi.fn();
    globalThis.URL.createObjectURL = createObjectURLMock;
    globalThis.URL.revokeObjectURL = revokeObjectURLMock;

    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const removeSpy = vi.spyOn(document.body, 'removeChild');
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x35, 0x0a]);

    vi.useFakeTimers();
    try {
      await act(async () => {
        render(
          <PdfPreviewPane
            pdfBytes={pdfBytes}
            compiling={false}
            projectName="Quantum Field Theory"
          />
        );
      });

      const downloadBtn = screen.getByRole('button', { name: /export \/ download pdf/i });
      expect(downloadBtn).not.toBeDisabled();

      // PDF.js renders from the bytes directly; only downloads create Blob URLs.
      expect(createObjectURLMock).toHaveBeenCalledTimes(0);

      fireEvent.click(downloadBtn);

      // Download creates a dedicated Blob URL with deferred 10s revocation
      expect(createObjectURLMock).toHaveBeenCalledTimes(1);
      const createdBlob = createObjectURLMock.mock.calls[0][0] as Blob;
      expect(createdBlob).toBeInstanceOf(Blob);
      expect(createdBlob.type).toBe('application/pdf');

      expect(createdBlob.size).toBe(pdfBytes.length);
      const sym = Object.getOwnPropertySymbols(createdBlob)[0];
      const internalBuffer = (createdBlob as any)[sym]?._buffer ?? (createdBlob as any)._buffer;
      if (internalBuffer) {
        expect(Array.from(new Uint8Array(internalBuffer))).toEqual(Array.from(pdfBytes));
      }

      const appendedAnchor = appendSpy.mock.calls.find(
        ([node]) => (node as HTMLElement).tagName === 'A'
      )?.[0] as HTMLAnchorElement;

      expect(appendedAnchor).toBeDefined();
      expect(appendedAnchor.download).toBe('quantum-field-theory.pdf');
      expect(appendedAnchor.href).toBe('blob:http://localhost/test-uuid');
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(removeSpy).toHaveBeenCalledWith(appendedAnchor);

      expect(revokeObjectURLMock).not.toHaveBeenCalled();

      vi.advanceTimersByTime(10000);
      expect(revokeObjectURLMock).toHaveBeenCalledTimes(1);
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:http://localhost/test-uuid');
    } finally {
      vi.useRealTimers();
    }
  });

  it('PdfPreviewPane: does not create a preview Blob URL on mount or unmount', async () => {
    const createObjectURLMock = vi.fn().mockReturnValue('blob:http://localhost/cleanup-uuid');
    const revokeObjectURLMock = vi.fn();
    globalThis.URL.createObjectURL = createObjectURLMock;
    globalThis.URL.revokeObjectURL = revokeObjectURLMock;

    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x35]);

    let unmountFn: () => void = () => {};
    await act(async () => {
      const { unmount } = render(
        <PdfPreviewPane pdfBytes={pdfBytes} compiling={false} projectName="Paper" />
      );
      unmountFn = unmount;
    });

    expect(createObjectURLMock).toHaveBeenCalledTimes(0);
    expect(revokeObjectURLMock).not.toHaveBeenCalled();

    act(() => {
      unmountFn();
    });

    expect(revokeObjectURLMock).not.toHaveBeenCalled();
  });

  it('renders embedded TopMenuBar inside ProjectTopBar and triggers callbacks', () => {
    const onNewFile = vi.fn();
    render(
      <ThemeProvider>
        <ProjectTopBar
          projects={[sampleProject]}
          activeProject={sampleProject}
          compileStatus="spotless"
          onSelectProject={vi.fn()}
          onCreateProject={vi.fn()}
          onRenameProject={vi.fn()}
          onDeleteProject={vi.fn()}
          onExportZip={vi.fn()}
          onImportZip={vi.fn()}
          onCompile={vi.fn()}
          onNewFile={onNewFile}
        />
      </ThemeProvider>
    );

    expect(screen.getByRole('menubar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'File' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tools' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Help' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'File' }));
    fireEvent.click(screen.getByText('New File'));
    expect(onNewFile).toHaveBeenCalledTimes(1);
  });

  it('toggles theme between dark and light mode via ProjectTopBar theme button', () => {
    render(
      <ThemeProvider defaultTheme="dark">
        <ProjectTopBar
          projects={[sampleProject]}
          activeProject={sampleProject}
          compileStatus="spotless"
          onSelectProject={vi.fn()}
          onCreateProject={vi.fn()}
          onRenameProject={vi.fn()}
          onDeleteProject={vi.fn()}
          onExportZip={vi.fn()}
          onImportZip={vi.fn()}
          onCompile={vi.fn()}
        />
      </ThemeProvider>
    );

    const toggleBtn = screen.getByRole('button', { name: /toggle theme/i });
    expect(toggleBtn).toBeInTheDocument();
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    fireEvent.click(toggleBtn);
    expect(document.documentElement.classList.contains('light')).toBe(true);

    fireEvent.click(toggleBtn);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('WorkspaceUI: does NOT render Problems/Build panel when diagnostics is empty', () => {
    mockWorkspaceState.lastResult = {
      status: 'spotless',
      diagnostics: [],
      pdfBytes: null,
      missingFiles: [],
      durationMs: 10,
    };

    render(
      <ThemeProvider>
        <WorkspaceUI />
      </ThemeProvider>
    );

    expect(screen.queryByText(/no problems found in document/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/problems \/ build/i)).not.toBeInTheDocument();
  });

  it('WorkspaceUI: renders Problems/Build panel in sidebar when diagnostics are present', () => {
    mockWorkspaceState.lastResult = {
      status: 'failed',
      diagnostics: [
        { severity: 'error', file: 'main.tex', line: 42, message: 'Missing delimiter $' },
      ],
      pdfBytes: null,
      missingFiles: [],
      durationMs: 40,
    };

    render(
      <ThemeProvider>
        <WorkspaceUI />
      </ThemeProvider>
    );

    expect(screen.getByText('Missing delimiter $')).toBeInTheDocument();
    expect(screen.getByLabelText(/problems \/ build/i)).toBeInTheDocument();

    const closeBtn = screen.getByRole('button', { name: /close problems panel/i });
    fireEvent.click(closeBtn);
    expect(screen.queryByText('Missing delimiter $')).not.toBeInTheDocument();
  });

  it('WorkspaceUI: renders WelcomeHomeScreen when no projects exist', () => {
    mockWorkspaceState.projects = [];
    mockWorkspaceState.activeProject = null;

    render(
      <ThemeProvider>
        <WorkspaceUI />
      </ThemeProvider>
    );

    expect(screen.getByText('Welcome to Torque', { selector: 'h1' })).toBeInTheDocument();
    expect(screen.getByText('No recent projects')).toBeInTheDocument();
  });

  it('WorkspaceUI: shows Welcome to Torque screen first when URL is at root / without project query param', () => {
    window.history.replaceState({}, '', '/');
    render(
      <ThemeProvider>
        <WorkspaceUI />
      </ThemeProvider>
    );

    expect(screen.getByText('Welcome to Torque', { selector: 'h1' })).toBeInTheDocument();
    expect(screen.getByText('Relativity Paper')).toBeInTheDocument();
  });

  it('WorkspaceUI: updates URL search parameters on project select, close, and customize tab switch', async () => {
    window.history.replaceState({}, '', '/');
    render(
      <ThemeProvider>
        <WorkspaceUI />
      </ThemeProvider>
    );

    // Initial state: welcome screen
    expect(screen.getByText('Welcome to Torque', { selector: 'h1' })).toBeInTheDocument();

    // Switch to Customize tab
    fireEvent.click(screen.getByRole('button', { name: 'Customize' }));
    expect(window.location.search).toContain('page=customize');

    // Switch back to Projects
    fireEvent.click(screen.getByRole('button', { name: 'Projects' }));
    expect(window.location.search).not.toContain('page=customize');

    // Open project
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    });
    expect(window.location.search).toContain('project=p1');

    // Close project to return to Welcome
    const torqueBtn = screen.getByRole('button', { name: /return to welcome screen/i });
    fireEvent.click(torqueBtn);
    expect(screen.getByText('Welcome to Torque', { selector: 'h1' })).toBeInTheDocument();
  });

  it('WorkspaceUI: navigates to WelcomeHomeScreen on Close Project or Torque logo click and returns on project select', async () => {
    render(
      <ThemeProvider>
        <WorkspaceUI />
      </ThemeProvider>
    );

    // Click Torque logo to return to Welcome screen
    const torqueBtn = screen.getByRole('button', { name: /return to welcome screen/i });
    fireEvent.click(torqueBtn);

    expect(screen.getByText('Welcome to Torque', { selector: 'h1' })).toBeInTheDocument();
    expect(screen.getByText('Relativity Paper')).toBeInTheDocument();

    // Selecting a project in the Welcome screen returns to workspace
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    });
    expect(mockWorkspaceState.selectProject).toHaveBeenCalledWith('p1');
    expect(screen.queryByText('Welcome to Torque', { selector: 'h1' })).not.toBeInTheDocument();
  });

  it('WorkspaceUI: opens LaTeX Package Manager modal from left activity stripe icon', () => {
    render(
      <ThemeProvider>
        <WorkspaceUI />
      </ThemeProvider>
    );

    const pkgBtn = screen.getByRole('button', { name: 'LaTeX Packages' });
    expect(pkgBtn).toBeInTheDocument();

    fireEvent.click(pkgBtn);

    expect(screen.getByText('LaTeX Package Manager')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search packages/i)).toBeInTheDocument();
  });

  it('WorkspaceUI: opens LaTeX Package Manager modal from Tools menu in TopMenuBar', () => {
    render(
      <ThemeProvider>
        <WorkspaceUI />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tools' }));
    fireEvent.click(screen.getByText('LaTeX Package Manager...'));

    expect(screen.getByText('LaTeX Package Manager')).toBeInTheDocument();
  });

  it('WorkspaceUI: toggles LaTeX Package Manager modal via keyboard shortcut Shift+Alt+P', () => {
    render(
      <ThemeProvider>
        <WorkspaceUI />
      </ThemeProvider>
    );

    expect(screen.queryByText('LaTeX Package Manager')).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'p', shiftKey: true, altKey: true });
    expect(screen.getByText('LaTeX Package Manager')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'p', shiftKey: true, altKey: true });
    expect(screen.queryByText('LaTeX Package Manager')).not.toBeInTheDocument();
  });

  it('WorkspaceUI: missing package diagnostic displays quick-fix button and opens modal pre-populated with package name', () => {
    mockWorkspaceState.lastResult = {
      status: 'failed',
      diagnostics: [
        {
          severity: 'error',
          file: 'main.tex',
          line: 12,
          message: "LaTeX Error: File 'mathtools.sty' not found.",
        },
      ],
      pdfBytes: null,
      missingFiles: [],
      durationMs: 45,
    };

    render(
      <ThemeProvider>
        <WorkspaceUI />
      </ThemeProvider>
    );

    const quickFixBtn = screen.getByRole('button', { name: /install package "mathtools"/i });
    expect(quickFixBtn).toBeInTheDocument();

    fireEvent.click(quickFixBtn);

    expect(screen.getByText('LaTeX Package Manager')).toBeInTheDocument();
    const searchInput = screen.getByPlaceholderText(/search packages/i) as HTMLInputElement;
    expect(searchInput.value).toBe('mathtools');
  });

  it('WorkspaceUI: inserting a package updates file content via workspace.updateFileContent', () => {
    mockWorkspaceState.files = [
      {
        projectId: 'p1',
        path: 'main.tex',
        content: '\\documentclass{article}\n\\begin{document}\nHello world\n\\end{document}',
        isBinary: false,
        updatedAt: 1,
      },
    ];
    mockWorkspaceState.activeFilePath = 'main.tex';

    render(
      <ThemeProvider>
        <WorkspaceUI />
      </ThemeProvider>
    );

    // Open Package Manager
    fireEvent.click(screen.getByRole('button', { name: 'LaTeX Packages' }));
    expect(screen.getByText('LaTeX Package Manager')).toBeInTheDocument();

    // Select amsmath from catalog list and click Insert \usepackage
    const amsmathItem = screen.getByRole('button', { name: /amsmath/i });
    fireEvent.click(amsmathItem);

    const insertBtn = screen.getByRole('button', { name: /insert \\usepackage/i });
    fireEvent.click(insertBtn);

    expect(mockWorkspaceState.updateFileContent).toHaveBeenCalledWith(
      'main.tex',
      '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nHello world\n\\end{document}'
    );
    // Modal should close upon insertion
    expect(screen.queryByText('LaTeX Package Manager')).not.toBeInTheDocument();
  });

  it('renders TeX Engine selector and triggers engine selection', () => {
    const onSelectEngine = vi.fn();
    render(
      <ProjectTopBar
        projects={[sampleProject]}
        activeProject={sampleProject}
        compileStatus="spotless"
        selectedEngine="pdflatex"
        onSelectEngine={onSelectEngine}
        onSelectProject={vi.fn()}
        onCreateProject={vi.fn()}
        onRenameProject={vi.fn()}
        onDeleteProject={vi.fn()}
        onExportZip={vi.fn()}
        onImportZip={vi.fn()}
        onCompile={vi.fn()}
      />
    );

    const engineButton = screen.getByRole('button', { name: /select tex engine/i });
    expect(engineButton).toHaveTextContent('pdflatex');

    fireEvent.click(engineButton);

    const xelatexOption = screen.getByText('latexmk (xelatex)');
    expect(xelatexOption).toBeInTheDocument();

    fireEvent.click(xelatexOption);
    expect(onSelectEngine).toHaveBeenCalledWith('xelatex');
  });

  it('displays resolving package status pill and resolved packages pill', () => {
    const { rerender } = render(
      <ProjectTopBar
        projects={[sampleProject]}
        activeProject={sampleProject}
        compileStatus="compiling"
        resolvingPackage="algorithm2e"
        onSelectProject={vi.fn()}
        onCreateProject={vi.fn()}
        onRenameProject={vi.fn()}
        onDeleteProject={vi.fn()}
        onExportZip={vi.fn()}
        onImportZip={vi.fn()}
        onCompile={vi.fn()}
      />
    );

    expect(screen.getByTestId('status-resolving-package')).toHaveTextContent(
      'Resolving package: algorithm2e...'
    );

    rerender(
      <ProjectTopBar
        projects={[sampleProject]}
        activeProject={sampleProject}
        compileStatus="spotless"
        resolvedPackages={['pgf', 'algorithm2e']}
        onSelectProject={vi.fn()}
        onCreateProject={vi.fn()}
        onRenameProject={vi.fn()}
        onDeleteProject={vi.fn()}
        onExportZip={vi.fn()}
        onImportZip={vi.fn()}
        onCompile={vi.fn()}
      />
    );

    expect(screen.getByTestId('status-resolved-packages')).toHaveTextContent(
      'Downloaded pgf, algorithm2e'
    );
  });
});
