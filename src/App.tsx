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

declare global {
  interface Window {
    __TORQUE_WORKSPACE_ACTIONS__?: any;
  }
}

export const App: React.FC = () => {
  const workspace = useWorkspace();
  const [logsOpen, setLogsOpen] = useState(true);

  // Expose WorkspaceActions for Phase 2 AI and automation
  useEffect(() => {
    window.__TORQUE_WORKSPACE_ACTIONS__ = workspace.actions;
    return () => {
      delete window.__TORQUE_WORKSPACE_ACTIONS__;
    };
  }, [workspace.actions]);

  // Handle uploading files into the active project
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
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-400 gap-3">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm font-medium">Initializing LaTeX Workspace...</span>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
      {/* Top Header */}
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

      {/* Main 3-Pane Resizable Workspace */}
      <div className="flex-1 w-full h-[calc(100vh-3.5rem)] overflow-hidden">
        <PanelGroup direction="horizontal">
          {/* Left Panel: File Explorer */}
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

          <PanelResizeHandle className="w-1 bg-zinc-800 hover:bg-indigo-500 transition cursor-col-resize" />

          {/* Center Panel: Editor + Diagnostics Drawer */}
          <Panel defaultSize={44} minSize={25}>
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

              <PanelResizeHandle className="h-1 bg-zinc-800 hover:bg-indigo-500 transition cursor-row-resize" />

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

          <PanelResizeHandle className="w-1 bg-zinc-800 hover:bg-indigo-500 transition cursor-col-resize" />

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
  );
};

export default App;
