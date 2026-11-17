import React, { useState } from 'react';
import {
  ArrowLeft,
  Bell,
  ChevronRight,
  CircleUserRound,
  LogOut,
  MapPin,
  Pencil,
  Settings as SettingsIcon,
  ShieldCheck,
} from 'lucide-react';
import { SettingsScreen } from '../settings/SettingsScreen';
import { ProfileAuthCard } from './ProfileAuthCard';
import { ProfileEditor } from './ProfileEditor';
import type { AuthState } from '../../services/auth/authState';
import type { TrackingStateSnapshot } from '../../services/gps/TrackingEngine';
import type { GpsPermissionStatus } from '../../types/gps';
import type { AppSettings } from '../../types/settings';

type ProfileSection = 'overview' | 'settings' | 'privacy' | 'sharing' | 'notifications';

interface MyProfileScreenProps {
  settings: AppSettings;
  journeyCount: number;
  tracking: TrackingStateSnapshot;
  persistenceError: string | null;
  auth: AuthState;
  authBusy: boolean;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onImportGpxFile: (xmlText: string, fileName: string) => Promise<void>;
  onClearAllData: () => Promise<void>;
  onSendOtp: (email: string) => Promise<boolean>;
  onVerifyOtp: (email: string, token: string) => Promise<boolean>;
  onSaveProfile: (profile: { username: string; displayName: string }) => Promise<boolean>;
  onSignOut: () => Promise<boolean>;
  onRetryProfileLoad: () => Promise<boolean>;
}

const comingSoonCopy = 'This account feature will be available when profile services are connected.';

const PreferenceRow: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  onClick: () => void;
}> = ({ icon: Icon, title, description, onClick }) => (
  <button type="button" onClick={onClick} className="w-full min-h-[72px] p-4 flex items-center gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
    <span className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
      <Icon className="w-4 h-4" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-semibold text-slate-900 dark:text-white">{title}</span>
      <span className="block mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</span>
    </span>
    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
  </button>
);

function ProfileSubsection({ section, onBack, permissionStatus }: {
  section: Exclude<ProfileSection, 'overview' | 'settings'>;
  onBack: () => void;
  permissionStatus: GpsPermissionStatus;
}) {
  const content = {
    privacy: {
      title: 'Privacy & Permissions',
      description: 'Review device permissions and how location information is used.',
      icon: ShieldCheck,
    },
    sharing: {
      title: 'Location Sharing Settings',
      description: 'Choose who can see your location and when sharing is active.',
      icon: MapPin,
    },
    notifications: {
      title: 'Notifications',
      description: 'Manage friend requests and conversation notifications.',
      icon: Bell,
    },
  }[section];
  const Icon = content.icon;

  return (
    <div className="h-full w-full overflow-y-auto bg-slate-50 dark:bg-slate-950" data-testid={`profile-${section}-screen`}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <div>
          <button type="button" onClick={onBack} className="mb-3 min-h-[40px] px-1 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 flex items-center gap-2 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span>Back to My Profile</span>
          </button>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{content.title}</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{content.description}</p>
        </div>

        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{section === 'privacy' ? 'Device location permission' : section === 'sharing' ? 'Sharing status' : 'Notification preferences'}</h2>
          </div>
          {section === 'privacy' ? (
            <>
              <div className="flex items-center justify-between gap-4 py-2">
                <span className="text-xs text-slate-600 dark:text-slate-400">Browser location permission</span>
                <span className="text-xs font-medium capitalize text-slate-800 dark:text-slate-100">{permissionStatus}</span>
              </div>
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">Route Tracker requests location only when you use locate or start recording. Browser permission controls are managed by your browser.</p>
            </>
          ) : (
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{section === 'sharing' ? 'Location sharing is not connected in this version. No friend can see your location through Route Tracker.' : comingSoonCopy}</p>
          )}
          {section !== 'privacy' && (
            <button type="button" disabled className="min-h-[40px] px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-medium opacity-60 cursor-not-allowed">
              {section === 'sharing' ? 'Sharing controls unavailable' : 'Notification controls unavailable'}
            </button>
          )}
        </section>
      </div>
    </div>
  );
}

