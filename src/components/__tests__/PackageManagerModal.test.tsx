// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import {
  PackageManagerModal,
  type PackageManagerModalProps,
} from '../PackageManagerModal';
import { ThemeProvider } from '../../context/ThemeContext';
import {
  resetPackageManagerState,
  isPackageInstalled,
} from '../../packages/packageManager';
import { downloadPackage } from '../../packages/packageDownloader';
import {
  clearPackageCache,
  savePackageFile,
} from '../../storage/packageCache';

vi.mock('../../packages/packageDownloader', async () => {
  const actual = await vi.importActual<any>('../../packages/packageDownloader');
  return {
    ...actual,
    downloadPackage: vi.fn(),
  };
});

function renderModal(
  props: Partial<PackageManagerModalProps> = {},
  theme: 'dark' | 'light' = 'dark'
) {
  const defaultProps: PackageManagerModalProps = {
    isOpen: true,
    onClose: vi.fn(),
    onInsertPackage: vi.fn(),
  };

  const mergedProps = { ...defaultProps, ...props };

  const result = render(
    <ThemeProvider defaultTheme={theme}>
      <PackageManagerModal {...mergedProps} />
    </ThemeProvider>
  );

  return { ...result, props: mergedProps };
}

describe('PackageManagerModal', () => {
  beforeEach(async () => {
    localStorage.clear();
    resetPackageManagerState();
    await clearPackageCache();
    vi.mocked(downloadPackage).mockReset();
    vi.mocked(downloadPackage).mockResolvedValue({
      success: true,
      files: ['mathtools.sty'],
    });
  });

  describe('Visibility and Basic Rendering', () => {
    it('returns null and renders nothing when isOpen is false', () => {
      renderModal({ isOpen: false });

      expect(screen.queryByText('LaTeX Package Manager')).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText(/search packages/i)).not.toBeInTheDocument();
    });

    it('renders modal dialog when isOpen is true', () => {
      renderModal({ isOpen: true });

      expect(screen.getByText('LaTeX Package Manager')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/search packages/i)).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('renders all category filter pills', () => {
      renderModal({ isOpen: true });

      const categoryBar = screen.getByTestId('category-filter-bar');
      const categories = [
        'All',
        'Math',
        'Physics',
        'Graphics',
        'Layout',
        'Typography',
        'Citations',
        'Code',
        'Tables',
      ];

      for (const cat of categories) {
        expect(
          within(categoryBar).getByRole('button', { name: new RegExp(`^${cat}$`, 'i') })
        ).toBeInTheDocument();
      }
    });
  });

  describe('Package List and Detail View', () => {
    it('displays package catalog in the master list and selects the first item by default', () => {
      renderModal({ isOpen: true });

      const packageList = screen.getByTestId('package-list');
      const detailPane = screen.getByTestId('package-detail-pane');

      // amsmath should be visible in the package list
      expect(within(packageList).getByText('amsmath')).toBeInTheDocument();

      // Detail pane should display amsmath details initially
      expect(within(detailPane).getByRole('heading', { level: 2, name: 'amsmath' })).toBeInTheDocument();
      expect(within(detailPane).getByText(/AMS mathematical facilities for LaTeX/i)).toBeInTheDocument();
      expect(within(detailPane).getByText('amsmath.sty')).toBeInTheDocument();
      expect(within(detailPane).getByText(/Bundle/i)).toBeInTheDocument();
    });

    it('selects another package when clicked in the list and updates details', () => {
      renderModal({ isOpen: true });

      const packageList = screen.getByTestId('package-list');
      const detailPane = screen.getByTestId('package-detail-pane');

      // Click on tikz-cd item
      const tikzCdItem = within(packageList).getByTestId('package-item-tikz-cd');
      fireEvent.click(tikzCdItem);

      expect(within(detailPane).getByRole('heading', { level: 2, name: 'tikz-cd' })).toBeInTheDocument();
      expect(within(detailPane).getByText(/commutative diagrams/i)).toBeInTheDocument();
      expect(within(detailPane).getByText('tikzlibrarycd.code.tex')).toBeInTheDocument();
    });
  });

  describe('Search Filtering', () => {
    it('filters packages in real-time when query is typed', () => {
      renderModal({ isOpen: true });

      const searchInput = screen.getByPlaceholderText(/search packages/i);
      fireEvent.change(searchInput, { target: { value: 'physics' } });

      const packageList = screen.getByTestId('package-list');
      const detailPane = screen.getByTestId('package-detail-pane');

      expect(within(detailPane).getByRole('heading', { level: 2, name: 'physics' })).toBeInTheDocument();
      expect(within(packageList).queryByTestId('package-item-tikz-cd')).not.toBeInTheDocument();
    });

    it('respects initialSearchQuery prop on mount', () => {
      renderModal({ isOpen: true, initialSearchQuery: 'siunitx' });

      const searchInput = screen.getByPlaceholderText(/search packages/i) as HTMLInputElement;
      expect(searchInput.value).toBe('siunitx');

      const detailPane = screen.getByTestId('package-detail-pane');
      expect(within(detailPane).getByRole('heading', { level: 2, name: 'siunitx' })).toBeInTheDocument();
    });

    it('displays empty state when search finds no matches', () => {
      renderModal({ isOpen: true });

      const searchInput = screen.getByPlaceholderText(/search packages/i);
      fireEvent.change(searchInput, { target: { value: 'nonexistentpackagexyz' } });

      expect(screen.getByText(/no packages found/i)).toBeInTheDocument();
      expect(screen.getByText(/no package selected/i)).toBeInTheDocument();
    });

    it('clears search input when clear button is clicked', () => {
      renderModal({ isOpen: true, initialSearchQuery: 'amsmath' });

      const searchInput = screen.getByPlaceholderText(/search packages/i) as HTMLInputElement;
      expect(searchInput.value).toBe('amsmath');

      const clearBtn = screen.getByRole('button', { name: /clear search/i });
      fireEvent.click(clearBtn);

      expect(searchInput.value).toBe('');
      // Restores full list
      const packageList = screen.getByTestId('package-list');
      expect(within(packageList).getByTestId('package-item-tikz-cd')).toBeInTheDocument();
    });

    it('filters packages matching both category and search query simultaneously', () => {
      renderModal({ isOpen: true });

      const categoryBar = screen.getByTestId('category-filter-bar');
      const mathPill = within(categoryBar).getByRole('button', { name: /^Math$/i });
      fireEvent.click(mathPill);

      const searchInput = screen.getByPlaceholderText(/search packages/i);
      fireEvent.change(searchInput, { target: { value: 'tikz' } });

      const packageList = screen.getByTestId('package-list');
      // In Math category with query 'tikz', tikz-cd should match
      expect(within(packageList).getByTestId('package-item-tikz-cd')).toBeInTheDocument();
      // Regular tikz is in Graphics category, so should NOT appear under Math
      expect(within(packageList).queryByTestId('package-item-tikz')).not.toBeInTheDocument();
    });
  });

  describe('Category Filtering', () => {
    it('filters packages when category pill is clicked', () => {
      renderModal({ isOpen: true });

      const categoryBar = screen.getByTestId('category-filter-bar');
      const packageList = screen.getByTestId('package-list');

      const physicsPill = within(categoryBar).getByRole('button', { name: /^Physics$/i });
      fireEvent.click(physicsPill);

      // Only physics packages (physics, siunitx) should appear in package list
      expect(within(packageList).getByTestId('package-item-physics')).toBeInTheDocument();
      expect(within(packageList).getByTestId('package-item-siunitx')).toBeInTheDocument();
      expect(within(packageList).queryByTestId('package-item-tikz-cd')).not.toBeInTheDocument();

      // Clicking 'All' restores list
      const allPill = within(categoryBar).getByRole('button', { name: /^All$/i });
      fireEvent.click(allPill);

      expect(within(packageList).getByTestId('package-item-tikz-cd')).toBeInTheDocument();
    });
  });

  describe('Package Installation Toggle', () => {
    it('allows installing an uninstalled package', async () => {
      renderModal({ isOpen: true, initialSearchQuery: 'mathtools' });

      expect(isPackageInstalled('mathtools')).toBe(false);

      const installBtn = screen.getByRole('button', { name: /install/i });
      fireEvent.click(installBtn);

      await waitFor(() => {
        expect(isPackageInstalled('mathtools')).toBe(true);
      });
      expect(screen.getByRole('button', { name: /uninstall/i })).toBeInTheDocument();
    });

    it('allows uninstalling an installed package', async () => {
      renderModal({ isOpen: true, initialSearchQuery: 'amsmath' });

      expect(isPackageInstalled('amsmath')).toBe(true);

      const uninstallBtn = screen.getByRole('button', { name: /uninstall/i });
      fireEvent.click(uninstallBtn);

      await waitFor(() => {
        expect(isPackageInstalled('amsmath')).toBe(false);
      });
      expect(screen.getByRole('button', { name: /install/i })).toBeInTheDocument();
    });
  });

  describe('Insert \\usepackage Action', () => {
    it('calls onInsertPackage with package name and closes modal', () => {
      const onInsertPackage = vi.fn();
      const onClose = vi.fn();

      renderModal({
        isOpen: true,
        initialSearchQuery: 'amsmath',
        onInsertPackage,
        onClose,
      });

      const insertBtn = screen.getByRole('button', { name: /insert \\usepackage/i });
      fireEvent.click(insertBtn);

      expect(onInsertPackage).toHaveBeenCalledWith('amsmath');
      expect(onClose).toHaveBeenCalled();
    });

    it('gracefully handles missing onInsertPackage callback and still closes', () => {
      const onClose = vi.fn();
      renderModal({
        isOpen: true,
        initialSearchQuery: 'amsmath',
        onInsertPackage: undefined,
        onClose,
      });

      const insertBtn = screen.getByRole('button', { name: /insert \\usepackage/i });
      fireEvent.click(insertBtn);

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Dismissal and Backdrop', () => {
    it('calls onClose when clicking close button (X)', () => {
      const onClose = vi.fn();
      renderModal({ isOpen: true, onClose });

      const closeBtn = screen.getByRole('button', { name: /close/i });
      fireEvent.click(closeBtn);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when clicking backdrop overlay', () => {
      const onClose = vi.fn();
      renderModal({ isOpen: true, onClose });

      const backdrop = screen.getByTestId('package-manager-backdrop');
      fireEvent.click(backdrop);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onClose when clicking inside dialog content', () => {
      const onClose = vi.fn();
      renderModal({ isOpen: true, onClose });

      const dialog = screen.getByRole('dialog');
      fireEvent.click(dialog);

      expect(onClose).not.toHaveBeenCalled();
    });

    it('calls onClose when pressing Escape key', () => {
      const onClose = vi.fn();
      renderModal({ isOpen: true, onClose });

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Theming and Styling', () => {
    it('applies dark theme IntelliJ styling classes', () => {
      renderModal({ isOpen: true }, 'dark');

      const dialog = screen.getByRole('dialog');
      expect(dialog.className).toContain('bg-[#1e1f22]');
      expect(dialog.className).toContain('border-[#393b40]');
      expect(dialog.className).toContain('text-[#dfe1e5]');
    });

    it('applies light theme IntelliJ styling classes', () => {
      renderModal({ isOpen: true }, 'light');

      const dialog = screen.getByRole('dialog');
      expect(dialog.className).toContain('bg-[#ffffff]');
      expect(dialog.className).toContain('border-[#d1d5db]');
      expect(dialog.className).toContain('text-[#1f2328]');
    });
  });

  describe('Documentation URL Link', () => {
    it('renders CTAN documentation link when available', () => {
      renderModal({ isOpen: true, initialSearchQuery: 'amsmath' });

      const docLink = screen.getByRole('link', { name: /documentation/i });
      expect(docLink).toHaveAttribute('href', 'https://ctan.org/pkg/amsmath');
      expect(docLink).toHaveAttribute('target', '_blank');
      expect(docLink).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
    });
  });

  describe('CTAN Package Download and Persistent Cache Status', () => {
    it('renders an active Download button and Available (CTAN) badge for uninstalled CTAN packages', () => {
      renderModal({ isOpen: true, initialSearchQuery: 'mathtools' });

      const detailPane = screen.getByTestId('package-detail-pane');
      expect(within(detailPane).getByText(/Available \(CTAN\)/i)).toBeInTheDocument();

      const downloadBtn = screen.getByRole('button', { name: /download/i });
      expect(downloadBtn).toBeInTheDocument();
      expect(downloadBtn).toBeEnabled();
    });

    it('shows visual progress feedback and disables Download button during active download', async () => {
      let resolveDownload: (res: any) => void;
      const downloadPromise = new Promise((resolve) => {
        resolveDownload = resolve;
      });

      vi.mocked(downloadPackage).mockImplementation((_pkgId, onProgress) => {
        onProgress?.('Downloading mathtools.sty (1/1)...');
        return downloadPromise as any;
      });

      renderModal({ isOpen: true, initialSearchQuery: 'mathtools' });

      const downloadBtn = screen.getByRole('button', { name: /download/i });
      fireEvent.click(downloadBtn);

      // Verify downloadPackage was called with the package id
      expect(downloadPackage).toHaveBeenCalledWith('mathtools', expect.any(Function));

      // Download button should now be disabled or showing downloading state
      expect(downloadBtn).toBeDisabled();
      expect(screen.getByText(/Downloading mathtools\.sty/i)).toBeInTheDocument();

      // Finish download
      resolveDownload!({ success: true, files: ['mathtools.sty'] });

      await waitFor(() => {
        expect(screen.queryByText(/Downloading mathtools\.sty/i)).not.toBeInTheDocument();
      });
    });

    it('updates status badge to Installed (Cached) on successful download', async () => {
      vi.mocked(downloadPackage).mockImplementation(async (_pkgId, onProgress) => {
        onProgress?.('Installing mathtools...');
        return { success: true, files: ['mathtools.sty'] };
      });

      renderModal({ isOpen: true, initialSearchQuery: 'mathtools' });

      const downloadBtn = screen.getByRole('button', { name: /download/i });
      fireEvent.click(downloadBtn);

      // Status pill should update to Installed (Cached)
      await waitFor(() => {
        const detailPane = screen.getByTestId('package-detail-pane');
        expect(within(detailPane).getByText(/Installed \(Cached\)/i)).toBeInTheDocument();
      });

      // Should offer option to remove from cache and insert \usepackage
      expect(screen.getByRole('button', { name: /remove from cache/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /insert \\usepackage/i })).toBeInTheDocument();
    });

    it('displays inline error message and retry button when download fails', async () => {
      vi.mocked(downloadPackage).mockResolvedValue({
        success: false,
        files: [],
        error: 'Failed to download mathtools.sty: CTAN mirror unreachable',
      });

      renderModal({ isOpen: true, initialSearchQuery: 'mathtools' });

      const downloadBtn = screen.getByRole('button', { name: /download/i });
      fireEvent.click(downloadBtn);

      await waitFor(() => {
        expect(screen.getByText(/CTAN mirror unreachable/i)).toBeInTheDocument();
      });

      const retryBtn = screen.getByRole('button', { name: /retry/i });
      expect(retryBtn).toBeInTheDocument();

      // Configure next download attempt to succeed
      vi.mocked(downloadPackage).mockResolvedValue({
        success: true,
        files: ['mathtools.sty'],
      });

      fireEvent.click(retryBtn);

      await waitFor(() => {
        const detailPane = screen.getByTestId('package-detail-pane');
        expect(within(detailPane).getByText(/Installed \(Cached\)/i)).toBeInTheDocument();
      });
    });

    it('detects already cached packages on mount and renders Installed (Cached) badge', async () => {
      // Pre-populate packageCache
      await savePackageFile('mathtools.sty', new Uint8Array([1, 2, 3]), 'mathtools');

      renderModal({ isOpen: true, initialSearchQuery: 'mathtools' });

      await waitFor(() => {
        const detailPane = screen.getByTestId('package-detail-pane');
        expect(within(detailPane).getByText(/Installed \(Cached\)/i)).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /remove from cache/i })).toBeInTheDocument();
    });

    it('removes package from cache when Remove from Cache is clicked', async () => {
      // Pre-populate packageCache
      await savePackageFile('mathtools.sty', new Uint8Array([1, 2, 3]), 'mathtools');

      renderModal({ isOpen: true, initialSearchQuery: 'mathtools' });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /remove from cache/i })).toBeInTheDocument();
      });

      const removeBtn = screen.getByRole('button', { name: /remove from cache/i });
      fireEvent.click(removeBtn);

      await waitFor(() => {
        const detailPane = screen.getByTestId('package-detail-pane');
        expect(within(detailPane).getByText(/Available \(CTAN\)/i)).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument();
    });
  });
});
