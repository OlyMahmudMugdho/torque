'use client';

import React, { useState, useEffect, useRef } from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { useWorkspace } from './workspace/useWorkspace';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { ProjectTopBar } from './components/ProjectTopBar';
import { FileTreeSidebar } from './components/FileTreeSidebar';
import { MonacoEditorPane, type MonacoEditorHandle } from './editor/MonacoEditorPane';
import { PdfPreviewPane } from './components/PdfPreviewPane';
import { DiagnosticsLogPanel } from './components/DiagnosticsLogPanel';
import { WelcomeHomeScreen } from './components/WelcomeHomeScreen';
import { TexSetupGuide } from './components/TexSetupGuide';
import { SettingsModal } from './components/SettingsModal';
import { McpInstructionsModal } from './components/McpInstructionsModal';
import { AiChatPanel } from './components/AiChatPanel';
import { loadAISettings } from './ai/aiConfig';
import type { AIProviderConfig } from './types/ai';
import type { Diagnostic } from './types/workspace';
import { Folder, Terminal, Settings, GitBranch, CheckCircle2, Package, Sparkles } from 'lucide-react';

declare global {
  interface Window {
    __TORQUE_WORKSPACE_ACTIONS__?: any;
  }
}

export interface WorkspaceUIProps {
  initialHomeView?: boolean;
  projectId?: string;
}

