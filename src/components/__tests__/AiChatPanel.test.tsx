// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AiChatPanel, type AiChatPanelProps } from '../AiChatPanel';
import type { AIProviderConfig, ChatSession } from '../../types/ai';
import type { FileDiffResult } from '../../ai/diffUtils';

const mockProvider: AIProviderConfig = {
  id: 'openai-1',
  name: 'OpenAI',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'sk-test-secret-key-123',
  selectedModel: 'gpt-4o',
  availableModels: ['gpt-4o', 'gpt-4o-mini'],
};

const mockDiff: FileDiffResult = {
  path: 'main.tex',
  originalContent: '\\documentclass{article}\n\\begin{document}\nOld text\n\\end{document}',
  newContent: '\\documentclass{article}\n\\begin{document}\nNew text\n\\end{document}',
  additions: 1,
  deletions: 1,
  diffHunks: [
    { type: 'context', line: '\\documentclass{article}', oldLineNo: 1, newLineNo: 1 },
    { type: 'context', line: '\\begin{document}', oldLineNo: 2, newLineNo: 2 },
    { type: 'deleted', line: 'Old text', oldLineNo: 3 },
    { type: 'added', line: 'New text', newLineNo: 3 },
    { type: 'context', line: '\\end{document}', oldLineNo: 4, newLineNo: 4 },
  ],
  unifiedDiff: '@@ -1,4 +1,4 @@\n \\documentclass{article}\n \\begin{document}\n-Old text\n+New text\n \\end{document}',
};

