import type { GpsSample } from '../../types/gps';
import type { Journey, JourneyMetadata } from '../../types/journey';
import { DEFAULT_SETTINGS, type AppSettings } from '../../types/settings';
import { recordingOwnership } from '../gps/RecordingOwnership';
import {
  applyJourneyStatistics,
  calculateJourneyStatistics,
  CURRENT_STATISTICS_VERSION,
  validateGpsSample,
} from '../../utils/journeyStats';

const DB_NAME = 'wayline-gps-db';
const DB_VERSION = 2;
const STORE_JOURNEYS = 'journeys';
const STORE_SAMPLES = 'samples';
const STORE_SETTINGS = 'settings';
const SETTINGS_KEY = 'app-settings';

export interface StoredSampleRecord {
  id?: number;
  journeyId: string;
  ordinal: number;
  sampleKey: string;
  capturedAt: number;
  timestamp: number;
  sample: GpsSample;
}

export interface JourneySnapshot {
  metadata: JourneyMetadata;
  records: StoredSampleRecord[];
  rawSamples: GpsSample[];
}

export interface RecoveryOutcome {
  recoveredJourneys: JourneyMetadata[];
  anotherContextOwnsRecording: boolean;
}

export class StorageConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageConflictError';
  }
}

export class JourneyIdConflictError extends StorageConflictError {
  constructor() {
    super('A journey with this ID already exists.');
    this.name = 'JourneyIdConflictError';
  }
}

export class StorageUncertainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageUncertainError';
  }
}

function sampleKey(journeyId: string, ordinal: number): string {
  return `journey:${journeyId}:${ordinal}`;
}

function sameSample(a: GpsSample, b: GpsSample): boolean {
  return (
    a.latitude === b.latitude &&
    a.longitude === b.longitude &&
    a.timestamp === b.timestamp &&
    a.accuracy === b.accuracy &&
    a.altitude === b.altitude &&
    a.speed === b.speed &&
    a.heading === b.heading
  );
}

function sameStoredPayload(record: StoredSampleRecord, sample: GpsSample, capturedAt: number): boolean {
  return record.capturedAt === capturedAt && sameSample(record.sample, sample);
}

