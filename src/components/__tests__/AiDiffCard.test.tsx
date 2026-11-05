// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AiDiffCard, type AiDiffCardProps } from '../AiDiffCard';
import type { FileDiffResult } from '../../ai/diffUtils';
import { ThemeProvider } from '../../context/ThemeContext';

const mockDiff: FileDiffResult = {
  path: 'src/main.tex',
  originalContent: '\\documentclass{article}\n\\usepackage{oldpkg}\n\\begin{document}\nHello\n\\end{document}',
  newContent: '\\documentclass{article}\n\\usepackage{newpkg}\n\\usepackage{extra}\n\\begin{document}\nHello\n\\end{document}',
  additions: 2,
  deletions: 1,
  diffHunks: [
    { type: 'context', line: '\\documentclass{article}', oldLineNo: 1, newLineNo: 1 },
    { type: 'deleted', line: '\\usepackage{oldpkg}', oldLineNo: 2 },
    { type: 'added', line: '\\usepackage{newpkg}', newLineNo: 2 },
    { type: 'added', line: '\\usepackage{extra}', newLineNo: 3 },
    { type: 'context', line: '\\begin{document}', oldLineNo: 3, newLineNo: 4 },
  ],
  unifiedDiff: '@@ -1,3 +1,4 @@\n \\documentclass{article}\n-\\usepackage{oldpkg}\n+\\usepackage{newpkg}\n+\\usepackage{extra}\n \\begin{document}',
};

function renderDiffCard(props: Partial<AiDiffCardProps> = {}, theme: 'dark' | 'light' = 'dark') {
  const defaultProps: AiDiffCardProps = {
    diff: mockDiff,
    status: 'pending_approval',
    onAccept: vi.fn(),
    onReject: vi.fn(),
    ...props,
  };

  const renderResult = render(
    <ThemeProvider defaultTheme={theme}>
      <AiDiffCard {...defaultProps} />
    </ThemeProvider>
  );

  return { ...renderResult, props: defaultProps };
}

describe('AiDiffCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Header and Stats', () => {
    it('renders the file path badge correctly', () => {
      renderDiffCard();
      expect(screen.getByText('src/main.tex')).toBeInTheDocument();
    });

    it('renders additions (+2) and deletions (-1) stats pills', () => {
      renderDiffCard();
      const additions = screen.getByText('+2');
      const deletions = screen.getByText('-1');
      expect(additions).toBeInTheDocument();
      expect(deletions).toBeInTheDocument();
    });
  });

  describe('Diff Content & Hunks', () => {
    it('renders diff lines including added, deleted, and context lines', () => {
      renderDiffCard();
      expect(screen.getByText('\\documentclass{article}')).toBeInTheDocument();
      expect(screen.getByText('\\usepackage{oldpkg}')).toBeInTheDocument();
      expect(screen.getByText('\\usepackage{newpkg}')).toBeInTheDocument();
      expect(screen.getByText('\\usepackage{extra}')).toBeInTheDocument();
    });

    it('renders diff indicators and line numbers', () => {
      renderDiffCard();
      expect(screen.getAllByText('1').length).toBeGreaterThan(0);
      expect(screen.getAllByText('2').length).toBeGreaterThan(0);
      expect(screen.getAllByText('3').length).toBeGreaterThan(0);
    });

    it('collapses and re-expands the diff view when toggled', () => {
      renderDiffCard();
      expect(screen.getByText('\\usepackage{oldpkg}')).toBeInTheDocument();

      const header = screen.getByTestId('diff-card-header');
      fireEvent.click(header);

      expect(screen.queryByText('\\usepackage{oldpkg}')).not.toBeInTheDocument();

      fireEvent.click(header);
      expect(screen.getByText('\\usepackage{oldpkg}')).toBeInTheDocument();
    });
  });

  describe('Action Controls and Status', () => {
    it('renders Accept and Reject buttons when status is pending_approval', () => {
      renderDiffCard({ status: 'pending_approval' });
      expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument();
    });

    it('triggers onAccept callback when Accept button is clicked', () => {
      const onAccept = vi.fn();
      renderDiffCard({ status: 'pending_approval', onAccept });

      const acceptBtn = screen.getByRole('button', { name: /accept/i });
      fireEvent.click(acceptBtn);

      expect(onAccept).toHaveBeenCalledTimes(1);
    });

    it('triggers onReject callback when Reject button is clicked', () => {
      const onReject = vi.fn();
      renderDiffCard({ status: 'pending_approval', onReject });

      const rejectBtn = screen.getByRole('button', { name: /reject/i });
      fireEvent.click(rejectBtn);

      expect(onReject).toHaveBeenCalledTimes(1);
    });

    it('shows Accepted badge and removes action buttons when status is accepted', () => {
      renderDiffCard({ status: 'accepted' });

      expect(screen.getByText(/accepted/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /reject/i })).not.toBeInTheDocument();
    });

    it('shows Rejected badge and removes action buttons when status is rejected', () => {
      renderDiffCard({ status: 'rejected' });

      expect(screen.getByText(/rejected/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /reject/i })).not.toBeInTheDocument();
    });
  });

  describe('Theming and Edge Cases', () => {
    it('renders cleanly in light mode', () => {
      renderDiffCard({}, 'light');
      expect(screen.getByText('src/main.tex')).toBeInTheDocument();
      expect(screen.getByText('+2')).toBeInTheDocument();
    });

    it('handles empty diffHunks gracefully', () => {
      const emptyDiff: FileDiffResult = {
        path: 'empty.tex',
        originalContent: '',
        newContent: '',
        additions: 0,
        deletions: 0,
        diffHunks: [],
        unifiedDiff: '',
      };

      renderDiffCard({ diff: emptyDiff });
      expect(screen.getByText('empty.tex')).toBeInTheDocument();
      expect(screen.getByText('+0')).toBeInTheDocument();
      expect(screen.getByText('-0')).toBeInTheDocument();
    });
  });
});
