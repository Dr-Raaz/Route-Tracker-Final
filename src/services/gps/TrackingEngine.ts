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
import { validateGpsSample, calculateJourneyStatistics, applyJourneyStatistics, CURRENT_STATISTICS_VERSION } from '../../utils/journeyStats';
import { formatDateShort } from '../../utils/format';
import { indexedDbService, StorageConflictError } from '../storage/IndexedDbService';
import { recordingOwnership, type RecordingLockLease } from './RecordingOwnership';
import { browserGeolocationProvider, devTestGpsProvider } from './GpsProvider';

export type TrackingPhase = 'idle' | 'requesting-permission' | 'recording' | 'stopping' | 'error';

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
  persistenceError: string | null;
  persistedSampleCount: number;
  finalizationPending: boolean;
  isSignalLost: boolean;
  isTestMode: boolean;
}

interface CapturedSample {
  sample: GpsSample;
  capturedAt: number;
}

type Subscriber = (state: TrackingStateSnapshot) => void;
const TARGET_RECORDING_INTERVAL_MS = 5000;

function createDefaultName(timestamp: number, isTestMode: boolean): string {
  const datePart = formatDateShort(timestamp);
  const timePart = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
  return isTestMode ? `Test Route · ${datePart} ${timePart}` : `Journey · ${datePart} ${timePart}`;
}