function randomJourneyId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `gpx-${crypto.randomUUID()}`;
  }
  return `gpx-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function captureIdbError(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(fallback);
}

export class IndexedDbService {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private recoveryPromise: Promise<RecoveryOutcome> | null = null;
  private readonly databaseName: string;
  private readonly ownership: typeof recordingOwnership;

  constructor(
    databaseName = DB_NAME,
    ownership: typeof recordingOwnership = recordingOwnership
  ) {
    this.databaseName = databaseName;
    this.ownership = ownership;
  }

  close(): void {
    void this.dbPromise?.then((db) => db.close(), () => undefined);
    this.dbPromise = null;
  }

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not available in this browser environment.'));
        return;
      }

      const request = indexedDB.open(this.databaseName, DB_VERSION);
      let wasBlocked = false;
      request.onblocked = () => {
        wasBlocked = true;
        this.dbPromise = null;
        reject(new Error('Local storage upgrade is blocked by another open Route Tracker tab. Close or reload the other tab, then reload this page.'));
      };
      request.onupgradeneeded = (event) => {
        const db = request.result;
        const tx = request.transaction;
        if (!tx) return;

        if (!db.objectStoreNames.contains(STORE_JOURNEYS)) {
          const store = db.createObjectStore(STORE_JOURNEYS, { keyPath: 'id' });
          store.createIndex('by_startedAt', 'startedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_SAMPLES)) {
          const store = db.createObjectStore(STORE_SAMPLES, {
            keyPath: 'id',
            autoIncrement: true,
          });
          store.createIndex('by_journey', 'journeyId', { unique: false });
        } else {
          const store = tx.objectStore(STORE_SAMPLES);
          if (!store.indexNames.contains('by_journey')) store.createIndex('by_journey', 'journeyId', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS);
        }

        if ((event as IDBVersionChangeEvent).oldVersion < 2) {
          const samples = tx.objectStore(STORE_SAMPLES);
          const journeys = tx.objectStore(STORE_JOURNEYS);
          const counts = new Map<string, number>();
          const cursorRequest = samples.openCursor();

          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (cursor) {
              const record = cursor.value as Partial<StoredSampleRecord>;
              const id = String(cursor.primaryKey);
              const journeyId = String(record.journeyId ?? '');
              const ordinal = counts.get(journeyId) ?? 0;
              counts.set(journeyId, ordinal + 1);
              cursor.update({
                ...record,
                journeyId,
                ordinal,
                sampleKey: `legacy:${id}`,
                capturedAt: Number.isFinite(record.capturedAt)
                  ? record.capturedAt
                  : Number(record.timestamp ?? record.sample?.timestamp ?? 0),
              });
              cursor.continue();
              return;
            }

            if (samples.indexNames.contains('by_sampleKey')) samples.deleteIndex('by_sampleKey');
            samples.createIndex('by_sampleKey', 'sampleKey', { unique: true });
            const journeysRequest = journeys.getAll();
            journeysRequest.onsuccess = () => {
              for (const existing of (journeysRequest.result as JourneyMetadata[]) ?? []) {
                const count = counts.get(existing.id) ?? 0;
                journeys.put({
                  ...existing,
                  sampleCount: count,
                  sampleRevision: count,
                  statisticsVersion: existing.statisticsVersion ?? 0,
                  finalizationToken: existing.finalizationToken ?? null,
                });
              }
            };
          };
        } else {
          const samples = tx.objectStore(STORE_SAMPLES);
          if (!samples.indexNames.contains('by_sampleKey')) {
            samples.createIndex('by_sampleKey', 'sampleKey', { unique: true });
          }
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        if (wasBlocked) {
          db.close();
          return;
        }
        db.onversionchange = () => {
          db.close();
          this.dbPromise = null;
        };
        resolve(db);
      };

      request.onerror = () => {
        this.dbPromise = null;
        reject(request.error ?? new Error('Failed to open local IndexedDB database.'));
      };
    });
    return this.dbPromise;
  }

  async listJourneys(): Promise<JourneyMetadata[]> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_JOURNEYS, 'readonly');
      const req = tx.objectStore(STORE_JOURNEYS).getAll();
      let rows: JourneyMetadata[] = [];
      req.onsuccess = () => {
        rows = (req.result as JourneyMetadata[]) ?? [];
        rows.sort((a, b) => b.startedAt - a.startedAt);
      };
      tx.oncomplete = () => resolve(rows);
      tx.onabort = () => reject(tx.error ?? req.error ?? new Error('Failed to read journeys.'));
    });
  }

  async getJourneySnapshot(id: string): Promise<JourneySnapshot | null> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_JOURNEYS, STORE_SAMPLES], 'readonly');
      const metaReq = tx.objectStore(STORE_JOURNEYS).get(id);
      const recordReq = tx.objectStore(STORE_SAMPLES).index('by_journey').getAll(IDBKeyRange.only(id));
      let metadata: JourneyMetadata | undefined;
      let records: StoredSampleRecord[] = [];
      metaReq.onsuccess = () => (metadata = metaReq.result as JourneyMetadata | undefined);
      recordReq.onsuccess = () => {
        records = (recordReq.result as StoredSampleRecord[]) ?? [];
      };
      tx.oncomplete = () => {
        if (!metadata) return resolve(null);
        records.sort((a, b) => metadata?.statisticsVersion === 0
          ? (a.timestamp - b.timestamp) || ((a.id ?? 0) - (b.id ?? 0))
          : (a.ordinal ?? a.id ?? 0) - (b.ordinal ?? b.id ?? 0));
        resolve({ metadata, records, rawSamples: records.map((record) => record.sample) });
      };
      tx.onabort = () => reject(tx.error ?? new Error('Failed to load journey details.'));
    });
  }

  async getJourney(id: string): Promise<Journey | null> {
    const snapshot = await this.getJourneySnapshot(id);
    if (!snapshot) return null;
    return { ...snapshot.metadata, rawSamples: snapshot.rawSamples };
  }

  async createRecording(meta: JourneyMetadata): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_JOURNEYS, 'readwrite');
      const req = tx.objectStore(STORE_JOURNEYS).add(meta);
      let failure: Error | null = null;
      req.onerror = () => {
        failure = req.error?.name === 'ConstraintError'
          ? new JourneyIdConflictError()
          : req.error ?? new Error('Failed to create recording.');
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('Failed to create recording.'));
    });
  }

  async cancelEmptyRecording(id: string): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_JOURNEYS, STORE_SAMPLES], 'readwrite');
      const journeys = tx.objectStore(STORE_JOURNEYS);
      const req = journeys.get(id);
      let failure: Error | null = null;
      req.onsuccess = () => {
        const meta = req.result as JourneyMetadata | undefined;
        if (!meta) return;
        const countReq = tx.objectStore(STORE_SAMPLES).index('by_journey').count(IDBKeyRange.only(id));
        countReq.onsuccess = () => {
          if (meta.status !== 'recording' || countReq.result !== 0 || (meta.sampleRevision ?? 0) !== 0) {
            failure = new StorageConflictError('Only an empty recording can be cancelled.');
            tx.abort();
            return;
          }
          journeys.put({ ...meta, status: 'interrupted', endedAt: meta.startedAt, finalizationToken: null });
        };
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('Could not cancel empty recording.'));
    });
  }

  async upsertJourneyMetadata(meta: JourneyMetadata): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_JOURNEYS, 'readwrite');
      const store = tx.objectStore(STORE_JOURNEYS);
      const req = store.get(meta.id);
      let failure: Error | null = null;
      req.onsuccess = () => {
        const current = req.result as JourneyMetadata | undefined;
        if (current?.status === 'recording' || current?.status === 'finalizing') {
          failure = new StorageConflictError('Active recordings cannot be edited.');
          tx.abort();
          return;
        }
        store.put(meta);
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('Failed to save journey metadata.'));
    });
  }

  async appendSampleAndMeta(
    journeyId: string,
    ordinal: number,
    capturedAt: number,
    sample: GpsSample,
    checkpoint: JourneyMetadata
  ): Promise<'committed' | 'already-committed'> {
    const invalidSample = validateGpsSample(sample);
    if (
      !Number.isSafeInteger(ordinal) || ordinal < 0 || checkpoint.id !== journeyId ||
      !Number.isFinite(capturedAt) || capturedAt < 0 || invalidSample
    ) {
      throw new StorageConflictError('Sample identity is invalid.');
    }
    const db = await this.openDb();
    const key = sampleKey(journeyId, ordinal);
    let duplicateResult: 'committed' | 'already-committed' = 'committed';
    let failure: Error | null = null;

    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([STORE_JOURNEYS, STORE_SAMPLES], 'readwrite');
        const journeyStore = tx.objectStore(STORE_JOURNEYS);
        const sampleStore = tx.objectStore(STORE_SAMPLES);
        const journeyReq = journeyStore.get(journeyId);
        const sampleReq = sampleStore.index('by_sampleKey').get(key);
        let journey: JourneyMetadata | undefined;
        let existing: StoredSampleRecord | undefined;
        let ready = 0;
        const proceed = () => {
          ready++;
          if (ready !== 2) return;
          if (!journey) {
            failure = new StorageConflictError('Recording no longer exists.');
            tx.abort();
            return;
          }
          if (existing) {
            if (
              existing.journeyId !== journeyId ||
              existing.ordinal !== ordinal ||
              existing.sampleKey !== key ||
              !sameStoredPayload(existing, sample, capturedAt)
            ) {
              failure = new StorageConflictError('Sample identity already exists with a different payload.');
              tx.abort();
              return;
            }
            duplicateResult = 'already-committed';
            return;
          }
          if (journey.status !== 'recording') {
            failure = new StorageConflictError(`Cannot append samples to a ${journey.status} journey.`);
            tx.abort();
            return;
          }
          const revision = journey.sampleRevision ?? journey.sampleCount ?? 0;
          if (ordinal !== revision) {
            failure = new StorageConflictError(`Expected sample ordinal ${revision}, received ${ordinal}.`);
            tx.abort();
            return;
          }
          if (checkpoint.sampleCount !== revision + 1) {
            failure = new StorageConflictError('Statistics checkpoint does not match the next sample revision.');
            tx.abort();
            return;
          }
          const addReq = sampleStore.add({
            journeyId,
            ordinal,
            sampleKey: key,
            capturedAt,
            timestamp: sample.timestamp,
            sample,
          } satisfies StoredSampleRecord);
          addReq.onerror = () => {
            failure = addReq.error ?? new Error('Sample insertion failed.');
          };
          journeyStore.put({
            ...journey,
            ...checkpoint,
            id: journeyId,
            status: 'recording',
            sampleRevision: revision + 1,
            sampleCount: revision + 1,
            checkpointCaptureAt: capturedAt,
          });
        };
        journeyReq.onsuccess = () => {
          journey = journeyReq.result as JourneyMetadata | undefined;
          proceed();
        };
        sampleReq.onsuccess = () => {
          existing = sampleReq.result as StoredSampleRecord | undefined;
          proceed();
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => {
          failure ??= tx.error ?? new Error('Sample transaction failed.');
        };
        tx.onabort = () => reject(failure ?? tx.error ?? new Error('Sample transaction aborted.'));
      });
      return duplicateResult;
    } catch (writeError) {
      let existing: StoredSampleRecord | null;
      try {
        existing = await this.readSampleByKey(key);
      } catch (readError) {
        throw new StorageUncertainError(
          `Sample write outcome is uncertain and could not be reconciled: ${readError instanceof Error ? readError.message : 'storage read failed'}`
        );
      }
      if (
        existing?.journeyId === journeyId &&
        existing.ordinal === ordinal &&
        existing.sampleKey === key &&
        sameStoredPayload(existing, sample, capturedAt)
      ) {
        return 'already-committed';
      }
      if (existing) {
        throw new StorageConflictError('Sample identity already exists with a different payload.');
      }
      throw failure ?? captureIdbError(writeError, 'Failed to persist GPS sample.');
    }
  }

  private async readSampleByKey(key: string): Promise<StoredSampleRecord | null> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SAMPLES, 'readonly');
      const req = tx.objectStore(STORE_SAMPLES).index('by_sampleKey').get(key);
      let record: StoredSampleRecord | undefined;
      req.onsuccess = () => (record = req.result as StoredSampleRecord | undefined);
      tx.oncomplete = () => resolve(record ?? null);
      tx.onabort = () => reject(tx.error ?? new Error('Sample reconciliation failed.'));
    });
  }

  async beginFinalization(id: string, token: string, revision: number, boundary: number): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_JOURNEYS, STORE_SAMPLES], 'readwrite');
      const store = tx.objectStore(STORE_JOURNEYS);
      const req = store.get(id);
      const samplesReq = tx.objectStore(STORE_SAMPLES).index('by_journey').getAll(IDBKeyRange.only(id));
      let records: StoredSampleRecord[] = [];
      let meta: JourneyMetadata | undefined;
      let ready = 0;
      let failure: Error | null = null;
      const proceed = () => {
        if (++ready !== 2) return;
        if (!meta) failure = new StorageConflictError('Recording no longer exists.');
        const alreadyFinalizing = meta?.status === 'finalizing' &&
          meta.finalizationToken === token && meta.sampleRevision === revision;
        const alreadyCompleted = meta?.status === 'completed' &&
          meta.finalizationToken === token &&
          meta.sampleRevision === revision &&
          meta.finalizationBoundary === boundary;
        if (alreadyFinalizing && meta?.finalizationBoundary !== boundary) {
          failure = new StorageConflictError('Finalization retry changed the frozen lifecycle boundary.');
        }
        if (!failure && !alreadyFinalizing && !alreadyCompleted && (
          meta!.status !== 'recording' ||
          (meta!.sampleRevision ?? meta!.sampleCount) !== revision
        )) failure = new StorageConflictError('Recording state changed before finalization.');
        if (!failure && (
          (meta!.sampleRevision ?? meta!.sampleCount) !== revision || records.length !== revision
        )) failure = new StorageConflictError('Persisted sample set does not match the expected revision.');
        if (!failure && records.some((record, index) =>
          record.ordinal !== index || record.sampleKey !== sampleKey(id, index)
        )) failure = new StorageConflictError('Persisted sample sequence is incomplete.');
        if (failure) {
          tx.abort();
          return;
        }
        if (alreadyFinalizing || alreadyCompleted) return;
        store.put({
          ...meta!,
          status: 'finalizing',
          finalizationToken: token,
          finalizationBoundary: boundary,
        });
      };
      req.onsuccess = () => {
        meta = req.result as JourneyMetadata | undefined;
        proceed();
      };
      samplesReq.onsuccess = () => {
        records = (samplesReq.result as StoredSampleRecord[]) ?? [];
        records.sort((a, b) => a.ordinal - b.ordinal);
        proceed();
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('Could not begin finalization.'));
    });
  }

  async finalizeJourney(meta: JourneyMetadata, token: string, revision: number): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_JOURNEYS, STORE_SAMPLES], 'readwrite');
      const journeyStore = tx.objectStore(STORE_JOURNEYS);
      const currentReq = journeyStore.get(meta.id);
      const samplesReq = tx.objectStore(STORE_SAMPLES).index('by_journey').getAll(IDBKeyRange.only(meta.id));
      let current: JourneyMetadata | undefined;
      let records: StoredSampleRecord[] = [];
      let ready = 0;
      let failure: Error | null = null;
      const proceed = () => {
        ready++;
        if (ready !== 2) return;
        if (!current) {
          failure = new StorageConflictError('Journey disappeared during finalization.');
          tx.abort();
          return;
        }
        const currentMeta = current;
        const ordered = [...records].sort((a, b) => a.ordinal - b.ordinal);
        if (!failure && ordered.some((record, index) =>
          record.ordinal !== index || record.sampleKey !== sampleKey(meta.id, index)
        )) failure = new StorageConflictError('Persisted sample sequence is incomplete.');
        if (!failure && currentMeta.status === 'completed') {
          if (
            currentMeta.finalizationToken === token &&
            currentMeta.sampleRevision === revision &&
            currentMeta.sampleCount === meta.sampleCount &&
            currentMeta.distanceMeters === meta.distanceMeters &&
            currentMeta.endedAt === meta.endedAt &&
            records.length === revision
          ) return;
          failure = new StorageConflictError('Completed journey metadata conflicts with this finalization.');
        } else if (!failure && (
          currentMeta.status !== 'finalizing' ||
          currentMeta.finalizationToken !== token ||
          currentMeta.sampleRevision !== revision ||
          records.length !== revision ||
          meta.sampleCount !== revision
        )) failure = new StorageConflictError('Persisted sample revision changed during finalization.');
        if (failure) {
          tx.abort();
          return;
        }
        journeyStore.put({ ...meta, status: 'completed', finalizationToken: token, sampleRevision: revision });
      };
      currentReq.onsuccess = () => {
        current = currentReq.result as JourneyMetadata | undefined;
        proceed();
      };
      samplesReq.onsuccess = () => {
        records = (samplesReq.result as StoredSampleRecord[]) ?? [];
        proceed();
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('Final metadata transaction aborted.'));
    });
  }

  async saveCompleteJourney(journey: Journey): Promise<Journey> {
    const db = await this.openDb();
    let candidate = journey;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction([STORE_JOURNEYS, STORE_SAMPLES], 'readwrite');
          const { rawSamples, ...meta } = candidate;
          const revision = rawSamples.length;
          const journeyStore = tx.objectStore(STORE_JOURNEYS);
          const sampleStore = tx.objectStore(STORE_SAMPLES);
          let failure: Error | null = null;
          const journeyRequest = journeyStore.add({
            ...meta,
            sampleRevision: revision,
            sampleCount: revision,
            statisticsVersion: meta.statisticsVersion ?? CURRENT_STATISTICS_VERSION,
          });
          journeyRequest.onerror = () => {
            if (journeyRequest.error?.name === 'ConstraintError') {
              failure = new JourneyIdConflictError();
            } else {
              failure = journeyRequest.error ?? new Error('Failed to insert journey metadata.');
            }
          };
          for (let ordinal = 0; ordinal < rawSamples.length; ordinal++) {
            const sample = rawSamples[ordinal];
            sampleStore.add({
              journeyId: candidate.id,
              ordinal,
              sampleKey: sampleKey(candidate.id, ordinal),
              capturedAt: sample.timestamp,
              timestamp: sample.timestamp,
              sample,
            } satisfies StoredSampleRecord);
          }
          tx.onerror = () => { failure ??= tx.error ?? new Error('Import transaction failed.'); };
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(failure ?? tx.error ?? new Error('Failed to import journey.'));
        });
        return candidate;
      } catch (error) {
        if (!(error instanceof JourneyIdConflictError) || attempt === 3) throw error;
        candidate = { ...candidate, id: randomJourneyId() };
      }
    }
    throw new Error('Unable to allocate a unique journey ID.');
  }

  async deleteJourney(id: string): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_JOURNEYS, STORE_SAMPLES], 'readwrite');
      const journeyStore = tx.objectStore(STORE_JOURNEYS);
      const req = journeyStore.get(id);
      let failure: Error | null = null;
      req.onsuccess = () => {
        const meta = req.result as JourneyMetadata | undefined;
        if (meta?.status === 'recording' || meta?.status === 'finalizing') {
          failure = new StorageConflictError('An active recording cannot be deleted.');
          tx.abort();
          return;
        }
        journeyStore.delete(id);
        const cursorReq = tx.objectStore(STORE_SAMPLES).index('by_journey').openKeyCursor(IDBKeyRange.only(id));
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor) {
            tx.objectStore(STORE_SAMPLES).delete(cursor.primaryKey);
            cursor.continue();
          }
        };
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('Failed to delete journey.'));
    });
  }

  async clearAllJourneys(): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_JOURNEYS, STORE_SAMPLES], 'readwrite');
      const journeys = tx.objectStore(STORE_JOURNEYS);
      const req = journeys.getAll();
      let failure: Error | null = null;
      req.onsuccess = () => {
        const active = (req.result as JourneyMetadata[]).some(
          (journey) => journey.status === 'recording' || journey.status === 'finalizing'
        );
        if (active) {
          failure = new StorageConflictError('Stop active recordings before clearing local data.');
          tx.abort();
          return;
        }
        journeys.clear();
        tx.objectStore(STORE_SAMPLES).clear();
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('Failed to clear local data.'));
    });
  }

  recoverInterruptedJourneys(): Promise<RecoveryOutcome> {
    if (this.recoveryPromise) return this.recoveryPromise;
    const operation = this.recoverWithOwnership();
    this.recoveryPromise = operation;
    void operation.finally(() => {
      if (this.recoveryPromise === operation) this.recoveryPromise = null;
    }).catch(() => {});
    return operation;
  }

  private async recoverWithOwnership(): Promise<RecoveryOutcome> {
    const lease = await this.ownership.tryAcquire();
    if (!lease) return { recoveredJourneys: [], anotherContextOwnsRecording: true };

    try {
      return { recoveredJourneys: await this.recoverInterruptedJourneysUnderLock(), anotherContextOwnsRecording: false };
    } finally {
      await lease.release();
    }
  }

  private async recoverInterruptedJourneysUnderLock(): Promise<JourneyMetadata[]> {
    const recovered: JourneyMetadata[] = [];
    const candidates = (await this.listJourneys()).filter(
      (journey) => journey.status === 'recording' || journey.status === 'finalizing'
    );
    for (const candidate of candidates) {
      for (let attempt = 0; attempt < 4; attempt++) {
        const snapshot = await this.getJourneySnapshot(candidate.id);
        if (!snapshot) break;
        const revision = snapshot.metadata.sampleRevision ?? snapshot.records.length;
        if (snapshot.records.length !== revision) {
          throw new StorageConflictError(`Journey ${candidate.id} has an inconsistent sample revision.`);
        }
        const lastRecord = snapshot.records.at(-1);
        const version = snapshot.metadata.statisticsVersion ?? 0;
        const boundary = snapshot.metadata.status === 'finalizing' &&
          Number.isFinite(snapshot.metadata.finalizationBoundary)
          ? snapshot.metadata.finalizationBoundary!
          : version === 0
            ? (snapshot.rawSamples.at(-1)?.timestamp ?? snapshot.metadata.startedAt)
            : (lastRecord?.capturedAt ?? snapshot.metadata.startedAt);
        const stats = calculateJourneyStatistics(
          snapshot.rawSamples,
          snapshot.metadata.startedAt,
          boundary,
          version
        );
        const interrupted = {
          ...applyJourneyStatistics(snapshot.metadata, stats),
          status: 'interrupted' as const,
          finalizationToken: null,
          sampleRevision: revision,
        };
        const saved = await this.commitRecovery(interrupted, revision);
        if (saved) {
          recovered.push(interrupted);
          break;
        }
      }
    }
    return recovered;
  }

  private async commitRecovery(meta: JourneyMetadata, revision: number): Promise<boolean> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_JOURNEYS, STORE_SAMPLES], 'readwrite');
      const journeyStore = tx.objectStore(STORE_JOURNEYS);
      const journeyReq = journeyStore.get(meta.id);
      const samplesReq = tx.objectStore(STORE_SAMPLES).index('by_journey').getAll(IDBKeyRange.only(meta.id));
      let current: JourneyMetadata | undefined;
      let records: StoredSampleRecord[] = [];
      let ready = 0;
      let changed = false;
      let failure: Error | null = null;
      const proceed = () => {
        if (++ready !== 2) return;
        if (!current) {
          failure = new StorageConflictError('Journey disappeared during recovery.');
        } else if (current.status !== 'recording' && current.status !== 'finalizing') {
          changed = true;
        } else if (
          (current.sampleRevision ?? current.sampleCount) !== revision ||
          records.length !== revision ||
          records.some((record, index) => record.ordinal !== index || record.sampleKey !== sampleKey(meta.id, index))
        ) {
          changed = true;
        } else {
          journeyStore.put(meta);
        }
        if (failure) tx.abort();
      };
      journeyReq.onsuccess = () => {
        current = journeyReq.result as JourneyMetadata | undefined;
        proceed();
      };
      samplesReq.onsuccess = () => {
        records = (samplesReq.result as StoredSampleRecord[]) ?? [];
        records.sort((a, b) => a.ordinal - b.ordinal);
        proceed();
      };
      tx.oncomplete = () => resolve(!changed);
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('Recovery transaction aborted.'));
    });
  }

  async loadSettings(): Promise<AppSettings> {
    try {
      const db = await this.openDb();
      return await new Promise((resolve) => {
        const tx = db.transaction(STORE_SETTINGS, 'readonly');
        const req = tx.objectStore(STORE_SETTINGS).get(SETTINGS_KEY);
        req.onsuccess = () => resolve({ ...DEFAULT_SETTINGS, ...(req.result as Partial<AppSettings> | undefined) });
        req.onerror = () => resolve(DEFAULT_SETTINGS);
      });
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SETTINGS, 'readwrite');
      tx.objectStore(STORE_SETTINGS).put(settings, SETTINGS_KEY);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('Failed to save settings.'));
    });
  }
}

export const indexedDbService = new IndexedDbService();
