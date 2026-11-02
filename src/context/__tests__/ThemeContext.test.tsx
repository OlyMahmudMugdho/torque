import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../ThemeContext';

const TestComponent = () => {
  const { theme, toggleTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="current-theme">{theme}</span>
      <button data-testid="toggle-btn" onClick={toggleTheme}>
        Toggle
      </button>
      <button data-testid="set-dark-btn" onClick={() => setTheme('dark')}>
        Set Dark
      </button>
      <button data-testid="set-light-btn" onClick={() => setTheme('light')}>
        Set Light
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
});
