import React, { useState, useRef } from 'react';
import type { Project } from '../types/workspace';
import { useThemeSafe } from '../context/ThemeContext';
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
  Minus,
  Square,
  FileText,
} from 'lucide-react';

export interface WelcomeHomeScreenProps {
  projects: Project[];
  activeProjectId?: string;
  onSelectProject: (projectId: string) => Promise<void> | void;
  onCreateProject: (name: string) => Promise<Project> | Promise<void> | void;
  onImportZip: (file: File) => Promise<void> | void;
  onDeleteProject: (projectId: string) => Promise<void> | void;
  onCloseWelcome?: () => void;
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
  onSelectProject,
  onCreateProject,
  onImportZip,
  onDeleteProject,
  onCloseWelcome,
}) => {
  const { theme, setTheme } = useThemeSafe();
  const isDark = theme === 'dark';

  const [activeTab, setActiveTab] = useState<'projects' | 'customize'>('projects');
  const [searchQuery, setSearchQuery] = useState('');
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>('medium');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCreateProject = async () => {
    const name = window.prompt('Enter new project name:', 'Untitled Project');
    if (name?.trim()) {
      await onCreateProject(name.trim());
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
      className={`w-screen h-screen flex items-center justify-center font-sans select-none overflow-hidden transition-colors ${
        isDark ? 'bg-[#1e1f22] text-[#dfe1e5]' : 'bg-[#e5e7eb] text-[#1f2328]'
      }`}
    >
      {/* Hidden file input for zip import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        onChange={handleFileChange}
        className="hidden"
        data-testid="welcome-zip-input"
        aria-label="Upload Zip"
      />

      {/* IntelliJ Window Container */}
      <div
        className={`w-full h-full sm:max-w-4xl sm:max-h-[640px] sm:rounded-lg border shadow-2xl flex flex-col overflow-hidden ${
          isDark ? 'bg-[#2b2d30] border-[#393b40]' : 'bg-[#ffffff] border-[#c9ccd6]'
        }`}
      >
        {/* Title Bar / Header */}
        <div
          className={`h-9 px-3 border-b flex items-center justify-between shrink-0 ${
            isDark ? 'bg-[#1e1f22] border-[#393b40]' : 'bg-[#ebecf0] border-[#d1d5db]'
          }`}
        >
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 bg-gradient-to-tr from-[#3574f0] via-[#59a869] to-[#e2a53b] rounded flex items-center justify-center">
              <span className="text-[7px] font-black text-black leading-none">TQ</span>
            </div>
            <span
              className={`text-xs font-medium ${
                isDark ? 'text-[#dfe1e5]' : 'text-[#1f2328]'
              }`}
            >
              Welcome to Torque
            </span>
          </div>

          {/* Window Control Buttons */}
          <div className="flex items-center">
            <button
              type="button"
              aria-label="Minimize"
              className={`w-7 h-6 flex items-center justify-center rounded transition ${
                isDark ? 'hover:bg-[#393b40] text-[#868a91]' : 'hover:bg-[#dfe1e5] text-[#6c707e]'
              }`}
            >
              <Minus className="w-3 h-3" />
            </button>
            <button
              type="button"
              aria-label="Maximize"
              className={`w-7 h-6 flex items-center justify-center rounded transition ${
                isDark ? 'hover:bg-[#393b40] text-[#868a91]' : 'hover:bg-[#dfe1e5] text-[#6c707e]'
              }`}
            >
              <Square className="w-2.5 h-2.5" />
            </button>
            <button
              type="button"
              aria-label="Close"
              onClick={onCloseWelcome}
              className="w-7 h-6 flex items-center justify-center rounded hover:bg-[#e05555] hover:text-white transition text-[#868a91]"
            >
              <X className="w-3 h-3" />
            </button>
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
              {/* Branding */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-[#3574f0] via-[#59a869] to-[#e2a53b] flex items-center justify-center shadow-md shrink-0">
                    <span className="text-sm font-black text-black tracking-tighter">TQ</span>
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-bold text-base tracking-tight">Torque</span>
                      <span className="text-[11px] font-mono text-[#868a91]">0.1.0</span>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] leading-snug text-[#868a91]">
                  An open-source LaTeX IDE inspired by IntelliJ IDEA
                </p>
              </div>

              {/* Navigation Tabs */}
              <nav aria-label="Welcome screen navigation" className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('projects')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-xs transition ${
                    activeTab === 'projects'
                      ? isDark
                        ? 'bg-[#2e436e] text-white font-medium'
                        : 'bg-[#2e436e] text-white font-medium shadow-sm'
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
                  onClick={() => setActiveTab('customize')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-xs transition ${
                    activeTab === 'customize'
                      ? isDark
                        ? 'bg-[#2e436e] text-white font-medium'
                        : 'bg-[#2e436e] text-white font-medium shadow-sm'
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
                onClick={() => setActiveTab('customize')}
                className={`flex items-center gap-2 text-xs p-1.5 rounded transition w-full ${
                  isDark ? 'text-[#868a91] hover:text-[#dfe1e5] hover:bg-[#2b2d30]' : 'text-[#6c707e] hover:text-[#1f2328] hover:bg-[#dfe1e5]'
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
          <main className="flex-1 flex flex-col overflow-hidden">
            {activeTab === 'projects' ? (
              <div className="flex-1 flex flex-col p-6 overflow-hidden">
                {/* Centered Welcome Hero */}
                <div className="flex flex-col items-center text-center mb-6">
                  <h1 className="text-2xl font-bold tracking-tight">Welcome to Torque</h1>
                  <p className="text-xs sm:text-sm text-[#868a91] mt-1.5 max-w-md">
                    Open a project, create a new LaTeX document, or import from zip.
                  </p>

                  {/* Quick Action Buttons */}
                  <div className="flex items-center gap-3 mt-4">
                    <button
                      type="button"
                      onClick={handleCreateProject}
                      className="flex items-center gap-2 px-4 py-2 rounded text-xs font-semibold bg-[#3574f0] text-white hover:bg-[#3068d9] transition shadow"
                    >
                      <Plus className="w-4 h-4" />
                      <span>New Project</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className={`flex items-center gap-2 px-4 py-2 rounded text-xs font-semibold border transition shadow-sm ${
                        isDark
                          ? 'border-[#4e5157] text-[#dfe1e5] hover:bg-[#393b40]'
                          : 'border-[#c9ccd6] text-[#1f2328] hover:bg-[#ebecf0]'
                      }`}
                    >
                      <FolderOpen className="w-4 h-4 text-[#3574f0]" />
                      <span>Open Project / Import Zip</span>
                    </button>
                  </div>
                </div>

                {/* Recent Projects Section */}
                <div className="flex-1 flex flex-col overflow-hidden min-h-0 border rounded-md">
                  {/* Search Filter Bar */}
                  <div
                    className={`h-10 px-3 border-b flex items-center justify-between shrink-0 ${
                      isDark ? 'bg-[#1e1f22] border-[#393b40]' : 'bg-[#f7f8fa] border-[#d1d5db]'
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-1 max-w-sm">
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
                          className="text-[#868a91] hover:text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    <span className="text-[11px] text-[#868a91]">
                      {filteredProjects.length} {filteredProjects.length === 1 ? 'project' : 'projects'}
                    </span>
                  </div>

                  {/* Projects List View */}
                  <div className="flex-1 overflow-y-auto">
                    {projects.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center p-6 text-center text-[#868a91]">
                        <Folder className="w-10 h-10 mb-2 opacity-40 text-[#3574f0]" />
                        <span className="text-sm font-medium">No recent projects</span>
                        <span className="text-xs mt-1 max-w-xs">
                          Get started by creating a new project or importing an existing LaTeX zip.
                        </span>
                      </div>
                    ) : filteredProjects.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center p-6 text-center text-[#868a91]">
                        <Search className="w-8 h-8 mb-2 opacity-40" />
                        <span className="text-xs">No projects matching &ldquo;{searchQuery}&rdquo;</span>
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
                                  className="p-1 rounded text-[#868a91] hover:text-[#e05555] hover:bg-[#e05555]/15 transition"
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
    </div>
  );
};
