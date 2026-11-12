import React from 'react';
import Image from 'next/image';
import { APP_VERSION, APP_NAME } from '../version';

export interface SplashScreenProps {
  statusMessage?: string;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  statusMessage = 'Loading Torque...',
}) => {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#141517] select-none"
    >
      <div className="relative w-[640px] max-w-[92vw] aspect-[1672/941] rounded-xl overflow-hidden shadow-2xl border border-white/10 bg-[#1e1f22] flex flex-col justify-end">
        {/* Splash Image */}
        <Image
          src="/splash.png"
          alt="Torque Splash Screen"
          fill
          priority
          sizes="(max-width: 640px) 92vw, 640px"
          className="object-cover"
        />

        {/* Bottom Loading Bar & Status Overlay */}
        <div className="relative z-10 w-full px-5 py-3.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex flex-col gap-2">
          <div className="flex items-center justify-between text-[11px] font-mono text-[#c2c5cc]">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3574f0] animate-pulse" />
              <span>{statusMessage}</span>
            </span>
            <span className="opacity-70">{APP_NAME} {APP_VERSION}</span>
          </div>

          {/* IntelliJ-style Slim Progress Bar */}
          <div className="w-full h-1 bg-white/15 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#3574f0] via-[#5b8def] to-[#3574f0] rounded-full animate-indeterminate"
              style={{
                width: '45%',
                animation: 'indeterminate 1.4s infinite ease-in-out',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
