'use client';

import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from 'react';

export type Theme = 'dark' | 'light';

export type EditorTheme =
  | 'auto'
  | 'intellij-dark'
  | 'intellij-light'
  | 'vs-dark'
  | 'vs'
  | 'hc-black'
  | 'hc-light';

export interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  editorTheme: EditorTheme;
  setEditorTheme: (editorTheme: EditorTheme) => void;
}

export const THEME_STORAGE_KEY = 'torque_theme';
export const EDITOR_THEME_STORAGE_KEY = 'torque_editor_theme';

export const VALID_EDITOR_THEMES: EditorTheme[] = [
  'auto',
  'intellij-dark',
  'intellij-light',
  'vs-dark',
  'vs',
  'hc-black',
  'hc-light',
];

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
  defaultEditorTheme?: EditorTheme;
}

export function ThemeProvider({
  children,
  defaultTheme = 'dark',
  defaultEditorTheme = 'auto',
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        if (stored === 'light' || stored === 'dark') {
          return stored;
        }
      } catch {
        // Fallback if localStorage access is restricted
      }
    }
    return defaultTheme;
  });

  const [editorTheme, setEditorThemeState] = useState<EditorTheme>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const stored = localStorage.getItem(EDITOR_THEME_STORAGE_KEY) as EditorTheme | null;
        if (stored && VALID_EDITOR_THEMES.includes(stored)) {
          return stored;
        }
      } catch {
        // Fallback if localStorage access is restricted
      }
    }
    return defaultEditorTheme;
  });

  useEffect(() => {
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      root.classList.toggle('dark', theme === 'dark');
      root.classList.toggle('light', theme === 'light');
      root.style.colorScheme = theme;
    }

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
      } catch {
        // Fallback if localStorage access is restricted
      }
    }
  }, [theme]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(EDITOR_THEME_STORAGE_KEY, editorTheme);
      } catch {
        // Fallback if localStorage access is restricted
      }
    }
  }, [editorTheme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const setEditorTheme = (newEditorTheme: EditorTheme) => {
    setEditorThemeState(newEditorTheme);
  };

  const value = useMemo(
    () => ({
      theme,
      toggleTheme,
      setTheme,
      editorTheme,
      setEditorTheme,
    }),
    [theme, editorTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export function useThemeSafe(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    return {
      theme: 'dark',
      toggleTheme: () => {},
      setTheme: () => {},
      editorTheme: 'auto',
      setEditorTheme: () => {},
    };
  }
  return context;
}
