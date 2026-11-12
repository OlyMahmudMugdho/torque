import '@testing-library/jest-dom/vitest';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SplashScreen } from '../SplashScreen';
import { APP_VERSION, APP_NAME } from '../../version';

describe('SplashScreen component', () => {
  it('renders splash screen image and default status message', () => {
    render(<SplashScreen />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByAltText('Torque Splash Screen')).toBeInTheDocument();
    expect(screen.getByText('Loading Torque...')).toBeInTheDocument();
    expect(screen.getByText(`${APP_NAME} ${APP_VERSION}`)).toBeInTheDocument();
  });

  it('renders custom status message when provided', () => {
    render(<SplashScreen statusMessage="Initializing TeX Live environment..." />);

    expect(screen.getByText('Initializing TeX Live environment...')).toBeInTheDocument();
  });
});
