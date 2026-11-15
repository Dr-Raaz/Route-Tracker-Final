import React from 'react';
import { Clock, Moon, Navigation, Settings, Sun } from 'lucide-react';
import type { ThemeMode } from '../types/settings';

export type AppRoute = 'live' | 'history' | 'details' | 'settings';

interface NavShellProps {
  activeRoute: AppRoute;
  isRecording: boolean;
  journeyCount: number;
  theme: ThemeMode;
  onNavigate: (route: 'live' | 'history' | 'settings') => void;
  onToggleTheme: () => void;
  children: React.ReactNode;
}

export const NavShell: React.FC<NavShellProps> = ({
  activeRoute,
  isRecording,
  journeyCount,
  theme,
  onNavigate,
  onToggleTheme,
  children,
}) => {
  const isHistorySection = activeRoute === 'history' || activeRoute === 'details';

  return (
    <div className="h-dvh w-full flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden">
      {/* Desktop Top Bar (3-zone contract) */}
      <header className="hidden md:flex items-center justify-between gap-8 h-14 px-6 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shrink-0 z-30">
        <a
          href="#live"
          onClick={(e) => {
            e.preventDefault();
            onNavigate('live');
          }}
          className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
        >
          Wayline
        </a>

        <nav aria-label="Primary navigation" className="flex items-center gap-7">
          <button
            type="button"
            onClick={() => onNavigate('live')}
            className={`relative min-h-[40px] px-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 ${
              activeRoute === 'live'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <span>Live Track</span>
            {isRecording && (
              <span
                className="w-2 h-2 rounded-full bg-emerald-500"
                title="Recording active"
                aria-label="Recording active"
              />
            )}
            {activeRoute === 'live' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onNavigate('history')}
            className={`relative min-h-[40px] px-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              isHistorySection
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <span>History ({journeyCount})</span>
            {isHistorySection && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className={`relative min-h-[40px] px-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeRoute === 'settings'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <span>Settings</span>
            {activeRoute === 'settings' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />
            )}
          </button>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light map theme' : 'Switch to dark map theme'}
            className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span>{theme === 'dark' ? 'Light Map' : 'Dark Map'}</span>
          </button>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1 min-h-0 relative overflow-hidden pb-16 md:pb-0">
        {children}
      </main>

      {/* Mobile Fixed Thumb-Zone Tab Bar (64px <= 15% of 844px) */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-3 items-center"
      >
        <button
          type="button"
          onClick={() => onNavigate('live')}
          className={`h-full min-h-[44px] flex flex-col items-center justify-center gap-1 transition-colors ${
            activeRoute === 'live'
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <div className="relative">
            <Navigation className="w-5 h-5" />
            {isRecording && (
              <span
                className="absolute -top-0.5 -right-1.5 w-2 h-2 rounded-full bg-emerald-500"
                aria-label="Recording active"
              />
            )}
          </div>
          <span className="text-[11px] font-medium tracking-tight">Live Track</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('history')}
          className={`h-full min-h-[44px] flex flex-col items-center justify-center gap-1 transition-colors ${
            isHistorySection
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Clock className="w-5 h-5" />
          <span className="text-[11px] font-medium tracking-tight">
            History ({journeyCount})
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('settings')}
          className={`h-full min-h-[44px] flex flex-col items-center justify-center gap-1 transition-colors ${
            activeRoute === 'settings'
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Settings className="w-5 h-5" />
          <span className="text-[11px] font-medium tracking-tight">Settings</span>
        </button>
      </nav>
    </div>
  );
};
