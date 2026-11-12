'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useThemeSafe } from '../context/ThemeContext';
import { Check } from 'lucide-react';
import type { LatexEngine } from '../types/workspace';

export interface TopMenuBarProps {
  onNewFile?: () => void;
  onNewProject?: () => void;
  onImportZip?: () => void;
  onExportZip?: () => void;
  onCloseProject?: () => void;
  onCompile?: () => void;
  onSave?: () => void;
  onOpenSettings?: () => void;
  onToggleSidebar?: () => void;
  onToggleProblems?: () => void;
  onTogglePreview?: () => void;
  onToggleAiChat?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onShortcuts?: () => void;
  onAbout?: () => void;
  onOpenMcpGuide?: () => void;
  onOpenMcp?: () => void;
  selectedEngine?: LatexEngine;
  onSelectEngine?: (engine: LatexEngine) => void;
  className?: string;
}

interface MenuItem {
  type?: 'item' | 'separator';
  label?: string;
  shortcut?: string;
  checked?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

interface MenuDef {
  id: string;
  label: string;
  items: MenuItem[];
}

export const TopMenuBar: React.FC<TopMenuBarProps> = ({
  onNewFile,
  onNewProject,
  onImportZip,
  onExportZip,
  onCloseProject,
  onCompile,
  onSave,
  onOpenSettings,
  onToggleSidebar,
  onToggleProblems,
  onTogglePreview,
  onToggleAiChat,
  onUndo,
  onRedo,
  onShortcuts,
  onAbout,
  onOpenMcpGuide,
  onOpenMcp,
  selectedEngine = 'pdflatex',
  onSelectEngine,
  className = '',
}) => {
  const { theme, setTheme } = useThemeSafe();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuBarRef = useRef<HTMLElement>(null);

  const isDark = theme === 'dark';

  // Listen for Escape key and click-outside dismissal
  useEffect(() => {
    if (!openMenu) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenMenu(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenu]);

  const handleItemClick = (item: MenuItem) => {
    if (item.disabled) return;
    item.onClick?.();
    setOpenMenu(null);
  };

  const menus: MenuDef[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        { label: 'New File', onClick: onNewFile },
        { label: 'New Project', onClick: onNewProject },
        { label: 'Save', shortcut: 'Ctrl+S', onClick: onSave },
        { type: 'separator' },
        { label: 'Import Zip', onClick: onImportZip },
        { label: 'Export Zip', onClick: onExportZip },
        { label: 'Close Project', onClick: onCloseProject },
        { type: 'separator' },
        { label: 'Settings...', shortcut: 'Ctrl+Alt+S', onClick: onOpenSettings },
        { type: 'separator' },
        { label: 'Compile', shortcut: 'Ctrl+B', onClick: onCompile },
        { type: 'separator' },
        { label: 'Exit', disabled: true },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        { label: 'Undo', shortcut: 'Ctrl+Z', onClick: onUndo },
        { label: 'Redo', shortcut: 'Ctrl+Y', onClick: onRedo },
        { type: 'separator' },
        { label: 'Cut', shortcut: 'Ctrl+X', disabled: true },
        { label: 'Copy', shortcut: 'Ctrl+C', disabled: true },
        { label: 'Paste', shortcut: 'Ctrl+V', disabled: true },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        { label: 'Toggle Sidebar', shortcut: 'Alt+1', onClick: onToggleSidebar },
        { label: 'Toggle Problems', shortcut: 'Alt+6', onClick: onToggleProblems },
        { label: 'Toggle AI Assistant', shortcut: 'Alt+7', onClick: onToggleAiChat },
        { label: 'Toggle PDF Preview', onClick: onTogglePreview },
        { type: 'separator' },
        {
          label: 'Dark Mode',
          checked: theme === 'dark',
          onClick: () => setTheme('dark'),
        },
        {
          label: 'Light Mode',
          checked: theme === 'light',
          onClick: () => setTheme('light'),
        },
      ],
    },
    {
      id: 'tools',
      label: 'Tools',
      items: [
        {
          label: 'Engine: latexmk (pdflatex)',
          checked: selectedEngine === 'pdflatex',
          onClick: () => onSelectEngine?.('pdflatex'),
        },
        {
          label: 'Engine: latexmk (xelatex)',
          checked: selectedEngine === 'xelatex',
          onClick: () => onSelectEngine?.('xelatex'),
        },
        {
          label: 'Engine: latexmk (lualatex)',
          checked: selectedEngine === 'lualatex',
          onClick: () => onSelectEngine?.('lualatex'),
        },
      ],
    },
    {
      id: 'help',
      label: 'Help',
      items: [
        { label: 'MCP AI Assistant Guide...', onClick: onOpenMcpGuide || onOpenMcp },
        { label: 'Shortcuts Guide', onClick: onShortcuts },
        { label: 'About Torque', onClick: onAbout },
      ],
    },
  ];

