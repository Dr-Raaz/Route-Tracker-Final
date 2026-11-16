import React from 'react';
import {
  Clock,
  MessageCircle,
  Moon,
  Navigation,
  Sun,
  UserRound,
  UsersRound,
} from 'lucide-react';
import type { ThemeMode } from '../types/settings';

export type AppRoute =
  | 'live'
  | 'history'
  | 'details'
  | 'conversation'
  | 'chat'
  | 'friends'
  | 'profile';

type MainRoute = 'live' | 'history' | 'chat' | 'friends' | 'profile';

interface NavShellProps {
  activeRoute: AppRoute;
  isRecording: boolean;
  journeyCount: number;
  theme: ThemeMode;
  onNavigate: (route: MainRoute) => void;
  onToggleTheme: () => void;
  children: React.ReactNode;
}

const mobileNavItems: Array<{
  route: MainRoute;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { route: 'live', label: 'Live', icon: Navigation },
  { route: 'history', label: 'History', icon: Clock },
  { route: 'chat', label: 'Chat', icon: MessageCircle },
  { route: 'friends', label: 'Friends', icon: UsersRound },
  { route: 'profile', label: 'Profile', icon: UserRound },
];

export const NavShell: React.FC<NavShellProps> = ({
  activeRoute,
  isRecording,
  journeyCount,
  theme,
  onNavigate,
  onToggleTheme,
  children,
}) => {
  const selectedRoute = activeRoute === 'details'
    ? 'history'
    : activeRoute === 'conversation'
      ? 'chat'
      : activeRoute;
  const navButtonClass = (route: MainRoute) =>
    `relative min-h-[40px] px-1 text-xs lg:text-sm font-medium transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 ${
      selectedRoute === route
        ? 'text-blue-600 dark:text-blue-400'
        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
    }`;

  return (
    <div className="h-dvh w-full flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden">
      {/* Desktop Top Bar */}
      <header className="hidden md:flex items-center justify-between gap-3 lg:gap-8 h-14 px-4 lg:px-6 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shrink-0 z-30">
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

        <nav aria-label="Primary navigation" className="flex flex-1 justify-center items-center gap-2 lg:gap-7 min-w-0">
          <button type="button" onClick={() => onNavigate('live')} className={navButtonClass('live')}>
            <span>Live Track</span>
            {isRecording && (
              <span className="w-2 h-2 rounded-full bg-emerald-500" title="Recording active" aria-label="Recording active" />
            )}
            {selectedRoute === 'live' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />}
          </button>
          <button type="button" onClick={() => onNavigate('history')} className={navButtonClass('history')}>
            <span>History ({journeyCount})</span>
            {selectedRoute === 'history' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />}
          </button>
          <button type="button" onClick={() => onNavigate('chat')} className={navButtonClass('chat')}>
            <span>Chat</span>
            {selectedRoute === 'chat' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />}
          </button>
          <button type="button" onClick={() => onNavigate('friends')} className={navButtonClass('friends')}>
            <span>Connect Friends</span>
            {selectedRoute === 'friends' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />}
          </button>
          <button type="button" onClick={() => onNavigate('profile')} className={navButtonClass('profile')}>
            <span>My Profile</span>
            {selectedRoute === 'profile' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />}
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

      <main className="flex-1 min-h-0 relative overflow-hidden pb-16 md:pb-0">
        {children}
      </main>

      {/* Five equal-width, full-height touch targets retain the existing 64px mobile bar. */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 items-center"
      >
        {mobileNavItems.map(({ route, label, icon: Icon }) => (
          <button
            key={route}
            type="button"
            onClick={() => onNavigate(route)}
            aria-label={route === 'history' ? `History, ${journeyCount} journeys` : route === 'live' ? 'Live Track' : route === 'friends' ? 'Connect Friends' : route === 'profile' ? 'My Profile' : 'Chat'}
            aria-current={selectedRoute === route ? 'page' : undefined}
            className={`h-full min-h-[44px] min-w-0 flex flex-col items-center justify-center gap-0.5 transition-colors ${
              selectedRoute === route
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <span className="relative flex items-center justify-center h-5">
              <Icon className="w-[18px] h-[18px]" />
              {route === 'live' && isRecording && (
                <span className="absolute -top-0.5 -right-1.5 w-2 h-2 rounded-full bg-emerald-500" aria-label="Recording active" />
              )}
            </span>
            <span className="max-w-full truncate px-0.5 text-[9px] min-[360px]:text-[10px] font-medium tracking-tight">
              {label}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
};
