import React from 'react';
import { ChevronLeft, ChevronRight, Clock, Play, X } from 'lucide-react';
import type { RouteInspectionResult } from '../../types/journey';
import type { DistanceUnit } from '../../types/settings';
import {
  formatCoordsPair,
  formatDateTimeFull,
  formatDistance,
  formatSpeed,
  formatTimeWithSeconds,
} from '../../utils/format';

interface RouteInspectorPopupProps {
  inspection: RouteInspectionResult;
  activeVisitIndex: number;
  unit: DistanceUnit;
  onChangeVisit: (nextIndex: number) => void;
  onJumpPlaybackToTimestamp: (timestamp: number) => void;
  onClose: () => void;
}

export const RouteInspectorPopup: React.FC<RouteInspectorPopupProps> = ({
  inspection,
  activeVisitIndex,
  unit,
  onChangeVisit,
  onJumpPlaybackToTimestamp,
  onClose,
}) => {
  const visits = inspection.visits;
  if (visits.length === 0) return null;

  const safeIndex = Math.max(0, Math.min(visits.length - 1, activeVisitIndex));
  const visit = visits[safeIndex];

  return (
    <div
      className="w-full max-w-sm rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-xl p-4 text-left"
      role="region"
      aria-label="Inspected route point details"
      data-testid="route-inspector-popup"
    >
      {/* Header Row */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span
              className={`font-medium ${
                visit.isInterpolated
                  ? 'text-amber-700 dark:text-amber-300'
                  : 'text-emerald-700 dark:text-emerald-400'
              }`}
              data-testid="inspection-timestamp-type"
            >
              {visit.isInterpolated
                ? 'Interpolated timestamp'
                : 'Directly recorded sample'}
            </span>
          </div>
          <div
            className="mt-0.5 text-base font-semibold font-mono text-slate-900 dark:text-white"
            data-testid="inspection-timestamp"
          >
            {formatDateTimeFull(visit.timestamp)}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close route inspection popup"
          className="min-h-[40px] min-w-[40px] -mr-1 -mt-1 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Multi-visit Switcher */}
      {visits.length > 1 && (
        <div className="mt-2.5 pt-2.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
          <span className="font-medium text-slate-700 dark:text-slate-300">
            Location visited {visits.length} times · Visit {safeIndex + 1} of{' '}
            {visits.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onChangeVisit((safeIndex - 1 + visits.length) % visits.length)}
              aria-label="Previous visit at this location"
              className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onChangeVisit((safeIndex + 1) % visits.length)}
              aria-label="Next visit at this location"
              className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Telemetry Details Grid */}
      <dl className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Coordinates</dt>
          <dd className="mt-0.5 font-mono font-medium text-slate-900 dark:text-slate-100">
            {formatCoordsPair(visit.latitude, visit.longitude)}
          </dd>
        </div>

        <div>
          <dt className="text-slate-500 dark:text-slate-400">Distance from start</dt>
          <dd className="mt-0.5 font-mono font-medium text-slate-900 dark:text-slate-100">
            {formatDistance(visit.distanceFromStartMeters, unit)}
          </dd>
        </div>

        <div>
          <dt className="text-slate-500 dark:text-slate-400">GPS accuracy</dt>
          <dd className="mt-0.5 font-mono font-medium text-slate-900 dark:text-slate-100">
            ±{Math.round(visit.accuracyMeters)} m
          </dd>
        </div>

        <div>
          <dt className="text-slate-500 dark:text-slate-400">Speed</dt>
          <dd className="mt-0.5 font-mono font-medium text-slate-900 dark:text-slate-100">
            {visit.speedMps !== null ? formatSpeed(visit.speedMps, unit) : 'Unavailable'}
          </dd>
        </div>
      </dl>

      {visit.isInterpolated && (
        <p className="mt-2.5 text-[11px] text-slate-500 dark:text-slate-400">
          Interpolated between recorded samples at{' '}
          <span className="font-mono">
            {formatTimeWithSeconds(visit.beforeSampleTimestamp)}
          </span>{' '}
          and{' '}
          <span className="font-mono">
            {formatTimeWithSeconds(visit.afterSampleTimestamp)}
          </span>
          .
        </p>
      )}

      <button
        type="button"
        onClick={() => onJumpPlaybackToTimestamp(visit.timestamp)}
        className="mt-3 w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium text-slate-800 dark:text-slate-100 flex items-center justify-center gap-1.5 transition-colors"
      >
        <Play className="w-3.5 h-3.5 fill-current" />
        <span>Jump Playback Here</span>
      </button>
    </div>
  );
};