  const barClasses = isDark
    ? 'bg-[#2b2d30] text-[#dfe1e5] border-[#1e1f22]'
    : 'bg-[#ebecf0] text-[#1f2328] border-[#d1d5db]';

  const dropdownClasses = isDark
    ? 'bg-[#2b2d30] border-[#4e5157] text-[#dfe1e5] shadow-2xl'
    : 'bg-[#ffffff] border-[#d1d5db] text-[#1f2328] shadow-xl';

  const separatorClasses = isDark ? 'bg-[#393b40]' : 'bg-[#e5e7eb]';

  return (
    <nav
      ref={menuBarRef}
      role="menubar"
      aria-label="Main menu"
      className={`flex flex-nowrap items-center text-xs select-none relative h-8 px-2 border-b shrink-0 ${barClasses} ${className}`}
    >
      <div className="flex flex-nowrap items-center gap-0.5 shrink-0">
        {menus.map((menu) => {
          const isOpen = openMenu === menu.label;

          const buttonClasses = isOpen
            ? isDark
              ? 'bg-[#393b40] text-white'
              : 'bg-[#dfe1e5] text-black'
            : isDark
              ? 'hover:bg-[#393b40] text-[#dfe1e5] hover:text-white'
              : 'hover:bg-[#dfe1e5] text-[#1f2328] hover:text-black';

          return (
            <div key={menu.id} className="relative">
              <button
                type="button"
                role="button"
                aria-haspopup="true"
                aria-expanded={isOpen}
                onClick={() => setOpenMenu(isOpen ? null : menu.label)}
                onMouseEnter={() => {
                  if (openMenu !== null && openMenu !== menu.label) {
                    setOpenMenu(menu.label);
                  }
                }}
                className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded text-xs font-medium cursor-pointer transition-colors shrink-0 ${buttonClasses}`}
              >
                {menu.label}
              </button>

              {isOpen && (
                <div
                  role="menu"
                  aria-label={`${menu.label} menu`}
                  className={`absolute left-0 top-full mt-0.5 min-w-[200px] py-1 border rounded z-50 ${dropdownClasses}`}
                >
                  {menu.items.map((item, idx) => {
                    if (item.type === 'separator') {
                      return (
                        <div
                          key={`sep-${idx}`}
                          role="separator"
                          className={`h-[1px] my-1 ${separatorClasses}`}
                        />
                      );
                    }

                    const itemClasses = item.disabled
                      ? isDark
                        ? 'text-[#6f737a] cursor-not-allowed'
                        : 'text-[#9ca3af] cursor-not-allowed'
                      : isDark
                        ? 'hover:bg-[#3574f0] hover:text-white text-[#dfe1e5]'
                        : 'hover:bg-[#3574f0] hover:text-white text-[#1f2328]';

                    return (
                      <button
                        key={item.label}
                        type="button"
                        role="menuitem"
                        disabled={item.disabled}
                        onClick={() => handleItemClick(item)}
                        className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left cursor-pointer transition-colors ${itemClasses}`}
                      >
                        <div className="flex items-center gap-1.5">
                          {item.checked !== undefined && (
                            <span className="w-3.5 h-3.5 flex items-center justify-center">
                              {item.checked && (
                                <Check className="w-3.5 h-3.5 text-current" />
                              )}
                            </span>
                          )}
                          <span>{item.label}</span>
                        </div>
                        {item.shortcut && (
                          <span className="text-[11px] font-mono opacity-60 ml-4">
                            {item.shortcut}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
};
