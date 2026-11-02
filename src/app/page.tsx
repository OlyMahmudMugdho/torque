'use client';

import dynamic from 'next/dynamic';

const App = dynamic(() => import('../App'), {
  ssr: false,
  loading: () => (
    <div className="w-screen h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-400 gap-3">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-sm font-medium">Loading LaTeX Workspace...</span>
    </div>
  ),
});

export default function Page() {
  return <App />;
}
