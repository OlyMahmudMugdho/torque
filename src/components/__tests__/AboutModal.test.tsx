import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AboutModal } from '../AboutModal';
import { ThemeContext } from '../../context/ThemeContext';
import { APP_VERSION, APP_NAME } from '../../version';

describe('AboutModal component', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
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
    renderWithTheme(<AboutModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders minimalist modal dialog with logo, app name, and clean version', () => {
    renderWithTheme(<AboutModal {...defaultProps} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: APP_NAME })).toBeInTheDocument();
    expect(screen.getByAltText('Torque Logo')).toBeInTheDocument();
    expect(screen.getByText(APP_VERSION)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();

    // Verify unwanted elements are absent
    expect(screen.queryByText(`v${APP_VERSION}`)).not.toBeInTheDocument();
    expect(screen.queryByText(/copy system info/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Native TeX Live')).not.toBeInTheDocument();
    expect(screen.queryByText('CTAN Auto-Resolver')).not.toBeInTheDocument();
    expect(screen.queryByText('Monaco Code Editor')).not.toBeInTheDocument();
    expect(screen.queryByText('AI Research Assistant')).not.toBeInTheDocument();
    expect(screen.queryByText(/runtime:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/license:/i)).not.toBeInTheDocument();
  });

  it('closes when clicking Close button or close icon', () => {
    const onClose = vi.fn();
    renderWithTheme(<AboutModal {...defaultProps} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('closes when pressing Escape key', () => {
    const onClose = vi.fn();
    renderWithTheme(<AboutModal {...defaultProps} onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