describe('AiChatPanel Component', () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  const createProps = (overrides: Partial<AiChatPanelProps> = {}): AiChatPanelProps => ({
    isOpen: true,
    onClose: vi.fn(),
    onOpenSettings: vi.fn(),
    activeProvider: mockProvider,
    workspace: {
      files: { 'main.tex': { content: 'Old text' } },
      activeFilePath: 'main.tex',
      activeFileContent: 'Old text',
      updateFileContent: vi.fn(),
      createFile: vi.fn(),
      compileProject: vi.fn(),
      diagnostics: [],
    },
    ...overrides,
  });

  it('renders nothing when isOpen is false', () => {
    render(<AiChatPanel {...createProps({ isOpen: false })} />);
    expect(screen.queryByTestId('ai-chat-panel')).not.toBeInTheDocument();
  });

  it('renders header, input, and prompt when isOpen is true', () => {
    render(<AiChatPanel {...createProps({ isOpen: true })} />);

    expect(screen.getByTestId('ai-chat-panel')).toBeInTheDocument();
    expect(screen.getByTestId('ai-chat-header')).toBeInTheDocument();
    expect(screen.getByText('AI Assistant')).toBeInTheDocument();
    expect(screen.getByTestId('active-model-pill')).toHaveTextContent('gpt-4o');

    const textarea = screen.getByTestId('chat-textarea');
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveAttribute(
      'placeholder',
      'Ask AI co-author to edit, format LaTeX, fix errors...'
    );

    expect(screen.getByTestId('chat-empty-state')).toBeInTheDocument();
  });

  it('shows banner/button to open settings when no provider is active', () => {
    const onOpenSettings = vi.fn();
    render(
      <AiChatPanel
        {...createProps({
          activeProvider: null,
          onOpenSettings,
        })}
      />
    );

    const banner = screen.getByTestId('unconfigured-provider-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent('No AI provider configured');

    const settingsBtn = screen.getByTestId('banner-open-settings-button');
    expect(settingsBtn).toBeInTheDocument();
    fireEvent.click(settingsBtn);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('shows banner when provider has no apiKey and is not localhost', () => {
    const unconfiguredProvider: AIProviderConfig = {
      id: 'custom-1',
      name: 'Custom',
      baseUrl: 'https://api.example.com',
      apiKey: '',
      selectedModel: 'custom-model',
      availableModels: ['custom-model'],
    };

    render(
      <AiChatPanel
        {...createProps({
          activeProvider: unconfiguredProvider,
        })}
      />
    );

    expect(screen.getByTestId('unconfigured-provider-banner')).toBeInTheDocument();
  });

  it('does NOT show banner when provider has localhost baseUrl without apiKey', () => {
    const ollamaLocalProvider: AIProviderConfig = {
      id: 'ollama-1',
      name: 'Ollama Local',
      baseUrl: 'http://localhost:11434',
      apiKey: '',
      selectedModel: 'llama3:latest',
      availableModels: ['llama3:latest'],
    };

    render(
      <AiChatPanel
        {...createProps({
          activeProvider: ollamaLocalProvider,
        })}
      />
    );

    expect(screen.queryByTestId('unconfigured-provider-banner')).not.toBeInTheDocument();
  });

  it('+ New Chat button creates a session', () => {
    render(<AiChatPanel {...createProps()} />);

    const select = screen.getByTestId('session-select') as HTMLSelectElement;
    expect(select.children.length).toBe(1);

    const newChatBtn = screen.getByTestId('new-chat-button');
    fireEvent.click(newChatBtn);

    expect(select.children.length).toBe(2);
    expect(select.value).not.toBe('session-default');
  });

  it('submitting a message displays it in the feed', () => {
    render(<AiChatPanel {...createProps()} />);

    const textarea = screen.getByTestId('chat-textarea') as HTMLTextAreaElement;
    const sendBtn = screen.getByTestId('send-message-button');

    fireEvent.change(textarea, { target: { value: 'Help me format this equation: $E=mc^2$' } });
    expect(sendBtn).not.toBeDisabled();

    fireEvent.click(sendBtn);

    expect(textarea.value).toBe('');
    expect(screen.getByTestId('chat-message-user')).toBeInTheDocument();
    expect(
      screen.getByText('Help me format this equation: $E=mc^2$')
    ).toBeInTheDocument();
  });

  it('supports Enter keyboard shortcut to submit message', () => {
    render(<AiChatPanel {...createProps()} />);

    const textarea = screen.getByTestId('chat-textarea');
    fireEvent.change(textarea, { target: { value: 'Explain document structure' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(screen.getByTestId('chat-message-user')).toBeInTheDocument();
    expect(screen.getByText('Explain document structure')).toBeInTheDocument();
  });

  it('renders AiDiffCard when a message has a diff tool call, and clicking Accept calls updateFileContent', () => {
    const updateFileContent = vi.fn();
    const sessionsWithDiff: ChatSession[] = [
      {
        id: 'sess-diff-1',
        title: 'Refactor Document',
        createdAt: Date.now(),
        messages: [
          {
            id: 'msg-asst-1',
            role: 'assistant',
            content: 'I have updated the main text section for you.',
            timestamp: Date.now(),
            toolCalls: [
              {
                id: 'tc-edit-1',
                name: 'torque_edit_file',
                status: 'pending_approval',
                diff: mockDiff,
              },
            ],
          },
        ],
      },
    ];

    render(
      <AiChatPanel
        {...createProps({
          initialSessions: sessionsWithDiff,
          workspace: {
            updateFileContent,
            createFile: vi.fn(),
          },
        })}
      />
    );

    // Verify Diff card is rendered
    expect(screen.getByTestId('ai-diff-card')).toBeInTheDocument();
    expect(screen.getByText('main.tex')).toBeInTheDocument();

    // Click Accept button
    const acceptBtn = screen.getByTestId('diff-accept-btn');
    expect(acceptBtn).toBeInTheDocument();
    fireEvent.click(acceptBtn);

    // Verify workspace.updateFileContent was invoked with expected path and newContent
    expect(updateFileContent).toHaveBeenCalledWith('main.tex', mockDiff.newContent);

    // Verify status badge changed to Accepted
    expect(screen.getByTestId('status-accepted-badge')).toBeInTheDocument();
  });

  it('rejecting a diff tool call updates status to rejected without modifying workspace', () => {
    const updateFileContent = vi.fn();
    const sessionsWithDiff: ChatSession[] = [
      {
        id: 'sess-diff-2',
        title: 'Proposed Changes',
        createdAt: Date.now(),
        messages: [
          {
            id: 'msg-asst-2',
            role: 'assistant',
            content: 'Here is a proposed diff.',
            timestamp: Date.now(),
            toolCalls: [
              {
                id: 'tc-edit-2',
                name: 'torque_edit_file',
                status: 'pending_approval',
                diff: mockDiff,
              },
            ],
          },
        ],
      },
    ];

    render(
      <AiChatPanel
        {...createProps({
          initialSessions: sessionsWithDiff,
          workspace: {
            updateFileContent,
          },
        })}
      />
    );

    const rejectBtn = screen.getByTestId('diff-reject-btn');
    fireEvent.click(rejectBtn);

    expect(updateFileContent).not.toHaveBeenCalled();
    expect(screen.getByTestId('status-rejected-badge')).toBeInTheDocument();
  });

  it('renders tool badges for read-only tools and filters out protocol messages from UI feed', () => {
    const sessionsWithTools: ChatSession[] = [
      {
        id: 'sess-tools-1',
        title: 'Tool Test',
        createdAt: Date.now(),
        messages: [
          {
            id: 'msg-u1',
            role: 'user',
            content: 'Summarize document',
            timestamp: 1,
          },
          {
            id: 'msg-a1',
            role: 'assistant',
            content: '',
            timestamp: 2,
            toolCalls: [
              {
                id: 'tc-read-1',
                name: 'torque_read_file',
                args: { path: 'main.tex', startLine: 1, endLine: 50 },
                status: 'done',
                result: '\\documentclass{article}...',
              },
              {
                id: 'tc-compile-1',
                name: 'torque_compile',
                args: { engine: 'pdflatex' },
                status: 'done',
                result: { success: true },
              },
              {
                id: 'tc-diag-1',
                name: 'torque_get_diagnostics',
                args: {},
                status: 'done',
                result: [],
              },
              {
                id: 'tc-acad-1',
                name: 'torque_search_academic',
                args: { query: 'transformers attention' },
                status: 'done',
                result: [{ title: 'Attention Is All You Need' }],
              },
              {
                id: 'tc-web-1',
                name: 'torque_search_web',
                args: { query: 'latex microtype documentation' },
                status: 'done',
                result: [{ title: 'Microtype package docs' }],
              },
            ],
          },
          {
            id: 'msg-tool-1',
            role: 'tool',
            toolCallId: 'tc-read-1',
            content: 'RAW_FILE_PAYLOAD_SHOULD_BE_HIDDEN',
            timestamp: 3,
          },
          {
            id: 'msg-a2',
            role: 'assistant',
            content: 'Here is the summary of the LaTeX file.',
            timestamp: 4,
          },
        ],
      },
    ];

    render(
      <AiChatPanel
        {...createProps({
          initialSessions: sessionsWithTools,
        })}
      />
    );

    // Tool badges should be visible
    expect(screen.getByTestId('tool-badge-read-file')).toBeInTheDocument();
    expect(screen.getByTestId('tool-badge-read-file')).toHaveTextContent('read main.tex');
    expect(screen.getByTestId('tool-badge-compile')).toBeInTheDocument();
    expect(screen.getByTestId('tool-badge-compile')).toHaveTextContent('compile project (pdflatex)');
    expect(screen.getByTestId('tool-badge-diagnostics')).toBeInTheDocument();
    expect(screen.getByTestId('tool-badge-search-academic')).toBeInTheDocument();
    expect(screen.getByTestId('tool-badge-search-academic')).toHaveTextContent('transformers attention');
    expect(screen.getByTestId('tool-badge-search-web')).toBeInTheDocument();
    expect(screen.getByTestId('tool-badge-search-web')).toHaveTextContent('latex microtype documentation');

    // The raw tool payload should NOT be rendered as a visible message bubble
    expect(screen.queryByText('RAW_FILE_PAYLOAD_SHOULD_BE_HIDDEN')).not.toBeInTheDocument();

    // Assistant summary should be visible
    expect(screen.getByText('Here is the summary of the LaTeX file.')).toBeInTheDocument();
  });

  it('shows history popover when history button is clicked and allows selecting or deleting sessions', () => {
    const multiSessions: ChatSession[] = [
      {
        id: 'sess-1',
        title: 'Quantum Discussion',
        createdAt: Date.now() - 60000,
        messages: [{ id: 'm1', role: 'user', content: 'What is bra-ket notation?', timestamp: 1 }],
      },
      {
        id: 'sess-2',
        title: 'LaTeX Formatting',
        createdAt: Date.now() - 3600000,
        messages: [{ id: 'm2', role: 'user', content: 'How to make a 2x2 table?', timestamp: 2 }],
      },
    ];

    render(
      <AiChatPanel
        {...createProps({
          initialSessions: multiSessions,
        })}
      />
    );

    // History popover should be hidden initially
    expect(screen.queryByTestId('history-popover')).not.toBeInTheDocument();

    const historyBtn = screen.getByTestId('history-button');
    expect(historyBtn).toBeInTheDocument();

    // Click History button to reveal popover
    fireEvent.click(historyBtn);
    expect(screen.getByTestId('history-popover')).toBeInTheDocument();
    expect(screen.getByText('Chat History')).toBeInTheDocument();
    expect(screen.getByText('(2)')).toBeInTheDocument();

    // Verify session items are shown
    expect(screen.getByTestId('history-session-item-sess-1')).toHaveTextContent('Quantum Discussion');
    expect(screen.getByTestId('history-session-item-sess-2')).toHaveTextContent('LaTeX Formatting');

    // Clicking session 2 switches active chat and closes popover
    fireEvent.click(screen.getByTestId('history-session-item-sess-2'));
    expect(screen.queryByTestId('history-popover')).not.toBeInTheDocument();

    // Active message feed should now show session 2 message
    expect(screen.getByText('How to make a 2x2 table?')).toBeInTheDocument();

    // Open history popover again and test deleting a session
    fireEvent.click(historyBtn);
    expect(screen.getByTestId('history-popover')).toBeInTheDocument();

    const deleteBtn = screen.getByTestId('delete-session-sess-2');
    fireEvent.click(deleteBtn);

    // Session 2 should be removed, leaving 1 session
    expect(screen.queryByTestId('history-session-item-sess-2')).not.toBeInTheDocument();
    expect(screen.getByTestId('history-session-item-sess-1')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<AiChatPanel {...createProps({ onClose })} />);

    const closeBtn = screen.getByTestId('close-chat-button');
    fireEvent.click(closeBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders rich markdown formatting including headings, bold, links, lists, and code blocks', () => {
    const markdownContent = [
      '### Literature Summary',
      'Here is the **Transformers Milestone** paper by *Vaswani et al.*:',
      '- Title: [Attention Is All You Need](https://arxiv.org/abs/1706.03762)',
      '- Year: 2017',
      '> Groundbreaking transformer architecture.',
      '```latex',
      '\\cite{vaswani2017attention}',
      '```',
    ].join('\n');

    const sessionsWithMarkdown: ChatSession[] = [
      {
        id: 'sess-md',
        title: 'Markdown Test',
        createdAt: 1,
        messages: [
          {
            id: 'msg-u1',
            role: 'user',
            content: 'Find attention paper',
            timestamp: 1,
          },
          {
            id: 'msg-a1',
            role: 'assistant',
            content: markdownContent,
            timestamp: 2,
          },
        ],
      },
    ];

    render(
      <AiChatPanel
        {...createProps({
          initialSessions: sessionsWithMarkdown,
        })}
      />
    );

    // Heading should render as h3
    const heading = screen.getByRole('heading', { level: 3 });
    expect(heading).toHaveTextContent('Literature Summary');

    // Bold text
    expect(screen.getByText('Transformers Milestone')).toBeInTheDocument();

    // Link
    const link = screen.getByRole('link', { name: 'Attention Is All You Need' });
    expect(link).toHaveAttribute('href', 'https://arxiv.org/abs/1706.03762');
    expect(link).toHaveAttribute('target', '_blank');

    // List item
    expect(screen.getByText('Year: 2017')).toBeInTheDocument();

    // Code block
    expect(screen.getByText('\\cite{vaswani2017attention}')).toBeInTheDocument();
  });
});
