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

  it('renders top bar without min-w-max on flex containers and keeps menu buttons visible', () => {
    const mockProject = {
      id: 'test-proj-2',
      name: 'Very Long LaTeX Research Project Title For Testing',
      rootEntry: 'main.tex',
      createdAt: 1000,
      updatedAt: 2000,
    };

    const { container } = render(
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
        />
      </ThemeProvider>
    );

    // Verify all 5 menu buttons are rendered
    expect(screen.getByRole('button', { name: 'File' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tools' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Help' })).toBeInTheDocument();

    // Verify no flex-1 container forces min-w-max
    const minWMaxContainers = container.querySelectorAll('.min-w-max.flex-1');
    expect(minWMaxContainers.length).toBe(0);

    // Verify containers use min-w-0
    const minWZeroContainers = container.querySelectorAll('.min-w-0.flex-1');
    expect(minWZeroContainers.length).toBeGreaterThanOrEqual(2);
  });
});