export const WorkspaceUI: React.FC<WorkspaceUIProps> = ({
  initialHomeView,
  projectId: propProjectId,
}) => {
  const workspace = useWorkspace();
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';

  const [welcomeTab, setWelcomeTab] = useState<'projects' | 'customize'>('projects');
  const [isHomeViewOpen, setIsHomeViewOpen] = useState<boolean>(() => {
    if (initialHomeView !== undefined) return initialHomeView;
    if (propProjectId) return false;
    if (typeof window !== 'undefined') {
      const search = window.location.search;
      if (search.includes('project=') || search.includes('id=')) {
        return false;
      }
    }
    return true;
  });
  const [logsOpen, setLogsOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeLeftTab, setActiveLeftTab] = useState<'files' | 'ai'>('files');
  const [createRequest, setCreateRequest] = useState<{ kind: "file" | "folder"; nonce: number } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [dismissedSetupResult, setDismissedSetupResult] = useState<unknown>(null);
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [isMcpModalOpen, setMcpModalOpen] = useState(false);
  const [activeAiProvider, setActiveAiProvider] = useState<AIProviderConfig | null>(null);
  const monacoRef = useRef<MonacoEditorHandle>(null);

  useEffect(() => {
    loadAISettings()
      .then((settings) => {
        const active =
          settings.providers.find((p) => p.id === settings.activeProviderId) ||
          settings.providers[0] ||
          null;
        setActiveAiProvider(active);
      })
      .catch(() => {});
  }, [isSettingsOpen, activeLeftTab]);

  // Synchronize URL search params (?project=, ?id=, ?page=) on mount and popstate
  useEffect(() => {
    if (!workspace.ready) return;

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const projId = propProjectId || params.get('project') || params.get('id');
      const page = params.get('page');

      if (projId) {
        const target = workspace.projects.find((p) => p.id === projId || p.name === projId);
        if (target && workspace.activeProject?.id !== target.id) {
          workspace.selectProject(target.id);
        }
        setIsHomeViewOpen(false);
      } else if (page === 'customize') {
        setWelcomeTab('customize');
        setIsHomeViewOpen(true);
      } else if (initialHomeView === undefined && !propProjectId) {
        setIsHomeViewOpen(true);
      }
    }
  }, [workspace.ready, workspace.projects, propProjectId, initialHomeView]);

  useEffect(() => {
    const handlePopState = () => {
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams(window.location.search);
      const projId = params.get('project') || params.get('id');
      const page = params.get('page');

      if (projId) {
        workspace.selectProject(projId);
        setIsHomeViewOpen(false);
      } else {
        setIsHomeViewOpen(true);
        if (page === 'customize') {
          setWelcomeTab('customize');
        } else {
          setWelcomeTab('projects');
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [workspace.selectProject]);

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

  const handleCreateFile = () => {
    setActiveLeftTab('files');
    setSidebarOpen(true);
    setCreateRequest({ kind: 'file', nonce: Date.now() });
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

  const handleSave = async () => {
    if (monacoRef.current?.getEditorValue && workspace.activeFilePath) {
      const val = monacoRef.current.getEditorValue();
      if (typeof val === 'string') {
        await workspace.updateActiveFileContent(val);
      }
    }
    await workspace.actions.save?.();
  };

  const handleToggleFiles = () => {
    if (sidebarOpen && activeLeftTab === 'files') {
      setSidebarOpen(false);
    } else {
      setActiveLeftTab('files');
      setSidebarOpen(true);
    }
  };

  const handleToggleAi = () => {
    if (sidebarOpen && activeLeftTab === 'ai') {
      setSidebarOpen(false);
    } else {
      setActiveLeftTab('ai');
      setSidebarOpen(true);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S / Cmd+S (Save)
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSave();
      }
      // Ctrl+Alt+S / Cmd+Alt+S (Settings)
      if ((e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setSettingsOpen((prev) => !prev);
      }
      // Alt+1: Toggle Files
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.key === '1') {
        e.preventDefault();
        handleToggleFiles();
      }
      // Alt+7: Toggle AI Assistant
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.key === '7') {
        e.preventDefault();
        handleToggleAi();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [workspace.activeFilePath, sidebarOpen, activeLeftTab]);

  const handleCompile = async () => {
    try {
      if (monacoRef.current?.getEditorValue && workspace.activeFilePath) {
        const val = monacoRef.current.getEditorValue();
        if (typeof val === 'string') {
          await workspace.updateActiveFileContent(val);
        }
      }
      await workspace.actions.compile();
    } catch {
      setLogsOpen(true);
      if (!sidebarOpen) setSidebarOpen(true);
    }
  };

  const handleNavigateToSource = (target: { file: string; line: number }) => {
    let resolvedFile: string | null = null;
    if (target.file) {
      const clean = target.file.replace(/\\/g, '/').replace(/\/\.\//g, '/').replace(/^\.\//, '');
      const paths = workspace.files.map((f) => f.path);
      resolvedFile =
        paths.find((p) => p === clean) ??
        paths
          .filter((p) => clean.endsWith('/' + p))
          .sort((x, y) => y.length - x.length)[0] ??
        paths.find((p) => p.split('/').pop() === clean.split('/').pop()) ??
        null;
      if (!resolvedFile) return; // unknown file (e.g. a system .cls): nothing to open
    }
    const switching = !!resolvedFile && resolvedFile !== workspace.activeFilePath;
    if (resolvedFile && switching) {
      workspace.selectFile(resolvedFile);
    }
    const reveal = () => monacoRef.current?.revealInEditor({ file: resolvedFile ?? '', line: target.line });
    // Switching files swaps the Monaco model asynchronously; reveal again once settled.
    window.setTimeout(reveal, switching ? 80 : 0);
    if (switching) window.setTimeout(reveal, 300);
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

  const handleSelectProject = async (projectId: string) => {
    await workspace.selectProject(projectId);
    setIsHomeViewOpen(false);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('project', projectId);
      url.searchParams.delete('page');
      window.history.pushState({ projectId }, '', url.toString());
    }
  };

  const handleCreateProject = async (
    name: string,
    initialFiles?: any,
    rootEntry?: string
  ) => {
    const newProj = await workspace.createNewProject(name, initialFiles, rootEntry);
    setIsHomeViewOpen(false);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('project', newProj.id);
      url.searchParams.delete('page');
      window.history.pushState({ projectId: newProj.id }, '', url.toString());
    }
    return newProj;
  };

  const handleCloseProject = () => {
    setIsHomeViewOpen(true);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('project');
      url.searchParams.delete('id');
      url.searchParams.delete('file');
      if (welcomeTab === 'customize') {
        url.searchParams.set('page', 'customize');
      }
      const queryStr = url.searchParams.toString();
      window.history.pushState({}, '', url.pathname + (queryStr ? `?${queryStr}` : ''));
    }
  };

  const handleWelcomeTabChange = (tab: 'projects' | 'customize') => {
    setWelcomeTab(tab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (tab === 'customize') {
        url.searchParams.set('page', 'customize');
      } else {
        url.searchParams.delete('page');
      }
      const queryStr = url.searchParams.toString();
      window.history.pushState({}, '', url.pathname + (queryStr ? `?${queryStr}` : ''));
    }
  };

  const showHomeView = isHomeViewOpen || workspace.projects.length === 0 || !workspace.activeProject;

  if (showHomeView) {
    return (
      <WelcomeHomeScreen
        projects={workspace.projects}
        activeProjectId={workspace.activeProject?.id}
        initialTab={welcomeTab}
        onTabChange={handleWelcomeTabChange}
        onSelectProject={handleSelectProject}
        onCreateProject={handleCreateProject}
        onImportZip={async (file) => {
          await handleImportZip(file);
          setIsHomeViewOpen(false);
        }}
        onDeleteProject={workspace.deleteProjectById}
      />
    );
  }

  const missingRequirements = workspace.lastResult?.missingRequirements ?? [];
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
        selectedEngine={workspace.selectedEngine}
        onSelectEngine={workspace.setSelectedEngine}
        resolvingPackage={workspace.resolvingPackage}
        resolvedPackages={workspace.resolvedPackages}
        onSelectProject={handleSelectProject}
        onCreateProject={handleCreateProject}
        onRenameProject={workspace.renameActiveProject}
        onDeleteProject={workspace.deleteProjectById}
        onExportZip={handleExportZip}
        onImportZip={handleImportZip}
        onCompile={handleCompile}
        onSave={handleSave}
        onOpenSettings={() => setSettingsOpen(true)}
        onCloseProject={handleCloseProject}
        onNewFile={handleCreateFile}
        onToggleSidebar={handleToggleFiles}
        onToggleProblems={() => {
          if (!sidebarOpen) setSidebarOpen(true);
          setLogsOpen((prev) => !prev);
        }}
        onTogglePreview={() => setPreviewOpen((prev) => !prev)}
        onToggleAiChat={handleToggleAi}
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
          alert('Torque LaTeX Editor\nHigh-Performance LaTeX IDE with Native TeX Live & Auto-Package Resolution');
        }}
        onOpenMcpGuide={() => setMcpModalOpen(true)}
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
              onClick={handleToggleFiles}
              className={`p-2 rounded transition ${
                sidebarOpen && activeLeftTab === 'files'
                  ? isDark
                    ? 'text-[#3574f0] bg-[#1e1f22]'
                    : 'text-[#3574f0] bg-[#ffffff]'
                  : isDark
                    ? 'text-[#c2c5cc] hover:bg-[#393b40] hover:text-white'
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
                      ? 'text-[#c2c5cc] hover:bg-[#393b40] hover:text-white'
                      : 'text-[#6c707e] hover:bg-[#dfe1e5]'
                }`}
                title={`Problems / Build (${diagnostics.length} issues)`}
                aria-label="Problems / Build"
              >
                <Terminal className="w-4 h-4" />
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#e05555]" />
              </button>
            )}

            {/* AI Assistant button */}
            <button
              onClick={handleToggleAi}
              className={`p-2 rounded transition ${
                sidebarOpen && activeLeftTab === 'ai'
                  ? isDark
                    ? 'text-[#3574f0] bg-[#1e1f22]'
                    : 'text-[#3574f0] bg-[#ffffff]'
                  : isDark
                    ? 'text-[#c2c5cc] hover:bg-[#393b40] hover:text-white'
                    : 'text-[#6c707e] hover:bg-[#dfe1e5]'
              }`}
              title="AI Assistant (Alt+7)"
              aria-label="AI Assistant"
            >
              <Sparkles className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => setSettingsOpen(true)}
              className={`p-2 rounded transition ${
                isDark
                  ? 'hover:text-[#dfe1e5] hover:bg-[#393b40]'
                  : 'hover:text-[#1f2328] hover:bg-[#dfe1e5]'
              }`}
              title="Settings (Ctrl+Alt+S)"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Resizable Panels */}
        <div className="flex-1 h-full overflow-hidden">
          <PanelGroup direction="horizontal">
            {/* Left Tool Window Panel: Dedicated for Files and AI Assistant */}
            {sidebarOpen && (
              <>
                <Panel defaultSize={24} minSize={12} maxSize={50}>
                  <div className="w-full h-full flex flex-col overflow-hidden">
                    {activeLeftTab === 'files' ? (
                      <>
                        <div className="flex-1 overflow-hidden min-h-0">
                          <FileTreeSidebar
                            files={workspace.files}
                            activeFilePath={workspace.activeFilePath}
                            rootEntry={workspace.activeProject?.rootEntry || 'main.tex'}
                            onSelectFile={workspace.selectFile}
                            projectName={workspace.activeProject?.name}
                            createRequest={createRequest}
                            onCreateFile={async (path) => {
                              await workspace.createFile(path);
                            }}
                            onCreateFolder={workspace.createFolder}
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
                      </>
                    ) : (
                      <div className="w-full h-full flex flex-col overflow-hidden">
                        <AiChatPanel
                          isOpen={true}
                          onClose={() => setSidebarOpen(false)}
                          workspace={{
                            files: workspace.files.reduce((acc, f) => {
                              acc[f.path] = f.content;
                              return acc;
                            }, {} as Record<string, any>),
                            activeFilePath: workspace.activeFilePath,
                            activeFileContent: (() => {
                              const file = workspace.files.find((f) => f.path === workspace.activeFilePath);
                              return typeof file?.content === 'string' ? file.content : undefined;
                            })(),
                            updateFileContent: async (path, content) => {
                              const file = workspace.files.find((f) => f.path === path);
                              if (file && file.path === workspace.activeFilePath) {
                                await workspace.updateActiveFileContent(content);
                              } else {
                                await workspace.createFile(path, content, false);
                              }
                            },
                            createFile: async (path, content) => {
                              await workspace.createFile(path, content, false);
                            },
                            compileProject: async (engine?: string) => {
                              if (engine) workspace.setSelectedEngine(engine as any);
                              return await workspace.actions.compile();
                            },
                            diagnostics: workspace.lastResult?.diagnostics ?? [],
                          }}
                          activeProvider={activeAiProvider}
                          onOpenSettings={() => setSettingsOpen(true)}
                        />
                      </div>
                    )}
                  </div>
                </Panel>
                <PanelResizeHandle
                  className={`w-1.5 hover:w-1.5 hover:bg-[#3574f0] active:bg-[#3574f0] transition-colors cursor-col-resize z-10 shrink-0 ${
                    isDark ? 'bg-[#1e1f22] border-r border-[#2b2d30]' : 'bg-[#d1d5db] border-r border-[#c4c7c5]'
                  }`}
                  aria-label="Resize left pane"
                />
              </>
            )}

            {/* Center Panel: Full-height Editor without bottom dock */}
            <Panel defaultSize={previewOpen ? (sidebarOpen ? 43 : 55) : 100} minSize={25}>
              <MonacoEditorPane
                ref={monacoRef}
                files={workspace.files}
                activeFilePath={workspace.activeFilePath}
                rootEntry={workspace.activeProject?.rootEntry || 'main.tex'}
                openTabs={workspace.openTabs}
                diagnostics={diagnostics}
                onSelectTab={workspace.selectFile}
                onCloseTab={workspace.closeTab}
                onContentChange={workspace.updateActiveFileContent}
                onCompileShortcut={handleCompile}
                onSaveShortcut={handleSave}
              />
            </Panel>

            {/* Right Panel: Full-height PDF Preview */}
            {previewOpen && (
              <>
                <PanelResizeHandle
                  className={`w-1.5 hover:w-1.5 hover:bg-[#3574f0] active:bg-[#3574f0] transition-colors cursor-col-resize z-10 shrink-0 ${
                    isDark ? 'bg-[#1e1f22] border-r border-[#2b2d30]' : 'bg-[#d1d5db] border-r border-[#c4c7c5]'
                  }`}
                  aria-label="Resize sidebar"
                />
                <Panel defaultSize={sidebarOpen ? 35 : 45} minSize={25}>
                  <PdfPreviewPane
                    pdfBytes={workspace.lastResult?.pdfBytes ?? null}
                    compiling={workspace.compileStatus === 'compiling'}
                    projectName={workspace.activeProject?.name}
                    compileStatus={workspace.compileStatus}
                    syncTexIndex={workspace.lastResult?.syncTexIndex}
                    onNavigateToSource={handleNavigateToSource}
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
          <span className="flex items-center gap-1 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-[#59a869]" />
            <span>latexmk ({workspace.selectedEngine || 'pdflatex'})</span>
          </span>
          {workspace.resolvedPackages && workspace.resolvedPackages.length > 0 && (
            <span className="text-[#3574f0] flex items-center gap-1">
              <Package className="w-3 h-3" />
              <span>Packages: {workspace.resolvedPackages.join(', ')}</span>
            </span>
          )}
          <span>UTF-8</span>
          <span>2 spaces</span>
        </div>
      </footer>

      <TexSetupGuide
        isOpen={missingRequirements.length > 0 && dismissedSetupResult !== workspace.lastResult}
        onClose={() => setDismissedSetupResult(workspace.lastResult)}
        missingRequirements={missingRequirements}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        onThemeChange={setTheme}
        autoSave={workspace.autoSave}
        onAutoSaveChange={workspace.setAutoSave}
        selectedEngine={workspace.selectedEngine}
        onEngineChange={workspace.setSelectedEngine}
      />

      <McpInstructionsModal
        isOpen={isMcpModalOpen}
        onClose={() => setMcpModalOpen(false)}
      />
    </div>
  );
};

export const App: React.FC<WorkspaceUIProps> = (props) => {
  return (
    <ThemeProvider>
      <WorkspaceUI {...props} />
    </ThemeProvider>
  );
};

export default App;
