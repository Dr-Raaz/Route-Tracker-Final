import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Download,
  Info,
  Trash2,
} from 'lucide-react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { JourneyMap, type JourneyMapHandle } from '../map/JourneyMap';
import type {
  GeoCoordinate,
  Journey,
  PlaybackSpeed,
  RouteInspectionResult,
} from '../../types/journey';
import type { DistanceUnit, ThemeMode } from '../../types/settings';
import {
  formatDateTimeFull,
  formatDistance,
  formatDurationMs,
  formatSpeed,
} from '../../utils/format';
import {
  buildFilteredRoutePoints,
  inspectRouteAtCoordinate,
} from '../../utils/geo';
import { getPlaybackFrameAtElapsed } from '../../utils/playback';
import { CURRENT_STATISTICS_VERSION } from '../../utils/journeyStats';
import { PlaybackControls } from './PlaybackControls';
import { RouteInspectorPopup } from './RouteInspectorPopup';

interface JourneyDetailsScreenProps {
  journeyId: string;
  theme: ThemeMode;
  unit: DistanceUnit;
  loadJourney: (id: string) => Promise<Journey | null>;
  onBack: () => void;
  onExportGpx: (id: string) => Promise<void>;
  onDeleteJourney: (id: string) => Promise<void>;
}