export const MyProfileScreen: React.FC<MyProfileScreenProps> = ({
  settings,
  journeyCount,
  tracking,
  persistenceError,
  auth,
  authBusy,
  onUpdateSettings,
  onImportGpxFile,
  onClearAllData,
  onSendOtp,
  onVerifyOtp,
  onSaveProfile,
  onSignOut,
  onRetryProfileLoad,
}) => {
  const [section, setSection] = useState<ProfileSection>('overview');
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  if (section === 'settings') {
    return (
      <SettingsScreen
        settings={settings}
        journeyCount={journeyCount}
        isRecording={tracking.activeJourneyId !== null || tracking.phase === 'requesting-permission'}
        persistenceError={persistenceError}
        onUpdateSettings={onUpdateSettings}
        onImportGpxFile={onImportGpxFile}
        onClearAllData={onClearAllData}
        onBack={() => setSection('overview')}
      />
    );
  }

  if (section !== 'overview') {
    return <ProfileSubsection section={section} onBack={() => setSection('overview')} permissionStatus={tracking.permissionStatus} />;
  }

  const saveProfile = async (profile: { username: string; displayName: string }) => {
    const saved = await onSaveProfile(profile);
    if (saved) setIsEditingProfile(false);
    return saved;
  };

  return (
    <div className="h-full w-full overflow-y-auto bg-slate-50 dark:bg-slate-950" data-testid="my-profile-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">My Profile</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Your account and app preferences.</p>
        </div>

        {auth.phase === 'configuration-error' && (
          <div role="alert" className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-sm text-rose-900 dark:text-rose-100" data-testid="auth-configuration-error">
            {auth.error}
          </div>
        )}

        {auth.phase === 'loading' && (
          <div role="status" className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 text-sm text-slate-600 dark:text-slate-400">
            Restoring your sign-in and profile…
          </div>
        )}

        {auth.phase === 'error' && auth.userId && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
            <div role="alert" className="text-sm text-rose-800 dark:text-rose-200">{auth.error}</div>
            <button type="button" disabled={authBusy} onClick={() => void onRetryProfileLoad()} className="min-h-[40px] px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-800 dark:text-slate-100 text-xs font-medium transition-colors">Retry profile load</button>
          </div>
        )}

        {auth.phase === 'error' && !auth.userId && (
          <ProfileAuthCard state={auth} isBusy={authBusy} onSendOtp={onSendOtp} onVerifyOtp={onVerifyOtp} />
        )}

        {auth.phase === 'signed-out' && (
          <ProfileAuthCard state={auth} isBusy={authBusy} onSendOtp={onSendOtp} onVerifyOtp={onVerifyOtp} />
        )}

        {auth.phase === 'profile-setup' && (
          <ProfileEditor email={auth.email} isBusy={authBusy} error={auth.error} onSave={saveProfile} />
        )}

        {auth.phase === 'authenticated' && isEditingProfile && auth.profile && (
          <ProfileEditor profile={auth.profile} email={auth.email} isBusy={authBusy} error={auth.error} onSave={saveProfile} onCancel={() => setIsEditingProfile(false)} />
        )}

        {auth.phase !== 'loading' && auth.phase !== 'configuration-error' && auth.phase !== 'profile-setup' && auth.phase !== 'error' && auth.phase !== 'authenticated' && (
          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900 flex items-center justify-center shrink-0" aria-label="Profile picture not set">
              <CircleUserRound className="w-9 h-9" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Local profile</h2>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">No account is connected</p>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">Local only</span>
          </div>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-slate-100 dark:border-slate-800 pt-4">
            <div><p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Display name</p><p className="mt-1 text-sm text-slate-700 dark:text-slate-200">Not set</p></div>
            <div><p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Username</p><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Available with accounts</p></div>
            <div><p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Email</p><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Not connected</p></div>
          </div>
          </section>
        )}

        {auth.phase === 'authenticated' && auth.profile && !isEditingProfile && (
          <>
            <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900 flex items-center justify-center shrink-0" aria-label="Profile picture not set">
                  <CircleUserRound className="w-9 h-9" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{auth.profile.display_name || auth.profile.username}</h2>
                  <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">@{auth.profile.username}</p>
                </div>
                <button type="button" onClick={() => setIsEditingProfile(true)} className="min-h-[40px] px-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center justify-center gap-2 transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                  Edit Profile
                </button>
              </div>
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-slate-100 dark:border-slate-800 pt-4">
                <div><p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Display name</p><p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{auth.profile.display_name || 'Not set'}</p></div>
                <div><p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Username</p><p className="mt-1 text-sm text-slate-700 dark:text-slate-200">@{auth.profile.username}</p></div>
                <div><p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Email</p><p className="mt-1 text-sm text-slate-700 dark:text-slate-200 break-all">{auth.email || 'Verified account'}</p></div>
              </div>
            </section>
            {auth.error && <div role="alert" className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-sm text-rose-900 dark:text-rose-100">{auth.error}</div>}
          </>
        )}

        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden" aria-label="Profile and application settings">
          <PreferenceRow icon={SettingsIcon} title="Settings" description="Map theme, units, local journeys, and GPX data" onClick={() => setSection('settings')} />
          <PreferenceRow icon={ShieldCheck} title="Privacy & Permissions" description="Device location permission and privacy information" onClick={() => setSection('privacy')} />
          <PreferenceRow icon={MapPin} title="Location Sharing Settings" description="Sharing controls will be available with Connect Friends" onClick={() => setSection('sharing')} />
          <PreferenceRow icon={Bell} title="Notifications" description="Friend and message notifications will be available with accounts" onClick={() => setSection('notifications')} />
        </section>

        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <LogOut className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Log Out</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{auth.userId ? 'Sign out of this Route Tracker account.' : 'No account is signed in on this device.'}</p>
            </div>
          </div>
          <button type="button" disabled={!auth.userId || authBusy || auth.phase === 'configuration-error'} onClick={() => void onSignOut()} className="min-h-[40px] px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-60 text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors">{authBusy ? 'Working…' : auth.userId ? 'Log Out' : 'Unavailable'}</button>
        </section>
      </div>
    </div>
  );
};
