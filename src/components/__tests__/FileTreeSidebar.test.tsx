import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { FileTreeSidebar, buildFileTree } from '../FileTreeSidebar';
import type { ProjectFile } from '../../types/workspace';

const mk = (path: string): ProjectFile => ({ projectId: 'p', path, content: '', isBinary: false, updatedAt: 1 });
const files = [
  mk('main.tex'),
  mk('refs.bib'),
  mk('chapters/intro.tex'),
  mk('chapters/deep/x.tex'),
  mk('figs/.keep'),
  mk('Zeta.png'),
];

const setup = (over: Partial<React.ComponentProps<typeof FileTreeSidebar>> = {}) => {
  const props = {
    files,
    activeFilePath: 'main.tex',
    rootEntry: 'main.tex',
    projectName: 'Thesis',
    onSelectFile: vi.fn(),
    onCreateFile: vi.fn().mockResolvedValue(undefined),
    onCreateFolder: vi.fn().mockResolvedValue(undefined),
    onUploadFiles: vi.fn(),
    onRenameFile: vi.fn().mockResolvedValue(undefined),
    onDeleteFile: vi.fn().mockResolvedValue(undefined),
    onSetRootEntry: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
  render(<FileTreeSidebar {...props} />);
  return props;
};

describe('buildFileTree', () => {
  it('nests folders, sorts folders first alphabetically, hides .keep markers', () => {
    const tree = buildFileTree(files);
    expect(tree.map((n) => `${n.type}:${n.name}`)).toEqual([
      'folder:chapters', 'folder:figs', 'file:main.tex', 'file:refs.bib', 'file:Zeta.png',
    ]);
    const chapters = tree[0];
    expect(chapters.children.map((n) => n.name)).toEqual(['deep', 'intro.tex']);
    expect(tree[1].children).toEqual([]); // empty folder from marker
  });
});

describe('FileTreeSidebar (IntelliJ project tree)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('renders header, project name, root badge; folders collapsed unless on active path', () => {
    setup({ activeFilePath: 'chapters/deep/x.tex' });
    expect(screen.getByText('Project')).toBeInTheDocument();
    expect(screen.getByText('Thesis')).toBeInTheDocument();
    expect(screen.getByText('ROOT')).toBeInTheDocument();
    expect(screen.getByText('x.tex')).toBeInTheDocument(); // active path expanded
    expect(screen.queryByText('.keep')).toBeNull();
  });

  it('expands/collapses folders and opens files on click', () => {
    const p = setup();
    expect(screen.queryByText('intro.tex')).toBeNull();
    fireEvent.click(screen.getByText('chapters'));
    fireEvent.click(screen.getByText('intro.tex'));
    expect(p.onSelectFile).toHaveBeenCalledWith('chapters/intro.tex');
    fireEvent.click(screen.getByLabelText('Collapse All'));
    expect(screen.queryByText('intro.tex')).toBeNull();
  });

  it('creates a nested file via the New popup and validates input', async () => {
    const p = setup();
    fireEvent.click(screen.getByLabelText('New'));
    fireEvent.click(screen.getByText('File'));
    const input = screen.getByLabelText('File name');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('alert')).toHaveTextContent(/empty/i);
    fireEvent.change(input, { target: { value: 'main.tex' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('alert')).toHaveTextContent(/already exists/i);
    fireEvent.change(input, { target: { value: '../x.tex' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('alert')).toHaveTextContent(/"\.\."/);
    fireEvent.change(input, { target: { value: 'a/b/c.tex' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(p.onCreateFile).toHaveBeenCalledWith('a/b/c.tex'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('creates a directory in the context-menu target folder; Esc cancels', async () => {
    const p = setup();
    fireEvent.contextMenu(screen.getByText('chapters'));
    fireEvent.click(within(screen.getByTestId('tree-context-menu')).getByText('New'));
    fireEvent.click(screen.getByText('Directory'));
    expect(screen.getByRole('dialog', { name: 'New Directory' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText('Directory name'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.contextMenu(screen.getByText('chapters'));
    fireEvent.click(within(screen.getByTestId('tree-context-menu')).getByText('New'));
    fireEvent.click(screen.getByText('Directory'));
    const input = screen.getByLabelText('Directory name');
    fireEvent.change(input, { target: { value: 'tables' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(p.onCreateFolder).toHaveBeenCalledWith('chapters/tables'));
  });

  it('context menu: set as root, rename (F2 inline) and delete with confirm', async () => {
    const p = setup({ activeFilePath: 'chapters/intro.tex' });
    fireEvent.contextMenu(screen.getByText('intro.tex'));
    fireEvent.click(screen.getByText('Set as Root File'));
    expect(p.onSetRootEntry).toHaveBeenCalledWith('chapters/intro.tex');

    const tree = screen.getByRole('tree');
    fireEvent.click(screen.getByText('intro.tex'));
    fireEvent.keyDown(tree, { key: 'F2' });
    const rename = screen.getByLabelText('Rename');
    fireEvent.change(rename, { target: { value: 'start.tex' } });
    fireEvent.keyDown(rename, { key: 'Enter' });
    await waitFor(() =>
      expect(p.onRenameFile).toHaveBeenCalledWith('chapters/intro.tex', 'chapters/start.tex')
    );

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    fireEvent.click(screen.getByText('intro.tex'));
    fireEvent.keyDown(tree, { key: 'Delete' });
    expect(p.onDeleteFile).not.toHaveBeenCalled();
    fireEvent.keyDown(tree, { key: 'Delete' });
    await waitFor(() => expect(p.onDeleteFile).toHaveBeenCalledWith('chapters/intro.tex'));
    expect(confirmSpy).toHaveBeenCalledTimes(2);
  });

  it('keyboard: arrows move, right/left expand/collapse, Alt+Insert opens New menu', () => {
    setup();
    const tree = screen.getByRole('tree');
    fireEvent.click(screen.getByText('chapters')); // selects + expands
    expect(screen.getByText('intro.tex')).toBeInTheDocument();
    fireEvent.keyDown(tree, { key: 'ArrowLeft' });
    expect(screen.queryByText('intro.tex')).toBeNull();
    fireEvent.keyDown(tree, { key: 'ArrowRight' });
    expect(screen.getByText('intro.tex')).toBeInTheDocument();
    fireEvent.keyDown(tree, { key: 'ArrowDown' });
    expect(screen.getByText('deep').closest('[role=treeitem]')).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tree, { key: 'Insert', altKey: true });
    expect(screen.getByTestId('tree-context-menu')).toBeInTheDocument();
  });
});
