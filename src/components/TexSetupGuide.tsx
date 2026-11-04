'use client';

import React, { useState } from 'react';
import { X, AlertTriangle, RefreshCw } from 'lucide-react';
import { useThemeSafe as useTheme } from '../context/ThemeContext';
import { getActiveCompilerDriver, type CompilerDriver } from '../compiler/compilerDriver';

export type OsKey = 'debian' | 'fedora' | 'arch' | 'macos' | 'windows';

export interface OsInstructions {
  key: OsKey;
  label: string;
  steps: string[];
  commands: string[];
}

export const OS_INSTRUCTIONS: OsInstructions[] = [
  {
    key: 'debian',
    label: 'Debian / Ubuntu',
    steps: ['Install latexmk and the base TeX Live packages:'],
    commands: ['sudo apt install latexmk texlive-latex-base texlive-latex-recommended texlive-latex-extra texlive-xetex texlive-luatex'],
  },
  {
    key: 'fedora',
    label: 'Fedora',
    steps: ['Install latexmk and the TeX Live packages:'],
    commands: ['sudo dnf install latexmk texlive-scheme-basic texlive-xetex texlive-luatex'],
  },
  {
    key: 'arch',
    label: 'Arch Linux',
    steps: ['Install TeX Live and latexmk:'],
    commands: ['sudo pacman -S texlive-basic texlive-latex texlive-latexrecommended texlive-xetex texlive-luatex texlive-binextra'],
  },
  {
    key: 'macos',
    label: 'macOS',
    steps: ['Install MacTeX (full), or the smaller BasicTeX followed by latexmk:'],
    commands: ['brew install --cask mactex-no-gui', 'brew install --cask basictex && sudo tlmgr install latexmk'],
  },
  {
    key: 'windows',
    label: 'Windows',
    steps: [
      'Install MiKTeX or TeX Live. latexmk requires Perl on Windows (e.g. Strawberry Perl).',
    ],
    commands: ['winget install MiKTeX.MiKTeX', 'winget install StrawberryPerl.StrawberryPerl'],
  },
];

export function detectOs(platform?: string, userAgent?: string): OsKey {
  const p = `${platform ?? ''} ${userAgent ?? ''}`.toLowerCase();
  if (p.includes('win')) return 'windows';
  if (p.includes('mac') || p.includes('iphone') || p.includes('ipad')) return 'macos';
  if (p.includes('fedora') || p.includes('red hat')) return 'fedora';
  if (p.includes('arch') && !p.includes('march')) return 'arch';
  return 'debian';
}

export interface TexSetupGuideProps {
  isOpen: boolean;
  onClose: () => void;
  missingRequirements: string[];
  driver?: CompilerDriver;
  onRecheckSuccess?: () => void;
}

export const TexSetupGuide: React.FC<TexSetupGuideProps> = ({
  isOpen,
  onClose,
  missingRequirements,
  driver,
  onRecheckSuccess,
}) => {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const [checking, setChecking] = useState(false);
  const [recheckMessage, setRecheckMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const detected = detectOs(nav?.platform, nav?.userAgent);
  const current = OS_INSTRUCTIONS.find((o) => o.key === detected)!;
  const others = OS_INSTRUCTIONS.filter((o) => o.key !== detected);

  const recheck = async () => {
    setChecking(true);
    setRecheckMessage(null);
    try {
      const env = await (driver ?? getActiveCompilerDriver()).detectEnvironment();
      if (env.available) {
        onRecheckSuccess?.();
        onClose();
      } else {
        setRecheckMessage('TeX Live is still not available. Make sure latexmk and an engine are on your PATH.');
      }
    } catch (e) {
      setRecheckMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  };

  const bg = dark ? '#2b2d30' : '#ffffff';
  const fg = dark ? '#dfe1e5' : '#1f2937';
  const border = dark ? '#323232' : '#d1d5db';
  const codeBg = dark ? '#1e1f22' : '#f3f4f6';

  const renderOs = (os: OsInstructions) => (
    <div>
      {os.steps.map((s) => (
        <p key={s} style={{ margin: '6px 0' }}>{s}</p>
      ))}
      {os.commands.map((c) => (
        <pre key={c} style={{ background: codeBg, border: `1px solid ${border}`, padding: '6px 8px', margin: '4px 0', overflowX: 'auto', fontSize: 12 }}>
          <code>{c}</code>
        </pre>
      ))}
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tex-setup-title"
        style={{ background: bg, color: fg, border: `1px solid ${border}`, borderRadius: 8, width: 560, maxWidth: '92vw', maxHeight: '86vh', overflowY: 'auto', fontSize: 13, boxShadow: '0 12px 32px rgba(0,0,0,0.4)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${border}` }}>
          <AlertTriangle size={16} color="#e5a50a" />
          <h2 id="tex-setup-title" style={{ flex: 1, margin: '0 8px', fontSize: 14, fontWeight: 600 }}>TeX Live setup required</h2>
          <button type="button" aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', color: fg, cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: 16 }}>
          <p style={{ marginTop: 0 }}>Torque needs a TeX distribution with <code>latexmk</code> to compile. Missing:</p>
          <ul data-testid="missing-list">
            {missingRequirements.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <h3 style={{ fontSize: 13, marginBottom: 4 }}>Detected: {current.label}</h3>
          <div data-testid="detected-os">{renderOs(current)}</div>
          <h3 style={{ fontSize: 13, marginBottom: 4 }}>Other platforms</h3>
          {others.map((os) => (
            <details key={os.key} style={{ margin: '4px 0' }}>
              <summary style={{ cursor: 'pointer' }}>{os.label}</summary>
              {renderOs(os)}
            </details>
          ))}
          {recheckMessage && <p role="status" style={{ color: '#e5534b' }}>{recheckMessage}</p>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 16px', borderTop: `1px solid ${border}` }}>
          <button type="button" onClick={onClose} style={{ padding: '4px 12px', background: 'transparent', color: fg, border: `1px solid ${border}`, borderRadius: 4, cursor: 'pointer' }}>
            Dismiss
          </button>
          <button type="button" onClick={recheck} disabled={checking} style={{ padding: '4px 12px', background: '#3574f0', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={12} /> {checking ? 'Checking…' : 'Re-check'}
          </button>
        </div>
      </div>
    </div>
  );
};
