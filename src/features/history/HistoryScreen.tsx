import React, { useRef, useState } from 'react';
import {
  ChevronRight,
  Download,
  MapPin,
  Trash2,
  Upload,
} from 'lucide-react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { RouteMiniPreview } from '../map/RouteMiniPreview';
import type { JourneyMetadata } from '../../types/journey';
import type { DistanceUnit } from '../../types/settings';
import {
  formatCoordsPair,
  formatDateShort,
  formatDistance,
  formatDurationMs,
  formatTimeWithSeconds,
} from '../../utils/format';

interface HistoryScreenProps {
  journeys: JourneyMetadata[];
  recoveredJourneys: JourneyMetadata[];
  loading: boolean;
  error: string | null;
  unit: DistanceUnit;
  onOpenJourney: (id: string) => void;
  onDeleteJourney: (id: string) => Promise<void>;
  onExportGpx: (id: string) => Promise<void>;
  onImportGpxFile: (xmlText: string, fileName: string) => Promise<void>;
  onStartNewTracking: () => void;
  onDismissRecovery: () => void;
}

export const HistoryScreen: React.FC<HistoryScreenProps> = ({
  journeys,
  recoveredJourneys,
  loading,
  error,
  unit,
  onOpenJourney,
  onDeleteJourney,
  onExportGpx,
  onImportGpxFile,
  onStartNewTracking,
  onDismissRecovery,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingDelete, setPendingDelete] = useState<JourneyMetadata | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportError(null);
    setImportSuccess(null);
    try {
      const text = await file.text();
      await onImportGpxFile(text, file.name);
      setImportSuccess(`Imported "${file.name}" into local IndexedDB storage.`);
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : 'Unable to parse selected GPX file.'
      );
    }
  };

  const sourceLabel = (j: JourneyMetadata) => {
    if (j.source === 'dev-test') return 'Development Test Route';
    if (j.source === 'gpx') return 'GPX Import';
    return 'GPS Recording';
  };

  return (
    <div
      className="h-full w-full overflow-y-auto bg-slate-50 dark:bg-slate-950"
      data-testid="history-screen"
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Journey History
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              All journeys are stored privately in your browser’s IndexedDB. Nothing is uploaded to external servers.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept=".gpx,application/gpx+xml,text/xml"
              onChange={(e) => void handleFileChange(e)}
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium text-slate-800 dark:text-slate-100 flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <Upload className="w-4 h-4" />
              <span>Import GPX</span>
            </button>
          </div>
        </div>

        {/* Recovery Notice */}
        {recoveredJourneys.length > 0 && (
          <div
            role="status"
            className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-amber-950 dark:text-amber-100"
          >
            <p>
              Recovered {recoveredJourneys.length} interrupted{' '}
              {recoveredJourneys.length === 1 ? 'journey' : 'journeys'} saved prior to page closure.
            </p>
            <button
              type="button"
              onClick={onDismissRecovery}
              className="text-xs font-semibold underline hover:no-underline self-start sm:self-center"
            >
              Dismiss
            </button>
          </div>
        )}

        {importError && (
          <div
            role="alert"
            className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-sm text-rose-900 dark:text-rose-100"
          >
            {importError}
          </div>
        )}

        {importSuccess && (
          <div
            role="status"
            className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-900 dark:text-emerald-100"
          >
            {importSuccess}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-sm text-rose-900 dark:text-rose-100"
          >
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="h-28 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse"
              />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && journeys.length === 0 && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 sm:p-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
              <MapPin className="w-6 h-6" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">
              No recorded journeys yet
            </h2>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
              Start a live GPS recording from the map or import an existing GPX track file to inspect timestamps and replay routes.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={onStartNewTracking}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
              >
                Go to Live Map
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm font-medium transition-colors"
              >
                Import GPX File
              </button>
            </div>
          </div>
        )}

        {/* Journey List */}
        {!loading && journeys.length > 0 && (
          <div className="space-y-3" data-testid="journey-list">
            {journeys.map((journey) => (
              <article
                key={journey.id}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 transition-colors hover:border-slate-300 dark:hover:border-slate-700"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  {/* Route SVG Preview */}
                  <button
                    type="button"
                    onClick={() => onOpenJourney(journey.id)}
                    aria-label={`Open route map for ${journey.name}`}
                    className="w-full sm:w-28 h-24 sm:h-20 shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600 rounded-xl"
                  >
                    <RouteMiniPreview
                      coordinates={journey.previewCoordinates}
                      className="w-full h-full"
                    />
                  </button>

                  {/* Primary Metadata & Metrics */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>{formatDateShort(journey.startedAt)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">
                        {formatTimeWithSeconds(journey.startedAt)} –{' '}
                        {journey.endedAt
                          ? formatTimeWithSeconds(journey.endedAt)
                          : 'Active'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{sourceLabel(journey)}</span>
                      {journey.status === 'interrupted' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-amber-600 dark:text-amber-400 font-medium">
                            Recovered
                          </span>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => onOpenJourney(journey.id)}
                      className="mt-1 text-left group flex items-center gap-1.5 max-w-full"
                    >
                      <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {journey.name}
                      </h2>
                      <ChevronRight className="w-4 h-4 shrink-0 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
                    </button>

                    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs sm:text-sm">
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">Distance: </span>
                        <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {formatDistance(journey.distanceMeters, unit)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">Duration: </span>
                        <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {formatDurationMs(journey.durationMs)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">Samples: </span>
                        <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {journey.sampleCount}
                        </span>
                      </div>
                    </div>

                    {journey.startLocation && journey.endLocation && (
                      <div className="mt-2 text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                        Start {formatCoordsPair(journey.startLocation.latitude, journey.startLocation.longitude)} → End{' '}
                        {formatCoordsPair(journey.endLocation.latitude, journey.endLocation.longitude)}
                      </div>
                    )}
                  </div>

                  {/* Row Actions */}
                  <div className="flex items-center justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => void onExportGpx(journey.id)}
                      aria-label={`Export GPX for ${journey.name}`}
                      className="min-h-[44px] min-w-[44px] px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <Download className="w-4 h-4" />
                      <span>GPX</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPendingDelete(journey)}
                      aria-label={`Delete ${journey.name}`}
                      className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/60 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 flex items-center justify-center transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenJourney(journey.id)}
                      className="min-h-[44px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                    >
                      Open
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete saved journey?"
        description={
          pendingDelete
            ? `Permanently delete "${pendingDelete.name}" and all ${pendingDelete.sampleCount} recorded GPS samples from local IndexedDB storage? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete Journey"
        destructive
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) {
            const id = pendingDelete.id;
            setPendingDelete(null);
            void onDeleteJourney(id);
          }
        }}
      />
    </div>
  );
};
