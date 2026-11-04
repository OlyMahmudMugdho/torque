// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TopMenuBar, type TopMenuBarProps } from '../TopMenuBar';
import { ThemeProvider, THEME_STORAGE_KEY } from '../../context/ThemeContext';

function renderTopMenuBar(props: TopMenuBarProps = {}, initialTheme: 'dark' | 'light' = 'dark') {
  return render(
    <ThemeProvider defaultTheme={initialTheme}>
      <TopMenuBar {...props} />
    </ThemeProvider>
  );
}

describe('TopMenuBar', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
  });

  describe('Rendering', () => {
    it('renders all top-level menus: File, Edit, View, Tools, Help', () => {
      renderTopMenuBar();

      expect(screen.getByRole('button', { name: 'File' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'View' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Tools' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Help' })).toBeInTheDocument();
    });

    it('does not display any dropdown menus initially', () => {
      renderTopMenuBar();

      expect(screen.queryByText('New File')).not.toBeInTheDocument();
      expect(screen.queryByText('Undo')).not.toBeInTheDocument();
      expect(screen.queryByText('Toggle Sidebar')).not.toBeInTheDocument();
      expect(screen.queryByText('Engine: latexmk (pdflatex)')).not.toBeInTheDocument();
      expect(screen.queryByText('About Torque')).not.toBeInTheDocument();
    });
  });

  describe('File Menu', () => {
    it('opens File dropdown when clicking "File"', () => {
      renderTopMenuBar();

      fireEvent.click(screen.getByRole('button', { name: 'File' }));

      expect(screen.getByText('New File')).toBeInTheDocument();
      expect(screen.getByText('New Project')).toBeInTheDocument();
      expect(screen.getByText('Save')).toBeInTheDocument();
      expect(screen.getByText('Ctrl+S')).toBeInTheDocument();
      expect(screen.getByText('Import Zip')).toBeInTheDocument();
      expect(screen.getByText('Export Zip')).toBeInTheDocument();
      expect(screen.getByText('Settings...')).toBeInTheDocument();
      expect(screen.getByText('Ctrl+Alt+S')).toBeInTheDocument();
      expect(screen.getByText('Compile')).toBeInTheDocument();
      expect(screen.getByText('Ctrl+B')).toBeInTheDocument();
    });

    it('triggers onSave callback and closes menu', () => {
      const onSave = vi.fn();
      renderTopMenuBar({ onSave });

      fireEvent.click(screen.getByRole('button', { name: 'File' }));
      fireEvent.click(screen.getByText('Save'));

      expect(onSave).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Save')).not.toBeInTheDocument();
    });

    it('triggers onOpenSettings callback and closes menu', () => {
      const onOpenSettings = vi.fn();
      renderTopMenuBar({ onOpenSettings });

      fireEvent.click(screen.getByRole('button', { name: 'File' }));
      fireEvent.click(screen.getByText('Settings...'));

      expect(onOpenSettings).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Settings...')).not.toBeInTheDocument();
    });

    it('triggers onCompile callback and closes menu', () => {
      const onCompile = vi.fn();
      renderTopMenuBar({ onCompile });

      fireEvent.click(screen.getByRole('button', { name: 'File' }));
      fireEvent.click(screen.getByText('Compile'));

      expect(onCompile).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Compile')).not.toBeInTheDocument();
    });

    it('triggers onNewFile callback and closes menu', () => {
      const onNewFile = vi.fn();
      renderTopMenuBar({ onNewFile });

      fireEvent.click(screen.getByRole('button', { name: 'File' }));
      fireEvent.click(screen.getByText('New File'));

      expect(onNewFile).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('New File')).not.toBeInTheDocument();
    });

    it('triggers onNewProject callback and closes menu', () => {
      const onNewProject = vi.fn();
      renderTopMenuBar({ onNewProject });

      fireEvent.click(screen.getByRole('button', { name: 'File' }));
      fireEvent.click(screen.getByText('New Project'));

      expect(onNewProject).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('New Project')).not.toBeInTheDocument();
    });

    it('triggers onImportZip and onExportZip callbacks', () => {
      const onImportZip = vi.fn();
      const onExportZip = vi.fn();
      renderTopMenuBar({ onImportZip, onExportZip });

      // Import Zip
      fireEvent.click(screen.getByRole('button', { name: 'File' }));
      fireEvent.click(screen.getByText('Import Zip'));
      expect(onImportZip).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Import Zip')).not.toBeInTheDocument();

      // Export Zip
      fireEvent.click(screen.getByRole('button', { name: 'File' }));
      fireEvent.click(screen.getByText('Export Zip'));
      expect(onExportZip).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Export Zip')).not.toBeInTheDocument();
    });

    it('triggers onCloseProject callback when Close Project is clicked', () => {
      const onCloseProject = vi.fn();
      renderTopMenuBar({ onCloseProject });

      fireEvent.click(screen.getByRole('button', { name: 'File' }));
      fireEvent.click(screen.getByText('Close Project'));
      expect(onCloseProject).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Close Project')).not.toBeInTheDocument();
    });
  });

  describe('Edit Menu', () => {
    it('opens Edit dropdown with Undo, Redo, Cut, Copy, Paste', () => {
      renderTopMenuBar();

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      expect(screen.getByText('Undo')).toBeInTheDocument();
      expect(screen.getByText('Ctrl+Z')).toBeInTheDocument();
      expect(screen.getByText('Redo')).toBeInTheDocument();
      expect(screen.getByText('Ctrl+Y')).toBeInTheDocument();
      expect(screen.getByText('Cut')).toBeInTheDocument();
      expect(screen.getByText('Copy')).toBeInTheDocument();
      expect(screen.getByText('Paste')).toBeInTheDocument();
    });

    it('triggers onUndo and onRedo callbacks and closes menu', () => {
      const onUndo = vi.fn();
      const onRedo = vi.fn();
      renderTopMenuBar({ onUndo, onRedo });

      // Undo
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.click(screen.getByText('Undo'));
      expect(onUndo).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Undo')).not.toBeInTheDocument();

      // Redo
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.click(screen.getByText('Redo'));
      expect(onRedo).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Redo')).not.toBeInTheDocument();
    });
  });

  describe('View Menu and Theme Switching', () => {
    it('opens View dropdown with toggle actions and shortcuts', () => {
      renderTopMenuBar();

      fireEvent.click(screen.getByRole('button', { name: 'View' }));

      expect(screen.getByText('Toggle Sidebar')).toBeInTheDocument();
      expect(screen.getByText('Alt+1')).toBeInTheDocument();
      expect(screen.getByText('Toggle Problems')).toBeInTheDocument();
      expect(screen.getByText('Alt+6')).toBeInTheDocument();
      expect(screen.getByText('Toggle PDF Preview')).toBeInTheDocument();
      expect(screen.getByText('Dark Mode')).toBeInTheDocument();
      expect(screen.getByText('Light Mode')).toBeInTheDocument();
    });

    it('triggers onToggleSidebar, onToggleProblems, onTogglePreview callbacks', () => {
      const onToggleSidebar = vi.fn();
      const onToggleProblems = vi.fn();
      const onTogglePreview = vi.fn();
      renderTopMenuBar({ onToggleSidebar, onToggleProblems, onTogglePreview });

      // Toggle Sidebar
      fireEvent.click(screen.getByRole('button', { name: 'View' }));
      fireEvent.click(screen.getByText('Toggle Sidebar'));
      expect(onToggleSidebar).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Toggle Sidebar')).not.toBeInTheDocument();

      // Toggle Problems
      fireEvent.click(screen.getByRole('button', { name: 'View' }));
      fireEvent.click(screen.getByText('Toggle Problems'));
      expect(onToggleProblems).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Toggle Problems')).not.toBeInTheDocument();

      // Toggle Preview
      fireEvent.click(screen.getByRole('button', { name: 'View' }));
      fireEvent.click(screen.getByText('Toggle PDF Preview'));
      expect(onTogglePreview).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Toggle PDF Preview')).not.toBeInTheDocument();
    });

    it('switches theme to Light Mode and updates ThemeContext', () => {
      renderTopMenuBar({}, 'dark');

      expect(document.documentElement.classList.contains('dark')).toBe(true);

      fireEvent.click(screen.getByRole('button', { name: 'View' }));
      fireEvent.click(screen.getByText('Light Mode'));

      expect(document.documentElement.classList.contains('light')).toBe(true);
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
      expect(screen.queryByText('Light Mode')).not.toBeInTheDocument();
    });

    it('switches theme back to Dark Mode and updates ThemeContext', () => {
      renderTopMenuBar({}, 'light');

      expect(document.documentElement.classList.contains('light')).toBe(true);

      fireEvent.click(screen.getByRole('button', { name: 'View' }));
      fireEvent.click(screen.getByText('Dark Mode'));

      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
      expect(screen.queryByText('Dark Mode')).not.toBeInTheDocument();
    });
  });

  describe('Tools Menu', () => {
    it('opens Tools dropdown when clicking "Tools"', () => {
      renderTopMenuBar();

      fireEvent.click(screen.getByRole('button', { name: 'Tools' }));

      expect(screen.getByText('Engine: latexmk (pdflatex)')).toBeInTheDocument();
      expect(screen.getByText('Engine: latexmk (xelatex)')).toBeInTheDocument();
      expect(screen.getByText('Engine: latexmk (lualatex)')).toBeInTheDocument();
    });

    it('triggers onSelectEngine callback and closes menu', () => {
      const onSelectEngine = vi.fn();
      renderTopMenuBar({ onSelectEngine });

      fireEvent.click(screen.getByRole('button', { name: 'Tools' }));
      fireEvent.click(screen.getByText('Engine: latexmk (xelatex)'));

      expect(onSelectEngine).toHaveBeenCalledWith('xelatex');
      expect(screen.queryByText('Engine: latexmk (xelatex)')).not.toBeInTheDocument();
    });
  });

  describe('Help Menu', () => {
    it('opens Help dropdown with Shortcuts Guide and About Torque', () => {
      renderTopMenuBar();

      fireEvent.click(screen.getByRole('button', { name: 'Help' }));

      expect(screen.getByText('Shortcuts Guide')).toBeInTheDocument();
      expect(screen.getByText('About Torque')).toBeInTheDocument();
    });

    it('closes menu when clicking an item in Help menu', () => {
      renderTopMenuBar();

      fireEvent.click(screen.getByRole('button', { name: 'Help' }));
      fireEvent.click(screen.getByText('About Torque'));

      expect(screen.queryByText('About Torque')).not.toBeInTheDocument();
    });
  });

  describe('Menu Interaction & Dismissal', () => {
    it('toggles menu closed when clicking the active menu button again', () => {
      renderTopMenuBar();

      const fileBtn = screen.getByRole('button', { name: 'File' });
      fireEvent.click(fileBtn);
      expect(screen.getByText('New File')).toBeInTheDocument();

      fireEvent.click(fileBtn);
      expect(screen.queryByText('New File')).not.toBeInTheDocument();
    });

    it('switches directly to another menu when clicking a different top menu item', () => {
      renderTopMenuBar();

      fireEvent.click(screen.getByRole('button', { name: 'File' }));
      expect(screen.getByText('New File')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      expect(screen.queryByText('New File')).not.toBeInTheDocument();
      expect(screen.getByText('Undo')).toBeInTheDocument();
    });

    it('closes open dropdown on Escape key', () => {
      renderTopMenuBar();

      fireEvent.click(screen.getByRole('button', { name: 'File' }));
      expect(screen.getByText('New File')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByText('New File')).not.toBeInTheDocument();
    });

    it('closes open dropdown when clicking outside', () => {
      renderTopMenuBar();

      fireEvent.click(screen.getByRole('button', { name: 'File' }));
      expect(screen.getByText('New File')).toBeInTheDocument();

      fireEvent.mouseDown(document.body);
      expect(screen.queryByText('New File')).not.toBeInTheDocument();
    });
  });

  describe('Theme-aware Styling', () => {
    it('applies dark theme styling when theme is dark', () => {
      const { container } = renderTopMenuBar({}, 'dark');
      const nav = container.querySelector('nav');
      expect(nav?.className).toContain('bg-[#2b2d30]');
      expect(nav?.className).toContain('text-[#dfe1e5]');
    });

    it('applies light theme styling when theme is light', () => {
      const { container } = renderTopMenuBar({}, 'light');
      const nav = container.querySelector('nav');
      expect(nav?.className).toContain('bg-[#ebecf0]');
      expect(nav?.className).toContain('text-[#1f2328]');
    });
  });
});
