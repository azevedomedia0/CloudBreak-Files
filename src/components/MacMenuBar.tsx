import React, { useState, useEffect } from 'react';
import {
  Wifi, ShieldCheck, Search, Battery, Cloud, HardDrive, 
  Lock, Unlock, Sliders, Scissors, Share2, Moon
} from 'lucide-react';

interface MacMenuBarProps {
  onOpenVaultSecurity: () => void;
  isVaultUnlocked: boolean;
  activeAccountName: string;
}

export const MacMenuBar: React.FC<MacMenuBarProps> = ({
  onOpenVaultSecurity,
  isVaultUnlocked,
  activeAccountName,
}) => {
  const [timeString, setTimeString] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeString(
        now.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        }) +
          ' ' +
          now.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 30000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="h-7 w-full px-4 flex items-center justify-between text-[13px] font-medium text-neutral-300 bg-black/40 backdrop-blur-2xl border-b border-white/8 select-none z-40 shrink-0">
      {/* Left Menu Items */}
      <div className="flex items-center gap-4">
        {/* Apple Logo */}
        <span className="text-white hover:text-neutral-300 cursor-pointer text-sm font-semibold pl-1">
          
        </span>
        <span className="font-semibold text-white tracking-tight cursor-pointer">
          Cloudbreak
        </span>
        <div className="hidden sm:flex items-center gap-3.5 text-xs text-neutral-300">
          <span className="hover:text-white cursor-pointer transition-colors">File</span>
          <span className="hover:text-white cursor-pointer transition-colors">Edit</span>
          <span className="hover:text-white cursor-pointer transition-colors">View</span>
          <span className="hover:text-white cursor-pointer transition-colors">Go</span>
          <span className="hover:text-white cursor-pointer transition-colors">Cloud</span>
          <span className="hover:text-white cursor-pointer transition-colors">Window</span>
          <span className="hover:text-white cursor-pointer transition-colors">Help</span>
        </div>
      </div>

      {/* Right System Tray */}
      <div className="flex items-center gap-3 text-xs text-neutral-300">
        {/* E2EE Crypto Shield */}
        <button
          onClick={onOpenVaultSecurity}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-white/10 transition-colors group"
          title="End-to-End Cryptography Engine"
        >
          <span className={`w-1.5 h-1.5 rounded-full ${isVaultUnlocked ? 'bg-cyan-400' : 'bg-amber-400'} animate-pulse`} />
          <span className="font-mono text-[11px] text-neutral-400 group-hover:text-cyan-300 transition-colors">
            {isVaultUnlocked ? 'AES-256 E2EE' : 'Vault Locked'}
          </span>
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
        </button>

        {/* Cloud Sync State */}
        <div className="flex items-center gap-1 text-neutral-400" title={`Connected to ${activeAccountName}`}>
          <Cloud className="w-3.5 h-3.5 text-sky-400" />
          <span className="text-[11px] hidden md:inline">{activeAccountName}</span>
        </div>

        {/* Wi-Fi & Battery */}
        <Wifi className="w-3.5 h-3.5 text-neutral-400" />
        <Battery className="w-4 h-4 text-neutral-400" />

        {/* Dark Mode Indicator */}
        <div 
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/5 border border-white/8 text-[11px] text-neutral-300 select-none shadow-xs"
          title="macOS Obsidian Dark Mode Active"
        >
          <Moon className="w-3 h-3 text-sky-400" />
          <span className="text-[10px] font-medium hidden sm:inline text-neutral-300">Dark</span>
        </div>

        {/* Dynamic Clock */}
        <span className="text-xs font-normal text-neutral-200 pl-1 font-mono">
          {timeString}
        </span>
      </div>
    </div>
  );
};
