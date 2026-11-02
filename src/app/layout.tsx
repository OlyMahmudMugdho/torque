import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Torque - Client-Side LaTeX Editor',
  description: 'Client-side WASM LaTeX workspace with AI editing capabilities',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-zinc-950 text-zinc-100 overflow-hidden" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
