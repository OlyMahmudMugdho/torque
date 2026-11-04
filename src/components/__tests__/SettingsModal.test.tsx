// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsModal, type SettingsModalProps } from '../SettingsModal';
import { ThemeProvider } from '../../context/ThemeContext';

function renderSettingsModal(props: Partial<SettingsModalProps> = {}) {
  const defaultProps: SettingsModalProps = {
    isOpen: true,
    onClose: vi.fn(),
    theme: 'dark',
    onThemeChange: vi.fn(),
    autoSave: true,
    onAutoSaveChange: vi.fn(),
    selectedEngine: 'pdflatex',
    onEngineChange: vi.fn(),
    ...props,
  };

  return {
    ...render(
      <ThemeProvider defaultTheme={defaultProps.theme || 'dark'}>
        <SettingsModal {...defaultProps} />
      </ThemeProvider>
    ),
    props: defaultProps,
  };
}

describe('SettingsModal', () => {
  it('does not render when isOpen is false', () => {
    renderSettingsModal({ isOpen: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders modal with title and categories when isOpen is true', () => {
    renderSettingsModal({ isOpen: true });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Appearance/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Editor/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Build & Execution/i })).toBeInTheDocument();
  });

  it('switches between categories when category buttons are clicked', () => {
    renderSettingsModal();

    // Defaults to Appearance category
    expect(screen.getByText('Darcula (Dark)')).toBeInTheDocument();
    expect(screen.getByText('IntelliJ Light')).toBeInTheDocument();

    // Switch to Editor category
    fireEvent.click(screen.getByRole('button', { name: /Editor/i }));
    expect(screen.getByTestId('autosave-checkbox')).toBeInTheDocument();
    expect(screen.getByText(/Enable Auto-save/i)).toBeInTheDocument();

    // Switch to Build & Execution category
    fireEvent.click(screen.getByRole('button', { name: /Build & Execution/i }));
    expect(screen.getByText('latexmk (pdflatex)')).toBeInTheDocument();
    expect(screen.getByText('latexmk (xelatex)')).toBeInTheDocument();
    expect(screen.getByText('latexmk (lualatex)')).toBeInTheDocument();
  });

  it('allows changing theme and calls onThemeChange on Apply or OK', () => {
    const onThemeChange = vi.fn();
    const onClose = vi.fn();
    renderSettingsModal({ theme: 'dark', onThemeChange, onClose });

    // Select light theme
    const lightRadio = screen.getByLabelText(/IntelliJ Light/i);
    fireEvent.click(lightRadio);

    // Click Apply
    const applyBtn = screen.getByRole('button', { name: 'Apply' });
    fireEvent.click(applyBtn);

    expect(onThemeChange).toHaveBeenCalledWith('light');
    expect(onClose).not.toHaveBeenCalled();

    // Click OK
    const okBtn = screen.getByRole('button', { name: 'OK' });
    fireEvent.click(okBtn);

    expect(onThemeChange).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('allows toggling autosave and calls onAutoSaveChange on Apply or OK', () => {
    const onAutoSaveChange = vi.fn();
    const onClose = vi.fn();
    renderSettingsModal({ autoSave: true, onAutoSaveChange, onClose });

    // Switch to Editor category
    fireEvent.click(screen.getByRole('button', { name: /Editor/i }));

    const checkbox = screen.getByTestId('autosave-checkbox');
    expect(checkbox).toBeChecked();

    // Uncheck autoSave
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();

    // Click OK
    const okBtn = screen.getByRole('button', { name: 'OK' });
    fireEvent.click(okBtn);

    expect(onAutoSaveChange).toHaveBeenCalledWith(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('allows selecting TeX engine and calls onEngineChange on OK', () => {
    const onEngineChange = vi.fn();
    const onClose = vi.fn();
    renderSettingsModal({ selectedEngine: 'pdflatex', onEngineChange, onClose });

    // Switch to Build category
    fireEvent.click(screen.getByRole('button', { name: /Build & Execution/i }));

    const xelatexRadio = screen.getByLabelText(/latexmk \(xelatex\)/i);
    fireEvent.click(xelatexRadio);

    const okBtn = screen.getByRole('button', { name: 'OK' });
    fireEvent.click(okBtn);

    expect(onEngineChange).toHaveBeenCalledWith('xelatex');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes dialog on Cancel without applying changes', () => {
    const onThemeChange = vi.fn();
    const onAutoSaveChange = vi.fn();
    const onClose = vi.fn();
    renderSettingsModal({ theme: 'dark', autoSave: true, onThemeChange, onAutoSaveChange, onClose });

    // Switch to Editor category and toggle
    fireEvent.click(screen.getByRole('button', { name: /Editor/i }));
    const checkbox = screen.getByTestId('autosave-checkbox');
    fireEvent.click(checkbox);

    // Click Cancel
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelBtn);

    expect(onAutoSaveChange).not.toHaveBeenCalled();
    expect(onThemeChange).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes dialog when pressing Escape or clicking X button', () => {
    const onClose = vi.fn();
    renderSettingsModal({ onClose });

    // Escape key
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    // Close button (X)
    const closeBtn = screen.getByLabelText('Close Settings');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
