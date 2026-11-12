// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsModal, type SettingsModalProps } from '../SettingsModal';
import { ThemeProvider } from '../../context/ThemeContext';
import { loadAISettings, saveAISettings } from '../../ai/aiConfig';

vi.mock('../../ai/aiConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ai/aiConfig')>();
  return {
    ...actual,
    loadAISettings: vi.fn(),
    saveAISettings: vi.fn(),
    fetchProviderModels: vi.fn(),
  };
});

function renderSettingsModal(props: Partial<SettingsModalProps> = {}) {
  const defaultProps: SettingsModalProps = {
    isOpen: true,
    onClose: vi.fn(),
    theme: 'dark',
    onThemeChange: vi.fn(),
    autoSave: true,
    onAutoSaveChange: vi.fn(),
    selectedEngine: 'pdflatex',
    onEngineChange: vi.fn(),
    ...props,
  };

  return {
    ...render(
      <ThemeProvider defaultTheme={defaultProps.theme || 'dark'}>
        <SettingsModal {...defaultProps} />
      </ThemeProvider>
    ),
    props: defaultProps,
  };
}

describe('SettingsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadAISettings).mockResolvedValue({
      providers: [
        {
          id: 'openai-default',
          name: 'OpenAI',
          baseUrl: 'https://api.openai.com/v1',
          apiKey: '',
          selectedModel: 'gpt-4o',
          availableModels: ['gpt-4o'],
        },
      ],
      activeProviderId: 'openai-default',
    });
    vi.mocked(saveAISettings).mockResolvedValue(undefined);
  });
  it('does not render when isOpen is false', () => {
    renderSettingsModal({ isOpen: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders modal with title and categories when isOpen is true', () => {
    renderSettingsModal({ isOpen: true });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Appearance/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Editor/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Build & Execution/i })).toBeInTheDocument();
  });

  it('switches between categories when category buttons are clicked', () => {
    renderSettingsModal();

    // Defaults to Appearance category
    expect(screen.getByText('Darcula (Dark)')).toBeInTheDocument();
    expect(screen.getByText('IntelliJ Light')).toBeInTheDocument();

    // Switch to Editor category
    fireEvent.click(screen.getByRole('button', { name: /Editor/i }));
    expect(screen.getByTestId('autosave-checkbox')).toBeInTheDocument();
    expect(screen.getByText(/Enable Auto-save/i)).toBeInTheDocument();

    // Switch to Build & Execution category
    fireEvent.click(screen.getByRole('button', { name: /Build & Execution/i }));
    expect(screen.getByText('latexmk (pdflatex)')).toBeInTheDocument();
    expect(screen.getByText('latexmk (xelatex)')).toBeInTheDocument();
    expect(screen.getByText('latexmk (lualatex)')).toBeInTheDocument();
  });

  it('allows changing theme and calls onThemeChange on Apply or OK', () => {
    const onThemeChange = vi.fn();
    const onClose = vi.fn();
    renderSettingsModal({ theme: 'dark', onThemeChange, onClose });

    // Select light theme
    const lightRadio = screen.getByLabelText(/IntelliJ Light/i);
    fireEvent.click(lightRadio);

    // Click Apply
    const applyBtn = screen.getByRole('button', { name: 'Apply' });
    fireEvent.click(applyBtn);

    expect(onThemeChange).toHaveBeenCalledWith('light');
    expect(onClose).not.toHaveBeenCalled();

    // Click OK
    const okBtn = screen.getByRole('button', { name: 'OK' });
    fireEvent.click(okBtn);

    expect(onThemeChange).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('allows toggling autosave and calls onAutoSaveChange on Apply or OK', () => {
    const onAutoSaveChange = vi.fn();
    const onClose = vi.fn();
    renderSettingsModal({ autoSave: true, onAutoSaveChange, onClose });

    // Switch to Editor category
    fireEvent.click(screen.getByRole('button', { name: /Editor/i }));

    const checkbox = screen.getByTestId('autosave-checkbox');
    expect(checkbox).toBeChecked();

    // Uncheck autoSave
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();

    // Click OK
    const okBtn = screen.getByRole('button', { name: 'OK' });
    fireEvent.click(okBtn);

    expect(onAutoSaveChange).toHaveBeenCalledWith(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('allows selecting TeX engine and calls onEngineChange on OK', () => {
    const onEngineChange = vi.fn();
    const onClose = vi.fn();
    renderSettingsModal({ selectedEngine: 'pdflatex', onEngineChange, onClose });

    // Switch to Build category
    fireEvent.click(screen.getByRole('button', { name: /Build & Execution/i }));

    const xelatexRadio = screen.getByLabelText(/latexmk \(xelatex\)/i);
    fireEvent.click(xelatexRadio);

    const okBtn = screen.getByRole('button', { name: 'OK' });
    fireEvent.click(okBtn);

    expect(onEngineChange).toHaveBeenCalledWith('xelatex');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes dialog on Cancel without applying changes', () => {
    const onThemeChange = vi.fn();
    const onAutoSaveChange = vi.fn();
    const onClose = vi.fn();
    renderSettingsModal({ theme: 'dark', autoSave: true, onThemeChange, onAutoSaveChange, onClose });

    // Switch to Editor category and toggle
    fireEvent.click(screen.getByRole('button', { name: /Editor/i }));
    const checkbox = screen.getByTestId('autosave-checkbox');
    fireEvent.click(checkbox);

    // Click Cancel
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelBtn);

    expect(onAutoSaveChange).not.toHaveBeenCalled();
    expect(onThemeChange).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes dialog when pressing Escape or clicking X button', () => {
    const onClose = vi.fn();
    renderSettingsModal({ onClose });

    // Escape key
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    // Close button (X)
    const closeBtn = screen.getByLabelText('Close Settings');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  describe('Search Settings in AI Category', () => {
    it('displays the Search Engine section when switching to the AI tab', async () => {
      renderSettingsModal();

      const aiButton = screen.getByRole('button', { name: /AI Assistant/i });
      fireEvent.click(aiButton);

      expect(screen.getByText('Search Engine & Literature Lookup')).toBeInTheDocument();
      expect(
        screen.getByText(/Configure search engines for automated literature discovery/i)
      ).toBeInTheDocument();
    });

    it('defaults the search provider dropdown to Built-in Free', async () => {
      renderSettingsModal();
      fireEvent.click(screen.getByRole('button', { name: /AI Assistant/i }));

      const providerSelect = await screen.findByLabelText(/Search Provider/i);
      expect(providerSelect).toBeInTheDocument();
      expect(providerSelect).toHaveValue('free');
      expect(
        screen.getByRole('option', { name: /Built-in Free/i })
      ).toBeInTheDocument();
      expect(screen.queryByLabelText('Search API Key')).not.toBeInTheDocument();
    });

    it('displays Search API Key input when selecting Tavily Search API or Brave Search API', async () => {
      renderSettingsModal();
      fireEvent.click(screen.getByRole('button', { name: /AI Assistant/i }));

      await waitFor(() => {
        expect(loadAISettings).toHaveBeenCalled();
      });

      const providerSelect = screen.getByLabelText(/Search Provider/i);

      // Select Tavily
      fireEvent.change(providerSelect, { target: { value: 'tavily' } });
      expect(providerSelect).toHaveValue('tavily');

      const apiKeyInput = screen.getByLabelText('Search API Key');
      expect(apiKeyInput).toBeInTheDocument();
      expect(apiKeyInput).toHaveAttribute('placeholder', 'e.g. tvly-...');

      // Select Brave
      fireEvent.change(providerSelect, { target: { value: 'brave' } });
      expect(providerSelect).toHaveValue('brave');
      expect(apiKeyInput).toHaveAttribute('placeholder', 'e.g. BSAE...');

      // Toggle visibility
      expect(apiKeyInput).toHaveAttribute('type', 'password');
      const toggleBtn = screen.getByLabelText(/Show Search API Key/i);
      fireEvent.click(toggleBtn);
      expect(apiKeyInput).toHaveAttribute('type', 'text');
    });

    it('saves search settings with provider and apiKey when Apply or OK is clicked', async () => {
      renderSettingsModal();
      fireEvent.click(screen.getByRole('button', { name: /AI Assistant/i }));

      await waitFor(() => {
        expect(loadAISettings).toHaveBeenCalled();
      });

      const providerSelect = screen.getByLabelText(/Search Provider/i);
      fireEvent.change(providerSelect, { target: { value: 'tavily' } });

      const apiKeyInput = screen.getByLabelText('Search API Key');
      fireEvent.change(apiKeyInput, { target: { value: 'tvly-secret-12345' } });

      // Click Apply
      const applyBtn = screen.getByRole('button', { name: 'Apply' });
      fireEvent.click(applyBtn);

      await waitFor(() => {
        expect(saveAISettings).toHaveBeenCalledWith(
          expect.objectContaining({
            search: {
              provider: 'tavily',
              apiKey: 'tvly-secret-12345',
            },
          })
        );
      });

      // Click OK
      const okBtn = screen.getByRole('button', { name: 'OK' });
      fireEvent.click(okBtn);

      await waitFor(() => {
        expect(saveAISettings).toHaveBeenCalledTimes(2);
        expect(saveAISettings).toHaveBeenLastCalledWith(
          expect.objectContaining({
            search: {
              provider: 'tavily',
              apiKey: 'tvly-secret-12345',
            },
          })
        );
      });
    });
  });
});
