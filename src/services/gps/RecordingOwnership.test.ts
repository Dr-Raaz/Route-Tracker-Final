import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RecordingOwnership,
  type WebLockManagerLike,
} from './RecordingOwnership';

class TestLockManager implements WebLockManagerLike {
  private held = false;

  async request<T>(
    _name: string,
    _options: { mode: 'exclusive'; ifAvailable: true },
    callback: (lock: Lock | null) => T | PromiseLike<T>
  ): Promise<T> {
    if (this.held) return callback(null);
    this.held = true;
    try {
      return await callback({} as Lock);
    } finally {
      this.held = false;
    }
  }
}

function createContexts() {
  const locks = new TestLockManager();
  return {
    firstTab: new RecordingOwnership(() => locks),
    secondTab: new RecordingOwnership(() => locks),
  };
}

test('another tab cannot own or start recording while the first tab holds the lock', async () => {
  const { firstTab, secondTab } = createContexts();
  const lease = await firstTab.tryAcquire();
  assert.ok(lease);
  assert.equal(await secondTab.tryAcquire(), null);
  await lease.release();
});

test('a second start attempt is rejected instead of taking ownership', async () => {
  const { firstTab, secondTab } = createContexts();
  const firstLease = await firstTab.tryAcquire();
  assert.ok(firstLease);
  assert.equal(await secondTab.tryAcquire(), null);
  await firstLease.release();
});

test('normal stop releases ownership for another tab', async () => {
  const { firstTab, secondTab } = createContexts();
  const firstLease = await firstTab.tryAcquire();
  assert.ok(firstLease);
  await firstLease.release();
  const secondLease = await secondTab.tryAcquire();
  assert.ok(secondLease);
  await secondLease.release();
});

test('unexpected context closure is modeled by browser lock release', async () => {
  const { firstTab, secondTab } = createContexts();
  const firstLease = await firstTab.tryAcquire();
  assert.ok(firstLease);
  // Web Locks releases locks when a context terminates; release() models that event.
  await firstLease.release();
  const recoveryLease = await secondTab.tryAcquire();
  assert.ok(recoveryLease);
  await recoveryLease.release();
});

test('recovery can acquire ownership after the former owner releases it', async () => {
  const { firstTab, secondTab } = createContexts();
  const recordingLease = await firstTab.tryAcquire();
  assert.ok(recordingLease);
  await recordingLease.release();
  const recoveryLease = await secondTab.tryAcquire();
  assert.ok(recoveryLease);
  await recoveryLease.release();
});

test('simultaneous recovery attempts grant at most one lease', async () => {
  const { firstTab, secondTab } = createContexts();
  const results = await Promise.all([firstTab.tryAcquire(), secondTab.tryAcquire()]);
  assert.equal(results.filter(Boolean).length, 1);
  await Promise.all(results.filter((lease) => lease !== null).map((lease) => lease.release()));
});

test('recording fails closed when Web Locks are unavailable', async () => {
  const ownership = new RecordingOwnership(() => null);
  await assert.rejects(ownership.tryAcquire(), /cannot safely coordinate recording/);
});
