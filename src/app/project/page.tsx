'use client';

import dynamic from 'next/dynamic';

const App = dynamic(() => import('../../App'), {
  ssr: false,
  loading: () => (
    <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#1e1f22] text-[#868a91] gap-3 font-sans">
      <div className="w-8 h-8 border-2 border-[#3574f0] border-t-transparent rounded-full animate-spin" />
      <span className="text-xs font-medium text-[#dfe1e5]">Loading Project...</span>
    </div>
  ),
});

export default function ProjectPage() {
  return <App initialHomeView={false} />;
}