export const JourneyDetailsScreen: React.FC<JourneyDetailsScreenProps> = ({
  journeyId,
  theme,
  unit,
  loadJourney,
  onBack,
  onExportGpx,
  onDeleteJourney,
}) => {
  const mapRef = useRef<JourneyMapHandle | null>(null);
  const [journey, setJourney] = useState<Journey | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackActive, setPlaybackActive] = useState(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Route inspection state
  const [inspection, setInspection] = useState<RouteInspectionResult | null>(null);
  const [activeVisitIndex, setActiveVisitIndex] = useState(0);

  // Refs for smooth rAF loop
  const elapsedRef = useRef(0);
  const speedRef = useRef<PlaybackSpeed>(1);
  speedRef.current = speed;
  const isPlayingRef = useRef(false);
  isPlayingRef.current = isPlaying;

  const handleExport = async () => {
    setActionError(null);
    try {
      await onExportGpx(journeyId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not export this journey.');
    }
  };

  const handleDelete = async () => {
    setActionError(null);
    try {
      await onDeleteJourney(journeyId);
      onBack();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete this journey.');
    }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setIsPlaying(false);
    setPlaybackActive(false);
    setElapsedMs(0);
    elapsedRef.current = 0;
    setInspection(null);

    loadJourney(journeyId)
      .then((loaded) => {
        if (!active) return;
        if (!loaded) {
          setError('This journey could not be found in local storage.');
        } else {
          setJourney(loaded);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load journey.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [journeyId, loadJourney]);

  const filteredPoints = useMemo(
    () => (journey
      ? buildFilteredRoutePoints(
          journey.rawSamples,
          journey.statisticsVersion ?? CURRENT_STATISTICS_VERSION
        )
      : []),
    [journey]
  );

  const routeCoordinates = useMemo<[number, number][]>(
    () => filteredPoints.map((p) => [p.sample.longitude, p.sample.latitude]),
    [filteredPoints]
  );

  const startCoord = useMemo(() => {
    const first = filteredPoints[0]?.sample;
    return first ? { latitude: first.latitude, longitude: first.longitude } : null;
  }, [filteredPoints]);

  const finishCoord = useMemo(() => {
    if (filteredPoints.length < 2) return null;
    const last = filteredPoints[filteredPoints.length - 1].sample;
    return { latitude: last.latitude, longitude: last.longitude };
  }, [filteredPoints]);

  const totalDurationMs = useMemo(() => {
    if (filteredPoints.length < 2) return 0;
    return Math.max(
      0,
      filteredPoints[filteredPoints.length - 1].sample.timestamp -
        filteredPoints[0].sample.timestamp
    );
  }, [filteredPoints]);

  const currentPlaybackFrame = useMemo(
    () => getPlaybackFrameAtElapsed(filteredPoints, elapsedMs),
    [filteredPoints, elapsedMs]
  );

  // Smooth timestamp-based animation loop
  useEffect(() => {
    if (!isPlaying || filteredPoints.length < 2 || totalDurationMs === 0) return;

    let rafId = 0;
    let lastFrameTime = performance.now();
    let lastUiSyncTime = lastFrameTime;

    const tick = (now: number) => {
      if (!isPlayingRef.current) return;
      const dtReal = Math.min(100, Math.max(0, now - lastFrameTime));
      lastFrameTime = now;

      const nextElapsed = Math.min(
        totalDurationMs,
        elapsedRef.current + dtReal * speedRef.current
      );
      elapsedRef.current = nextElapsed;

      const frame = getPlaybackFrameAtElapsed(filteredPoints, nextElapsed);
      if (frame) {
        mapRef.current?.updatePlaybackOverlay({
          progressiveCoordinates: frame.progressiveCoordinates,
          markerCoordinate: [frame.longitude, frame.latitude],
        });
      }

      // Sync React slider/timestamp HUD ~15fps to avoid unnecessary layout churn
      if (now - lastUiSyncTime >= 66 || nextElapsed >= totalDurationMs) {
        lastUiSyncTime = now;
        setElapsedMs(nextElapsed);
      }

      if (nextElapsed >= totalDurationMs) {
        setIsPlaying(false);
        return;
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [isPlaying, filteredPoints, totalDurationMs]);

  const handleTogglePlay = useCallback(() => {
    if (totalDurationMs === 0) return;
    setPlaybackActive(true);
    if (!isPlaying && elapsedRef.current >= totalDurationMs) {
      elapsedRef.current = 0;
      setElapsedMs(0);
    }
    setIsPlaying((prev) => !prev);
  }, [isPlaying, totalDurationMs]);

  const handleRestart = useCallback(() => {
    setPlaybackActive(true);
    elapsedRef.current = 0;
    setElapsedMs(0);
    const frame = getPlaybackFrameAtElapsed(filteredPoints, 0);
    if (frame) {
      mapRef.current?.updatePlaybackOverlay({
        progressiveCoordinates: frame.progressiveCoordinates,
        markerCoordinate: [frame.longitude, frame.latitude],
      });
    }
    setIsPlaying(true);
  }, [filteredPoints]);

  const handleSeek = useCallback(
    (nextElapsed: number) => {
      setPlaybackActive(true);
      const clamped = Math.max(0, Math.min(totalDurationMs, nextElapsed));
      elapsedRef.current = clamped;
      setElapsedMs(clamped);
      const frame = getPlaybackFrameAtElapsed(filteredPoints, clamped);
      if (frame) {
        mapRef.current?.updatePlaybackOverlay({
          progressiveCoordinates: frame.progressiveCoordinates,
          markerCoordinate: [frame.longitude, frame.latitude],
        });
      }
    },
    [filteredPoints, totalDurationMs]
  );

  const handleRouteCoordinateClick = useCallback(
    (coord: GeoCoordinate) => {
      if (filteredPoints.length === 0) return;
      const result = inspectRouteAtCoordinate(filteredPoints, coord, 450);
      if (result && result.visits.length > 0) {
        setInspection(result);
        setActiveVisitIndex(0);
      }
    },
    [filteredPoints]
  );

  const handleJumpPlaybackToTimestamp = useCallback(
    (timestamp: number) => {
      if (filteredPoints.length === 0) return;
      const startTs = filteredPoints[0].sample.timestamp;
      handleSeek(timestamp - startTs);
    },
    [filteredPoints, handleSeek]
  );

  const inspectedCoord = useMemo(() => {
    if (!inspection || inspection.visits.length === 0) return null;
    const visit =
      inspection.visits[
        Math.max(0, Math.min(inspection.visits.length - 1, activeVisitIndex))
      ];
    return { latitude: visit.latitude, longitude: visit.longitude };
  }, [inspection, activeVisitIndex]);

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-sm text-slate-600 dark:text-slate-400">
        Loading journey route…
      </div>
    );
  }

  if (error || !journey) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-950 text-center">
        <p className="text-sm text-rose-600 dark:text-rose-400">
          {error ?? 'Journey not found.'}
        </p>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 min-h-[44px] px-5 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-medium"
        >
          Back to History
        </button>
      </div>
    );
  }

  const startTs = journey.startedAt;
  const endTs = journey.endedAt ?? journey.rawSamples[journey.rawSamples.length - 1]?.timestamp ?? startTs;

  return (
    <div
      className="h-full w-full flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden"
      data-testid="journey-details-screen"
    >
      {actionError && (
        <div role="alert" className="px-4 py-3 bg-rose-50 dark:bg-rose-950/60 border-b border-rose-200 dark:border-rose-800 text-sm text-rose-900 dark:text-rose-100">
          {actionError}
        </div>
      )}
      {/* Details Header & Stats Strip */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3 shrink-0 z-20">
        <div className="max-w-7xl mx-auto flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={onBack}
                aria-label="Back to journey history"
                className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 transition-colors shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
                  {journey.name}
                </h1>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate font-mono">
                  {formatDateTimeFull(startTs)} → {formatDateTimeFull(endTs)}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void handleExport()}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium text-slate-800 dark:text-slate-100 flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                <span>Export GPX</span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(true)}
                aria-label="Delete this journey"
                className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/60 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 flex items-center justify-center transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Journey Metrics Row */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs sm:text-sm pt-1 border-t border-slate-100 dark:border-slate-800">
            <div>
              <span className="text-slate-500 dark:text-slate-400">Distance: </span>
              <span className="font-mono font-semibold text-slate-900 dark:text-white">
                {formatDistance(journey.distanceMeters, unit)}
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">Duration: </span>
              <span className="font-mono font-semibold text-slate-900 dark:text-white">
                {formatDurationMs(journey.durationMs)}
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">Avg Speed: </span>
              <span className="font-mono font-semibold text-slate-900 dark:text-white">
                {formatSpeed(journey.averageSpeedMps, unit)}
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">GPS Samples: </span>
              <span className="font-mono font-semibold text-slate-900 dark:text-white">
                {journey.sampleCount}
              </span>
              {journey.filteredPointCount < journey.sampleCount && (
                <span className="ml-1 text-[11px] text-slate-500 dark:text-slate-400">
                  ({journey.filteredPointCount} plotted)
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Map + Playback + Route Inspection */}
      <div className="relative flex-1 min-h-0">
        <JourneyMap
          ref={mapRef}
          theme={theme}
          mode={playbackActive ? 'playback' : 'details'}
          routeCoordinates={routeCoordinates}
          progressiveCoordinates={currentPlaybackFrame?.progressiveCoordinates ?? []}
          startCoordinate={startCoord}
          finishCoordinate={finishCoord}
          currentCoordinate={
            playbackActive && currentPlaybackFrame
              ? {
                  latitude: currentPlaybackFrame.latitude,
                  longitude: currentPlaybackFrame.longitude,
                }
              : null
          }
          inspectedCoordinate={inspectedCoord}
          onRouteCoordinateClick={handleRouteCoordinateClick}
        />

        {/* Discovery Hint / Inspection Popup */}
        <div className="absolute top-3 left-3 right-16 sm:right-auto z-20 max-w-sm pointer-events-none">
          {inspection ? (
            <div className="pointer-events-auto">
              <RouteInspectorPopup
                inspection={inspection}
                activeVisitIndex={activeVisitIndex}
                unit={unit}
                onChangeVisit={setActiveVisitIndex}
                onJumpPlaybackToTimestamp={handleJumpPlaybackToTimestamp}
                onClose={() => setInspection(null)}
              />
            </div>
          ) : (
            <div className="px-3.5 py-2 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
              <Info className="w-3.5 h-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
              <span>Click or tap anywhere along the blue route to inspect its timestamp.</span>
            </div>
          )}
        </div>

        {/* Bottom Playback Controls */}
        <div className="absolute bottom-3 left-3 right-3 z-20 flex justify-center pointer-events-none">
          <div className="pointer-events-auto w-full max-w-xl">
            <PlaybackControls
              isPlaying={isPlaying}
              speed={speed}
              elapsedMs={elapsedMs}
              totalDurationMs={totalDurationMs}
              currentTimestamp={
                currentPlaybackFrame?.currentTimestamp ?? journey.startedAt
              }
              disabled={filteredPoints.length < 2}
              onTogglePlay={handleTogglePlay}
              onRestart={handleRestart}
              onChangeSpeed={setSpeed}
              onSeek={handleSeek}
            />
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete saved journey?"
        description={`Permanently delete "${journey.name}" and its ${journey.sampleCount} GPS samples from IndexedDB?`}
        confirmLabel="Delete Journey"
        destructive
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={() => {
          setConfirmDeleteOpen(false);
          void handleDelete();
        }}
      />
    </div>
  );
};
