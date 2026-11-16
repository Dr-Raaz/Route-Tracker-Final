import React from 'react';
import { ArrowLeft, MapPin, MessageCircle, Send, ShieldCheck } from 'lucide-react';

interface ConversationScreenProps {
  onBack?: () => void;
}

export const ConversationScreen: React.FC<ConversationScreenProps> = ({ onBack }) => {
  const conversation = (
    <section className="min-h-[320px] h-full rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden" aria-label="Conversation">
    <div className="min-h-[68px] px-4 sm:px-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center shrink-0">
          <MessageCircle className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Conversation</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Choose a friend to begin</p>
        </div>
      </div>
      <button type="button" disabled title="Location sharing requests will be available with accounts" className="min-h-[40px] px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-medium flex items-center gap-2 opacity-60 cursor-not-allowed shrink-0">
        <MapPin className="w-4 h-4" />
        <span className="hidden sm:inline">Request location</span>
      </button>
    </div>

    <div className="flex-1 min-h-[180px] flex items-center justify-center p-6 text-center">
      <div className="max-w-xs">
        <div className="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
          <MessageCircle className="w-5 h-5" />
        </div>
        <p className="mt-3 text-sm font-medium text-slate-800 dark:text-slate-100">No conversation selected</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Messages and location-sharing requests will be available after account and friend services are connected.</p>
      </div>
    </div>

    <div className="p-3 sm:p-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
      <div role="status" className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
        <span>Location sharing is separate from messaging and will always require explicit consent.</span>
      </div>
      <div className="flex items-center gap-2">
        <input disabled aria-label="Message" placeholder="Messages are not available yet" className="min-w-0 flex-1 min-h-[44px] px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-500 dark:text-slate-400 placeholder:text-slate-400 disabled:cursor-not-allowed" />
        <button type="button" disabled aria-label="Send message" className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center opacity-50 cursor-not-allowed">
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
    </section>
  );

  if (!onBack) return conversation;

  return (
    <div className="h-full w-full overflow-y-auto bg-slate-50 dark:bg-slate-950" data-testid="conversation-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4 h-full flex flex-col">
        <button type="button" onClick={onBack} className="min-h-[40px] px-1 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 flex items-center gap-2 transition-colors self-start">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Chat</span>
        </button>
        <div className="flex-1 min-h-0">{conversation}</div>
      </div>
    </div>
  );
};
