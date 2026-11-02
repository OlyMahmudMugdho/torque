import React, { useEffect, useRef } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import type { ProjectFile, Diagnostic } from '../types/workspace';
import { registerLatexLanguage, diagnosticsToMarkers } from './latexLanguage';
import { X, Image } from 'lucide-react';

interface MonacoEditorPaneProps {
  files: ProjectFile[];
  activeFilePath: string;
  rootEntry: string;
  openTabs: string[];
  diagnostics: Diagnostic[];
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onContentChange: (content: string) => void;
  onCompileShortcut: () => void;
}

export const MonacoEditorPane: React.FC<MonacoEditorPaneProps> = ({
  files,
  activeFilePath,
  rootEntry,
  openTabs,
  diagnostics,
  onSelectTab,
  onCloseTab,
  onContentChange,
  onCompileShortcut,
}) => {
  const monaco = useMonaco();
  const editorRef = useRef<any>(null);

  // Register LaTeX language syntax & tokens once Monaco is ready
  useEffect(() => {
    if (monaco) {
      registerLatexLanguage(monaco);
    }
  }, [monaco]);

  const activeFile = files.find((f) => f.path === activeFilePath);
  const isBinary = activeFile?.isBinary ?? false;
  const textContent =
    activeFile && typeof activeFile.content === 'string'
      ? activeFile.content
      : '';

  // Update Monaco diagnostic markers on model
  useEffect(() => {
    if (!monaco || !editorRef.current || isBinary) return;

    const model = editorRef.current.getModel();
    if (!model) return;

    const markers = diagnosticsToMarkers(diagnostics, activeFilePath, rootEntry);
    monaco.editor.setModelMarkers(model, 'glyphtex', markers);
  }, [monaco, diagnostics, activeFilePath, rootEntry, isBinary]);

  const handleEditorDidMount = (editor: any, m: any) => {
    editorRef.current = editor;

    // Add Ctrl+Enter / Cmd+Enter hotkey for Compile
    editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.Enter, () => {
      onCompileShortcut();
    });
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#1e1e1e]">
      {/* Tab Bar */}
      <div className="h-9 bg-zinc-950 border-b border-zinc-800 flex items-center overflow-x-auto select-none">
        {openTabs.map((tabPath) => {
          const isActive = tabPath === activeFilePath;
          const fileName = tabPath.split('/').pop() || tabPath;

          return (
            <div
              key={tabPath}
              onClick={() => onSelectTab(tabPath)}
              className={`h-full flex items-center gap-2 px-3 text-xs border-r border-zinc-800 cursor-pointer transition ${
                isActive
                  ? 'bg-[#1e1e1e] text-white font-medium border-t-2 border-t-indigo-500'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
              }`}
            >
              <span>{fileName}</span>
              {openTabs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tabPath);
                  }}
                  className="p-0.5 hover:bg-zinc-700 rounded text-zinc-500 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Editor or Binary Asset View */}
      <div className="flex-1 w-full h-[calc(100%-2.25rem)]">
        {isBinary ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 gap-2">
            <Image className="w-12 h-12 text-zinc-600" />
            <span className="text-sm font-medium">Binary asset: {activeFilePath}</span>
            <span className="text-xs text-zinc-500">Binary files cannot be edited in the code editor.</span>
          </div>
        ) : (
          <Editor
            height="100%"
            language={activeFilePath.endsWith('.tex') ? 'latex' : 'plaintext'}
            theme="vs-dark"
            value={textContent}
            onChange={(val) => onContentChange(val ?? '')}
            onMount={handleEditorDidMount}
            options={{
              fontSize: 14,
              fontFamily: 'JetBrains Mono, Menlo, Monaco, Courier New, monospace',
              minimap: { enabled: true },
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              wordWrap: 'on',
            }}
          />
        )}
      </div>
    </div>
  );
};
