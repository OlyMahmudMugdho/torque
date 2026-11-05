// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsModal, type SettingsModalProps } from '../SettingsModal';
import { ThemeProvider } from '../../context/ThemeContext';
import {
  loadAISettings,
  saveAISettings,
  fetchProviderModels,
} from '../../ai/aiConfig';
import type { AISettings } from '../../types/ai';

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

describe('SettingsModal - AI Assistant Category', () => {
  const mockAISettings: AISettings = {
    providers: [
      {
        id: 'openai-default',
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test-key-123',
        selectedModel: 'gpt-4o',
        availableModels: ['gpt-4o', 'gpt-4o-mini'],
      },
      {
        id: 'ollama-default',
        name: 'Ollama Local',
        baseUrl: 'http://localhost:11434/v1',
        apiKey: '',
        selectedModel: 'llama3:latest',
        availableModels: ['llama3:latest'],
      },
    ],
    activeProviderId: 'openai-default',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadAISettings).mockResolvedValue(JSON.parse(JSON.stringify(mockAISettings)));
    vi.mocked(saveAISettings).mockResolvedValue(undefined);
    vi.mocked(fetchProviderModels).mockResolvedValue(['model-a', 'model-b']);
  });

  it('renders AI Assistant category button and navigates to it', async () => {
    renderSettingsModal();

    const aiButton = screen.getByRole('button', { name: /AI Assistant/i });
    expect(aiButton).toBeInTheDocument();

    fireEvent.click(aiButton);

    expect(screen.getByText('AI Assistant Configuration')).toBeInTheDocument();
    expect(screen.getByText('Configured Providers')).toBeInTheDocument();
    await waitFor(() => {
      expect(loadAISettings).toHaveBeenCalled();
    });
  });

  it('displays provider details (Name, Base URL, API Key, Model)', async () => {
    renderSettingsModal();
    fireEvent.click(screen.getByRole('button', { name: /AI Assistant/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('OpenAI')).toBeInTheDocument();
      expect(screen.getByDisplayValue('https://api.openai.com/v1')).toBeInTheDocument();
      expect(screen.getByDisplayValue('sk-test-key-123')).toBeInTheDocument();
      expect(screen.getByLabelText('Model Name')).toHaveValue('gpt-4o');
    });
  });

  it('toggles API Key visibility with show/hide button', async () => {
    renderSettingsModal();
    fireEvent.click(screen.getByRole('button', { name: /AI Assistant/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('sk-test-key-123')).toBeInTheDocument();
    });

    const apiKeyInput = screen.getByLabelText('API Key');
    expect(apiKeyInput).toHaveAttribute('type', 'password');

    const toggleButton = screen.getByLabelText('Show API Key');
    fireEvent.click(toggleButton);
    expect(apiKeyInput).toHaveAttribute('type', 'text');

    const hideButton = screen.getByLabelText('Hide API Key');
    fireEvent.click(hideButton);
    expect(apiKeyInput).toHaveAttribute('type', 'password');
  });

  it('tests connection successfully and populates models', async () => {
    vi.mocked(fetchProviderModels).mockResolvedValue(['gpt-4o', 'gpt-4o-mini', 'o1-preview']);

    renderSettingsModal();
    fireEvent.click(screen.getByRole('button', { name: /AI Assistant/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('OpenAI')).toBeInTheDocument();
    });

    const testButton = screen.getByRole('button', { name: /Test Connection/i });
    fireEvent.click(testButton);

    await waitFor(() => {
      expect(fetchProviderModels).toHaveBeenCalledWith(
        'https://api.openai.com/v1',
        'sk-test-key-123'
      );
      expect(screen.getByText(/Connected! Found 3 models\./i)).toBeInTheDocument();
    });
  });

  it('handles connection test error and displays message', async () => {
    vi.mocked(fetchProviderModels).mockRejectedValue(new Error('Connection refused'));

    renderSettingsModal();
    fireEvent.click(screen.getByRole('button', { name: /AI Assistant/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('OpenAI')).toBeInTheDocument();
    });

    const testButton = screen.getByRole('button', { name: /Test Connection/i });
    fireEvent.click(testButton);

    await waitFor(() => {
      expect(screen.getByText('Connection refused')).toBeInTheDocument();
    });
  });

  it('allows adding a new provider and editing its details', async () => {
    renderSettingsModal();
    fireEvent.click(screen.getByRole('button', { name: /AI Assistant/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('OpenAI')).toBeInTheDocument();
    });

    const addBtn = screen.getByRole('button', { name: /Add Provider/i });
    fireEvent.click(addBtn);

    const nameInput = screen.getByLabelText('Provider Name');
    fireEvent.change(nameInput, { target: { value: 'DeepSeek Local' } });
    expect(screen.getByDisplayValue('DeepSeek Local')).toBeInTheDocument();

    const baseUrlInput = screen.getByLabelText('Base URL');
    fireEvent.change(baseUrlInput, { target: { value: 'http://localhost:8000/v1' } });
    expect(screen.getByDisplayValue('http://localhost:8000/v1')).toBeInTheDocument();
  });

  it('allows deleting a provider when more than 1 provider exists', async () => {
    renderSettingsModal();
    fireEvent.click(screen.getByRole('button', { name: /AI Assistant/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('OpenAI')).toBeInTheDocument();
    });

    const deleteBtn = screen.getByLabelText('Delete provider Ollama Local');
    fireEvent.click(deleteBtn);

    expect(screen.queryByText('Ollama Local')).not.toBeInTheDocument();
  });

  it('saves AI settings when Apply or OK is clicked', async () => {
    renderSettingsModal();
    fireEvent.click(screen.getByRole('button', { name: /AI Assistant/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('OpenAI')).toBeInTheDocument();
    });

    const baseUrlInput = screen.getByLabelText('Base URL');
    fireEvent.change(baseUrlInput, { target: { value: 'https://custom.api.com/v1' } });

    const applyButton = screen.getByRole('button', { name: 'Apply' });
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(saveAISettings).toHaveBeenCalledWith(
        expect.objectContaining({
          providers: expect.arrayContaining([
            expect.objectContaining({
              baseUrl: 'https://custom.api.com/v1',
            }),
          ]),
        })
      );
    });

    const okButton = screen.getByRole('button', { name: 'OK' });
    fireEvent.click(okButton);

    await waitFor(() => {
      expect(saveAISettings).toHaveBeenCalledTimes(2);
    });
  });

  it('renders styled model dropdown and allows selecting an available model', async () => {
    renderSettingsModal();
    fireEvent.click(screen.getByRole('button', { name: /AI Assistant/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('OpenAI')).toBeInTheDocument();
    });

    const select = screen.getByLabelText('Available Models');
    expect(select).toBeInTheDocument();
    expect(select).toHaveClass('appearance-none');

    // Select gpt-4o-mini
    fireEvent.change(select, { target: { value: 'gpt-4o-mini' } });
    expect(screen.getByLabelText('Model Name')).toHaveValue('gpt-4o-mini');
  });
});
