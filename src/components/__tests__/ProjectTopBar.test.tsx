// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectTopBar } from '../ProjectTopBar';
import { ThemeProvider } from '../../context/ThemeContext';

describe('ProjectTopBar', () => {
  it('renders MCP status pill and triggers onOpenMcpGuide when clicked', () => {
    const onOpenMcpGuide = vi.fn();
    const mockProject = {
      id: 'test-proj-1',
      name: 'Test Project',
      rootEntry: 'main.tex',
      createdAt: 1000,
      updatedAt: 2000,
    };

    render(
      <ThemeProvider defaultTheme="dark">
        <ProjectTopBar
          projects={[mockProject]}
          activeProject={mockProject}
          compileStatus="idle"
          onSelectProject={vi.fn()}
          onCreateProject={vi.fn()}
          onRenameProject={vi.fn()}
          onDeleteProject={vi.fn()}
          onExportZip={vi.fn()}
          onImportZip={vi.fn()}
          onCompile={vi.fn()}
          onOpenMcpGuide={onOpenMcpGuide}
        />
      </ThemeProvider>
    );

    const mcpPill = screen.getByTestId('mcp-status-pill');
    expect(mcpPill).toBeInTheDocument();
    expect(mcpPill).toHaveTextContent('MCP');

    fireEvent.click(mcpPill);
    expect(onOpenMcpGuide).toHaveBeenCalledTimes(1);
  });
});