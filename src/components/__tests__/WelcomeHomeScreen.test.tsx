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
      ...props,
    };

    const renderResult = render(
      <ThemeProvider defaultTheme={initialTheme}>
        <WelcomeHomeScreen {...defaultProps} />
      </ThemeProvider>
    );

    return { ...renderResult, props: defaultProps };
  };

  describe('Title Bar & Sidebar Branding', () => {
    it('renders title bar with app title and no window control buttons', () => {
      renderComponent();

      // Window title
      expect(screen.getByText('Welcome to Torque', { selector: 'span' })).toBeInTheDocument();

      // No window control buttons (minimize/maximize/close removed)
      expect(screen.queryByRole('button', { name: 'Minimize' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Maximize' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    });

    it('renders full-screen responsive window container', () => {
      const { container } = renderComponent();

      // Outer backdrop fills the viewport
      const backdrop = container.firstChild as HTMLElement;
      expect(backdrop.className).toContain('w-screen');
      expect(backdrop.className).toContain('h-screen');

      // Inner window container is full-width/full-height with rounded corners on sm+
      const windowContainer = backdrop.querySelector('div') as HTMLElement;
      expect(windowContainer.className).toContain('w-full');
      expect(windowContainer.className).toContain('h-full');
      expect(windowContainer.className).toContain('rounded-none');
      expect(windowContainer.className).toContain('sm:rounded-lg');
    });

    it('renders left sidebar branding with app name, version, and subtitle', () => {
      renderComponent();

      // Sidebar branding
      expect(screen.getByText('Torque')).toBeInTheDocument();
      expect(screen.getByText('0.1.0')).toBeInTheDocument();
      expect(
        screen.getByText('An open-source IDE inspired by IntelliJ IDEA')
      ).toBeInTheDocument();
      expect(screen.getByText('TQ')).toBeInTheDocument();
    });

    it('confirms ABSOLUTELY NO plugin section or plugins tab exists', () => {
      renderComponent();

      expect(screen.queryByText(/plugins/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /plugins/i })).not.toBeInTheDocument();
    });
  });

  describe('Empty Projects State & Action Cards', () => {
    it('renders centered welcome empty state layout with all 4 action cards', () => {
      renderComponent({ projects: [] });

      // Heading and subtitles matching IntelliJ IDEA welcome screen
      expect(screen.getByText('Welcome to Torque', { selector: 'h1' })).toBeInTheDocument();
      expect(
        screen.getByText('Open a folder from disk or clone a repository from version control.')
      ).toBeInTheDocument();
      expect(
        screen.getByText('You can also drop a folder onto this window.')
      ).toBeInTheDocument();
      expect(screen.getByText('No recent projects')).toBeInTheDocument();

      // All 4 Action Cards
      expect(screen.getByRole('button', { name: 'New Project' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Clone Repository' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Remote Development' })).toBeInTheDocument();
    });

    it('clicking "New Project" card opens JetBrains New Project modal and triggers onCreateProject on submit', async () => {
      const { props } = renderComponent({ projects: [] });

      const newProjCard = screen.getByRole('button', { name: 'New Project' });
      fireEvent.click(newProjCard);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /new project/i })).toBeInTheDocument();

      const nameInput = screen.getByLabelText(/name:/i);
      fireEvent.change(nameInput, { target: { value: 'My New Thesis' } });

      const createBtn = screen.getByRole('button', { name: /create/i });
      fireEvent.click(createBtn);

      expect(props.onCreateProject).toHaveBeenCalledWith('My New Thesis', expect.any(Array), 'main.tex');
    });

    it('does not trigger onCreateProject if user cancels the New Project modal', async () => {
      const { props } = renderComponent({ projects: [] });

      const newProjCard = screen.getByRole('button', { name: 'New Project' });
      fireEvent.click(newProjCard);

      expect(screen.getByRole('dialog')).toBeInTheDocument();

      const cancelBtn = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelBtn);

      expect(props.onCreateProject).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('clicking "Open" card triggers file input click', () => {
      renderComponent({ projects: [] });

      const zipInput = screen.getByTestId('welcome-zip-input');
      const clickSpy = vi.spyOn(zipInput, 'click');

      const openCard = screen.getByRole('button', { name: 'Open' });
      fireEvent.click(openCard);

      expect(clickSpy).toHaveBeenCalled();
    });

    it('clicking "Clone Repository" card prompts for Git URL and creates project', async () => {
      const promptSpy = vi
        .spyOn(window, 'prompt')
        .mockReturnValue('https://github.com/example/quantum-mechanics.git');
      const { props } = renderComponent({ projects: [] });

      const cloneCard = screen.getByRole('button', { name: 'Clone Repository' });
      fireEvent.click(cloneCard);

      expect(promptSpy).toHaveBeenCalledWith('Enter Git repository URL:');
      expect(props.onCreateProject).toHaveBeenCalledWith('quantum-mechanics');
    });

    it('cancelling Git URL prompt does not trigger onCreateProject', async () => {
      vi.spyOn(window, 'prompt').mockReturnValue(null);
      const { props } = renderComponent({ projects: [] });

      const cloneCard = screen.getByRole('button', { name: 'Clone Repository' });
      fireEvent.click(cloneCard);

      expect(props.onCreateProject).not.toHaveBeenCalled();
    });

    it('clicking "Remote Development" card alerts user about coming soon', () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      renderComponent({ projects: [] });

      const remoteDevCard = screen.getByRole('button', { name: 'Remote Development' });
      fireEvent.click(remoteDevCard);

      expect(alertSpy).toHaveBeenCalledWith('Remote Development is coming soon in Torque.');
    });

    it('supports drag and drop in empty state to import files', async () => {
      const { props } = renderComponent({ projects: [] });

      const emptyContainer = screen.getByTestId('welcome-empty-state');
      const file = new File(['fake zip content'], 'project.zip', { type: 'application/zip' });

      // dragOver triggers overlay
      fireEvent.dragOver(emptyContainer);
      expect(
        screen.getByText('Drop folder or .zip file here to import')
      ).toBeInTheDocument();

      // dragLeave removes overlay
      fireEvent.dragLeave(emptyContainer);
      expect(
        screen.queryByText('Drop folder or .zip file here to import')
      ).not.toBeInTheDocument();

      // drop calls onImportZip
      fireEvent.drop(emptyContainer, {
        dataTransfer: {
          files: [file],
        },
      });

      expect(props.onImportZip).toHaveBeenCalledWith(file);
    });
  });

  describe('Projects List & Search Filter (When Projects Exist)', () => {
    it('displays top action header with New Project and Open buttons', () => {
      renderComponent();

      // Top action header buttons
      expect(screen.getByRole('button', { name: /new project/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /open from disk/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /clone repository/i })).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Search projects...')).toBeInTheDocument();
    });

    it('triggers onCreateProject from top header New Project button via modal', async () => {
      const { props } = renderComponent();

      const newBtn = screen.getByRole('button', { name: /new project/i });
      fireEvent.click(newBtn);

      expect(screen.getByRole('dialog')).toBeInTheDocument();

      const nameInput = screen.getByLabelText(/name:/i);
      fireEvent.change(nameInput, { target: { value: 'Another Thesis' } });

      const createBtn = screen.getByRole('button', { name: /create/i });
      fireEvent.click(createBtn);

      expect(props.onCreateProject).toHaveBeenCalledWith('Another Thesis', expect.any(Array), 'main.tex');
    });

    it('triggers file input from top header Open button', () => {
      renderComponent();

      const zipInput = screen.getByTestId('welcome-zip-input');
      const clickSpy = vi.spyOn(zipInput, 'click');

      const openBtn = screen.getByRole('button', { name: /open from disk/i });
      fireEvent.click(openBtn);

      expect(clickSpy).toHaveBeenCalled();
    });

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

    it('triggers onImportZip when a zip file is selected via file input', async () => {
      const { props } = renderComponent();

      const input = screen.getByTestId('welcome-zip-input') as HTMLInputElement;
      const file = new File(['mock zip content'], 'project.zip', { type: 'application/zip' });

      fireEvent.change(input, { target: { files: [file] } });

      expect(props.onImportZip).toHaveBeenCalledWith(file);
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

  describe('formatLastModified helper', () => {
    it('formats timestamps accurately', () => {
      expect(formatLastModified(0)).toBe('Unknown');
      expect(formatLastModified(Date.now() - 30000)).toBe('Just now');
      expect(formatLastModified(Date.now() - 1000 * 60 * 15)).toBe('15m ago');
      expect(formatLastModified(Date.now() - 1000 * 60 * 60 * 4)).toBe('4h ago');
    });
  });
});
