import React from 'react';
import { Search, ShieldCheck, UserPlus, UsersRound } from 'lucide-react';

export const ConnectFriendsScreen: React.FC = () => (
  <div className="h-full w-full overflow-y-auto bg-slate-50 dark:bg-slate-950" data-testid="connect-friends-screen">
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Connect Friends</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Find people you know and choose separately if you want to share your location.
        </p>
      </div>

      <div role="status" className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-sm text-blue-950 dark:text-blue-100 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
        <div>
          <p className="font-semibold">Friend accounts are not connected yet</p>
          <p className="mt-1 text-blue-900/80 dark:text-blue-100/80">This screen is ready for account-backed friend requests. No search, invitation, or location sharing is active in this version.</p>
        </div>
      </div>

      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Find by username</h2>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <label className="relative flex-1">
            <span className="sr-only">Search by unique username</span>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="search"
              disabled
              placeholder="Username search will be available with accounts"
              className="w-full min-h-[44px] pl-9 pr-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-500 dark:text-slate-400 placeholder:text-slate-400 disabled:cursor-not-allowed"
            />
          </label>
          <button type="button" disabled className="min-h-[44px] px-5 rounded-xl bg-blue-600 text-white text-sm font-semibold opacity-50 cursor-not-allowed">
            Search
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">Searching will reveal only limited profile information. Adding a friend will never enable location sharing by itself.</p>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Friend requests</h2>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">Not connected</span>
          </div>
          <div className="p-8 text-center">
            <div className="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
              <UserPlus className="w-5 h-5" />
            </div>
            <p className="mt-3 text-sm font-medium text-slate-800 dark:text-slate-100">Requests will appear here</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Connect an account to send or receive friend requests.</p>
          </div>
        </section>

        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <UsersRound className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Your friends</h2>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">Not connected</span>
          </div>
          <div className="p-8 text-center">
            <div className="w-11 h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center mx-auto">
              <UsersRound className="w-5 h-5" />
            </div>
            <p className="mt-3 text-sm font-medium text-slate-800 dark:text-slate-100">Friends will appear here</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Accepted connections will appear here. Location sharing always requires separate consent.</p>
          </div>
        </section>
      </div>
    </div>
  </div>
);