function makeJourneyId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `jrn-${crypto.randomUUID()}`;
  return `jrn-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function toGpsError(error: unknown): GpsError {
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) return error as GpsError;
  return { code: 'UNKNOWN', message: error instanceof Error ? error.message : 'Unable to save GPS recording.', timestamp: Date.now() };
}

class TrackingEngine {
  private state: TrackingStateSnapshot = {
    phase: 'idle', permissionStatus: 'unknown', activeJourneyId: null,
    activeJourneyName: null, source: 'gps', startedAt: null, elapsedMs: 0,
    distanceMeters: 0, currentSpeedMps: null, averageSpeedMps: null,
    latestSample: null, rawSamples: [], filteredPoints: [], error: null,
    persistenceError: null, persistedSampleCount: 0, finalizationPending: false,
    isSignalLost: false, isTestMode: false,
  };
  private subscribers = new Set<Subscriber>();
  private stopWatchFn: (() => void) | null = null;
  private durationTimerId: number | null = null;
  private signalWatchdogId: number | null = null;
  private lastSampleWallTime = 0;
  private activeMeta: JourneyMetadata | null = null;
  private capturedSamples: CapturedSample[] = [];
  private persistedRevision = 0;
  private callbackGateOpen = false;
  private sessionGeneration = 0;
  private startInFlight = false;
  private drainPromise: Promise<void> | null = null;
  private stopPromise: Promise<Journey | null> | null = null;
  private finalizationToken: string | null = null;
  private finalizationBoundary: number | null = null;
  private customFinalName: string | undefined;
  private ownershipLease: RecordingLockLease | null = null;
  private pendingOwnershipLease: RecordingLockLease | null = null;
  private pendingJourneyCreationId: string | null = null;
  private emptyCancellationPendingId: string | null = null;

  subscribe(listener: Subscriber): () => void {
    this.subscribers.add(listener);
    listener(this.state);
    return () => this.subscribers.delete(listener);
  }
  getSnapshot(): TrackingStateSnapshot { return this.state; }
  private emit(partial: Partial<TrackingStateSnapshot>): void {
    this.state = { ...this.state, ...partial };
    for (const subscriber of this.subscribers) subscriber(this.state);
  }

  async refreshPermission(useTestMode: boolean): Promise<GpsPermissionStatus> {
    try {
      const status = await this.selectProvider(useTestMode).checkPermission();
      this.emit({ permissionStatus: status, isTestMode: useTestMode });
      return status;
    } catch (error) {
      this.emit({ permissionStatus: 'unknown', error: toGpsError(error) });
      return 'unknown';
    }
  }
  private selectProvider(useTestMode: boolean): GpsProvider {
    return useTestMode ? devTestGpsProvider : browserGeolocationProvider;
  }

  async locateOnce(useTestMode: boolean): Promise<GpsSample | null> {
    const provider = this.selectProvider(useTestMode);
    try {
      const sample = await provider.requestInitialPosition();
      const invalid = validateGpsSample(sample);
      if (invalid) throw { code: 'INVALID_SAMPLE', message: invalid, timestamp: Date.now() } satisfies GpsError;
      const permissionStatus = await provider.checkPermission();
      this.emit({ latestSample: sample, permissionStatus, error: null });
      return sample;
    } catch (err) {
      const gpsErr = toGpsError(err);
      const permissionStatus = await provider.checkPermission().catch(() => 'unknown' as const);
      this.emit({ permissionStatus, error: gpsErr });
      return null;
    }
  }

  async startTracking(options: { useTestMode: boolean; customName?: string }): Promise<boolean> {
    if (this.startInFlight || this.state.activeJourneyId || this.state.phase === 'recording' || this.state.phase === 'stopping') return false;
    this.startInFlight = true;
    const generation = ++this.sessionGeneration;
    const provider = this.selectProvider(options.useTestMode);
    const source: JourneySource = options.useTestMode ? 'dev-test' : 'gps';
    this.emit({ phase: 'requesting-permission', error: null, persistenceError: null, finalizationPending: false, isSignalLost: false, isTestMode: options.useTestMode, source });
    let acquiredLease: RecordingLockLease | null = null;
    try {
      acquiredLease = await recordingOwnership.tryAcquire();
      if (!acquiredLease) throw new Error('Another Route Tracker tab currently owns recording. Stop the recording there before starting a new one.');
      this.pendingOwnershipLease = acquiredLease;
      if (generation !== this.sessionGeneration) {
        await this.releasePendingOwnership(acquiredLease);
        return false;
      }
      const initialSample = await provider.requestInitialPosition();
      if (generation !== this.sessionGeneration) {
        await this.releasePendingOwnership(acquiredLease);
        return false;
      }
      const invalid = validateGpsSample(initialSample);
      if (invalid) throw { code: 'INVALID_SAMPLE', message: invalid, timestamp: Date.now() } satisfies GpsError;
      const permissionStatus = await provider.checkPermission();
      if (generation !== this.sessionGeneration) {
        await this.releasePendingOwnership(acquiredLease);
        return false;
      }

      const startedAt = Date.now();
      const journeyId = makeJourneyId();
      const name = options.customName?.trim() || createDefaultName(startedAt, options.useTestMode);
      const meta: JourneyMetadata = {
        id: journeyId, name, createdAt: startedAt, startedAt, endedAt: null,
        durationMs: 0, distanceMeters: 0, averageSpeedMps: null, maxSpeedMps: null,
        sampleCount: 0, filteredPointCount: 0, startLocation: null, endLocation: null,
        status: 'recording', source, providerKind: provider.kind,
        previewCoordinates: [], sampleRevision: 0,
        statisticsVersion: CURRENT_STATISTICS_VERSION, finalizationToken: null,
      };
      this.pendingJourneyCreationId = journeyId;
      await indexedDbService.createRecording(meta);
      this.pendingJourneyCreationId = null;
      if (generation !== this.sessionGeneration) {
        try {
          await indexedDbService.cancelEmptyRecording(journeyId);
          if (this.pendingOwnershipLease === acquiredLease) this.pendingOwnershipLease = null;
          await acquiredLease.release();
        } catch (cleanupError) {
          this.activeMeta = meta;
          this.ownershipLease = acquiredLease;
          this.pendingOwnershipLease = null;
          this.emptyCancellationPendingId = journeyId;
          this.emit({
            phase: 'error', activeJourneyId: journeyId, activeJourneyName: name,
            startedAt, persistenceError: `The canceled start could not be cleaned up: ${cleanupError instanceof Error ? cleanupError.message : 'local storage failed'}. Retry cleanup; the empty recording remains available for recovery.`,
          });
        }
        return false;
      }
      this.ownershipLease = acquiredLease;
      this.pendingOwnershipLease = null;
      this.activeMeta = meta;
      this.persistedRevision = 0;
      this.capturedSamples = [{ sample: initialSample, capturedAt: Date.now() }];
      this.callbackGateOpen = true;
      this.lastSampleWallTime = Date.now();
      const stats = calculateJourneyStatistics([initialSample], startedAt, this.capturedSamples[0].capturedAt, CURRENT_STATISTICS_VERSION);
      const checkpoint = applyJourneyStatistics(meta, stats);
      this.emit({
        phase: 'recording', permissionStatus, activeJourneyId: journeyId,
        activeJourneyName: name, source, startedAt, elapsedMs: stats.durationMs,
        distanceMeters: stats.distanceMeters, currentSpeedMps: initialSample.speed,
        averageSpeedMps: stats.averageSpeedMps, latestSample: initialSample,
        rawSamples: [initialSample], filteredPoints: stats.filteredPoints,
        persistedSampleCount: 0, persistenceError: null, error: null, isSignalLost: false,
      });
      this.activeMeta = checkpoint;
      this.startTimers();
      this.stopWatchFn = provider.startWatching(
        { targetIntervalMs: TARGET_RECORDING_INTERVAL_MS, highAccuracy: true },
        {
          onSample: (sample) => this.handleIncomingSample(sample, generation),
          onError: (error) => this.handleWatchError(error, generation),
        }
      );
      await this.drainWrites();
      return true;
    } catch (error) {
      this.pendingJourneyCreationId = null;
      const gpsErr = toGpsError(error);
      if (generation !== this.sessionGeneration) {
        if (acquiredLease && this.pendingOwnershipLease === acquiredLease) {
          await this.releasePendingOwnership(acquiredLease).catch(() => {});
        }
        return false;
      }
      if (this.activeMeta && this.capturedSamples.length > 0) {
        this.callbackGateOpen = false;
        this.stopWatchFn?.();
        this.stopWatchFn = null;
        this.clearTimers();
        this.emit({ phase: 'error', persistenceError: gpsErr.message, finalizationPending: false });
      } else {
        if (acquiredLease && this.pendingOwnershipLease === acquiredLease) {
          await this.releasePendingOwnership(acquiredLease).catch((releaseError) => {
            this.emit({ persistenceError: `Could not release recording ownership: ${releaseError instanceof Error ? releaseError.message : 'unknown error'}` });
          });
        }
        const permissionStatus = gpsErr.code === 'PERMISSION_DENIED'
          ? 'denied'
          : await provider.checkPermission().catch(() => 'unknown' as const);
        this.emit({ phase: 'error', permissionStatus, error: gpsErr });
      }
      return false;
    } finally {
      if (generation === this.sessionGeneration) this.startInFlight = false;
    }
  }

  private startTimers(): void {
    this.clearTimers();
    this.durationTimerId = window.setInterval(() => {
      if (this.state.phase !== 'recording' || this.state.startedAt === null) return;
      const durationMs = Math.max(0, Date.now() - this.state.startedAt);
      this.emit({ elapsedMs: durationMs, averageSpeedMps: durationMs > 0 ? this.state.distanceMeters / (durationMs / 1000) : null });
    }, 1000);
    this.signalWatchdogId = window.setInterval(() => {
      if (this.state.phase === 'recording' && Date.now() - this.lastSampleWallTime > 18000 && !this.state.isSignalLost) this.emit({ isSignalLost: true });
    }, 3000);
  }
  private clearTimers(): void {
    if (this.durationTimerId !== null) window.clearInterval(this.durationTimerId);
    if (this.signalWatchdogId !== null) window.clearInterval(this.signalWatchdogId);
    this.durationTimerId = null;
    this.signalWatchdogId = null;
  }

  private handleIncomingSample(sample: GpsSample, generation: number): void {
    // The gate is closed synchronously before watch cleanup on Stop.
    if (!this.callbackGateOpen || generation !== this.sessionGeneration || !this.activeMeta) return;
    const invalid = validateGpsSample(sample);
    if (invalid) {
      this.emit({ error: { code: 'INVALID_SAMPLE', message: invalid, timestamp: Date.now() } });
      return;
    }
    const capturedAt = Date.now();
    this.lastSampleWallTime = capturedAt;
    const nextRecords = [...this.capturedSamples, { sample, capturedAt }];
    const nextRaw = nextRecords.map((record) => record.sample);
    const stats = calculateJourneyStatistics(nextRaw, this.activeMeta.startedAt, capturedAt, this.activeMeta.statisticsVersion ?? CURRENT_STATISTICS_VERSION);
    const checkpoint = applyJourneyStatistics(this.activeMeta, stats);
    this.capturedSamples = nextRecords;
    this.activeMeta = checkpoint;
    this.emit({
      latestSample: sample, rawSamples: nextRaw, filteredPoints: stats.filteredPoints,
      distanceMeters: stats.distanceMeters, elapsedMs: stats.durationMs,
      currentSpeedMps: sample.speed, averageSpeedMps: stats.averageSpeedMps,
      error: null, isSignalLost: false,
    });
    void this.drainWrites().catch(() => {});
  }

  private drainWrites(): Promise<void> {
    if (this.drainPromise) return this.drainPromise;
    const operation = (async () => {
      while (this.activeMeta && this.persistedRevision < this.capturedSamples.length) {
        const ordinal = this.persistedRevision;
        const captured = this.capturedSamples[ordinal];
        const prefix = this.capturedSamples.slice(0, ordinal + 1);
        const stats = calculateJourneyStatistics(
          prefix.map((record) => record.sample),
          this.activeMeta.startedAt,
          captured.capturedAt,
          this.activeMeta.statisticsVersion ?? CURRENT_STATISTICS_VERSION
        );
        const checkpoint = applyJourneyStatistics(this.activeMeta, stats);
        await indexedDbService.appendSampleAndMeta(
          this.activeMeta.id, ordinal, captured.capturedAt, captured.sample, checkpoint
        );
        this.persistedRevision++;
        this.activeMeta = { ...checkpoint, sampleRevision: this.persistedRevision, sampleCount: this.persistedRevision };
        this.emit({ persistedSampleCount: this.persistedRevision, persistenceError: null });
      }
    })();
    this.drainPromise = operation;
    void operation.finally(() => {
      if (this.drainPromise === operation) this.drainPromise = null;
    }).catch(() => {});
    return operation.catch((error) => {
      const message = error instanceof Error ? error.message : 'Failed to persist GPS samples.';
      this.emit({ persistenceError: message });
      throw error;
    });
  }

  private handleWatchError(gpsError: GpsError, generation: number): void {
    if (!this.callbackGateOpen || generation !== this.sessionGeneration) return;
    if (gpsError.code === 'PERMISSION_DENIED') {
      this.emit({ permissionStatus: 'denied', error: gpsError });
      void this.stopTracking().catch(() => {});
      return;
    }
    this.emit({ isSignalLost: true, error: gpsError });
  }

  stopTracking(customName?: string): Promise<Journey | null> {
    if (this.stopPromise) return this.stopPromise;
    if (this.state.phase === 'requesting-permission') {
      // Cancel an in-flight location request. Its completion observes the generation change.
      this.callbackGateOpen = false;
      this.sessionGeneration++;
      this.startInFlight = false;
      this.emit({ phase: 'idle', error: null, persistenceError: null });
      const pendingLease = this.pendingOwnershipLease;
      if (this.pendingJourneyCreationId) return Promise.resolve(null);
      this.pendingOwnershipLease = null;
      return pendingLease
        ? pendingLease.release().then(() => null).catch((error) => {
            this.emit({ phase: 'error', persistenceError: `Could not release recording ownership: ${error instanceof Error ? error.message : 'unknown error'}` });
            throw error;
          })
        : Promise.resolve(null);
    }
    if (!this.activeMeta || !['recording', 'error', 'stopping'].includes(this.state.phase)) return Promise.resolve(null);

    // Shutdown order is intentional: close the gate, then stop GPS, then drain.
    this.callbackGateOpen = false;
    this.sessionGeneration++;
    this.emit({ phase: 'stopping' });
    try {
      this.stopWatchFn?.();
    } catch (error) {
      this.emit({ persistenceError: `GPS watch cleanup failed: ${error instanceof Error ? error.message : 'unknown error'}` });
    }
    this.stopWatchFn = null;
    this.clearTimers();
    if (customName?.trim()) this.customFinalName = customName.trim();
    const operation = this.finishStop();
    this.stopPromise = operation;
    void operation.finally(() => {
      if (this.stopPromise === operation) this.stopPromise = null;
    }).catch(() => {});
    return operation;
  }

  private async finishStop(): Promise<Journey | null> {
    try {
      await this.drainWrites();
      if (!this.activeMeta) return null;
      if (this.persistedRevision !== this.capturedSamples.length) throw new StorageConflictError('Persisted sample revision does not match the frozen recording sequence.');

      this.finalizationToken ??= makeJourneyId();
      this.finalizationBoundary ??= Date.now();
      const token = this.finalizationToken;
      const boundary = this.finalizationBoundary;
      await indexedDbService.beginFinalization(this.activeMeta.id, token, this.persistedRevision, boundary);
      this.activeMeta = { ...this.activeMeta, status: 'finalizing', finalizationToken: token };

      const snapshot = await indexedDbService.getJourneySnapshot(this.activeMeta.id);
      if (!snapshot || snapshot.records.length !== this.persistedRevision || snapshot.metadata.sampleRevision !== this.persistedRevision) {
        throw new StorageConflictError('Persisted sample set changed during finalization.');
      }
      const stats = calculateJourneyStatistics(
        snapshot.rawSamples,
        snapshot.metadata.startedAt,
        boundary,
        snapshot.metadata.statisticsVersion ?? CURRENT_STATISTICS_VERSION
      );
      const finalMeta = {
        ...applyJourneyStatistics(snapshot.metadata, stats),
        name: this.customFinalName || snapshot.metadata.name,
        endedAt: boundary,
        status: 'completed' as const,
        sampleRevision: this.persistedRevision,
        sampleCount: this.persistedRevision,
        finalizationToken: token,
      };
      await indexedDbService.finalizeJourney(finalMeta, token, this.persistedRevision);
      const journey: Journey = { ...finalMeta, rawSamples: snapshot.rawSamples };
      await this.releaseOwnership();
      this.resetAfterSave();
      return journey;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to finalize journey.';
      this.emit({ phase: 'error', persistenceError: message, finalizationPending: this.persistedRevision === this.capturedSamples.length });
      throw error;
    }
  }

  private resetAfterSave(): void {
    this.activeMeta = null;
    this.capturedSamples = [];
    this.persistedRevision = 0;
    this.finalizationToken = null;
    this.finalizationBoundary = null;
    this.customFinalName = undefined;
    this.callbackGateOpen = false;
    this.emit({
      phase: 'idle', activeJourneyId: null, activeJourneyName: null, startedAt: null,
      elapsedMs: 0, distanceMeters: 0, currentSpeedMps: null, averageSpeedMps: null,
      rawSamples: [], filteredPoints: [], persistedSampleCount: 0,
      persistenceError: null, finalizationPending: false, isSignalLost: false, error: null,
    });
  }

  retryPersistence(): Promise<Journey | null> {
    if (!this.activeMeta) return Promise.resolve(null);
    if (this.emptyCancellationPendingId) {
      return this.retryEmptyCancellation();
    }
    if (this.callbackGateOpen) {
      this.emit({ persistenceError: null });
      return this.drainWrites().then(() => null);
    }
    return this.stopTracking();
  }

  private async retryEmptyCancellation(): Promise<null> {
    const id = this.emptyCancellationPendingId;
    if (!id) return null;
    try {
      await indexedDbService.cancelEmptyRecording(id);
      this.emptyCancellationPendingId = null;
      await this.releaseOwnership();
      this.activeMeta = null;
      this.resetAfterSave();
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to clean up the canceled start.';
      this.emit({ phase: 'error', persistenceError: `The canceled start is still stored and can be retried: ${message}` });
      throw error;
    }
  }

  private async releaseOwnership(): Promise<void> {
    const lease = this.ownershipLease;
    this.ownershipLease = null;
    if (lease) await lease.release();
  }

  private async releasePendingOwnership(lease: RecordingLockLease): Promise<void> {
    if (this.pendingOwnershipLease === lease) this.pendingOwnershipLease = null;
    await lease.release();
  }

  cleanup(): void {
    this.callbackGateOpen = false;
    this.sessionGeneration++;
    this.stopWatchFn?.();
    this.stopWatchFn = null;
    this.clearTimers();
  }
}

export const trackingEngine = new TrackingEngine();
