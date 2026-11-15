import type {
  GpsError,
  GpsPermissionStatus,
  GpsProvider,
  GpsSample,
} from '../../types/gps';
import type {
  FilteredRoutePoint,
  Journey,
  JourneyMetadata,
  JourneySource,
} from '../../types/journey';
import {
  buildFilteredRoutePoints,
  buildPreviewCoordinates,
  isDuplicateSample,
} from '../../utils/geo';
import { formatDateShort } from '../../utils/format';
import { indexedDbService } from '../storage/IndexedDbService';
import { browserGeolocationProvider, devTestGpsProvider } from './GpsProvider';

export type TrackingPhase =
  | 'idle'
  | 'requesting-permission'
  | 'recording'
  | 'stopping'
  | 'error';

export interface TrackingStateSnapshot {
  phase: TrackingPhase;
  permissionStatus: GpsPermissionStatus;
  activeJourneyId: string | null;
  activeJourneyName: string | null;
  source: JourneySource;
  startedAt: number | null;
  elapsedMs: number;
  distanceMeters: number;
  currentSpeedMps: number | null;
  averageSpeedMps: number | null;
  latestSample: GpsSample | null;
  rawSamples: GpsSample[];
  filteredPoints: FilteredRoutePoint[];
  error: GpsError | null;
  isSignalLost: boolean;
  isTestMode: boolean;
}

type Subscriber = (state: TrackingStateSnapshot) => void;

const TARGET_RECORDING_INTERVAL_MS = 5000;
const MIN_ACCEPT_INTERVAL_MS = 4400; // Accept ticks arriving around the 5s target interval

function createDefaultName(timestamp: number, isTestMode: boolean): string {
  const datePart = formatDateShort(timestamp);
  const timePart = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
  return isTestMode
    ? `Test Route · ${datePart} ${timePart}`
    : `Journey · ${datePart} ${timePart}`;
}

/**
 * Framework-independent GPS Tracking Engine.
 * Manages lifecycle, 5s sample interval enforcement, duplicate filtering,
 * raw vs. filtered separation, IndexedDB persistence, and subscriber updates.
 */
class TrackingEngine {
  private state: TrackingStateSnapshot = {
    phase: 'idle',
    permissionStatus: 'unknown',
    activeJourneyId: null,
    activeJourneyName: null,
    source: 'gps',
    startedAt: null,
    elapsedMs: 0,
    distanceMeters: 0,
    currentSpeedMps: null,
    averageSpeedMps: null,
    latestSample: null,
    rawSamples: [],
    filteredPoints: [],
    error: null,
    isSignalLost: false,
    isTestMode: false,
  };

  private subscribers = new Set<Subscriber>();
  private stopWatchFn: (() => void) | null = null;
  private durationTimerId: number | null = null;
  private signalWatchdogId: number | null = null;
  private lastSampleWallTime = 0;
  private activeMeta: JourneyMetadata | null = null;
  private startInFlight = false;

