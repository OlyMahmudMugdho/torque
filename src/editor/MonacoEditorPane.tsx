import React, { useEffect, useRef } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import type { ProjectFile, Diagnostic } from '../types/workspace';
import { registerLatexLanguage, diagnosticsToMarkers } from './latexLanguage';
import { X, Image, ChevronRight, FileCode } from 'lucide-react';

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

  useEffect(() => {
    if (!monaco || !editorRef.current || isBinary) return;

    const model = editorRef.current.getModel();
    if (!model) return;

    const markers = diagnosticsToMarkers(diagnostics, activeFilePath, rootEntry);
    monaco.editor.setModelMarkers(model, 'glyphtex', markers);
  }, [monaco, diagnostics, activeFilePath, rootEntry, isBinary]);

  const handleEditorDidMount = (editor: any, m: any) => {
    editorRef.current = editor;

    // Ctrl+Enter / Cmd+Enter for compile
    editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.Enter, () => {
      onCompileShortcut();
    });

    // Shift+F10 (IntelliJ shortcut for Run)
    editor.addCommand(m.KeyMod.Shift | m.KeyCode.F10, () => {
      onCompileShortcut();
    });
  };

  const pathParts = activeFilePath.split('/');

  return (
    <div className="w-full h-full flex flex-col bg-[#1e1f22]">
      {/* IntelliJ Tab Bar */}
      <div className="h-9 bg-[#2b2d30] border-b border-[#1e1f22] flex items-center overflow-x-auto select-none">
        {openTabs.map((tabPath) => {
          const isActive = tabPath === activeFilePath;
          const fileName = tabPath.split('/').pop() || tabPath;

          return (
            <div
              key={tabPath}
              onClick={() => onSelectTab(tabPath)}
              className={`h-full flex items-center gap-2 px-3 text-xs border-r border-[#1e1f22] cursor-pointer transition ${
                isActive
                  ? 'bg-[#1e1f22] text-[#dfe1e5] font-medium border-b-2 border-b-[#3574f0]'
                  : 'bg-[#2b2d30] text-[#868a91] hover:text-[#dfe1e5] hover:bg-[#313438]'
              }`}
            >
              <FileCode className="w-3.5 h-3.5 text-[#59a869]" />
              <span>{fileName}</span>
              {openTabs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tabPath);
                  }}
                  className="p-0.5 hover:bg-[#393b40] rounded text-[#868a91] hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* IntelliJ Breadcrumbs Bar */}
      <div className="h-6 bg-[#1e1f22] border-b border-[#2b2d30] px-3 flex items-center text-[11px] text-[#868a91] font-mono select-none">
        <span className="hover:text-[#dfe1e5] cursor-pointer">project</span>
        {pathParts.map((part, idx) => (
          <React.Fragment key={idx}>
            <ChevronRight className="w-3 h-3 text-[#5a5d63] mx-1" />
            <span
              className={`hover:text-[#dfe1e5] cursor-pointer ${
                idx === pathParts.length - 1 ? 'text-[#dfe1e5] font-medium' : ''
              }`}
            >
              {part}
            </span>
          </React.Fragment>
        ))}
      </div>

      {/* Editor or Binary Asset View */}
      <div className="flex-1 w-full h-[calc(100%-3.75rem)]">
        {isBinary ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-[#868a91] gap-2">
            <Image className="w-12 h-12 text-[#5a5d63]" />
            <span className="text-sm font-medium text-[#dfe1e5]">Binary asset: {activeFilePath}</span>
            <span className="text-xs text-[#868a91]">Binary file preview is not supported in the code editor.</span>
          </div>
        ) : (
          <Editor
            height="100%"
            language={activeFilePath.endsWith('.tex') ? 'latex' : 'plaintext'}
            theme="intellij-dark"
            value={textContent}
            onChange={(val) => onContentChange(val ?? '')}
            onMount={handleEditorDidMount}
            options={{
              fontSize: 13,
              fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
              lineHeight: 20,
              minimap: { enabled: true },
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              wordWrap: 'on',
              cursorBlinking: 'smooth',
              cursorSmoothCaretAnimation: 'on',
              renderLineHighlight: 'all',
            }}
          />
        )}
      </div>
    </div>
  );
};
