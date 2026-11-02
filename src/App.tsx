'use client';

import React, { useState, useEffect } from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { useWorkspace } from './workspace/useWorkspace';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { ProjectTopBar } from './components/ProjectTopBar';
import { FileTreeSidebar } from './components/FileTreeSidebar';
import { MonacoEditorPane } from './editor/MonacoEditorPane';
import { PdfPreviewPane } from './components/PdfPreviewPane';
import { DiagnosticsLogPanel } from './components/DiagnosticsLogPanel';
import { WelcomeHomeScreen } from './components/WelcomeHomeScreen';
import type { Diagnostic } from './types/workspace';
import { Folder, Terminal, Settings, GitBranch, CheckCircle2, Sun, Moon } from 'lucide-react';

declare global {
  interface Window {
    __TORQUE_WORKSPACE_ACTIONS__?: any;
  }
}

export const WorkspaceUI: React.FC = () => {
  const workspace = useWorkspace();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const [isHomeViewOpen, setIsHomeViewOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(true);

  // Expose WorkspaceActions for automation
  useEffect(() => {
    window.__TORQUE_WORKSPACE_ACTIONS__ = workspace.actions;
    return () => {
      delete window.__TORQUE_WORKSPACE_ACTIONS__;
    };
  }, [workspace.actions]);

  const handleUploadFiles = async (fileList: FileList) => {
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const ext = file.name.split('.').pop()?.toLowerCase();
      const isBinary = ['png', 'jpg', 'jpeg', 'pdf', 'eps', 'svg', 'ttf', 'otf', 'woff', 'woff2'].includes(
        ext ?? ''
      );

      if (isBinary) {
        const buffer = await file.arrayBuffer();
        await workspace.createFile(file.name, new Uint8Array(buffer), true);
      } else {
        const text = await file.text();
        await workspace.createFile(file.name, text, false);
      }
    }
  };

  const handleCreateFile = async () => {
    const path = window.prompt('Enter file path (e.g. chapters/intro.tex):');
    if (path?.trim()) {
      await workspace.createFile(path.trim());
    }
  };

  const handleExportZip = async () => {
    const zipBytes = await workspace.exportActiveProjectZip();
    const blob = new Blob([zipBytes as BlobPart], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(workspace.activeProject?.name || 'latex-project').toLowerCase().replace(/\s+/g, '-')}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportZip = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const projectName = file.name.replace(/\.zip$/i, '') || 'Imported Project';
    await workspace.importZipAsProject(projectName, buffer);
  };

  const handleCompile = async () => {
    try {
      await workspace.actions.compile();
    } catch {
      setLogsOpen(true);
      if (!sidebarOpen) setSidebarOpen(true);
    }
  };

  const handleSelectDiagnostic = (d: Diagnostic) => {
    if (d.file) {
      workspace.selectFile(d.file);
    }
  };

  if (!workspace.ready) {
    return (
      <div
        className={`w-screen h-screen flex flex-col items-center justify-center gap-3 font-sans ${
          isDark ? 'bg-[#1e1f22] text-[#868a91]' : 'bg-[#f7f8fa] text-[#6c707e]'
        }`}
      >
        <div className="w-6 h-6 border-2 border-[#3574f0] border-t-transparent rounded-full animate-spin" />
        <span className={`text-xs font-medium ${isDark ? 'text-[#dfe1e5]' : 'text-[#1f2328]'}`}>
          Loading Torque...
        </span>
      </div>
    );
  }

  const showHomeView = isHomeViewOpen || workspace.projects.length === 0 || !workspace.activeProject;

  if (showHomeView) {
    return (
      <WelcomeHomeScreen
        projects={workspace.projects}
        activeProjectId={workspace.activeProject?.id}
        onSelectProject={async (projectId) => {
          await workspace.selectProject(projectId);
          setIsHomeViewOpen(false);
        }}
        onCreateProject={async (name) => {
          await workspace.createNewProject(name);
          setIsHomeViewOpen(false);
        }}
        onImportZip={async (file) => {
          await handleImportZip(file);
          setIsHomeViewOpen(false);
        }}
        onDeleteProject={workspace.deleteProjectById}
        onCloseWelcome={() => {
          if (workspace.projects.length > 0 && workspace.activeProject) {
            setIsHomeViewOpen(false);
          }
        }}
      />
    );
  }

  const diagnostics = workspace.lastResult?.diagnostics ?? [];
  const hasProblems = diagnostics.length > 0 || workspace.compileStatus === 'failed';
  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;

  return (
    <div
      className={`w-screen h-screen flex flex-col overflow-hidden font-sans ${
        isDark ? 'bg-[#1e1f22] text-[#dfe1e5]' : 'bg-[#ffffff] text-[#1f2328]'
      }`}
    >
      {/* IntelliJ Main Toolbar Header */}
      <ProjectTopBar
        projects={workspace.projects}
        activeProject={workspace.activeProject}
        compileStatus={workspace.compileStatus}
        lastDurationMs={workspace.lastResult?.durationMs}
        onSelectProject={workspace.selectProject}
        onCreateProject={workspace.createNewProject}
        onRenameProject={workspace.renameActiveProject}
        onDeleteProject={workspace.deleteProjectById}
        onExportZip={handleExportZip}
        onImportZip={handleImportZip}
        onCompile={handleCompile}
        onCloseProject={() => setIsHomeViewOpen(true)}
        onNewFile={handleCreateFile}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        onToggleProblems={() => {
          if (!sidebarOpen) setSidebarOpen(true);
          setLogsOpen((prev) => !prev);
        }}
        onTogglePreview={() => setPreviewOpen((prev) => !prev)}
        onUndo={() => {
          document.execCommand('undo');
        }}
        onRedo={() => {
          document.execCommand('redo');
        }}
        onShortcuts={() => {
          alert('Keyboard Shortcuts:\n• Ctrl+B / Shift+F10: Compile\n• Alt+1: Toggle Sidebar\n• Alt+6: Toggle Problems\n• Ctrl+Z: Undo\n• Ctrl+Y: Redo');
        }}
        onAbout={() => {
          alert('Torque LaTeX Editor\nHigh-Performance WebAssembly LaTeX IDE');
        }}
      />

      {/* Main Area: Activity Bar + Resizable Workspace */}
      <div className="flex-1 w-full h-[calc(100vh-4rem)] flex overflow-hidden">
        {/* IntelliJ Left Tool Window Stripe (Activity Bar) */}
        <div
          className={`w-10 border-r flex flex-col items-center justify-between py-2 select-none shrink-0 ${
            isDark
              ? 'bg-[#2b2d30] border-[#1e1f22] text-[#868a91]'
              : 'bg-[#ebecf0] border-[#d1d5db] text-[#6c707e]'
          }`}
        >
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className={`p-2 rounded transition ${
                sidebarOpen
                  ? isDark
                    ? 'text-[#3574f0] bg-[#1e1f22]'
                    : 'text-[#3574f0] bg-[#ffffff]'
                  : isDark
                    ? 'text-[#868a91] hover:bg-[#393b40]'
                    : 'text-[#6c707e] hover:bg-[#dfe1e5]'
              }`}
              title="Project (Alt+1)"
              aria-label="Project Sidebar"
            >
              <Folder className="w-4 h-4" />
            </button>

            {/* Problems button - only show when diagnostics exist */}
            {hasProblems && (
              <button
                onClick={() => {
                  if (!sidebarOpen) setSidebarOpen(true);
                  setLogsOpen(!logsOpen);
                }}
                className={`p-2 rounded relative transition ${
                  logsOpen
                    ? isDark
                      ? 'text-[#e05555] bg-[#1e1f22]'
                      : 'text-[#e05555] bg-[#ffffff]'
                    : isDark
                      ? 'text-[#868a91] hover:bg-[#393b40]'
                      : 'text-[#6c707e] hover:bg-[#dfe1e5]'
                }`}
                title={`Problems / Build (${diagnostics.length} issues)`}
                aria-label="Problems / Build"
              >
                <Terminal className="w-4 h-4" />
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#e05555]" />
              </button>
            )}
          </div>

          <div className="flex flex-col items-center gap-2">
            <button
              onClick={toggleTheme}
              className={`p-2 rounded transition ${
                isDark
                  ? 'hover:text-[#dfe1e5] hover:bg-[#393b40]'
                  : 'hover:text-[#1f2328] hover:bg-[#dfe1e5]'
              }`}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label="Toggle Theme"
            >
              {isDark ? (
                <Sun className="w-4 h-4 text-[#e2a53b]" />
              ) : (
                <Moon className="w-4 h-4 text-[#3574f0]" />
              )}
            </button>
            <button
              className={`p-2 rounded transition ${
                isDark
                  ? 'hover:text-[#dfe1e5] hover:bg-[#393b40]'
                  : 'hover:text-[#1f2328] hover:bg-[#dfe1e5]'
              }`}
              title="Settings"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Resizable Panels */}
        <div className="flex-1 h-full overflow-hidden">
          <PanelGroup direction="horizontal">
            {/* Left Panel: Sidebar containing File Explorer + Problems Panel at bottom (only when problems exist) */}
            {sidebarOpen && (
              <>
                <Panel defaultSize={22} minSize={14} maxSize={35}>
                  <div className="w-full h-full flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-hidden min-h-0">
                      <FileTreeSidebar
                        files={workspace.files}
                        activeFilePath={workspace.activeFilePath}
                        rootEntry={workspace.activeProject?.rootEntry || 'main.tex'}
                        onSelectFile={workspace.selectFile}
                        onCreateFile={async (path) => {
                          await workspace.createFile(path);
                        }}
                        onUploadFiles={handleUploadFiles}
                        onRenameFile={workspace.renameFilePath}
                        onDeleteFile={workspace.deleteFilePath}
                        onSetRootEntry={workspace.setProjectRootEntry}
                      />
                    </div>

                    {/* Problems/Build Panel in Sidebar: ONLY rendered when diagnostics exist and logsOpen */}
                    {hasProblems && logsOpen && (
                      <div
                        className={`border-t shrink-0 max-h-[50%] flex flex-col overflow-hidden ${
                          isDark ? 'border-[#393b40]' : 'border-[#d1d5db]'
                        }`}
                      >
                        <DiagnosticsLogPanel
                          diagnostics={diagnostics}
                          isOpen={logsOpen}
                          onToggle={() => setLogsOpen(false)}
                          onClose={() => setLogsOpen(false)}
                          onSelectDiagnostic={handleSelectDiagnostic}
                        />
                      </div>
                    )}
                  </div>
                </Panel>
                <PanelResizeHandle
                  className={`w-1 hover:bg-[#3574f0] transition cursor-col-resize ${
                    isDark ? 'bg-[#1e1f22]' : 'bg-[#d1d5db]'
                  }`}
                />
              </>
            )}

            {/* Center Panel: Full-height Editor without bottom dock */}
            <Panel defaultSize={previewOpen ? (sidebarOpen ? 43 : 55) : 100} minSize={25}>
              <MonacoEditorPane
                files={workspace.files}
                activeFilePath={workspace.activeFilePath}
                rootEntry={workspace.activeProject?.rootEntry || 'main.tex'}
                openTabs={workspace.openTabs}
                diagnostics={diagnostics}
                onSelectTab={workspace.selectFile}
                onCloseTab={workspace.closeTab}
                onContentChange={workspace.updateActiveFileContent}
                onCompileShortcut={handleCompile}
              />
            </Panel>

            {/* Right Panel: Full-height PDF Preview */}
            {previewOpen && (
              <>
                <PanelResizeHandle
                  className={`w-1 hover:bg-[#3574f0] transition cursor-col-resize ${
                    isDark ? 'bg-[#1e1f22]' : 'bg-[#d1d5db]'
                  }`}
                />
                <Panel defaultSize={sidebarOpen ? 35 : 45} minSize={25}>
                  <PdfPreviewPane
                    pdfBytes={workspace.lastResult?.pdfBytes ?? null}
                    compiling={workspace.compileStatus === 'compiling'}
                    projectName={workspace.activeProject?.name}
                  />
                </Panel>
              </>
            )}
          </PanelGroup>
        </div>
      </div>

      {/* IntelliJ Bottom Status Bar */}
      <footer
        className={`h-6 border-t px-3 flex items-center justify-between text-[11px] select-none font-sans ${
          isDark
            ? 'bg-[#2b2d30] border-[#1e1f22] text-[#868a91]'
            : 'bg-[#ebecf0] border-[#d1d5db] text-[#5c6066]'
        }`}
      >
        <div className="flex items-center gap-3">
          <span
            className={`flex items-center gap-1 cursor-pointer ${
              isDark ? 'hover:text-[#dfe1e5]' : 'hover:text-[#1f2328]'
            }`}
          >
            <GitBranch className="w-3 h-3 text-[#3574f0]" />
            <span>main</span>
          </span>

          <div className="flex items-center gap-1.5">
            {errorCount > 0 ? (
              <span className="text-[#e05555] font-semibold">{errorCount} errors</span>
            ) : warningCount > 0 ? (
              <span className="text-[#e2a53b] font-semibold">{warningCount} warnings</span>
            ) : (
              <span className="flex items-center gap-1 text-[#59a869]">
                <CheckCircle2 className="w-3 h-3" />
                <span>No problems</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span>LaTeX (WASM)</span>
          <span>UTF-8</span>
          <span>2 spaces</span>
        </div>
      </footer>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <WorkspaceUI />
    </ThemeProvider>
  );
};

export default App;
