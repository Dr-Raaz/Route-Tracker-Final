import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Compass,
  FlaskConical,
  Moon,
  Play,
  Radio,
  Square,
  Sun,
} from 'lucide-react';
import { JourneyMap, type JourneyMapHandle } from '../map/JourneyMap';
import type { TrackingStateSnapshot } from '../../services/gps/TrackingEngine';
import type { Journey } from '../../types/journey';
import type { DistanceUnit, ThemeMode } from '../../types/settings';
import {
  formatDistance,
  formatDurationMs,
  formatSpeed,
  getAccuracyQuality,
} from '../../utils/format';

interface LiveTrackingScreenProps {
  tracking: TrackingStateSnapshot;
  theme: ThemeMode;
  unit: DistanceUnit;
  devTestMode: boolean;
  onToggleTheme: () => void;
  onEnableDevTestMode: () => void;
  onStartTracking: (customName?: string) => Promise<boolean>;
  onStopTracking: (customName?: string) => Promise<Journey | null>;
  onLocateOnce: () => Promise<unknown>;
  onOpenJourney: (journeyId: string) => void;
}

export const LiveTrackingScreen: React.FC<LiveTrackingScreenProps> = ({
  tracking,
  theme,
  unit,
  devTestMode,
  onToggleTheme,
  onEnableDevTestMode,
  onStartTracking,
  onStopTracking,
  onLocateOnce,
  onOpenJourney,
}) => {
  const mapRef = useRef<JourneyMapHandle | null>(null);
  const [followPosition, setFollowPosition] = useState(true);
  const [justSavedJourney, setJustSavedJourney] = useState<Journey | null>(null);
  const [journeyLabel, setJourneyLabel] = useState('');

  const isRecording = tracking.phase === 'recording';
  const isRequesting = tracking.phase === 'requesting-permission';

  const routeCoordinates = useMemo<[number, number][]>(
    () =>
      tracking.filteredPoints.map((p) => [
        p.sample.longitude,
        p.sample.latitude,
      ]),
    [tracking.filteredPoints]
  );

  const startCoord = useMemo(() => {
    const first = tracking.filteredPoints[0]?.sample ?? tracking.rawSamples[0];
    return first
      ? { latitude: first.latitude, longitude: first.longitude }
      : null;
  }, [tracking.filteredPoints, tracking.rawSamples]);

  const currentCoord = useMemo(() => {
    const cur = tracking.latestSample;
    return cur ? { latitude: cur.latitude, longitude: cur.longitude } : null;
  }, [tracking.latestSample]);

  const accuracyInfo = tracking.latestSample
    ? getAccuracyQuality(tracking.latestSample.accuracy)
    : null;

  const handleStart = async () => {
    setJustSavedJourney(null);
    setFollowPosition(true);
    await onStartTracking(journeyLabel.trim() || undefined);
  };

  const handleStop = async () => {
    const saved = await onStopTracking(journeyLabel.trim() || undefined);
    setJourneyLabel('');
    if (saved) {
      setJustSavedJourney(saved);
    }
  };

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      data-testid="live-tracking-screen"
      data-tracking-phase={tracking.phase}
    >
      {/* Full-Screen Interactive Map */}
      <JourneyMap
        ref={mapRef}
        theme={theme}
        mode="live"
        routeCoordinates={routeCoordinates}
        startCoordinate={startCoord}
        currentCoordinate={currentCoord}
        currentAccuracyMeters={tracking.latestSample?.accuracy ?? null}
        followCurrentPosition={followPosition}
      />

      {/* Top Status Strip (unboxed, clean, low visual weight) */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-start justify-between gap-2 pointer-events-none">
        <div className="flex flex-col gap-2 max-w-md pointer-events-auto">
          {/* GPS Accuracy & Signal Indicator */}
          <div className="px-3.5 py-2 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <Radio
                className={`w-3.5 h-3.5 ${
                  isRecording
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              />
              <span className="font-medium text-slate-800 dark:text-slate-100">
                {isRecording
                  ? 'Recording · 5s interval'
                  : isRequesting
                    ? 'Acquiring GPS fix…'
                    : 'GPS Ready'}
              </span>
            </div>

            {accuracyInfo && (
              <>
                <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                  ·
                </span>
                <span
                  className={`font-mono font-medium ${
                    accuracyInfo.tier === 'good'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : accuracyInfo.tier === 'fair'
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-rose-700 dark:text-rose-400'
                  }`}
                >
                  ±{Math.round(tracking.latestSample!.accuracy)} m ({accuracyInfo.tier})
                </span>
              </>
            )}

            {tracking.permissionStatus === 'prompt' && !isRecording && !devTestMode && (
              <button
                type="button"
                onClick={() => void onLocateOnce()}
                className="ml-1 text-blue-600 dark:text-blue-400 font-medium hover:underline whitespace-nowrap"
              >
                Locate me
              </button>
            )}
          </div>

          {/* Development-only GPS Test Mode Notice */}
          {devTestMode && (
            <div className="px-3.5 py-2 rounded-xl bg-amber-50/95 dark:bg-amber-950/90 border border-amber-300 dark:border-amber-700/70 text-amber-900 dark:text-amber-100 shadow-sm flex items-center gap-2 text-xs">
              <FlaskConical className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                Development GPS Test Mode active — recording predefined sample route, not live hardware GPS.
              </span>
            </div>
          )}

          {/* Poor GPS Accuracy Warning */}
          {accuracyInfo?.tier === 'poor' && (
            <div
              role="status"
              className="px-3.5 py-2 rounded-xl bg-amber-50/95 dark:bg-amber-950/90 border border-amber-300 dark:border-amber-700/70 text-amber-900 dark:text-amber-100 shadow-sm flex items-center gap-2 text-xs"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                GPS accuracy is currently poor (±{Math.round(tracking.latestSample!.accuracy)} m). Move to an open sky area for cleaner route lines.
              </span>
            </div>
          )}

          {/* Temporary Signal Loss Warning */}
          {isRecording && tracking.isSignalLost && (
            <div
              role="status"
              className="px-3.5 py-2 rounded-xl bg-amber-50/95 dark:bg-amber-950/90 border border-amber-300 dark:border-amber-700/70 text-amber-900 dark:text-amber-100 shadow-sm flex items-center gap-2 text-xs"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                GPS signal temporarily unavailable. Waiting for next satellite fix without fabricating coordinates.
              </span>
            </div>
          )}

          {/* Permission Denied or GPS Error Explanation */}
          {tracking.error && (
            <div
              role="alert"
              className="px-3.5 py-2.5 rounded-xl bg-rose-50/95 dark:bg-rose-950/90 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-100 shadow-sm text-xs space-y-2"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                <p className="leading-relaxed">{tracking.error.message}</p>
              </div>
              {!devTestMode && (
                <button
                  type="button"
                  onClick={onEnableDevTestMode}
                  className="inline-flex items-center gap-1.5 font-medium text-rose-800 dark:text-rose-200 underline hover:no-underline"
                >
                  <FlaskConical className="w-3.5 h-3.5" />
                  <span>Enable Development GPS Test Mode to try with a sample route</span>
                </button>
              )}
            </div>
          )}

          {/* Saved Confirmation Toast */}
          {justSavedJourney && !isRecording && (
            <div
              role="status"
              className="px-3.5 py-2.5 rounded-xl bg-emerald-50/95 dark:bg-emerald-950/90 border border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-100 shadow-sm flex items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="truncate font-medium">
                  Saved “{justSavedJourney.name}” ({justSavedJourney.sampleCount} samples)
                </span>
              </div>
              <button
                type="button"
                onClick={() => onOpenJourney(justSavedJourney.id)}
                className="font-semibold text-emerald-700 dark:text-emerald-300 hover:underline whitespace-nowrap shrink-0"
              >
                Inspect &amp; Replay
              </button>
            </div>
          )}
        </div>

        {/* Mobile Quick Theme Toggle (desktop already has it in Top Bar) */}
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light map theme' : 'Switch to dark map theme'}
          className="md:hidden pointer-events-auto w-11 h-11 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-center text-slate-700 dark:text-slate-200"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      {/* Bottom Floating Live Telemetry & Control Panel */}
      <div className="absolute bottom-3 left-3 right-3 z-20 flex justify-center pointer-events-none">
        <div className="pointer-events-auto w-full max-w-xl rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-lg p-4">
          {/* Live Telemetry Readout */}
          <div className="grid grid-cols-4 gap-3 pb-3.5 border-b border-slate-200/80 dark:border-slate-800">
            <div>
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Duration
              </div>
              <div
                className="mt-0.5 text-lg sm:text-xl font-semibold font-mono text-slate-900 dark:text-white"
                data-testid="live-duration"
              >
                {formatDurationMs(tracking.elapsedMs)}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Distance
              </div>
              <div
                className="mt-0.5 text-lg sm:text-xl font-semibold font-mono text-slate-900 dark:text-white"
                data-testid="live-distance"
              >
                {formatDistance(tracking.distanceMeters, unit)}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Speed
              </div>
              <div
                className="mt-0.5 text-lg sm:text-xl font-semibold font-mono text-slate-900 dark:text-white"
                data-testid="live-speed"
              >
                {formatSpeed(tracking.currentSpeedMps, unit)}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Samples
              </div>
              <div
                className="mt-0.5 text-lg sm:text-xl font-semibold font-mono text-slate-900 dark:text-white"
                data-testid="live-samples"
              >
                {tracking.rawSamples.length}
              </div>
            </div>
          </div>

          {/* Controls Row */}
          <div className="pt-3.5 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <input
              type="text"
              value={journeyLabel}
              onChange={(e) => setJourneyLabel(e.target.value)}
              placeholder={
                isRecording
                  ? tracking.activeJourneyName ?? 'Name this journey…'
                  : 'Optional journey title…'
              }
              aria-label="Journey title"
              className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-transparent focus:border-blue-600 focus:bg-white dark:focus:bg-slate-900 outline-none text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-colors"
            />

            {!isRecording ? (
              <button
                type="button"
                onClick={() => void handleStart()}
                disabled={isRequesting}
                className="min-h-[48px] px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 shadow-sm"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{isRequesting ? 'Starting GPS…' : 'Start Tracking'}</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setFollowPosition((prev) => !prev)}
                  aria-pressed={followPosition}
                  aria-label="Toggle auto-follow current location"
                  className={`min-h-[48px] px-3.5 py-2 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    followPosition
                      ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                      : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Compass className="w-4 h-4" />
                  <span>{followPosition ? 'Following' : 'Free Pan'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleStop()}
                  className="min-h-[48px] px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 shadow-sm"
                >
                  <Square className="w-4 h-4 fill-current" />
                  <span>Stop &amp; Save</span>
                </button>
              </div>
            )}
          </div>

          {/* Honest Browser Background Tracking Notice */}
          {isRecording && (
            <p className="mt-2.5 text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
              Web tracking continues across screens while this browser tab stays active. Reliable background GPS with the screen locked requires the native Android Capacitor app.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
