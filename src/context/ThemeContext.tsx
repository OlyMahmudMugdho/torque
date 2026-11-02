import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from 'react';

export type Theme = 'dark' | 'light';

export interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

export const THEME_STORAGE_KEY = 'torque_theme';

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
}

export function ThemeProvider({ children, defaultTheme = 'dark' }: ThemeProviderProps) {
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

  useEffect(() => {
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      root.classList.toggle('dark', theme === 'dark');
      root.classList.toggle('light', theme === 'light');
    }

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
      } catch {
        // Fallback if localStorage access is restricted
      }
    }
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const value = useMemo(
    () => ({
      theme,
      toggleTheme,
      setTheme,
    }),
    [theme]
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
