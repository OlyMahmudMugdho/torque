import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CloneRepositoryModal, inferRepoName } from '../CloneRepositoryModal';
import { ThemeContext } from '../../context/ThemeContext';

describe('inferRepoName helper', () => {
  it('extracts repo name from standard https git URLs', () => {
    expect(inferRepoName('https://github.com/example/my-latex-project.git')).toBe('my-latex-project');
    expect(inferRepoName('https://gitlab.com/group/subgroup/paper')).toBe('paper');
  });

  it('extracts repo name from ssh git URLs', () => {
    expect(inferRepoName('git@github.com:user/thesis.git')).toBe('thesis');
  });

  it('returns empty string for empty or whitespace-only strings', () => {
    expect(inferRepoName('')).toBe('');
    expect(inferRepoName('   ')).toBe('');
  });
});

describe('CloneRepositoryModal Component', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onClone: vi.fn(),
  };

  const renderWithTheme = (ui: React.ReactElement, theme: 'dark' | 'light' = 'dark') => {
    return render(
      <ThemeContext.Provider
        value={{
          theme,
          setTheme: vi.fn(),
          toggleTheme: vi.fn(),
          editorTheme: 'auto',
          setEditorTheme: vi.fn(),
        }}
      >
        {ui}
      </ThemeContext.Provider>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    renderWithTheme(<CloneRepositoryModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders modal dialog with input fields and buttons when isOpen is true', () => {
    renderWithTheme(<CloneRepositoryModal {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Get from Version Control')).toBeInTheDocument();
    expect(screen.getByLabelText(/^URL/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Directory Name/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clone' })).toBeInTheDocument();
  });

  it('renders correctly in light theme', () => {
    renderWithTheme(<CloneRepositoryModal {...defaultProps} />, 'light');
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    const modalBox = dialog.querySelector('.bg-white');
    expect(modalBox).toBeInTheDocument();
  });

  it('infers directory name automatically when user types URL', () => {
    renderWithTheme(<CloneRepositoryModal {...defaultProps} />);
    const urlInput = screen.getByLabelText(/^URL/i) as HTMLInputElement;
    const nameInput = screen.getByLabelText(/Directory Name/i) as HTMLInputElement;

    fireEvent.change(urlInput, { target: { value: 'https://github.com/torquetex/quantum-paper.git' } });
    expect(nameInput.value).toBe('quantum-paper');
  });

  it('does not overwrite manually edited directory name when URL updates', () => {
    renderWithTheme(<CloneRepositoryModal {...defaultProps} />);
    const urlInput = screen.getByLabelText(/^URL/i) as HTMLInputElement;
    const nameInput = screen.getByLabelText(/Directory Name/i) as HTMLInputElement;

    fireEvent.change(nameInput, { target: { value: 'my-custom-name' } });
    fireEvent.change(urlInput, { target: { value: 'https://github.com/torquetex/quantum-paper.git' } });
    expect(nameInput.value).toBe('my-custom-name');
  });

  it('calls onClose when clicking Cancel button or close icon', () => {
    const onClose = vi.fn();
    renderWithTheme(<CloneRepositoryModal {...defaultProps} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('calls onClose when pressing Escape key', () => {
    const onClose = vi.fn();
    renderWithTheme(<CloneRepositoryModal {...defaultProps} onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClone with URL and project name upon submit', async () => {
    const onClone = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    renderWithTheme(<CloneRepositoryModal {...defaultProps} onClone={onClone} onClose={onClose} />);

    const urlInput = screen.getByLabelText(/^URL/i);
    fireEvent.change(urlInput, { target: { value: 'https://github.com/user/research-notes.git' } });

    const cloneButton = screen.getByRole('button', { name: 'Clone' });
    fireEvent.click(cloneButton);

    await waitFor(() => {
      expect(onClone).toHaveBeenCalledWith('https://github.com/user/research-notes.git', 'research-notes');
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('displays error alert when onClone rejects', async () => {
    const onClone = vi.fn().mockRejectedValue(new Error('Git clone failed: repository not found.'));
    renderWithTheme(<CloneRepositoryModal {...defaultProps} onClone={onClone} />);

    const urlInput = screen.getByLabelText(/^URL/i);
    fireEvent.change(urlInput, { target: { value: 'https://github.com/bad/repo.git' } });

    const cloneButton = screen.getByRole('button', { name: 'Clone' });
    fireEvent.click(cloneButton);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Git clone failed: repository not found.');
    });
  });
});
