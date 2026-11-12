import React, { useEffect } from 'react';
import Image from 'next/image';
import { useThemeSafe } from '../context/ThemeContext';
import { APP_VERSION, APP_NAME } from '../version';
import { X } from 'lucide-react';

export interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  const { theme } = useThemeSafe();
  const isDark = theme === 'dark';

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-[380px] max-w-[95vw] rounded-lg shadow-2xl border flex flex-col overflow-hidden font-sans ${
          isDark
            ? 'bg-[#2b2d30] border-[#43454a] text-[#dfe1e5]'
            : 'bg-white border-[#d1d5db] text-[#1f2328]'
        }`}
        style={{ colorScheme: isDark ? 'dark' : 'light' }}
      >
        {/* IntelliJ Dialog Header */}
        <div
          className={`flex items-center justify-between px-4 py-2.5 border-b shrink-0 ${
            isDark ? 'border-[#393b40] bg-[#26282b]' : 'border-[#ebecf0] bg-[#f7f8fa]'
          }`}
        >
          <span className="text-xs font-semibold tracking-wide" id="about-dialog-title">
            About {APP_NAME}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className={`p-1 rounded transition cursor-pointer ${
              isDark
                ? 'text-[#c2c5cc] hover:text-white hover:bg-[#393b40]'
                : 'text-[#6c707e] hover:text-[#1f2328] hover:bg-[#dfe1e5]'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Dialog Body */}
        <div className="p-6 flex flex-col items-center text-center gap-3">
          <div className="w-16 h-16 rounded-xl flex items-center justify-center shrink-0 p-2 shadow-sm border border-black/10 bg-gradient-to-br from-[#3574f0]/10 to-[#3574f0]/5">
            <Image
              src="/icon.png"
              alt="Torque Logo"
              width={56}
              height={56}
              className="w-full h-full object-contain drop-shadow-sm"
            />
          </div>

          <div className="flex flex-col items-center">
            <h1 className="text-xl font-bold tracking-tight">{APP_NAME}</h1>
            <p className="text-xs font-mono text-[#868a91] mt-0.5">{APP_VERSION}</p>
          </div>

          <p className="text-xs opacity-75 max-w-[280px]">
            High-Performance LaTeX IDE
          </p>
        </div>

        {/* Footer Actions */}
        <div
          className={`px-4 py-3 border-t flex items-center justify-end ${
            isDark ? 'border-[#393b40] bg-[#26282b]/50' : 'border-[#ebecf0] bg-[#f7f8fa]/50'
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded text-xs font-semibold bg-[#3574f0] text-white hover:bg-[#3068d9] transition shadow-sm cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