  subscribe(listener: Subscriber): () => void {
    this.subscribers.add(listener);
    listener(this.state);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  getSnapshot(): TrackingStateSnapshot {
    return this.state;
  }

  private emit(partial: Partial<TrackingStateSnapshot>): void {
    this.state = { ...this.state, ...partial };
    for (const sub of this.subscribers) {
      sub(this.state);
    }
  }

  async refreshPermission(useTestMode: boolean): Promise<GpsPermissionStatus> {
    const provider = this.selectProvider(useTestMode);
    const status = await provider.checkPermission();
    this.emit({ permissionStatus: status, isTestMode: useTestMode });
    return status;
  }

  private selectProvider(useTestMode: boolean): GpsProvider {
    return useTestMode ? devTestGpsProvider : browserGeolocationProvider;
  }

  async locateOnce(useTestMode: boolean): Promise<GpsSample | null> {
    const provider = this.selectProvider(useTestMode);
    try {
      const sample = await provider.requestInitialPosition();
      const permissionStatus = await provider.checkPermission();
      this.emit({
        latestSample: sample,
        permissionStatus,
        error: null,
      });
      return sample;
    } catch (err) {
      const gpsErr = err as GpsError;
      const permissionStatus = await provider.checkPermission();
      this.emit({
        permissionStatus,
        error: gpsErr,
      });
      return null;
    }
  }

  async startTracking(options: { useTestMode: boolean; customName?: string }): Promise<boolean> {
    if (this.state.phase === 'recording' || this.startInFlight) {
      // Prevent duplicate tracking sessions
      return false;
    }

    this.startInFlight = true;
    const provider = this.selectProvider(options.useTestMode);
    const source: JourneySource = options.useTestMode ? 'dev-test' : 'gps';

    this.emit({
      phase: 'requesting-permission',
      error: null,
      isSignalLost: false,
      isTestMode: options.useTestMode,
      source,
    });

    try {
      const initialSample = await provider.requestInitialPosition();
      const permissionStatus = await provider.checkPermission();

      const journeyId = `jrn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const startedAt = initialSample.timestamp;
      const name =
        options.customName?.trim() || createDefaultName(startedAt, options.useTestMode);

      const filtered = buildFilteredRoutePoints([initialSample]);
      const meta: JourneyMetadata = {
        id: journeyId,
        name,
        createdAt: Date.now(),
        startedAt,
        endedAt: null,
        durationMs: 0,
        distanceMeters: 0,
        averageSpeedMps: initialSample.speed,
        maxSpeedMps: initialSample.speed,
        sampleCount: 1,
        filteredPointCount: filtered.length,
        startLocation: {
          latitude: initialSample.latitude,
          longitude: initialSample.longitude,
        },
        endLocation: {
          latitude: initialSample.latitude,
          longitude: initialSample.longitude,
        },
        status: 'recording',
        source,
        providerKind: provider.kind,
        previewCoordinates: buildPreviewCoordinates(filtered),
      };

      this.activeMeta = meta;
      this.lastSampleWallTime = Date.now();

      await indexedDbService.appendSampleAndMeta(meta, initialSample);

      this.emit({
        phase: 'recording',
        permissionStatus,
        activeJourneyId: journeyId,
        activeJourneyName: name,
        source,
        startedAt,
        elapsedMs: 0,
        distanceMeters: 0,
        currentSpeedMps: initialSample.speed,
        averageSpeedMps: initialSample.speed,
        latestSample: initialSample,
        rawSamples: [initialSample],
        filteredPoints: filtered,
        error: null,
        isSignalLost: false,
      });

      this.startTimers();
      this.stopWatchFn = provider.startWatching(
        {
          targetIntervalMs: TARGET_RECORDING_INTERVAL_MS,
          highAccuracy: true,
        },
        {
          onSample: (sample) => this.handleIncomingSample(sample),
          onError: (gpsErr) => this.handleWatchError(gpsErr),
        }
      );

      this.startInFlight = false;
      return true;
    } catch (err) {
      const gpsErr = err as GpsError;
      const permissionStatus =
        gpsErr?.code === 'PERMISSION_DENIED'
          ? 'denied'
          : await provider.checkPermission();

      this.emit({
        phase: 'error',
        permissionStatus,
        error: gpsErr ?? {
          code: 'UNKNOWN',
          message: 'Unable to start GPS tracking.',
          timestamp: Date.now(),
        },
      });
      this.startInFlight = false;
      return false;
    }
  }

  private startTimers(): void {
    this.clearTimers();

    this.durationTimerId = window.setInterval(() => {
      if (this.state.phase !== 'recording' || !this.state.startedAt) return;
      const now = Date.now();
      const wallElapsed = Math.max(0, now - this.state.startedAt);
      const lastSampleElapsed =
        this.state.latestSample && this.state.startedAt
          ? Math.max(0, this.state.latestSample.timestamp - this.state.startedAt)
          : 0;

      this.emit({
        elapsedMs: Math.max(wallElapsed, lastSampleElapsed),
      });
    }, 1000);

    this.signalWatchdogId = window.setInterval(() => {
      if (this.state.phase !== 'recording') return;
      if (Date.now() - this.lastSampleWallTime > 18000 && !this.state.isSignalLost) {
        this.emit({ isSignalLost: true });
      }
    }, 3000);
  }

  private clearTimers(): void {
    if (this.durationTimerId !== null) {
      window.clearInterval(this.durationTimerId);
      this.durationTimerId = null;
    }
    if (this.signalWatchdogId !== null) {
      window.clearInterval(this.signalWatchdogId);
      this.signalWatchdogId = null;
    }
  }

  private handleIncomingSample(sample: GpsSample): void {
    if (this.state.phase !== 'recording' || !this.activeMeta) return;

    this.lastSampleWallTime = Date.now();
    const lastRecorded = this.state.rawSamples[this.state.rawSamples.length - 1];

    // Always update live position & clear transient signal-loss state
    if (isDuplicateSample(lastRecorded, sample)) {
      this.emit({
        latestSample: sample,
        isSignalLost: false,
        error: null,
      });
      return;
    }

    // Enforce ~5s target recording interval while updating live indicator smoothly
    if (lastRecorded && sample.timestamp - lastRecorded.timestamp < MIN_ACCEPT_INTERVAL_MS) {
      this.emit({
        latestSample: sample,
        currentSpeedMps: sample.speed ?? this.state.currentSpeedMps,
        isSignalLost: false,
        error: null,
      });
      return;
    }

    const nextRawSamples = [...this.state.rawSamples, sample];
    const nextFiltered = buildFilteredRoutePoints(nextRawSamples);
    const distanceMeters =
      nextFiltered.length > 0
        ? nextFiltered[nextFiltered.length - 1].cumulativeDistanceMeters
        : 0;

    const startedAt = this.state.startedAt ?? sample.timestamp;
    const sampleElapsed = Math.max(0, sample.timestamp - startedAt);
    const averageSpeedMps =
      sampleElapsed > 0 ? distanceMeters / (sampleElapsed / 1000) : sample.speed;

    const speeds = nextRawSamples
      .map((s) => s.speed)
      .filter((v): v is number => v !== null && Number.isFinite(v));
    const maxSpeedMps = speeds.length > 0 ? Math.max(...speeds) : this.activeMeta.maxSpeedMps;

    const updatedMeta: JourneyMetadata = {
      ...this.activeMeta,
      durationMs: sampleElapsed,
      distanceMeters,
      averageSpeedMps,
      maxSpeedMps,
      sampleCount: nextRawSamples.length,
      filteredPointCount: nextFiltered.length,
      endLocation: {
        latitude: sample.latitude,
        longitude: sample.longitude,
      },
      previewCoordinates: buildPreviewCoordinates(nextFiltered),
    };

    this.activeMeta = updatedMeta;

    // Persist immediately to IndexedDB
    void indexedDbService.appendSampleAndMeta(updatedMeta, sample).catch((err) => {
      console.error('Failed to persist GPS sample to IndexedDB', err);
    });

    this.emit({
      latestSample: sample,
      rawSamples: nextRawSamples,
      filteredPoints: nextFiltered,
      distanceMeters,
      elapsedMs: Math.max(this.state.elapsedMs, sampleElapsed),
      currentSpeedMps: sample.speed,
      averageSpeedMps,
      isSignalLost: false,
      error: null,
    });
  }

  private handleWatchError(gpsErr: GpsError): void {
    if (gpsErr.code === 'PERMISSION_DENIED') {
      // Stop recording cleanly if user revokes permission mid-session
      this.emit({
        permissionStatus: 'denied',
        error: gpsErr,
      });
      void this.stopTracking();
      return;
    }

    this.emit({
      isSignalLost: true,
      error: gpsErr,
    });
  }

  async stopTracking(customName?: string): Promise<Journey | null> {
    if (this.state.phase !== 'recording' && this.state.phase !== 'requesting-permission') {
      return null;
    }

    this.emit({ phase: 'stopping' });

    if (this.stopWatchFn) {
      this.stopWatchFn();
      this.stopWatchFn = null;
    }
    this.clearTimers();

    const meta = this.activeMeta;
    const rawSamples = [...this.state.rawSamples];
    this.activeMeta = null;

    if (!meta || rawSamples.length === 0) {
      this.emit({
        phase: 'idle',
        activeJourneyId: null,
        activeJourneyName: null,
        startedAt: null,
        elapsedMs: 0,
        distanceMeters: 0,
        currentSpeedMps: null,
        averageSpeedMps: null,
        rawSamples: [],
        filteredPoints: [],
        isSignalLost: false,
      });
      return null;
    }

    const filtered = buildFilteredRoutePoints(rawSamples);
    const lastSample = rawSamples[rawSamples.length - 1];
    const endedAt = lastSample.timestamp;
    const durationMs = Math.max(0, endedAt - meta.startedAt);
    const distanceMeters =
      filtered.length > 0 ? filtered[filtered.length - 1].cumulativeDistanceMeters : 0;
    const averageSpeedMps = durationMs > 0 ? distanceMeters / (durationMs / 1000) : null;

    const finalMeta: JourneyMetadata = {
      ...meta,
      name: customName?.trim() || meta.name,
      endedAt,
      durationMs,
      distanceMeters,
      averageSpeedMps,
      sampleCount: rawSamples.length,
      filteredPointCount: filtered.length,
      endLocation: {
        latitude: lastSample.latitude,
        longitude: lastSample.longitude,
      },
      status: 'completed',
      previewCoordinates: buildPreviewCoordinates(filtered),
    };

    await indexedDbService.upsertJourneyMetadata(finalMeta);

    this.emit({
      phase: 'idle',
      activeJourneyId: null,
      activeJourneyName: null,
      startedAt: null,
      elapsedMs: 0,
      distanceMeters: 0,
      currentSpeedMps: null,
      averageSpeedMps: null,
      rawSamples: [],
      filteredPoints: [],
      isSignalLost: false,
      error: null,
    });

    return {
      ...finalMeta,
      rawSamples,
    };
  }

  cleanup(): void {
    if (this.stopWatchFn) {
      this.stopWatchFn();
      this.stopWatchFn = null;
    }
    this.clearTimers();
  }
}

export const trackingEngine = new TrackingEngine();
