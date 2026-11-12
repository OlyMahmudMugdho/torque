import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Torque - Client-Side LaTeX Editor',
  description: 'Client-side WASM LaTeX workspace with AI editing capabilities',
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.addEventListener('unhandledrejection', function(e) {
                var reason = e.reason;
                if (
                  reason &&
                  (reason.type === 'cancelation' ||
                   reason.message === 'operation is manually canceled' ||
                   reason.msg === 'operation is manually canceled' ||
                   reason.name === 'RenderingCancelledException' ||
                   (typeof reason === 'string' && (
                     reason.indexOf('operation is manually canceled') !== -1 ||
                     reason.indexOf('cancelation') !== -1 ||
                     reason.indexOf('RenderingCancelledException') !== -1
                   )))
                ) {
                  e.preventDefault();
                }
              });
            `,
          }}
        />
      </head>
      <body className="bg-zinc-950 text-zinc-100 overflow-hidden" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
