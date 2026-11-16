import React, { useRef, useState } from 'react';
import {
  CheckCircle2,
  FlaskConical,
  HardDrive,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
} from 'lucide-react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import type { AppSettings, DistanceUnit, ThemeMode } from '../../types/settings';

interface SettingsScreenProps {
  settings: AppSettings;
  journeyCount: number;
  isRecording: boolean;
  persistenceError: string | null;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onImportGpxFile: (xmlText: string, fileName: string) => Promise<void>;
  onClearAllData: () => Promise<void>;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  settings,
  journeyCount,
  isRecording,
  persistenceError,
  onUpdateSettings,
  onImportGpxFile,
  onClearAllData,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const text = await file.text();
      await onImportGpxFile(text, file.name);
      setStatusMsg(`Imported "${file.name}" into local IndexedDB storage.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to import GPX file.');
    }
  };

  return (
    <div
      className="h-full w-full overflow-y-auto bg-slate-50 dark:bg-slate-950"
      data-testid="settings-screen"
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Settings &amp; Local Storage
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Privacy-first configuration. All location data remains exclusively on this device.
          </p>
        </div>

        {statusMsg && (
          <div
            role="status"
            className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-900 dark:text-emerald-100 flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{statusMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-sm text-rose-900 dark:text-rose-100"
          >
            {errorMsg}
          </div>
        )}

        {persistenceError && (
          <div role="alert" className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-sm text-rose-900 dark:text-rose-100">
            Settings could not be saved to local storage: {persistenceError}
          </div>
        )}

        {/* Display & Units */}
        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
          <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Map &amp; Interface Theme
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Switches between OpenStreetMap light tiles and CARTO dark tiles.
              </p>
            </div>
            <div
              className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 self-start sm:self-center"
              role="group"
              aria-label="Map theme"
            >
              {(['light', 'dark'] as ThemeMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onUpdateSettings({ theme: mode })}
                  aria-pressed={settings.theme === mode}
                  className={`min-h-[38px] px-4 rounded-lg text-xs font-medium capitalize transition-colors ${
                    settings.theme === mode
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Measurement Units
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Choose metric (km, km/h) or imperial (mi, mph) for distance and speed readouts.
              </p>
            </div>
            <div
              className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 self-start sm:self-center"
              role="group"
              aria-label="Measurement units"
            >
              {([
                { id: 'km', label: 'Metric (km)' },
                { id: 'mi', label: 'Imperial (mi)' },
              ] as Array<{ id: DistanceUnit; label: string }>).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onUpdateSettings({ unit: item.id })}
                  aria-pressed={settings.unit === item.id}
                  className={`min-h-[38px] px-3.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    settings.unit === item.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Development-Only GPS Test Mode */}
        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Development GPS Test Mode
                </h2>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-xl">
                For testing when real GPS hardware is unavailable. Emits a predefined coastal sample route with 5-second spaced timestamps. Recordings created in this mode are explicitly tagged as Development Test Routes.
              </p>
              {isRecording && (
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                  Stop the active tracking session before changing GPS provider mode.
                </p>
              )}
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={settings.devTestMode}
              disabled={isRecording}
              onClick={() => onUpdateSettings({ devTestMode: !settings.devTestMode })}
              className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 ${
                settings.devTestMode
                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100'
              }`}
            >
              {settings.devTestMode ? 'Test Mode: ON' : 'Test Mode: OFF'}
            </button>
          </div>
        </section>

        {/* Local Storage & GPX Management */}
        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Local IndexedDB Data ({journeyCount} {journeyCount === 1 ? 'journey' : 'journeys'})
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".gpx,application/gpx+xml,text/xml"
              onChange={(e) => void handleImport(e)}
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-medium flex items-center gap-2 transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span>Import GPX Track</span>
            </button>

            <button
              type="button"
              disabled={journeyCount === 0 || isRecording}
              onClick={() => setConfirmClearOpen(true)}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-950/80 disabled:opacity-40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/70 text-xs font-medium flex items-center gap-2 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>Clear All Local Data</span>
            </button>
          </div>
        </section>

        {/* Privacy & Native Android Readiness */}
        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-slate-700 dark:text-slate-300" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Web Capabilities &amp; Android Capacitor Readiness
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5">
              <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Implemented in Web App</span>
              </div>
              <ul className="space-y-1 text-slate-600 dark:text-slate-400 list-disc pl-4">
                <li>Browser Geolocation API with ~5s target sample interval</li>
                <li>Persistent IndexedDB storage &amp; crash recovery</li>
                <li>Offline GPS recording &amp; geospatial calculations</li>
                <li>GPX 1.1 export and import with timestamps</li>
                <li>Timestamp-driven playback &amp; multi-visit inspection</li>
              </ul>
            </div>

            <div className="space-y-1.5">
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                Requires Native Android (Capacitor)
              </div>
              <ul className="space-y-1 text-slate-600 dark:text-slate-400 list-disc pl-4">
                <li>Guaranteed locked-screen background GPS tracking</li>
                <li>Persistent Android foreground service notification</li>
                <li>Native Android background location permission prompts</li>
                <li>Battery optimization exemption requests</li>
                <li>Offline raster tile pack caching on device storage</li>
              </ul>
            </div>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={confirmClearOpen}
        title="Clear all local journey data?"
        description={`This will permanently erase all ${journeyCount} saved journeys and their GPS samples from IndexedDB on this browser. Export any journeys you want to keep as GPX first.`}
        confirmLabel="Clear All Data"
        destructive
        onCancel={() => setConfirmClearOpen(false)}
        onConfirm={() => {
          setConfirmClearOpen(false);
          setErrorMsg(null);
          void onClearAllData().then(() => {
            setStatusMsg('All local journey data has been cleared.');
          }).catch((err) => {
            setErrorMsg(err instanceof Error ? err.message : 'Could not clear local journey data.');
          });
        }}
      />
    </div>
  );
};
