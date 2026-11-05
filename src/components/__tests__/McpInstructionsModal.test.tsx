// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { McpInstructionsModal } from '../McpInstructionsModal';
import { ThemeProvider } from '../../context/ThemeContext';

function renderModal(props: { isOpen: boolean; onClose: () => void; port?: number }) {
  return render(
    <ThemeProvider defaultTheme="dark">
      <McpInstructionsModal {...props} />
    </ThemeProvider>
  );
}

describe('McpInstructionsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = renderModal({ isOpen: false, onClose: vi.fn() });
    expect(container.firstChild).toBeNull();
  });

  it('renders modal dialog with active port and status when isOpen is true', () => {
    renderModal({ isOpen: true, onClose: vi.fn(), port: 3030 });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Model Context Protocol \(MCP\) AI Assistant Guide/i)).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('3030')).toBeInTheDocument();
    expect(screen.getByText('http://127.0.0.1:3030/sse')).toBeInTheDocument();
  });

  it('renders client configuration tabs and switches between them', () => {
    renderModal({ isOpen: true, onClose: vi.fn() });

    // Client tabs
    expect(screen.getByText('Claude Desktop')).toBeInTheDocument();
    expect(screen.getByText('Cursor')).toBeInTheDocument();
    expect(screen.getByText('Antigravity / Cline')).toBeInTheDocument();
    expect(screen.getByText('Zed')).toBeInTheDocument();

    // Default tab is Claude Desktop
    expect(screen.getByText('Configure Claude Desktop')).toBeInTheDocument();
    expect(screen.getAllByText('claude_desktop_config.json').length).toBeGreaterThanOrEqual(1);

    // Switch to Cursor
    fireEvent.click(screen.getByText('Cursor'));
    expect(screen.getByText('Configure Cursor')).toBeInTheDocument();
    expect(screen.getAllByText(/http:\/\/127\.0\.0\.1:3030\/sse/).length).toBeGreaterThanOrEqual(1);

    // Switch to Zed
    fireEvent.click(screen.getByText('Zed'));
    expect(screen.getByText('Configure Zed')).toBeInTheDocument();
    expect(screen.getByText(/context_servers/)).toBeInTheDocument();
  });

  it('switches to AI Tools summary tab and displays tool list', () => {
    renderModal({ isOpen: true, onClose: vi.fn() });

    const toolsBtn = screen.getByRole('button', { name: /AI Tools/i });
    fireEvent.click(toolsBtn);

    expect(screen.getByText('Available AI Editing Tools')).toBeInTheDocument();
    expect(screen.getByText('torque_read_file')).toBeInTheDocument();
    expect(screen.getByText('torque_edit_file')).toBeInTheDocument();
    expect(screen.getByText('torque_write_file')).toBeInTheDocument();
    expect(screen.getByText('torque_compile')).toBeInTheDocument();
    expect(screen.getByText('torque_get_diagnostics')).toBeInTheDocument();
  });

  it('copies configuration snippet to clipboard when clicking Copy JSON', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    renderModal({ isOpen: true, onClose: vi.fn() });

    const copyBtn = screen.getByRole('button', { name: /Copy JSON/i });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Copied!')).toBeInTheDocument();
    });
  });

  it('calls onClose when clicking close button, close footer button, or pressing Escape', () => {
    const onClose = vi.fn();
    renderModal({ isOpen: true, onClose });

    // Close button (X)
    const closeX = screen.getByLabelText('Close MCP Guide');
    fireEvent.click(closeX);
    expect(onClose).toHaveBeenCalledTimes(1);

    // Footer close button
    const footerClose = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(footerClose);
    expect(onClose).toHaveBeenCalledTimes(2);

    // Escape key
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});