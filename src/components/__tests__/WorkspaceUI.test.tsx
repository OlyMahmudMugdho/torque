// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import * as pdfjsLib from 'pdfjs-dist';
import { FileTreeSidebar } from '../FileTreeSidebar';
import { DiagnosticsLogPanel } from '../DiagnosticsLogPanel';
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
    mockWorkspaceState = {
      ready: true,
      projects: [sampleProject],
      activeProject: sampleProject,
      activeFilePath: 'main.tex',
      files: sampleFiles,
      openTabs: ['main.tex'],
      compileStatus: 'spotless',
      lastResult: null,
      actions: { compile: vi.fn() },
      selectProject: vi.fn(),
      createNewProject: vi.fn(),
      renameActiveProject: vi.fn(),
      deleteProjectById: vi.fn(),
      selectFile: vi.fn(),
      closeTab: vi.fn(),
      createFile: vi.fn(),
      renameFilePath: vi.fn(),
      deleteFilePath: vi.fn(),
      setProjectRootEntry: vi.fn(),
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

      fireEvent.click(downloadBtn);

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
});
