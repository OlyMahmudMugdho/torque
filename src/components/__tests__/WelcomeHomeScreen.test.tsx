// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WelcomeHomeScreen, formatLastModified } from '../WelcomeHomeScreen';
import { ThemeProvider, THEME_STORAGE_KEY } from '../../context/ThemeContext';
import type { Project } from '../../types/workspace';

const mockProjects: Project[] = [
  {
    id: 'p1',
    name: 'Quantum Optics Paper',
    rootEntry: 'main.tex',
    createdAt: 1000,
    updatedAt: Date.now() - 1000 * 60 * 5, // 5 min ago
  },
  {
    id: 'p2',
    name: 'Thesis Chapter 1',
    rootEntry: 'thesis.tex',
    createdAt: 2000,
    updatedAt: Date.now() - 1000 * 60 * 60 * 3, // 3 hours ago
  },
  {
    id: 'p3',
    name: 'Algebraic Geometry Notes',
    rootEntry: 'notes.tex',
    createdAt: 3000,
    updatedAt: Date.now() - 1000 * 60 * 60 * 48, // 2 days ago
  },
];

describe('WelcomeHomeScreen', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    vi.restoreAllMocks();
  });

  const renderComponent = (props = {}, initialTheme: 'dark' | 'light' = 'dark') => {
    const defaultProps = {
      projects: mockProjects,
      activeProjectId: 'p1',
      onSelectProject: vi.fn(),
      onCreateProject: vi.fn(),
      onImportZip: vi.fn(),
      onDeleteProject: vi.fn(),
      onCloseWelcome: vi.fn(),
      ...props,
    };

    const renderResult = render(
      <ThemeProvider defaultTheme={initialTheme}>
        <WelcomeHomeScreen {...defaultProps} />
      </ThemeProvider>
    );

    return { ...renderResult, props: defaultProps };
  };

  describe('Hero & Action Buttons', () => {
    it('renders Welcome hero and action buttons (New Project, Open / Import Zip)', () => {
      renderComponent();

      // Window title and hero
      expect(screen.getByText('Welcome to Torque', { selector: 'h1' })).toBeInTheDocument();
      expect(
        screen.getByText('Open a project, create a new LaTeX document, or import from zip.')
      ).toBeInTheDocument();

      // Action buttons
      expect(screen.getByRole('button', { name: /new project/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /open project \/ import zip/i })).toBeInTheDocument();

      // Sidebar branding
      expect(screen.getByText('Torque')).toBeInTheDocument();
      expect(screen.getByText('0.1.0')).toBeInTheDocument();
      expect(screen.getByText(/an open-source latex ide/i)).toBeInTheDocument();
    });

    it('triggers onCreateProject when New Project button is clicked and user provides a name', async () => {
      const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('My New Thesis');
      const { props } = renderComponent();

      const newProjBtn = screen.getByRole('button', { name: /new project/i });
      fireEvent.click(newProjBtn);

      expect(promptSpy).toHaveBeenCalledWith('Enter new project name:', 'Untitled Project');
      expect(props.onCreateProject).toHaveBeenCalledWith('My New Thesis');
    });

    it('does not trigger onCreateProject if user cancels prompt', async () => {
      vi.spyOn(window, 'prompt').mockReturnValue(null);
      const { props } = renderComponent();

      const newProjBtn = screen.getByRole('button', { name: /new project/i });
      fireEvent.click(newProjBtn);

      expect(props.onCreateProject).not.toHaveBeenCalled();
    });

    it('triggers onImportZip when a zip file is selected via file input', async () => {
      const { props } = renderComponent();

      const input = screen.getByTestId('welcome-zip-input') as HTMLInputElement;
      const file = new File(['mock zip content'], 'project.zip', { type: 'application/zip' });

      fireEvent.change(input, { target: { files: [file] } });

      expect(props.onImportZip).toHaveBeenCalledWith(file);
    });
  });

  describe('Projects List & Search Filter', () => {
    it('displays list of projects with name, root entry, and timestamp', () => {
      renderComponent();

      expect(screen.getByText('Quantum Optics Paper')).toBeInTheDocument();
      expect(screen.getByText('main.tex')).toBeInTheDocument();

      expect(screen.getByText('Thesis Chapter 1')).toBeInTheDocument();
      expect(screen.getByText('thesis.tex')).toBeInTheDocument();

      expect(screen.getByText('Algebraic Geometry Notes')).toBeInTheDocument();
      expect(screen.getByText('notes.tex')).toBeInTheDocument();

      // Current badge for active project
      expect(screen.getByText('Current')).toBeInTheDocument();
    });

    it('filters projects by search query matching name or rootEntry', () => {
      renderComponent();

      const searchInput = screen.getByPlaceholderText('Search projects...');

      // Filter by 'optics'
      fireEvent.change(searchInput, { target: { value: 'optics' } });
      expect(screen.getByText('Quantum Optics Paper')).toBeInTheDocument();
      expect(screen.queryByText('Thesis Chapter 1')).not.toBeInTheDocument();
      expect(screen.queryByText('Algebraic Geometry Notes')).not.toBeInTheDocument();

      // Filter by root entry 'thesis.tex'
      fireEvent.change(searchInput, { target: { value: 'thesis.tex' } });
      expect(screen.queryByText('Quantum Optics Paper')).not.toBeInTheDocument();
      expect(screen.getByText('Thesis Chapter 1')).toBeInTheDocument();
      expect(screen.queryByText('Algebraic Geometry Notes')).not.toBeInTheDocument();

      // Filter with no match
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } });
      expect(screen.getByText(/no projects matching “nonexistent”/i)).toBeInTheDocument();

      // Clear search
      const clearBtn = screen.getByLabelText('Clear search');
      fireEvent.click(clearBtn);
      expect(screen.getByText('Quantum Optics Paper')).toBeInTheDocument();
      expect(screen.getByText('Thesis Chapter 1')).toBeInTheDocument();
      expect(screen.getByText('Algebraic Geometry Notes')).toBeInTheDocument();
    });

    it('clicking a project row calls onSelectProject', () => {
      const { props } = renderComponent();

      const projectItem = screen.getByText('Thesis Chapter 1');
      fireEvent.click(projectItem);

      expect(props.onSelectProject).toHaveBeenCalledWith('p2');
    });

    it('clicking Open button on a project calls onSelectProject', () => {
      const { props } = renderComponent();

      const openButtons = screen.getAllByRole('button', { name: 'Open' });
      fireEvent.click(openButtons[0]);

      expect(props.onSelectProject).toHaveBeenCalledWith('p1');
    });

    it('clicking Delete button prompts for confirmation and calls onDeleteProject', () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const { props } = renderComponent();

      const deleteBtn = screen.getByLabelText('Delete project Quantum Optics Paper');
      fireEvent.click(deleteBtn);

      expect(confirmSpy).toHaveBeenCalledWith(
        'Delete project "Quantum Optics Paper"? This cannot be undone.'
      );
      expect(props.onDeleteProject).toHaveBeenCalledWith('p1');
    });

    it('cancelling delete confirmation does not call onDeleteProject', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      const { props } = renderComponent();

      const deleteBtn = screen.getByLabelText('Delete project Quantum Optics Paper');
      fireEvent.click(deleteBtn);

      expect(props.onDeleteProject).not.toHaveBeenCalled();
    });

    it('displays empty state when no projects exist', () => {
      renderComponent({ projects: [] });

      expect(screen.getByText('No recent projects')).toBeInTheDocument();
      expect(
        screen.getByText(/get started by creating a new project or importing an existing latex zip/i)
      ).toBeInTheDocument();
    });
  });

  describe('Customize Tab & Theme Switching', () => {
    it('Customize tab allows theme toggling (Dark/Light)', () => {
      renderComponent({}, 'dark');

      expect(document.documentElement.classList.contains('dark')).toBe(true);

      // Switch to Customize tab
      const customizeNavBtn = screen.getByRole('button', { name: 'Customize' });
      fireEvent.click(customizeNavBtn);

      expect(screen.getByRole('heading', { name: 'Customize' })).toBeInTheDocument();
      expect(screen.getByText('IntelliJ Dark')).toBeInTheDocument();
      expect(screen.getByText('IntelliJ Light')).toBeInTheDocument();

      // Click IntelliJ Light
      const lightOption = screen.getByText('IntelliJ Light');
      fireEvent.click(lightOption);

      expect(document.documentElement.classList.contains('light')).toBe(true);
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');

      // Click IntelliJ Dark
      const darkOption = screen.getByText('IntelliJ Dark');
      fireEvent.click(darkOption);

      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    });

    it('allows changing editor font size in Customize tab', () => {
      renderComponent();

      fireEvent.click(screen.getByRole('button', { name: 'Customize' }));

      const largeFontBtn = screen.getByRole('button', { name: /large 16px/i });
      fireEvent.click(largeFontBtn);

      expect(largeFontBtn.className).toContain('border-[#3574f0]');
    });

    it('navigates to Customize tab when bottom Settings button is clicked', () => {
      renderComponent();

      const settingsBtn = screen.getByRole('button', { name: 'Settings' });
      fireEvent.click(settingsBtn);

      expect(screen.getByRole('heading', { name: 'Customize' })).toBeInTheDocument();
    });
  });

  describe('Window Controls', () => {
    it('calls onCloseWelcome when close button in title bar is clicked', () => {
      const { props } = renderComponent();

      const closeBtn = screen.getByRole('button', { name: 'Close' });
      fireEvent.click(closeBtn);

      expect(props.onCloseWelcome).toHaveBeenCalledTimes(1);
    });
  });

  describe('formatLastModified helper', () => {
    it('formats timestamps accurately', () => {
      expect(formatLastModified(0)).toBe('Unknown');
      expect(formatLastModified(Date.now() - 30000)).toBe('Just now');
      expect(formatLastModified(Date.now() - 1000 * 60 * 15)).toBe('15m ago');
      expect(formatLastModified(Date.now() - 1000 * 60 * 60 * 4)).toBe('4h ago');
    });
  });
});
