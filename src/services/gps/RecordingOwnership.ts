export const RECORDING_LOCK_NAME = 'route-tracker:active-recording';

export interface WebLockManagerLike {
  request<T>(
    name: string,
    options: { mode: 'exclusive'; ifAvailable: true },
    callback: (lock: Lock | null) => T | PromiseLike<T>
  ): Promise<T>;
}

export interface RecordingLockLease {
  release(): Promise<void>;
}

export class RecordingOwnershipUnavailableError extends Error {
  constructor(message = 'This browser cannot safely coordinate recording across tabs. Use a current browser over HTTPS or localhost.') {
    super(message);
    this.name = 'RecordingOwnershipUnavailableError';
  }
}

function getLockManager(): WebLockManagerLike | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as Navigator & { locks?: WebLockManagerLike }).locks ?? null;
}

/**
 * Holds one origin-wide exclusive lock for a recording or recovery operation.
 * A null acquisition means another context currently owns the recording slot.
 */
export class RecordingOwnership {
  private readonly managerProvider: () => WebLockManagerLike | null;

  constructor(managerProvider: () => WebLockManagerLike | null = getLockManager) {
    this.managerProvider = managerProvider;
  }

  async tryAcquire(): Promise<RecordingLockLease | null> {
    const manager = this.managerProvider();
    if (!manager) throw new RecordingOwnershipUnavailableError();

    let signalAcquired!: (acquired: boolean) => void;
    let rejectAcquisition!: (error: unknown) => void;
    let acquisitionSettled = false;
    let releaseLock!: () => void;
    const acquired = new Promise<boolean>((resolve, reject) => {
      signalAcquired = (value) => {
        acquisitionSettled = true;
        resolve(value);
      };
      rejectAcquisition = reject;
    });
    const released = new Promise<void>((resolve) => { releaseLock = resolve; });

    const lockRequest = manager.request(
      RECORDING_LOCK_NAME,
      { mode: 'exclusive', ifAvailable: true },
      async (lock) => {
        if (!lock) {
          signalAcquired(false);
          return;
        }
        signalAcquired(true);
        await released;
      }
    );
    void lockRequest.catch((error) => {
      if (!acquisitionSettled) rejectAcquisition(error);
    });

    if (!(await acquired)) {
      await lockRequest;
      return null;
    }

    let didRelease = false;
    return {
      release: async () => {
        if (!didRelease) {
          didRelease = true;
          releaseLock();
        }
        await lockRequest;
      },
    };
  }
}

export const recordingOwnership = new RecordingOwnership();
