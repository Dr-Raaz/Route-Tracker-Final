import React, { useState } from 'react';
import { KeyRound, Mail, ShieldCheck } from 'lucide-react';
import type { AuthState } from '../../services/auth/authState';

interface ProfileAuthCardProps {
  state: AuthState;
  isBusy: boolean;
  onSendOtp: (email: string) => Promise<boolean>;
  onVerifyOtp: (email: string, token: string) => Promise<boolean>;
}

export const ProfileAuthCard: React.FC<ProfileAuthCardProps> = ({
  state,
  isBusy,
  onSendOtp,
  onVerifyOtp,
}) => {
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);

  const handleSendCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await onSendOtp(email)) {
      setSentTo(email.trim());
      setToken('');
    }
  };

  const handleVerify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onVerifyOtp(sentTo ?? email, token);
  };

  return (
    <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4" data-testid="profile-auth-card">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Sign in or create an account</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Use your email to receive a one-time verification code. No password is required.</p>
        </div>
      </div>

      {state.error && (
        <div role="alert" className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-900 dark:text-rose-100">
          {state.error}
        </div>
      )}

      {!sentTo ? (
        <form onSubmit={(event) => void handleSendCode(event)} className="space-y-3">
          <label className="block">
            <span className="block mb-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">Email address</span>
            <span className="relative block">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isBusy}
                placeholder="you@example.com"
                className="w-full min-h-[44px] pl-9 pr-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </span>
          </label>
          <button type="submit" disabled={isBusy} className="min-h-[44px] w-full px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
            {isBusy ? 'Sending code…' : 'Send verification code'}
          </button>
          <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">If this email can sign in, a code will be sent. Your account is not active until the code is verified.</p>
        </form>
      ) : (
        <form onSubmit={(event) => void handleVerify(event)} className="space-y-3">
          <p className="text-xs text-slate-600 dark:text-slate-400">Enter the code sent to <span className="font-medium text-slate-800 dark:text-slate-200">{sentTo}</span>.</p>
          <label className="block">
            <span className="block mb-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">6-digit verification code</span>
            <span className="relative block">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={token}
                onChange={(event) => setToken(event.target.value.replace(/\D/g, '').slice(0, 6))}
                disabled={isBusy}
                placeholder="000000"
                className="w-full min-h-[44px] pl-9 pr-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm tracking-[0.25em] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </span>
          </label>
          <button type="submit" disabled={isBusy || token.length !== 6} className="min-h-[44px] w-full px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
            {isBusy ? 'Verifying…' : 'Verify email and continue'}
          </button>
          <button type="button" disabled={isBusy} onClick={() => { setSentTo(null); setToken(''); }} className="min-h-[40px] w-full text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-50">
            Use a different email or request another code
          </button>
        </form>
      )}
    </section>
  );
};
