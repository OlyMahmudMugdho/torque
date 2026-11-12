'use client';

import dynamic from 'next/dynamic';
import { SplashScreen } from '../components/SplashScreen';

const App = dynamic(() => import('../App'), {
  ssr: false,
  loading: () => <SplashScreen statusMessage="Initializing Torque..." />,
});

export default function Page() {
  return <App />;
}
