import React, { useState } from 'react';
import { CheckCircle2, UserRound } from 'lucide-react';
import type { ProfileRow } from '../../services/supabase/database.types';
import { validateUsername } from '../../utils/username';

interface ProfileEditorProps {
  profile?: ProfileRow | null;
  email: string | null;
  isBusy: boolean;
  error: string | null;
  onSave: (values: { username: string; displayName: string }) => Promise<boolean>;
  onCancel?: () => void;
}

export const ProfileEditor: React.FC<ProfileEditorProps> = ({
  profile,
  email,
  isBusy,
  error,
  onSave,
  onCancel,
}) => {
  const [username, setUsername] = useState(profile?.username ?? '');
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateUsername(username);
    if (!validation.valid) {
      setValidationError(validation.error);
      return;
    }
    setValidationError(null);
    await onSave({ username: validation.normalized, displayName });
  };

  const usernameValidation = username ? validateUsername(username) : null;

  return (
    <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4" data-testid="profile-editor">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
          <UserRound className="w-5 h-5" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{profile ? 'Edit your profile' : 'Choose your username'}</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Your email has been verified. Your username will be unique and shown to people you connect with.</p>
        </div>
      </div>

      {(error || validationError) && (
        <div role="alert" className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-900 dark:text-rose-100">
          {validationError ?? error}
        </div>
      )}

      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-3">
        <label className="block">
          <span className="block mb-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">Username</span>
          <input
            type="text"
            autoComplete="username"
            minLength={3}
            maxLength={24}
            required
            value={username}
            onChange={(event) => { setUsername(event.target.value); setValidationError(null); }}
            disabled={isBusy}
            placeholder="trail_rider"
            aria-invalid={Boolean(usernameValidation && !usernameValidation.valid)}
            className="w-full min-h-[44px] px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
          <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">3–24 ASCII letters, numbers, or underscores. Stored in lowercase.</span>
          {usernameValidation?.valid && username !== usernameValidation.normalized && (
            <span className="mt-1 block text-[11px] text-blue-700 dark:text-blue-300">Your username will be saved as <strong>{usernameValidation.normalized}</strong>.</span>
          )}
        </label>

        <label className="block">
          <span className="block mb-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">Display name <span className="font-normal text-slate-400">(optional)</span></span>
          <input
            type="text"
            autoComplete="name"
            maxLength={60}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            disabled={isBusy}
            placeholder="How friends will see you"
            className="w-full min-h-[44px] px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </label>

        {email && (
          <div className="py-2 border-t border-slate-100 dark:border-slate-800">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Verified email</p>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{email}</p>
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
          {onCancel && (
            <button type="button" disabled={isBusy} onClick={onCancel} className="min-h-[44px] px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-800 dark:text-slate-100 text-xs font-medium transition-colors">Cancel</button>
          )}
          <button type="submit" disabled={isBusy} className="min-h-[44px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors">
            <CheckCircle2 className="w-4 h-4" />
            {isBusy ? 'Saving profile…' : profile ? 'Save Profile' : 'Create Profile'}
          </button>
        </div>
      </form>
    </section>
  );
};
