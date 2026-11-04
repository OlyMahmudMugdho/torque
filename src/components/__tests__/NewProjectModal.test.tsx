// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NewProjectModal } from '../NewProjectModal';
import { scaffoldProjectFiles, PROJECT_TEMPLATES } from '../../templates/projectTemplates';
import { ThemeProvider } from '../../context/ThemeContext';

describe('NewProjectModal Component & Project Scaffolding', () => {
  it('does not render when isOpen is false', () => {
    render(
      <ThemeProvider>
        <NewProjectModal isOpen={false} onClose={vi.fn()} onCreate={vi.fn()} />
      </ThemeProvider>
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders JetBrains-style dialog with generators and form controls when isOpen is true', () => {
    render(
      <ThemeProvider>
        <NewProjectModal isOpen={true} onClose={vi.fn()} onCreate={vi.fn()} />
      </ThemeProvider>
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /new project/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/name:/i)).toBeInTheDocument();

    // Verify template generators are displayed
    for (const tmpl of PROJECT_TEMPLATES) {
      expect(screen.getByRole('button', { name: tmpl.name })).toBeInTheDocument();
    }

    // Verify font size options
    expect(screen.getByRole('button', { name: '10pt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '11pt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '12pt' })).toBeInTheDocument();

    // Verify paper size options
    expect(screen.getByRole('button', { name: 'Letter' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'A4' })).toBeInTheDocument();

    // Verify checkboxes
    expect(screen.getByLabelText(/generate sample/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/initialize git repository/i)).toBeInTheDocument();

    // Verify action buttons
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument();
  });

  it('submits form with selected template and custom values', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <ThemeProvider>
        <NewProjectModal isOpen={true} onClose={onClose} onCreate={onCreate} />
      </ThemeProvider>
    );

    // Change name
    const nameInput = screen.getByLabelText(/name:/i);
    fireEvent.change(nameInput, { target: { value: 'quantum-computing-paper' } });

    // Select IEEE Conference template
    const ieeeBtn = screen.getByRole('button', { name: 'Conference Paper (IEEE)' });
    fireEvent.click(ieeeBtn);

    // Select A4 paper
    fireEvent.click(screen.getByRole('button', { name: 'A4' }));

    // Select 12pt font
    fireEvent.click(screen.getByRole('button', { name: '12pt' }));

    // Check git repo checkbox
    fireEvent.click(screen.getByLabelText(/initialize git repository/i));

    // Submit form
    fireEvent.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledTimes(1);
    });

    expect(onCreate).toHaveBeenCalledWith({
      name: 'quantum-computing-paper',
      templateId: 'ieee',
      fontSize: '12pt',
      paperSize: 'a4paper',
      createGitRepo: true,
      generateSample: true,
      location: '~/.torque/projects/quantum-computing-paper',
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('allows customizing location path in NewProjectModal', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <ThemeProvider>
        <NewProjectModal isOpen={true} onClose={onClose} onCreate={onCreate} />
      </ThemeProvider>
    );

    const locationInput = screen.getByLabelText(/location:/i);
    expect(locationInput).toBeInTheDocument();
    fireEvent.change(locationInput, { target: { value: '/home/user/latex-docs' } });

    const nameInput = screen.getByLabelText(/name:/i);
    fireEvent.change(nameInput, { target: { value: 'custom-proj' } });

    fireEvent.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'custom-proj',
          location: '/home/user/latex-docs/custom-proj',
        })
      );
    });
  });

  it('scaffolds IEEEtran conference project files properly', () => {
    const result = scaffoldProjectFiles({
      name: 'Deep Learning Paper',
      templateId: 'ieee',
      fontSize: '10pt',
      paperSize: 'letterpaper',
      createGitRepo: true,
      generateSample: true,
    });

    expect(result.rootEntry).toBe('main.tex');
    expect(result.files.length).toBe(2);

    const mainFile = result.files.find((f) => f.path === 'main.tex');
    expect(mainFile).toBeDefined();
    expect(mainFile?.content).toContain('\\documentclass[conference,10pt,letterpaper]{IEEEtran}');
    expect(mainFile?.content).toContain('Deep Learning Paper');

    const gitignoreFile = result.files.find((f) => f.path === '.gitignore');
    expect(gitignoreFile).toBeDefined();
    expect(gitignoreFile?.content).toContain('*.aux');
  });

  it('scaffolds Beamer presentation project files properly', () => {
    const result = scaffoldProjectFiles({
      name: 'Quarterly Review',
      templateId: 'beamer',
      fontSize: '11pt',
      paperSize: 'letterpaper',
      createGitRepo: false,
      generateSample: true,
    });

    expect(result.rootEntry).toBe('main.tex');
    expect(result.files.length).toBe(1);

    const mainFile = result.files[0];
    expect(mainFile.content).toContain('\\documentclass[11pt]{beamer}');
    expect(mainFile.content).toContain('\\usetheme{Madrid}');
    expect(mainFile.content).toContain('Quarterly Review');
  });

  it('scaffolds Empty and Report templates properly', () => {
    const emptyResult = scaffoldProjectFiles({
      name: 'Empty Test',
      templateId: 'empty',
      fontSize: '11pt',
      paperSize: 'letterpaper',
      createGitRepo: false,
      generateSample: false,
    });
    expect(emptyResult.files[0].content).toContain('\\documentclass[11pt]{article}');

    const reportResult = scaffoldProjectFiles({
      name: 'Technical Manual',
      templateId: 'report',
      fontSize: '12pt',
      paperSize: 'a4paper',
      createGitRepo: false,
      generateSample: true,
    });
    expect(reportResult.files[0].content).toContain('\\documentclass[12pt,a4paper]{report}');
    expect(reportResult.files[0].content).toContain('\\chapter{Introduction}');
  });
});
