'use client';

import React, { useState, useEffect } from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { useWorkspace } from './workspace/useWorkspace';
import { ProjectTopBar } from './components/ProjectTopBar';
import { FileTreeSidebar } from './components/FileTreeSidebar';
import { MonacoEditorPane } from './editor/MonacoEditorPane';
import { PdfPreviewPane } from './components/PdfPreviewPane';
import { DiagnosticsLogPanel } from './components/DiagnosticsLogPanel';
import type { Diagnostic } from './types/workspace';
import { Folder, Terminal, Settings, GitBranch, CheckCircle2 } from 'lucide-react';

declare global {
  interface Window {
    __TORQUE_WORKSPACE_ACTIONS__?: any;
  }
}

export const App: React.FC = () => {
  const workspace = useWorkspace();
  const [logsOpen, setLogsOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Expose WorkspaceActions for Phase 2 AI and automation
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

  const handleSelectDiagnostic = (d: Diagnostic) => {
    if (d.file) {
      workspace.selectFile(d.file);
    }
  };

  if (!workspace.ready) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#1e1f22] text-[#868a91] gap-3 font-sans">
        <div className="w-6 h-6 border-2 border-[#3574f0] border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-medium text-[#dfe1e5]">Loading Torque...</span>
      </div>
    );
  }

  const errorCount = workspace.lastResult?.diagnostics.filter((d) => d.severity === 'error').length ?? 0;
  const warningCount = workspace.lastResult?.diagnostics.filter((d) => d.severity === 'warning').length ?? 0;

  return (
    <div className="w-screen h-screen flex flex-col bg-[#1e1f22] text-[#dfe1e5] overflow-hidden font-sans">
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
        onCompile={async () => {
          try {
            await workspace.actions.compile();
          } catch {
            setLogsOpen(true);
          }
        }}
      />

      {/* Main Area: Tool Window Stripe + Resizable Workspace */}
      <div className="flex-1 w-full h-[calc(100vh-3.75rem)] flex overflow-hidden">
        {/* IntelliJ Left Tool Window Stripe (Activity Bar) */}
        <div className="w-10 bg-[#2b2d30] border-r border-[#1e1f22] flex flex-col items-center justify-between py-2 select-none shrink-0">
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className={`p-2 rounded hover:bg-[#393b40] transition ${
                sidebarOpen ? 'text-[#3574f0] bg-[#1e1f22]' : 'text-[#868a91]'
              }`}
              title="Project (Alt+1)"
            >
              <Folder className="w-4 h-4" />
            </button>
            <button
              onClick={() => setLogsOpen(!logsOpen)}
              className={`p-2 rounded hover:bg-[#393b40] transition ${
                logsOpen ? 'text-[#3574f0] bg-[#1e1f22]' : 'text-[#868a91]'
              }`}
              title="Problems / Build (Alt+4)"
            >
              <Terminal className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-col items-center gap-2 text-[#868a91]">
            <button className="p-2 hover:text-[#dfe1e5] hover:bg-[#393b40] rounded transition" title="Settings">
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Resizable 3-Panels */}
        <div className="flex-1 h-full overflow-hidden">
          <PanelGroup direction="horizontal">
            {/* Left Panel: File Explorer */}
            {sidebarOpen && (
              <>
                <Panel defaultSize={18} minSize={12} maxSize={30}>
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
                </Panel>
                <PanelResizeHandle className="w-1 bg-[#1e1f22] hover:bg-[#3574f0] transition cursor-col-resize" />
              </>
            )}

            {/* Center Panel: Editor + Bottom Problems/Log Drawer */}
            <Panel defaultSize={sidebarOpen ? 44 : 54} minSize={25}>
              <PanelGroup direction="vertical">
                <Panel defaultSize={75} minSize={40}>
                  <MonacoEditorPane
                    files={workspace.files}
                    activeFilePath={workspace.activeFilePath}
                    rootEntry={workspace.activeProject?.rootEntry || 'main.tex'}
                    openTabs={workspace.openTabs}
                    diagnostics={workspace.lastResult?.diagnostics ?? []}
                    onSelectTab={workspace.selectFile}
                    onCloseTab={workspace.closeTab}
                    onContentChange={workspace.updateActiveFileContent}
                    onCompileShortcut={async () => {
                      try {
                        await workspace.actions.compile();
                      } catch {
                        setLogsOpen(true);
                      }
                    }}
                  />
                </Panel>

                <PanelResizeHandle className="h-1 bg-[#2b2d30] hover:bg-[#3574f0] transition cursor-row-resize" />

                <Panel
                  defaultSize={25}
                  minSize={10}
                  maxSize={50}
                  collapsible
                  collapsedSize={4}
                >
                  <DiagnosticsLogPanel
                    diagnostics={workspace.lastResult?.diagnostics ?? []}
                    isOpen={logsOpen}
                    onToggle={() => setLogsOpen(!logsOpen)}
                    onSelectDiagnostic={handleSelectDiagnostic}
                  />
                </Panel>
              </PanelGroup>
            </Panel>

            <PanelResizeHandle className="w-1 bg-[#1e1f22] hover:bg-[#3574f0] transition cursor-col-resize" />

            {/* Right Panel: PDF Viewer */}
            <Panel defaultSize={38} minSize={25}>
              <PdfPreviewPane
                pdfBytes={workspace.lastResult?.pdfBytes ?? null}
                compiling={workspace.compileStatus === 'compiling'}
                projectName={workspace.activeProject?.name}
              />
            </Panel>
          </PanelGroup>
        </div>
      </div>

      {/* IntelliJ Bottom Status Bar */}
      <footer className="h-6 bg-[#2b2d30] border-t border-[#1e1f22] px-3 flex items-center justify-between text-[11px] text-[#868a91] select-none font-sans">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 hover:text-[#dfe1e5] cursor-pointer">
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
          <span className="text-[#868a91]">LaTeX (WASM)</span>
          <span className="text-[#868a91]">UTF-8</span>
          <span className="text-[#868a91]">2 spaces</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
