import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import type { GpsSample } from '../../types/gps';
import type { Journey, JourneyMetadata } from '../../types/journey';
import { IndexedDbService } from './IndexedDbService';
import { RecordingOwnership, type WebLockManagerLike } from '../gps/RecordingOwnership';
import { applyJourneyStatistics, calculateJourneyStatistics, CURRENT_STATISTICS_VERSION } from '../../utils/journeyStats';

const start = 1_760_000_000_000;
let databaseCounter = 0;
const nextDbName = () => `route-tracker-test-${Date.now()}-${++databaseCounter}`;

function makeSample(offset: number, longitude = -122.45): GpsSample {
  return {
    latitude: 37.8,
    longitude,
    timestamp: start + offset,
    accuracy: 5,
    altitude: 10,
    speed: 2,
    heading: 90,
  };
}

function makeMetadata(id: string, status: JourneyMetadata['status'] = 'recording'): JourneyMetadata {
  return {
    id, name: `Journey ${id}`, createdAt: start, startedAt: start, endedAt: null,
    durationMs: 0, distanceMeters: 0, averageSpeedMps: null, maxSpeedMps: null,
    sampleCount: 0, filteredPointCount: 0, startLocation: null, endLocation: null,
    status, source: 'gps', providerKind: 'browser-geolocation', previewCoordinates: [],
    sampleRevision: 0, statisticsVersion: CURRENT_STATISTICS_VERSION, finalizationToken: null,
  };
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted.'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

async function seedVersionOne(name: string, metadata: JourneyMetadata, samples: GpsSample[]): Promise<void> {
  const open = indexedDB.open(name, 1);
  open.onupgradeneeded = () => {
    const db = open.result;
    const journeys = db.createObjectStore('journeys', { keyPath: 'id' });
    journeys.createIndex('by_startedAt', 'startedAt', { unique: false });
    const records = db.createObjectStore('samples', { keyPath: 'id', autoIncrement: true });
    records.createIndex('by_journey', 'journeyId', { unique: false });
    db.createObjectStore('settings');
  };
  const db = await requestResult(open);
  const tx = db.transaction(['journeys', 'samples'], 'readwrite');
  const done = transactionDone(tx);
  tx.objectStore('journeys').put(metadata);
  for (const sample of samples) {
    tx.objectStore('samples').add({ journeyId: metadata.id, timestamp: sample.timestamp, sample });
  }
  await done;
  db.close();
}

function checkpoint(meta: JourneyMetadata, samples: GpsSample[], boundary: number): JourneyMetadata {
  return applyJourneyStatistics(
    meta,
    calculateJourneyStatistics(samples, meta.startedAt, boundary, meta.statisticsVersion)
  );
}

function testService(name = nextDbName()): IndexedDbService {
  return new IndexedDbService(name);
}

class TestLockManager implements WebLockManagerLike {
  private held = false;
  async request<T>(_name: string, _options: { mode: 'exclusive'; ifAvailable: true }, callback: (lock: Lock | null) => T | PromiseLike<T>): Promise<T> {
    if (this.held) return callback(null);
    this.held = true;
    try { return await callback({} as Lock); }
    finally { this.held = false; }
  }
}

test('v1 migration preserves samples and assigns legacy keys, ordinals and revision', async () => {
  const name = nextDbName();
  const service = testService(name);
  const original = { ...makeMetadata('legacy'), sampleRevision: undefined, statisticsVersion: undefined };
  const duplicateMeasurements = [makeSample(0), makeSample(0)];
  await seedVersionOne(name, original, duplicateMeasurements);

  const journeys = await service.listJourneys();
  const snapshot = await service.getJourneySnapshot(original.id);
  assert.equal(journeys[0].sampleCount, 2);
  assert.equal(journeys[0].sampleRevision, 2);
  assert.equal(journeys[0].statisticsVersion, 0);
  assert.equal(snapshot?.records.length, 2);
  assert.deepEqual(snapshot?.records.map(({ ordinal }) => ordinal), [0, 1]);
  assert.deepEqual(snapshot?.records.map(({ sampleKey }) => sampleKey), ['legacy:1', 'legacy:2']);
  assert.deepEqual(snapshot?.rawSamples, duplicateMeasurements);

  const db = await (service as unknown as { openDb(): Promise<IDBDatabase> }).openDb();
  assert.equal(db.transaction('samples').objectStore('samples').index('by_sampleKey').unique, true);
  const conflictTx = db.transaction('samples', 'readwrite');
  const conflictDone = transactionDone(conflictTx);
  conflictTx.objectStore('samples').add({
    journeyId: original.id, ordinal: 2, sampleKey: 'legacy:1', capturedAt: start,
    timestamp: start, sample: makeSample(2000),
  });
  await assert.rejects(conflictDone, { name: 'ConstraintError' });
  service.close();
});

test('aborted v1-to-v2 upgrade rolls back cursor changes and schema changes', async () => {
  const name = nextDbName();
  const legacyMeta = makeMetadata('rollback');
  await seedVersionOne(name, legacyMeta, [makeSample(0)]);
  const originalContinue = IDBCursor.prototype.continue;
  let abortedAfterFirstCursorUpdate = false;
  IDBCursor.prototype.continue = function (...args: []) {
    const cursor = this as IDBCursorWithValue;
    if (!abortedAfterFirstCursorUpdate && cursor.source instanceof IDBObjectStore && cursor.source.transaction.db.name === name) {
      abortedAfterFirstCursorUpdate = true;
      cursor.source.transaction.abort();
      return;
    }
    return originalContinue.apply(cursor, args);
  };
  const service = testService(name);
  try {
    await assert.rejects(service.listJourneys());
  } finally {
    IDBCursor.prototype.continue = originalContinue;
    service.close();
  }

  const db = await requestResult(indexedDB.open(name, 1));
  assert.equal(db.version, 1);
  assert.equal(db.transaction('samples').objectStore('samples').indexNames.contains('by_sampleKey'), false);
  const tx = db.transaction(['journeys', 'samples'], 'readonly');
  const metaReq = tx.objectStore('journeys').get('rollback');
  const recordsReq = tx.objectStore('samples').getAll();
  const [metadata, records] = await Promise.all([requestResult(metaReq), requestResult(recordsReq)]);
  assert.equal((metadata as JourneyMetadata).sampleRevision, 0);
  assert.equal((records as unknown[]).length, 1);
  db.close();
});

test('blocked database upgrade rejects visibly, then succeeds after the old connection closes', async () => {
  const name = nextDbName();
  await seedVersionOne(name, makeMetadata('blocked'), []);
  const blocker = await requestResult(indexedDB.open(name, 1));
  const service = testService(name);
  await assert.rejects(service.listJourneys(), /blocked by another open Route Tracker tab/);
  blocker.close();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const journeys = await service.listJourneys();
  assert.equal(journeys[0]?.id, 'blocked');
  assert.equal(journeys[0]?.sampleRevision, 0);
  service.close();
});

test('sample insert, checkpoint and revision commit atomically; exact retry is a no-op', async () => {
  const service = testService();
  const meta = makeMetadata('append');
  const sample = makeSample(0);
  await service.createRecording(meta);
  assert.equal(await service.appendSampleAndMeta(meta.id, 0, start, sample, checkpoint(meta, [sample], start)), 'committed');
  assert.equal(await service.appendSampleAndMeta(meta.id, 0, start, sample, checkpoint(meta, [sample], start)), 'already-committed');

  const snapshot = await service.getJourneySnapshot(meta.id);
  assert.equal(snapshot?.records.length, 1);
  assert.equal(snapshot?.metadata.sampleRevision, 1);
  assert.equal(snapshot?.metadata.sampleCount, 1);
  assert.equal(snapshot?.metadata.distanceMeters, 0);
  service.close();
});

test('a retry after a lost caller acknowledgement reconciles to the committed sample', async () => {
  const service = testService();
  const meta = makeMetadata('uncertain-ack');
  const sample = makeSample(0);
  await service.createRecording(meta);
  const firstResult = await service.appendSampleAndMeta(meta.id, 0, start, sample, checkpoint(meta, [sample], start));
  assert.equal(firstResult, 'committed');
  // Simulate the caller losing the first result after the transaction committed.
  const retryResult = await service.appendSampleAndMeta(meta.id, 0, start, sample, checkpoint(meta, [sample], start));
  assert.equal(retryResult, 'already-committed');
  assert.equal((await service.getJourneySnapshot(meta.id))?.metadata.sampleRevision, 1);
  service.close();
});

test('transaction abort after sample add rolls back sample and metadata revision', async () => {
  const service = testService();
  const meta = makeMetadata('atomic-abort');
  const sample = makeSample(0);
  await service.createRecording(meta);
  const originalAdd = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function (value: unknown, key?: IDBValidKey) {
    const request = originalAdd.call(this, value, key);
    const record = value as { sampleKey?: string };
    if (this.name === 'samples' && record.sampleKey === 'journey:atomic-abort:0') {
      request.onsuccess = () => this.transaction.abort();
    }
    return request;
  };
  try {
    await assert.rejects(service.appendSampleAndMeta(meta.id, 0, start, sample, checkpoint(meta, [sample], start)));
  } finally {
    IDBObjectStore.prototype.add = originalAdd;
  }
  const snapshot = await service.getJourneySnapshot(meta.id);
  assert.equal(snapshot?.records.length, 0);
  assert.equal(snapshot?.metadata.sampleRevision, 0);
  service.close();
});

test('conflicting payload with an existing stable key is rejected without changing revision', async () => {
  const service = testService();
  const meta = makeMetadata('conflict');
  const sample = makeSample(0);
  await service.createRecording(meta);
  await service.appendSampleAndMeta(meta.id, 0, start, sample, checkpoint(meta, [sample], start));
  const conflicting = { ...sample, longitude: -122.4 };
  await assert.rejects(
    service.appendSampleAndMeta(meta.id, 0, start, conflicting, checkpoint(meta, [conflicting], start)),
    /different payload/
  );
  assert.equal((await service.getJourneySnapshot(meta.id))?.metadata.sampleRevision, 1);
  service.close();
});

test('concurrent writes for one ordinal cannot create duplicate samples or revisions', async () => {
  const service = testService();
  const meta = makeMetadata('concurrent');
  const first = makeSample(0);
  const second = makeSample(1000, -122.449);
  await service.createRecording(meta);
  const results = await Promise.allSettled([
    service.appendSampleAndMeta(meta.id, 0, start, first, checkpoint(meta, [first], start)),
    service.appendSampleAndMeta(meta.id, 0, start + 100, second, checkpoint(meta, [second], start + 100)),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const snapshot = await service.getJourneySnapshot(meta.id);
  assert.equal(snapshot?.records.length, 1);
  assert.equal(snapshot?.metadata.sampleRevision, 1);
  service.close();
});

test('recording and finalizing status are enforced at the storage boundary', async () => {
  const service = testService();
  const meta = makeMetadata('statuses');
  const first = makeSample(0);
  await service.createRecording(meta);
  await service.appendSampleAndMeta(meta.id, 0, start, first, checkpoint(meta, [first], start));
  await service.beginFinalization(meta.id, 'token', 1, start + 100);
  const second = makeSample(1000);
  await assert.rejects(
    service.appendSampleAndMeta(meta.id, 1, start + 100, second, checkpoint(meta, [first, second], start + 100)),
    /finalizing journey/
  );
  await assert.rejects(service.deleteJourney(meta.id), /active recording cannot be deleted/);
  assert.equal((await service.getJourneySnapshot(meta.id))?.records.length, 1);
  service.close();
});

test('finalization retries after completion without duplicating or altering the journey', async () => {
  const service = testService();
  const meta = makeMetadata('finalize');
  const sample = makeSample(0);
  await service.createRecording(meta);
  await service.appendSampleAndMeta(meta.id, 0, start, sample, checkpoint(meta, [sample], start));
  const token = 'stable-final-token';
  const boundary = start + 5000;
  await service.beginFinalization(meta.id, token, 1, boundary);
  const snapshot = await service.getJourneySnapshot(meta.id);
  assert.ok(snapshot);
  const completed = {
    ...checkpoint(snapshot.metadata, snapshot.rawSamples, boundary),
    status: 'completed' as const,
    endedAt: boundary,
    sampleCount: 1,
    sampleRevision: 1,
    finalizationToken: token,
    finalizationBoundary: boundary,
  };
  await service.finalizeJourney(completed, token, 1);
  await service.beginFinalization(meta.id, token, 1, boundary);
  await service.finalizeJourney(completed, token, 1);
  const result = await service.getJourneySnapshot(meta.id);
  assert.equal(result?.metadata.status, 'completed');
  assert.equal(result?.records.length, 1);
  service.close();
});

test('finalization aborts with a storage conflict when journey metadata is missing', async () => {
  const service = testService();
  const meta = makeMetadata('missing-finalize-meta');
  const sample = makeSample(0);
  const token = 'missing-meta-token';
  const boundary = start + 5000;
  await service.createRecording(meta);
  await service.appendSampleAndMeta(meta.id, 0, start, sample, checkpoint(meta, [sample], start));
  await service.beginFinalization(meta.id, token, 1, boundary);

  const db = await (service as unknown as { openDb(): Promise<IDBDatabase> }).openDb();
  const removeTx = db.transaction('journeys', 'readwrite');
  const removeDone = transactionDone(removeTx);
  removeTx.objectStore('journeys').delete(meta.id);
  await removeDone;

  const finalMeta = {
    ...checkpoint(meta, [sample], boundary),
    status: 'completed' as const,
    endedAt: boundary,
    sampleCount: 1,
    sampleRevision: 1,
    finalizationToken: token,
    finalizationBoundary: boundary,
  };
  await assert.rejects(
    service.finalizeJourney(finalMeta, token, 1),
    /Journey disappeared during finalization/
  );
  assert.equal(await service.getJourney(meta.id), null);
  service.close();
});

test('recovery serializes and coalesces repeated calls and marks abandoned recording interrupted', async () => {
  const ownership = new RecordingOwnership(() => new TestLockManager());
  const service = new IndexedDbService(nextDbName(), ownership);
  const meta = makeMetadata('recovery');
  const sample = makeSample(0);
  await service.createRecording(meta);
  await service.appendSampleAndMeta(meta.id, 0, start, sample, checkpoint(meta, [sample], start));
  const firstCall = service.recoverInterruptedJourneys();
  const secondCall = service.recoverInterruptedJourneys();
  assert.equal(firstCall, secondCall);
  const outcome = await firstCall;
  assert.equal(outcome.recoveredJourneys[0]?.status, 'interrupted');
  assert.equal((await service.getJourneySnapshot(meta.id))?.records.length, 1);
  service.close();
});

test('finalizing journey recovers with its frozen finalization boundary', async () => {
  const ownership = new RecordingOwnership(() => new TestLockManager());
  const service = new IndexedDbService(nextDbName(), ownership);
  const meta = makeMetadata('recover-finalizing');
  const sample = makeSample(0);
  await service.createRecording(meta);
  await service.appendSampleAndMeta(meta.id, 0, start, sample, checkpoint(meta, [sample], start));
  await service.beginFinalization(meta.id, 'pending-token', 1, start + 9000);
  const outcome = await service.recoverInterruptedJourneys();
  assert.equal(outcome.recoveredJourneys[0]?.endedAt, start + 9000);
  assert.equal(outcome.recoveredJourneys[0]?.status, 'interrupted');
  service.close();
});

test('simultaneous recovery calls across services allow one recovery owner', async () => {
  const name = nextDbName();
  const lockManager = new TestLockManager();
  const first = new IndexedDbService(name, new RecordingOwnership(() => lockManager));
  const second = new IndexedDbService(name, new RecordingOwnership(() => lockManager));
  const meta = makeMetadata('simultaneous-recovery');
  const sample = makeSample(0);
  await first.createRecording(meta);
  await first.appendSampleAndMeta(meta.id, 0, start, sample, checkpoint(meta, [sample], start));
  const results = await Promise.all([first.recoverInterruptedJourneys(), second.recoverInterruptedJourneys()]);
  assert.equal(results.filter((result) => result.anotherContextOwnsRecording).length, 1);
  assert.equal(results.reduce((count, result) => count + result.recoveredJourneys.length, 0), 1);
  first.close();
  second.close();
});

test('GPX import uses fresh identity on collision and atomically stores ordered samples', async () => {
  const service = testService();
  const existing = makeMetadata('import-id', 'completed');
  await service.upsertJourneyMetadata(existing);
  const samples = [makeSample(0), makeSample(5000, -122.449)];
  const stats = calculateJourneyStatistics(samples, start, start + 5000);
  const journey: Journey = {
    ...applyJourneyStatistics({ ...existing, sampleCount: 2, sampleRevision: 2 }, stats),
    source: 'gpx', status: 'completed', sampleCount: 2, sampleRevision: 2,
    rawSamples: samples,
  };
  const saved = await service.saveCompleteJourney(journey);
  assert.notEqual(saved.id, journey.id);
  const snapshot = await service.getJourneySnapshot(saved.id);
  assert.deepEqual(snapshot?.records.map(({ ordinal }) => ordinal), [0, 1]);
  assert.deepEqual(snapshot?.records.map(({ sampleKey }) => sampleKey), [
    `journey:${saved.id}:0`, `journey:${saved.id}:1`,
  ]);
  service.close();
});

test('failed imported sample insertion rolls back newly added metadata', async () => {
  const service = testService();
  const candidate = { ...makeMetadata('orphan'), status: 'completed' as const };
  const db = await (service as unknown as { openDb(): Promise<IDBDatabase> }).openDb();
  const seed = db.transaction('samples', 'readwrite');
  const seedDone = transactionDone(seed);
  seed.objectStore('samples').add({
    journeyId: candidate.id, ordinal: 0, sampleKey: 'journey:orphan:0',
    capturedAt: start, timestamp: start, sample: makeSample(0),
  });
  await seedDone;
  const samples = [makeSample(0)];
  const stats = calculateJourneyStatistics(samples, start, start);
  const journey: Journey = {
    ...applyJourneyStatistics({ ...candidate, sampleCount: 1 }, stats),
    status: 'completed', source: 'gpx', rawSamples: samples,
  };
  await assert.rejects(service.saveCompleteJourney(journey), /Import transaction failed|ConstraintError/);
  assert.equal(await service.getJourney(candidate.id), null);
  service.close();
});

test('active journey cannot be modified or deleted', async () => {
  const service = testService();
  const meta = makeMetadata('protected');
  await service.createRecording(meta);
  await assert.rejects(service.deleteJourney(meta.id), /active recording cannot be deleted/);
  await assert.rejects(service.upsertJourneyMetadata({ ...meta, name: 'changed' }), /cannot be edited/);
  await assert.rejects(service.clearAllJourneys(), /Stop active recordings/);
  service.close();
});

test('journey ID conflict uses a new ID and never overwrites prior metadata', async () => {
  const service = testService();
  const existing = makeMetadata('collision', 'completed');
  await service.upsertJourneyMetadata(existing);
  const samples = [makeSample(0)];
  const stats = calculateJourneyStatistics(samples, start, start);
  const journey: Journey = {
    ...applyJourneyStatistics({ ...existing, sampleCount: 1 }, stats),
    status: 'completed', source: 'gpx', rawSamples: samples,
  };
  const saved = await service.saveCompleteJourney(journey);
  assert.notEqual(saved.id, existing.id);
  assert.equal((await service.getJourney(existing.id))?.sampleCount, 0);
  assert.equal((await service.getJourney(saved.id))?.sampleCount, 1);
  service.close();
});
