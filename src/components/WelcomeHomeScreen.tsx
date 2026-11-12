import React, { useState, useRef, useEffect } from 'react';
import type { Project, ProjectFile } from '../types/workspace';
import { useThemeSafe } from '../context/ThemeContext';
import { NewProjectModal } from './NewProjectModal';
import { scaffoldProjectFiles, type NewProjectFormValues } from '../templates/projectTemplates';
import {
  Folder,
  FolderOpen,
  Plus,
  Search,
  Trash2,
  Sliders,
  Settings,
  Sun,
  Moon,
  Check,
  X,
  FileText,
  GitBranch,
  Terminal,
} from 'lucide-react';

export interface WelcomeHomeScreenProps {
  projects: Project[];
  activeProjectId?: string;
  initialTab?: 'projects' | 'customize';
  onTabChange?: (tab: 'projects' | 'customize') => void;
  onSelectProject: (projectId: string) => Promise<void> | void;
  onCreateProject: (
    name: string,
    initialFiles?: Omit<ProjectFile, 'projectId' | 'updatedAt'>[],
    rootEntry?: string
  ) => Promise<Project> | Promise<void> | void;
  onImportZip: (file: File) => Promise<void> | void;
  onDeleteProject: (projectId: string) => Promise<void> | void;
}

export function formatLastModified(timestamp: number): string {
  if (!timestamp) return 'Unknown';
  const diff = Date.now() - timestamp;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export const WelcomeHomeScreen: React.FC<WelcomeHomeScreenProps> = ({
  projects,
  activeProjectId,
  initialTab = 'projects',
  onTabChange,
  onSelectProject,
  onCreateProject,
  onImportZip,
  onDeleteProject,
}) => {
  const { theme, setTheme } = useThemeSafe();
  const isDark = theme === 'dark';

  const [activeTab, setActiveTab] = useState<'projects' | 'customize'>(initialTab);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialTab && initialTab !== activeTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const handleTabSwitch = (tab: 'projects' | 'customize') => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  const handleCreateProject = () => {
    setIsNewProjectModalOpen(true);
  };

  const handleConfirmCreateProject = async (values: NewProjectFormValues) => {
    const { files, rootEntry } = scaffoldProjectFiles(values);
    await onCreateProject(values.name, files, rootEntry);
  };

  const handleCloneRepository = async () => {
    const url = window.prompt('Enter Git repository URL:');
    if (url?.trim()) {
      const segments = url.trim().replace(/\.git$/i, '').split('/');
      const repoName = segments[segments.length - 1] || 'Cloned Repository';
      await onCreateProject(repoName);
    }
  };

  const handleRemoteDevelopment = () => {
    if (typeof window.alert === 'function') {
      window.alert('Remote Development is coming soon in Torque.');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await onImportZip(file);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await onImportZip(files[0]);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (window.confirm(`Delete project "${name}"? This cannot be undone.`)) {
      await onDeleteProject(id);
    }
  };

  const filteredProjects = projects.filter((p) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      (p.rootEntry && p.rootEntry.toLowerCase().includes(q))
    );
  });

  return (
    <div
      className={`w-screen h-screen flex flex-col font-sans select-none overflow-hidden transition-colors ${
        isDark ? 'bg-[#1e1f22] text-[#dfe1e5]' : 'bg-[#e5e7eb] text-[#1f2328]'
      }`}
    >
      {/* Hidden file input for zip or file import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        onChange={handleFileChange}
        className="hidden"
        data-testid="welcome-zip-input"
        aria-label="Upload Zip"
      />

      {/* IntelliJ / OpenIDEA Window Container — flush full-window layout */}
      <div
        className={`w-full h-full rounded-none border-0 shadow-none flex flex-col overflow-hidden ${
          isDark ? 'bg-[#2b2d30]' : 'bg-[#ffffff]'
        }`}
      >
        {/* Title Bar / Header */}
        <div
          className={`h-9 px-3 border-b flex items-center justify-between shrink-0 ${
            isDark ? 'bg-[#1e1f22] border-[#323232]' : 'bg-[#ebecf0] border-[#d1d5db]'
          }`}
        >
          {/* Left Title */}
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-[#1e1f22] border border-[#e5a035] flex items-center justify-center">
              <span className="text-[8px] font-black text-[#e5a035] leading-none">T</span>
            </div>
            <span
              className={`text-xs font-medium ${
                isDark ? 'text-[#dfe1e5]' : 'text-[#1f2328]'
              }`}
            >
              Welcome to Torque
            </span>
          </div>
        </div>

        {/* Window Body: Left Sidebar + Right Main Panel */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar */}
          <aside
            className={`w-56 sm:w-60 border-r flex flex-col justify-between shrink-0 p-4 ${
              isDark ? 'bg-[#1e1f22] border-[#393b40]' : 'bg-[#ebecf0] border-[#d1d5db]'
            }`}
          >
            <div className="flex flex-col gap-6">
              {/* Branding Badge & App Info */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0">
                    <img
                      src="/logo.png"
                      alt="Torque Logo"
                      className="w-11 h-11 object-contain"
                    />
                    <span className="sr-only">TQ</span>
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-bold text-lg tracking-tight">Torque</span>
                      <span className="text-[11px] font-mono text-[#868a91]">0.1.0</span>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] leading-snug text-[#868a91]">
                  An open-source IDE inspired by IntelliJ IDEA
                </p>
              </div>

              {/* Navigation Menu */}
              <nav aria-label="Welcome screen navigation" className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => handleTabSwitch('projects')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition ${
                    activeTab === 'projects'
                      ? 'bg-[#3574f0] text-white shadow-sm'
                      : isDark
                        ? 'text-[#dfe1e5] hover:bg-[#2b2d30]'
                        : 'text-[#1f2328] hover:bg-[#dfe1e5]'
                  }`}
                >
                  <Folder className="w-4 h-4 shrink-0" />
                  <span>Projects</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleTabSwitch('customize')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition ${
                    activeTab === 'customize'
                      ? 'bg-[#3574f0] text-white shadow-sm'
                      : isDark
                        ? 'text-[#dfe1e5] hover:bg-[#2b2d30]'
                        : 'text-[#1f2328] hover:bg-[#dfe1e5]'
                  }`}
                >
                  <Sliders className="w-4 h-4 shrink-0" />
                  <span>Customize</span>
                </button>
              </nav>
            </div>

            {/* Bottom Settings Link */}
            <div className={`pt-3 border-t ${isDark ? 'border-[#393b40]' : 'border-[#d1d5db]'}`}>
              <button
                type="button"
                onClick={() => handleTabSwitch('customize')}
                className={`flex items-center gap-2 text-xs p-1.5 rounded transition w-full ${
                  isDark
                    ? 'text-[#c2c5cc] hover:text-[#dfe1e5] hover:bg-[#2b2d30]'
                    : 'text-[#6c707e] hover:text-[#1f2328] hover:bg-[#dfe1e5]'
                }`}
                title="Settings"
                aria-label="Settings"
              >
                <Settings className="w-4 h-4 shrink-0" />
                <span>Settings</span>
              </button>
            </div>
          </aside>

          {/* Right Main Panel */}
          <main className="flex-1 flex flex-col overflow-hidden relative">
            {/* Drag & Drop Overlay */}
            {isDraggingOver && (
              <div className="absolute inset-0 z-50 bg-[#3574f0]/20 border-2 border-dashed border-[#3574f0] backdrop-blur-[1px] flex flex-col items-center justify-center pointer-events-none rounded-lg">
                <FolderOpen className="w-12 h-12 text-[#3574f0] mb-2 animate-bounce" />
                <span className="text-sm font-semibold text-[#3574f0]">
                  Drop folder or .zip file here to import
                </span>
              </div>
            )}

            {activeTab === 'projects' ? (
              projects.length === 0 ? (
                /* Empty Projects State: IntelliJ IDEA Centered Action Cards */
                <div
                  className="flex-1 flex flex-col items-center justify-center p-8 text-center relative select-none"
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  data-testid="welcome-empty-state"
                >
                  <span className="sr-only">No recent projects</span>

                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
                    Welcome to Torque
                  </h1>
                  <p className="text-xs sm:text-sm text-[#868a91] max-w-md">
                    Open a folder from disk or clone a repository from version control.
                  </p>
                  <p className="text-xs sm:text-sm text-[#868a91] mt-1 max-w-md">
                    You can also drop a folder onto this window.
                  </p>

                  {/* Action Cards Row */}
                  <div className="flex flex-wrap items-center justify-center gap-6 mt-8">
                    {/* Card 1: New Project */}
                    <button
                      type="button"
                      onClick={handleCreateProject}
                      className="group flex flex-col items-center gap-2 focus:outline-none"
                      aria-label="New Project"
                    >
                      <div
                        className={`w-18 h-18 sm:w-20 sm:h-20 rounded-xl border flex items-center justify-center transition shadow-sm ${
                          isDark
                            ? 'border-[#4e5157] bg-[#2b2d30] group-hover:border-[#3574f0] group-hover:bg-[#3574f0]/10 text-[#dfe1e5] group-hover:text-white'
                            : 'border-[#c9ccd6] bg-[#ffffff] group-hover:border-[#3574f0] group-hover:bg-[#3574f0]/10 text-[#1f2328] group-hover:text-[#3574f0]'
                        }`}
                      >
                        <Plus className="w-7 h-7 sm:w-8 sm:h-8" />
                      </div>
                      <span className="text-xs font-medium text-center">New Project</span>
                    </button>

                    {/* Card 2: Open */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="group flex flex-col items-center gap-2 focus:outline-none"
                      aria-label="Open"
                    >
                      <div
                        className={`w-18 h-18 sm:w-20 sm:h-20 rounded-xl border flex items-center justify-center transition shadow-sm ${
                          isDark
                            ? 'border-[#4e5157] bg-[#2b2d30] group-hover:border-[#3574f0] group-hover:bg-[#3574f0]/10 text-[#dfe1e5] group-hover:text-white'
                            : 'border-[#c9ccd6] bg-[#ffffff] group-hover:border-[#3574f0] group-hover:bg-[#3574f0]/10 text-[#1f2328] group-hover:text-[#3574f0]'
                        }`}
                      >
                        <Folder className="w-7 h-7 sm:w-8 sm:h-8" />
                      </div>
                      <span className="text-xs font-medium text-center">Open</span>
                    </button>

                    {/* Card 3: Clone Repository */}
                    <button
                      type="button"
                      onClick={handleCloneRepository}
                      className="group flex flex-col items-center gap-2 focus:outline-none"
                      aria-label="Clone Repository"
                    >
                      <div
                        className={`w-18 h-18 sm:w-20 sm:h-20 rounded-xl border flex items-center justify-center transition shadow-sm ${
                          isDark
                            ? 'border-[#4e5157] bg-[#2b2d30] group-hover:border-[#3574f0] group-hover:bg-[#3574f0]/10 text-[#dfe1e5] group-hover:text-white'
                            : 'border-[#c9ccd6] bg-[#ffffff] group-hover:border-[#3574f0] group-hover:bg-[#3574f0]/10 text-[#1f2328] group-hover:text-[#3574f0]'
                        }`}
                      >
                        <GitBranch className="w-7 h-7 sm:w-8 sm:h-8" />
                      </div>
                      <span className="text-xs font-medium text-center">Clone Repository</span>
                    </button>

                    {/* Card 4: Remote Development */}
                    <button
                      type="button"
                      onClick={handleRemoteDevelopment}
                      className="group flex flex-col items-center gap-2 focus:outline-none"
                      aria-label="Remote Development"
                    >
                      <div
                        className={`w-18 h-18 sm:w-20 sm:h-20 rounded-xl border flex items-center justify-center transition shadow-sm ${
                          isDark
                            ? 'border-[#4e5157] bg-[#2b2d30] group-hover:border-[#3574f0] group-hover:bg-[#3574f0]/10 text-[#dfe1e5] group-hover:text-white'
                            : 'border-[#c9ccd6] bg-[#ffffff] group-hover:border-[#3574f0] group-hover:bg-[#3574f0]/10 text-[#1f2328] group-hover:text-[#3574f0]'
                        }`}
                      >
                        <Terminal className="w-7 h-7 sm:w-8 sm:h-8" />
                      </div>
                      <span className="text-xs font-medium text-center">Remote Development</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Projects List View with Top Action Header */
                <div
                  className="flex-1 flex flex-col p-6 overflow-hidden relative"
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <h1 className="sr-only">Welcome to Torque</h1>

                  {/* Top Action Header */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4 shrink-0">
                    {/* Search Filter Bar */}
                    <div
                      className={`h-9 px-3 rounded-md border flex items-center gap-2 flex-1 max-w-sm ${
                        isDark ? 'bg-[#1e1f22] border-[#393b40]' : 'bg-[#f7f8fa] border-[#d1d5db]'
                      }`}
                    >
                      <Search className="w-3.5 h-3.5 text-[#868a91] shrink-0" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search projects..."
                        aria-label="Search projects"
                        className={`w-full bg-transparent text-xs outline-none ${
                          isDark ? 'text-[#dfe1e5] placeholder-[#868a91]' : 'text-[#1f2328] placeholder-[#6c707e]'
                        }`}
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          aria-label="Clear search"
                          className="text-[#c2c5cc] hover:text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Header Action Buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCreateProject}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-[#3574f0] text-white hover:bg-[#3068d9] transition shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>New Project</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        aria-label="Open from disk"
                        title="Open project from disk or zip"
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border transition shadow-sm ${
                          isDark
                            ? 'border-[#4e5157] text-[#dfe1e5] hover:bg-[#393b40]'
                            : 'border-[#c9ccd6] text-[#1f2328] hover:bg-[#ebecf0]'
                        }`}
                      >
                        <Folder className="w-3.5 h-3.5 text-[#3574f0]" />
                        <span>Open</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleCloneRepository}
                        aria-label="Clone Repository"
                        title="Clone repository from version control"
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border transition shadow-sm ${
                          isDark
                            ? 'border-[#4e5157] text-[#dfe1e5] hover:bg-[#393b40]'
                            : 'border-[#c9ccd6] text-[#1f2328] hover:bg-[#ebecf0]'
                        }`}
                      >
                        <GitBranch className="w-3.5 h-3.5 text-[#3574f0]" />
                        <span>Clone</span>
                      </button>
                    </div>
                  </div>

                  {/* Projects List Container */}
                  <div className="flex-1 flex flex-col overflow-hidden min-h-0 border rounded-md">
                    <div className="flex-1 overflow-y-auto">
                      {filteredProjects.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center p-6 text-center text-[#868a91]">
                          <Search className="w-8 h-8 mb-2 opacity-40" />
                          <span className="text-xs">
                            No projects matching &ldquo;{searchQuery}&rdquo;
                          </span>
                        </div>
                      ) : (
                        <div className="divide-y divide-inherit">
                          {filteredProjects.map((p) => {
                            const isCurrent = p.id === activeProjectId;
                            return (
                              <div
                                key={p.id}
                                onClick={() => onSelectProject(p.id)}
                                className={`group px-4 py-2.5 flex items-center justify-between cursor-pointer transition ${
                                  isCurrent
                                    ? isDark
                                      ? 'bg-[#3574f0]/10 hover:bg-[#3574f0]/20'
                                      : 'bg-[#3574f0]/10 hover:bg-[#3574f0]/15'
                                    : isDark
                                      ? 'hover:bg-[#35373c]'
                                      : 'hover:bg-[#f2f3f5]'
                                }`}
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-7 h-7 rounded bg-[#3574f0]/15 flex items-center justify-center shrink-0">
                                    <FileText className="w-4 h-4 text-[#3574f0]" />
                                  </div>
                                  <div className="flex flex-col min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={`text-xs font-semibold truncate ${
                                          isDark ? 'text-[#dfe1e5]' : 'text-[#1f2328]'
                                        }`}
                                      >
                                        {p.name}
                                      </span>
                                      {isCurrent && (
                                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#3574f0]/20 text-[#3574f0] font-medium">
                                          Current
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className="text-[11px] font-mono text-[#868a91]">
                                        {p.rootEntry || 'main.tex'}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-3 shrink-0">
                                  <span className="text-[11px] text-[#868a91]">
                                    {formatLastModified(p.updatedAt)}
                                  </span>

                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onSelectProject(p.id);
                                    }}
                                    className="px-2.5 py-1 text-xs font-medium rounded bg-[#3574f0]/15 text-[#3574f0] hover:bg-[#3574f0] hover:text-white transition"
                                  >
                                    Open
                                  </button>

                                  <button
                                    type="button"
                                    onClick={(e) => handleDelete(e, p.id, p.name)}
                                    aria-label={`Delete project ${p.name}`}
                                    title="Delete project"
                                    className="p-1 rounded text-[#c2c5cc] hover:text-[#e05555] hover:bg-[#e05555]/15 transition"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            ) : (
              /* Customize Tab View */
              <div className="flex-1 p-6 overflow-y-auto">
                <div className="max-w-xl flex flex-col gap-6">
                  <div>
                    <h2 className="text-xl font-bold tracking-tight">Customize</h2>
                    <p className="text-xs text-[#868a91] mt-1">
                      Configure your Torque editing environment and appearance.
                    </p>
                  </div>

                  {/* Theme Section */}
                  <div className="flex flex-col gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#868a91]">
                      Color Theme
                    </span>
                    <div className="grid grid-cols-2 gap-3">
                      {/* Dark Mode Option */}
                      <button
                        type="button"
                        onClick={() => setTheme('dark')}
                        className={`flex flex-col items-start p-4 rounded-lg border text-left transition ${
                          isDark
                            ? 'border-[#3574f0] ring-1 ring-[#3574f0] bg-[#1e1f22]'
                            : 'border-[#d1d5db] hover:border-[#9ca3af] bg-[#f7f8fa]'
                        }`}
                      >
                        <div className="w-full flex items-center justify-between mb-2">
                          <Moon className="w-5 h-5 text-[#3574f0]" />
                          {isDark && <Check className="w-4 h-4 text-[#3574f0]" />}
                        </div>
                        <span className="text-xs font-bold">IntelliJ Dark</span>
                        <span className="text-[11px] text-[#868a91] mt-0.5">
                          Modern dark theme with high-contrast accents
                        </span>
                      </button>

                      {/* Light Mode Option */}
                      <button
                        type="button"
                        onClick={() => setTheme('light')}
                        className={`flex flex-col items-start p-4 rounded-lg border text-left transition ${
                          !isDark
                            ? 'border-[#3574f0] ring-1 ring-[#3574f0] bg-[#ffffff]'
                            : 'border-[#393b40] hover:border-[#4e5157] bg-[#1e1f22]'
                        }`}
                      >
                        <div className="w-full flex items-center justify-between mb-2">
                          <Sun className="w-5 h-5 text-[#e2a53b]" />
                          {!isDark && <Check className="w-4 h-4 text-[#3574f0]" />}
                        </div>
                        <span className="text-xs font-bold">IntelliJ Light</span>
                        <span className="text-[11px] text-[#868a91] mt-0.5">
                          Clean light palette optimized for daytime writing
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Font Size Section */}
                  <div className="flex flex-col gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#868a91]">
                      Editor &amp; IDE Font Size
                    </span>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { id: 'small', label: 'Small', desc: '12px' },
                        { id: 'medium', label: 'Medium', desc: '14px (Default)' },
                        { id: 'large', label: 'Large', desc: '16px' },
                      ].map((item) => {
                        const isSelected = fontSize === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setFontSize(item.id as any)}
                            className={`flex flex-col items-center justify-center p-3 rounded-lg border text-center transition ${
                              isSelected
                                ? 'border-[#3574f0] ring-1 ring-[#3574f0] ' +
                                  (isDark ? 'bg-[#1e1f22]' : 'bg-[#edf3ff]')
                                : isDark
                                  ? 'border-[#393b40] hover:border-[#4e5157] bg-[#1e1f22]'
                                  : 'border-[#d1d5db] hover:border-[#9ca3af] bg-[#f7f8fa]'
                            }`}
                          >
                            <span className="text-xs font-bold">{item.label}</span>
                            <span className="text-[11px] text-[#868a91] mt-0.5">{item.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* JetBrains-style New Project Modal Wizard */}
      <NewProjectModal
        isOpen={isNewProjectModalOpen}
        onClose={() => setIsNewProjectModalOpen(false)}
        onCreate={handleConfirmCreateProject}
      />
    </div>
  );
};
