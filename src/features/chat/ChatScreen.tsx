import React from 'react';
import { Clock, MessageCircle, Search } from 'lucide-react';
import { ConversationScreen } from './ConversationScreen';

interface ChatScreenProps {
  onOpenConversation: () => void;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({ onOpenConversation }) => (
  <div className="h-full w-full overflow-y-auto bg-slate-50 dark:bg-slate-950" data-testid="chat-screen">
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 h-full flex flex-col">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Chat</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Conversations with your connected friends.</p>
      </div>

      <div role="status" className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-sm text-blue-950 dark:text-blue-100 flex items-start gap-3">
        <MessageCircle className="w-5 h-5 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
        <div>
          <p className="font-semibold">Messaging is not connected yet</p>
          <p className="mt-1 text-blue-900/80 dark:text-blue-100/80">This screen shows the planned conversation layout. No messages or conversations are being stored or sent.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)] gap-4 flex-1 min-h-[420px]">
        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Conversations</h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">Not connected</span>
          </div>
          <label className="p-3 relative">
            <span className="sr-only">Search conversations</span>
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input disabled type="search" placeholder="Search conversations" className="w-full min-h-[40px] pl-9 pr-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 placeholder:text-slate-400 disabled:cursor-not-allowed" />
          </label>
          <div className="flex-1 flex items-center justify-center p-6 text-center">
            <div>
              <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center mx-auto">
                <Clock className="w-5 h-5" />
              </div>
              <p className="mt-3 text-sm font-medium text-slate-800 dark:text-slate-100">No conversations yet</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Your chats with friends will appear here.</p>
              <button type="button" onClick={onOpenConversation} className="mt-4 min-h-[40px] px-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors">
                View conversation layout
              </button>
            </div>
          </div>
        </section>

        <ConversationScreen />
      </div>
    </div>
  </div>
);
