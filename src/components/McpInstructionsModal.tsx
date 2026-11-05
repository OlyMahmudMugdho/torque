'use client';

import React, { useState, useEffect } from 'react';
import { useThemeSafe } from '../context/ThemeContext';
import { isTauri } from '../storage/tauriStorage';
import { X, Check, Copy, Bot, Terminal, Code2, Server, HelpCircle } from 'lucide-react';

export type McpClientType = 'claude' | 'cursor' | 'antigravity' | 'zed';

export interface McpInstructionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  port?: number;
}

export const McpInstructionsModal: React.FC<McpInstructionsModalProps> = ({
  isOpen,
  onClose,
  port: initialPort = 3030,
}) => {
  const { theme } = useThemeSafe();
  const isDark = theme === 'dark';

  const [activeTab, setActiveTab] = useState<McpClientType>('claude');
  const [activeSection, setActiveSection] = useState<'config' | 'tools'>('config');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [port, setPort] = useState<number>(initialPort);

  // Sync port from Tauri backend if available
  useEffect(() => {
    if (initialPort) {
      setPort(initialPort);
    }
    if (isTauri()) {
      import('@tauri-apps/api/core')
        .then(({ invoke }) => {
          invoke<{ port: number; active: boolean }>('tauri_get_mcp_info')
            .then((info) => {
              if (info && info.port > 0) {
                setPort(info.port);
              }
            })
            .catch(() => {});
        })
        .catch(() => {});
    }
  }, [initialPort]);

  // Keyboard escape listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sseUrl = `http://127.0.0.1:${port}/sse`;
  const httpUrl = `http://127.0.0.1:${port}/mcp`;

  const configs: Record<McpClientType, { title: string; configPath: string; snippet: string }> = {
    claude: {
      title: 'Claude Desktop',
      configPath: 'claude_desktop_config.json',
      snippet: JSON.stringify(
        {
          mcpServers: {
            torque: {
              command: 'node',
              args: ['/path/to/torque/scripts/torque-mcp-bridge.js'],
            },
          },
        },
        null,
        2
      ),
    },
    cursor: {
      title: 'Cursor',
      configPath: '.cursor/mcp.json (or Cursor Settings > Features > MCP)',
      snippet: JSON.stringify(
        {
          mcpServers: {
            torque: {
              url: sseUrl,
            },
          },
        },
        null,
        2
      ),
    },
    antigravity: {
      title: 'Antigravity / Cline',
      configPath: 'mcp_settings.json / settings.json',
      snippet: JSON.stringify(
        {
          mcpServers: {
            torque: {
              command: 'node',
              args: ['/path/to/torque/scripts/torque-mcp-bridge.js'],
              alwaysAllow: [
                'torque_read_file',
                'torque_edit_file',
                'torque_write_file',
                'torque_compile',
                'torque_get_diagnostics',
              ],
            },
          },
        },
        null,
        2
      ),
    },
    zed: {
      title: 'Zed',
      configPath: '~/.config/zed/settings.json',
      snippet: JSON.stringify(
        {
          context_servers: {
            torque: {
              command: 'node',
              args: ['/path/to/torque/scripts/torque-mcp-bridge.js'],
            },
          },
        },
        null,
        2
      ),
    },
  };

  const handleCopy = async (text: string, key: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
      }
    } catch {
      // ignore
    }
  };

  const tools = [
    {
      name: 'torque_read_file',
      description: 'Read full text or slice by line ranges (startLine, endLine) to optimize context window.',
      params: 'path (string, required), startLine (number), endLine (number), projectId (string)',
    },
    {
      name: 'torque_edit_file',
      description: 'Surgical search & replace in LaTeX files. Replaces unique targets or sections accurately.',
      params: 'path (string, required), search (string, required), replace (string, required)',
    },
    {
      name: 'torque_write_file',
      description: 'Full file creation or overwrite in the active LaTeX project with instant workspace sync.',
      params: 'path (string, required), content (string, required), projectId (string)',
    },
    {
      name: 'torque_compile',
      description: 'Trigger native TeX Live multi-pass compilation (pdflatex, xelatex, lualatex) with SyncTeX.',
      params: 'engine (string: pdflatex | xelatex | lualatex), projectId (string)',
    },
    {
      name: 'torque_get_diagnostics',
      description: 'Fetch structured compile errors, warnings, missing files, and auto-resolved CTAN packages.',
      params: 'projectId (string)',
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mcp-modal-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-[760px] max-w-[95vw] h-[560px] max-h-[92vh] rounded-lg shadow-2xl border flex flex-col overflow-hidden font-sans ${
          isDark
            ? 'bg-[#2b2d30] border-[#393b40] text-[#dfe1e5]'
            : 'bg-[#ffffff] border-[#d1d5db] text-[#1f2328]'
        }`}
      >
        {/* IntelliJ Header */}
        <div
          className={`flex items-center justify-between px-4 py-2.5 border-b shrink-0 ${
            isDark ? 'border-[#393b40] bg-[#26282b]' : 'border-[#d1d5db] bg-[#f7f8fa]'
          }`}
        >
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-[#3574f0]" />
            <h2 id="mcp-modal-title" className="text-xs font-semibold tracking-wide">
              Model Context Protocol (MCP) AI Assistant Guide
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close MCP Guide"
            className={`p-1 rounded transition cursor-pointer ${
              isDark
                ? 'text-[#868a91] hover:text-[#dfe1e5] hover:bg-[#393b40]'
                : 'text-[#6c707e] hover:text-[#1f2328] hover:bg-[#dfe1e5]'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Server Status Ribbon */}
        <div
          className={`px-4 py-2 border-b flex items-center justify-between text-xs shrink-0 ${
            isDark ? 'border-[#393b40] bg-[#1e1f22]' : 'border-[#e5e7eb] bg-[#f0f4ff]'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-2 h-2 rounded-full bg-[#59a869] animate-pulse" />
              <span className="text-[#59a869] font-semibold">Active</span>
            </span>
            <span className={`h-3 w-px ${isDark ? 'bg-[#393b40]' : 'bg-[#d1d5db]'}`} />
            <span className="font-mono text-[11px] opacity-80">
              Port: <strong>{port}</strong> (fallback 3031)
            </span>
            <span className={`h-3 w-px ${isDark ? 'bg-[#393b40]' : 'bg-[#d1d5db]'}`} />
            <span className="font-mono text-[11px] opacity-80">
              SSE: <strong>{sseUrl}</strong>
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveSection('config')}
              className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition ${
                activeSection === 'config'
                  ? isDark
                    ? 'bg-[#3574f0] text-white'
                    : 'bg-[#3574f0] text-white'
                  : isDark
                  ? 'text-[#868a91] hover:text-[#dfe1e5]'
                  : 'text-[#6c707e] hover:text-[#1f2328]'
              }`}
            >
              Clients
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('tools')}
              className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition ${
                activeSection === 'tools'
                  ? isDark
                    ? 'bg-[#3574f0] text-white'
                    : 'bg-[#3574f0] text-white'
                  : isDark
                  ? 'text-[#868a91] hover:text-[#dfe1e5]'
                  : 'text-[#6c707e] hover:text-[#1f2328]'
              }`}
            >
              AI Tools ({tools.length})
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {activeSection === 'config' ? (
            <>
              {/* Left Client Sidebar */}
              <div
                className={`w-44 border-r flex flex-col py-2 shrink-0 ${
                  isDark ? 'border-[#393b40] bg-[#26282b]' : 'border-[#d1d5db] bg-[#f7f8fa]'
                }`}
              >
                {(['claude', 'cursor', 'antigravity', 'zed'] as const).map((client) => {
                  const isSelected = activeTab === client;
                  return (
                    <button
                      key={client}
                      type="button"
                      onClick={() => setActiveTab(client)}
                      className={`flex items-center gap-2 px-3 py-2 text-xs font-medium text-left transition cursor-pointer ${
                        isSelected
                          ? isDark
                            ? 'bg-[#3574f0] text-white'
                            : 'bg-[#3574f0] text-white'
                          : isDark
                          ? 'text-[#dfe1e5] hover:bg-[#323438]'
                          : 'text-[#1f2328] hover:bg-[#ebecf0]'
                      }`}
                    >
                      <Bot className="w-3.5 h-3.5 shrink-0 opacity-80" />
                      <span>{configs[client].title}</span>
                    </button>
                  );
                })}

                <div className={`mt-auto p-3 border-t text-[11px] opacity-70 ${isDark ? 'border-[#393b40]' : 'border-[#d1d5db]'}`}>
                  <div className="flex items-center gap-1 font-semibold mb-1">
                    <Server className="w-3 h-3 text-[#3574f0]" />
                    <span>Endpoints</span>
                  </div>
                  <div className="font-mono text-[10px] truncate" title={sseUrl}>SSE: {sseUrl}</div>
                  <div className="font-mono text-[10px] truncate mt-0.5" title={httpUrl}>HTTP: {httpUrl}</div>
                </div>
              </div>

              {/* Right Client Configuration Pane */}
              <div className="flex-1 p-5 overflow-y-auto flex flex-col gap-4">
                <div>
                  <h3 className="text-sm font-semibold tracking-wide">
                    Configure {configs[activeTab].title}
                  </h3>
                  <p className="text-xs opacity-70 mt-1">
                    Add the following configuration to your client's MCP configuration file (
                    <code className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 font-mono text-[11px]">
                      {configs[activeTab].configPath}
                    </code>
                    ):
                  </p>
                </div>

                {/* Code Block with One-Click Copy */}
                <div
                  className={`rounded-md border flex flex-col overflow-hidden text-xs ${
                    isDark ? 'border-[#393b40] bg-[#1e1f22]' : 'border-[#d1d5db] bg-[#f6f8fa]'
                  }`}
                >
                  <div
                    className={`flex items-center justify-between px-3 py-1.5 border-b text-[11px] font-mono ${
                      isDark ? 'border-[#393b40] bg-[#26282b] text-[#868a91]' : 'border-[#d1d5db] bg-[#eaecef] text-[#6c707e]'
                    }`}
                  >
                    <span>{configs[activeTab].configPath}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(configs[activeTab].snippet, `client-${activeTab}`)}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded border transition cursor-pointer text-xs ${
                        isDark
                          ? 'border-[#4e5157] text-[#dfe1e5] hover:bg-[#393b40]'
                          : 'border-[#c9ccd6] text-[#1f2328] hover:bg-[#dfe1e5]'
                      }`}
                    >
                      {copiedKey === `client-${activeTab}` ? (
                        <>
                          <Check className="w-3 h-3 text-[#59a869]" />
                          <span className="text-[#59a869] font-medium">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy JSON</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="p-3 font-mono text-[11px] leading-relaxed overflow-x-auto select-text">
                    {configs[activeTab].snippet}
                  </pre>
                </div>

                <div
                  className={`p-3 rounded border text-xs leading-relaxed ${
                    isDark ? 'border-[#393b40] bg-[#26282b]' : 'border-[#e5e7eb] bg-[#f9fafb]'
                  }`}
                >
                  <div className="font-semibold text-xs mb-1 flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-[#3574f0]" />
                    <span>How it works</span>
                  </div>
                  <p className="opacity-80">
                    The MCP bridge connects your AI assistant directly to Torque's embedded server.
                    File edits apply instantly in the editor, and compilation triggers live PDF updates
                    and structured diagnostics.
                  </p>
                </div>
              </div>
            </>
          ) : (
            /* AI Tools Summary Pane */
            <div className="flex-1 p-5 overflow-y-auto flex flex-col gap-3">
              <div>
                <h3 className="text-sm font-semibold tracking-wide">Available AI Editing Tools</h3>
                <p className="text-xs opacity-70 mt-1">
                  These tools are exposed through the Model Context Protocol to connected assistants:
                </p>
              </div>

              <div className="flex flex-col gap-2.5">
                {tools.map((tool) => (
                  <div
                    key={tool.name}
                    className={`p-3 rounded-md border text-xs ${
                      isDark ? 'border-[#393b40] bg-[#26282b]' : 'border-[#d1d5db] bg-[#f9fafb]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Code2 className="w-3.5 h-3.5 text-[#3574f0]" />
                        <span className="font-mono font-semibold text-xs text-[#3574f0]">
                          {tool.name}
                        </span>
                      </div>
                    </div>
                    <p className="opacity-80 mb-1.5">{tool.description}</p>
                    <div className="text-[11px] font-mono opacity-60">
                      Parameters: {tool.params}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`flex items-center justify-between px-4 py-2.5 border-t shrink-0 ${
            isDark ? 'border-[#393b40] bg-[#26282b]' : 'border-[#d1d5db] bg-[#f7f8fa]'
          }`}
        >
          <div className="text-[11px] opacity-60 flex items-center gap-1">
            <HelpCircle className="w-3.5 h-3.5 text-[#3574f0]" />
            <span>Changes made by connected AI assistants sync reactively in real time.</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded text-xs font-semibold bg-[#3574f0] text-white hover:bg-[#3068d9] transition shadow-sm cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};