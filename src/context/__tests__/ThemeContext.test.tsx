import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../ThemeContext';

const TestComponent = () => {
  const { theme, toggleTheme, setTheme, editorTheme, setEditorTheme } = useTheme();
  return (
    <div>
      <span data-testid="current-theme">{theme}</span>
      <span data-testid="current-editor-theme">{editorTheme}</span>
      <button data-testid="toggle-btn" onClick={toggleTheme}>
        Toggle
      </button>
      <button data-testid="set-dark-btn" onClick={() => setTheme('dark')}>
        Set Dark
      </button>
      <button data-testid="set-light-btn" onClick={() => setTheme('light')}>
        Set Light
      </button>
      <button data-testid="set-editor-theme-btn" onClick={() => setEditorTheme('vs-dark')}>
        Set VS Dark
      </button>
    </div>
  );
};

describe('ThemeContext & ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
  });

  it('throws an error when useTheme is used outside ThemeProvider', () => {
    // Suppress console.error for expected React error boundary message
    const consoleError = console.error;
    console.error = () => {};

    expect(() => render(<TestComponent />)).toThrow(
      'useTheme must be used within a ThemeProvider'
    );

    console.error = consoleError;
  });

  it('defaults to dark theme when localStorage is empty', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    expect(screen.getByTestId('current-theme').textContent).toBe('dark');
    expect(localStorage.getItem('torque_theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('initializes to light theme if stored in localStorage', () => {
    localStorage.setItem('torque_theme', 'light');

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    expect(screen.getByTestId('current-theme').textContent).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('falls back to default dark theme if localStorage contains invalid value', () => {
    localStorage.setItem('torque_theme', 'invalid-theme');

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    expect(screen.getByTestId('current-theme').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('toggles theme between dark and light', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    expect(screen.getByTestId('current-theme').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    // Toggle to light
    act(() => {
      screen.getByTestId('toggle-btn').click();
    });

    expect(screen.getByTestId('current-theme').textContent).toBe('light');
    expect(localStorage.getItem('torque_theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    // Toggle back to dark
    act(() => {
      screen.getByTestId('toggle-btn').click();
    });

    expect(screen.getByTestId('current-theme').textContent).toBe('dark');
    expect(localStorage.getItem('torque_theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('updates theme and storage with setTheme', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    // Explicitly set to light
    act(() => {
      screen.getByTestId('set-light-btn').click();
    });

    expect(screen.getByTestId('current-theme').textContent).toBe('light');
    expect(localStorage.getItem('torque_theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    // Explicitly set to dark
    act(() => {
      screen.getByTestId('set-dark-btn').click();
    });

    expect(screen.getByTestId('current-theme').textContent).toBe('dark');
    expect(localStorage.getItem('torque_theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('manages editorTheme and persists to localStorage', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    // Default editorTheme is 'auto'
    expect(screen.getByTestId('current-editor-theme').textContent).toBe('auto');

    // Update editorTheme
    act(() => {
      screen.getByTestId('set-editor-theme-btn').click();
    });

    expect(screen.getByTestId('current-editor-theme').textContent).toBe('vs-dark');
    expect(localStorage.getItem('torque_editor_theme')).toBe('vs-dark');
  });

  it('initializes editorTheme from localStorage if present', () => {
    localStorage.setItem('torque_editor_theme', 'intellij-light');

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    expect(screen.getByTestId('current-editor-theme').textContent).toBe('intellij-light');
  });
});
