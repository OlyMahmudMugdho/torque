import React, { useEffect, useImperativeHandle, useRef, useMemo } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import type { ProjectFile, Diagnostic } from '../types/workspace';
import { useThemeSafe } from '../context/ThemeContext';
import { registerLatexLanguage, diagnosticsToMarkers } from './latexLanguage';
import { X, Image, ChevronRight, FileCode } from 'lucide-react';

export interface MonacoEditorPaneProps {
  files: ProjectFile[];
  activeFilePath: string;
  rootEntry: string;
  openTabs: string[];
  diagnostics: Diagnostic[];
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onContentChange: (content: string) => void;
  onCompileShortcut: () => void;
  onSaveShortcut?: () => void;
}

export interface MonacoEditorHandle {
  revealInEditor: (target: { file: string; line: number }) => void;
  getEditorValue?: () => string | undefined;
}

export const MonacoEditorPane = React.forwardRef<MonacoEditorHandle, MonacoEditorPaneProps>(
  (
    {
      files,
      activeFilePath,
      rootEntry,
      openTabs,
      diagnostics,
      onSelectTab,
      onCloseTab,
      onContentChange,
      onCompileShortcut,
      onSaveShortcut,
    },
    ref
  ) => {
  const { theme, editorTheme } = useThemeSafe();
  const isDark = theme === 'dark';
  const monaco = useMonaco();
  const editorRef = useRef<any>(null);

  const effectiveEditorTheme = useMemo(() => {
    if (editorTheme && editorTheme !== 'auto') {
      return editorTheme;
    }
    return theme === 'dark' ? 'intellij-dark' : 'intellij-light';
  }, [theme, editorTheme]);

  useEffect(() => {
    const handleUnhandledRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      if (
        reason?.type === 'cancelation' ||
        reason?.message === 'operation is manually canceled' ||
        reason?.msg === 'operation is manually canceled' ||
        reason?.name === 'RenderingCancelledException' ||
        (typeof reason === 'string' &&
          (reason.includes('operation is manually canceled') ||
            reason.includes('cancelation') ||
            reason.includes('RenderingCancelledException')))
      ) {
        e.preventDefault();
      }
    };
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    if (monaco) {
      registerLatexLanguage(monaco);
      monaco.editor.setTheme(effectiveEditorTheme);
    }
  }, [monaco, effectiveEditorTheme]);

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
      const val = editor.getValue();
      if (typeof val === 'string') {
        onContentChange(val);
      }
      onCompileShortcut();
    });

    // Shift+F10 (IntelliJ shortcut for Run)
    editor.addCommand(m.KeyMod.Shift | m.KeyCode.F10, () => {
      const val = editor.getValue();
      if (typeof val === 'string') {
        onContentChange(val);
      }
      onCompileShortcut();
    });

    // Ctrl+S / Cmd+S for save
    editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyS, () => {
      const val = editor.getValue();
      if (typeof val === 'string') {
        onContentChange(val);
      }
      onSaveShortcut?.();
    });
  };

  const pathParts = activeFilePath.split('/');

  useImperativeHandle(ref, () => ({
    revealInEditor: (target: { file: string; line: number }) => {
      const editor = editorRef.current;
      if (!editor) return;
      const model = editor.getModel();
      if (!model) return;
      const lineNo = Math.max(1, Math.min(model.getLineCount(), target.line || 1));
      const position = { lineNumber: lineNo, column: 1 };
      editor.setPosition(position);
      editor.revealLineInCenter(lineNo);
      editor.focus();
      const range = {
        startLineNumber: lineNo,
        startColumn: 1,
        endLineNumber: lineNo,
        endColumn: model.getLineLength(lineNo) + 1,
      };
      editor.setSelection(range);
    },
    getEditorValue: () => {
      return editorRef.current?.getValue();
    },
  }));

  return (
    <div
      className={`w-full h-full flex flex-col ${
        isDark ? 'bg-[#1e1f22]' : 'bg-[#ffffff]'
      }`}
    >
      {/* IntelliJ Tab Bar */}
      <div
        className={`h-9 border-b flex items-center overflow-x-auto select-none ${
          isDark ? 'bg-[#2b2d30] border-[#1e1f22]' : 'bg-[#ebecf0] border-[#d1d5db]'
        }`}
      >
        {openTabs.map((tabPath) => {
          const isActive = tabPath === activeFilePath;
          const fileName = tabPath.split('/').pop() || tabPath;

          return (
            <div
              key={tabPath}
              onClick={() => onSelectTab(tabPath)}
              className={`h-full flex items-center gap-2 px-3 text-xs border-r cursor-pointer transition ${
                isActive
                  ? isDark
                    ? 'bg-[#1e1f22] text-[#dfe1e5] font-medium border-b-2 border-b-[#3574f0] border-r-[#1e1f22]'
                    : 'bg-[#ffffff] text-[#1f2328] font-medium border-b-2 border-b-[#3574f0] border-r-[#d1d5db]'
                  : isDark
                    ? 'bg-[#2b2d30] text-[#c2c5cc] hover:text-white hover:bg-[#313438] border-r-[#1e1f22]'
                    : 'bg-[#ebecf0] text-[#6c707e] hover:text-[#1f2328] hover:bg-[#dfe1e5] border-r-[#d1d5db]'
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
                  className={`p-0.5 rounded ${
                    isDark
                      ? 'hover:bg-[#393b40] text-[#c2c5cc] hover:text-white'
                      : 'hover:bg-[#dfe1e5] text-[#6c707e] hover:text-black'
                  }`}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* IntelliJ Breadcrumbs Bar */}
      <div
        className={`h-6 border-b px-3 flex items-center text-[11px] font-mono select-none ${
          isDark
            ? 'bg-[#1e1f22] border-[#2b2d30] text-[#868a91]'
            : 'bg-[#ffffff] border-[#e5e7eb] text-[#6c707e]'
        }`}
      >
        <span
          className={`cursor-pointer ${
            isDark ? 'hover:text-[#dfe1e5]' : 'hover:text-[#1f2328]'
          }`}
        >
          project
        </span>
        {pathParts.map((part, idx) => (
          <React.Fragment key={idx}>
            <ChevronRight
              className={`w-3 h-3 mx-1 ${
                isDark ? 'text-[#5a5d63]' : 'text-[#a1a3a8]'
              }`}
            />
            <span
              className={`cursor-pointer ${
                idx === pathParts.length - 1
                  ? isDark
                    ? 'text-[#dfe1e5] font-medium'
                    : 'text-[#1f2328] font-medium'
                  : isDark
                    ? 'hover:text-[#dfe1e5]'
                    : 'hover:text-[#1f2328]'
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
          <div
            className={`w-full h-full flex flex-col items-center justify-center gap-2 ${
              isDark ? 'text-[#868a91]' : 'text-[#6c707e]'
            }`}
          >
            <Image className="w-12 h-12 opacity-50" />
            <span
              className={`text-sm font-medium ${
                isDark ? 'text-[#dfe1e5]' : 'text-[#1f2328]'
              }`}
            >
              Binary asset: {activeFilePath}
            </span>
            <span className="text-xs">
              Binary file preview is not supported in the code editor.
            </span>
          </div>
        ) : (
          <Editor
            path={activeFilePath}
            height="100%"
            language={activeFilePath.endsWith('.tex') ? 'latex' : 'plaintext'}
            theme={effectiveEditorTheme}
            beforeMount={(m) => registerLatexLanguage(m)}
            value={textContent}
            defaultValue={textContent}
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

});
