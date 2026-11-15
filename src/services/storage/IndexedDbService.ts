import type { GpsSample } from '../../types/gps';
import type { Journey, JourneyMetadata } from '../../types/journey';
import { DEFAULT_SETTINGS, type AppSettings } from '../../types/settings';
import { buildFilteredRoutePoints, buildPreviewCoordinates } from '../../utils/geo';

const DB_NAME = 'wayline-gps-db';
const DB_VERSION = 1;
const STORE_JOURNEYS = 'journeys';
const STORE_SAMPLES = 'samples';
const STORE_SETTINGS = 'settings';
const SETTINGS_KEY = 'app-settings';

interface StoredSampleRecord {
  id?: number;
  journeyId: string;
  timestamp: number;
  sample: GpsSample;
}

class IndexedDbService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not available in this browser environment.'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_JOURNEYS)) {
          const journeyStore = db.createObjectStore(STORE_JOURNEYS, { keyPath: 'id' });
          journeyStore.createIndex('by_startedAt', 'startedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_SAMPLES)) {
          const sampleStore = db.createObjectStore(STORE_SAMPLES, {
            keyPath: 'id',
            autoIncrement: true,
          });
          sampleStore.createIndex('by_journey', 'journeyId', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS);
        }
      };

      request.onsuccess = () => {
        const db = request.result;
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
      const store = tx.objectStore(STORE_JOURNEYS);
      const req = store.getAll();

      req.onsuccess = () => {
        const rows = (req.result as JourneyMetadata[]) ?? [];
        rows.sort((a, b) => b.startedAt - a.startedAt);
        resolve(rows);
      };
      req.onerror = () => reject(req.error ?? new Error('Failed to read journeys.'));
    });
  }

  async getJourney(id: string): Promise<Journey | null> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_JOURNEYS, STORE_SAMPLES], 'readonly');
      const jStore = tx.objectStore(STORE_JOURNEYS);
      const sStore = tx.objectStore(STORE_SAMPLES);
      const sIndex = sStore.index('by_journey');

      let meta: JourneyMetadata | undefined;
      let samples: GpsSample[] = [];

      const jReq = jStore.get(id);
      jReq.onsuccess = () => {
        meta = jReq.result as JourneyMetadata | undefined;
      };

      const sReq = sIndex.getAll(IDBKeyRange.only(id));
      sReq.onsuccess = () => {
        const records = (sReq.result as StoredSampleRecord[]) ?? [];
        records.sort((a, b) => a.timestamp - b.timestamp);
        samples = records.map((r) => r.sample);
      };

      tx.oncomplete = () => {
        if (!meta) {
          resolve(null);
          return;
        }
        resolve({
          ...meta,
          rawSamples: samples,
        });
      };

      tx.onerror = () => reject(tx.error ?? new Error('Failed to load journey details.'));
    });
  }

  async upsertJourneyMetadata(meta: JourneyMetadata): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_JOURNEYS, 'readwrite');
      tx.objectStore(STORE_JOURNEYS).put(meta);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to save journey metadata.'));
    });
  }

  async appendSampleAndMeta(meta: JourneyMetadata, sample: GpsSample): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_JOURNEYS, STORE_SAMPLES], 'readwrite');
      tx.objectStore(STORE_JOURNEYS).put(meta);
      tx.objectStore(STORE_SAMPLES).add({
        journeyId: meta.id,
        timestamp: sample.timestamp,
        sample,
      } satisfies StoredSampleRecord);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to persist GPS sample.'));
    });
  }

  async saveCompleteJourney(journey: Journey): Promise<void> {
    const db = await this.openDb();
    const { rawSamples, ...meta } = journey;
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_JOURNEYS, STORE_SAMPLES], 'readwrite');
      tx.objectStore(STORE_JOURNEYS).put(meta);
      const sStore = tx.objectStore(STORE_SAMPLES);
      for (const sample of rawSamples) {
        sStore.add({
          journeyId: journey.id,
          timestamp: sample.timestamp,
          sample,
        } satisfies StoredSampleRecord);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to save journey.'));
    });
  }

  async deleteJourney(id: string): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_JOURNEYS, STORE_SAMPLES], 'readwrite');
      tx.objectStore(STORE_JOURNEYS).delete(id);
      const sStore = tx.objectStore(STORE_SAMPLES);
      const index = sStore.index('by_journey');
      const cursorReq = index.openKeyCursor(IDBKeyRange.only(id));

      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          sStore.delete(cursor.primaryKey);
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to delete journey.'));
    });
  }

  async clearAllJourneys(): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_JOURNEYS, STORE_SAMPLES], 'readwrite');
      tx.objectStore(STORE_JOURNEYS).clear();
      tx.objectStore(STORE_SAMPLES).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to clear local data.'));
    });
  }

  /**
   * Finds journeys left in 'recording' status after an unexpected page reload or crash,
   * and finalizes their computed statistics from persisted samples.
   */
  async recoverInterruptedJourneys(): Promise<JourneyMetadata[]> {
    const all = await this.listJourneys();
    const interrupted = all.filter((j) => j.status === 'recording');
    const recovered: JourneyMetadata[] = [];

    for (const meta of interrupted) {
      const full = await this.getJourney(meta.id);
      if (!full || full.rawSamples.length === 0) {
        await this.deleteJourney(meta.id);
        continue;
      }

      const filtered = buildFilteredRoutePoints(full.rawSamples);
      const lastSample = full.rawSamples[full.rawSamples.length - 1];
      const durationMs = Math.max(0, lastSample.timestamp - full.startedAt);
      const distanceMeters =
        filtered.length > 0 ? filtered[filtered.length - 1].cumulativeDistanceMeters : 0;

      const updated: JourneyMetadata = {
        ...meta,
        status: 'interrupted',
        endedAt: lastSample.timestamp,
        durationMs,
        distanceMeters,
        sampleCount: full.rawSamples.length,
        filteredPointCount: filtered.length,
        averageSpeedMps: durationMs > 0 ? distanceMeters / (durationMs / 1000) : null,
        endLocation: {
          latitude: lastSample.latitude,
          longitude: lastSample.longitude,
        },
        previewCoordinates: buildPreviewCoordinates(filtered),
      };

      await this.upsertJourneyMetadata(updated);
      recovered.push(updated);
    }

    return recovered;
  }

  async loadSettings(): Promise<AppSettings> {
    try {
      const db = await this.openDb();
      return await new Promise((resolve) => {
        const tx = db.transaction(STORE_SETTINGS, 'readonly');
        const req = tx.objectStore(STORE_SETTINGS).get(SETTINGS_KEY);
        req.onsuccess = () => {
          resolve({
            ...DEFAULT_SETTINGS,
            ...(req.result as Partial<AppSettings> | undefined),
          });
        };
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
      tx.onerror = () => reject(tx.error ?? new Error('Failed to save settings.'));
    });
  }
}

export const indexedDbService = new IndexedDbService();
