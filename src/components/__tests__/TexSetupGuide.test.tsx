// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TexSetupGuide, detectOs } from '../TexSetupGuide';
import { ThemeProvider } from '../../context/ThemeContext';
import type { CompilerDriver } from '../../compiler/compilerDriver';

const mkDriver = (available: boolean): CompilerDriver =>
  ({
    detectEnvironment: vi.fn().mockResolvedValue({ available }),
    compile: vi.fn(),
  }) as unknown as CompilerDriver;

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('TexSetupGuide', () => {
  it('renders nothing when closed', () => {
    wrap(<TexSetupGuide isOpen={false} onClose={vi.fn()} missingRequirements={['latexmk']} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lists missing requirements and OS instructions', () => {
    wrap(<TexSetupGuide isOpen onClose={vi.fn()} missingRequirements={['latexmk', 'xelatex']} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('missing-list')).toHaveTextContent('latexmk');
    expect(screen.getByTestId('missing-list')).toHaveTextContent('xelatex');
    expect(screen.getByText(/winget install MiKTeX.MiKTeX/)).toBeInTheDocument();
    expect(screen.getByText(/brew install --cask mactex-no-gui/)).toBeInTheDocument();
  });

  it('detects OS', () => {
    expect(detectOs('Win32', '')).toBe('windows');
    expect(detectOs('MacIntel', '')).toBe('macos');
    expect(detectOs('Linux x86_64', 'X11; Linux')).toBe('debian');
  });

  it('re-check closes when environment becomes available', async () => {
    const onClose = vi.fn();
    wrap(<TexSetupGuide isOpen onClose={onClose} missingRequirements={['latexmk']} driver={mkDriver(true)} />);
    fireEvent.click(screen.getByRole('button', { name: /re-check/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('re-check stays open when still unavailable', async () => {
    const onClose = vi.fn();
    wrap(<TexSetupGuide isOpen onClose={onClose} missingRequirements={['latexmk']} driver={mkDriver(false)} />);
    fireEvent.click(screen.getByRole('button', { name: /re-check/i }));
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });
});
