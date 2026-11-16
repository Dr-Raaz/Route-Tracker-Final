import { useCallback, useEffect, useState } from 'react';
import {
  trackingEngine,
  type TrackingStateSnapshot,
} from '../services/gps/TrackingEngine';

export function useTracking(devTestMode: boolean) {
  const [state, setState] = useState<TrackingStateSnapshot>(() =>
    trackingEngine.getSnapshot()
  );

  useEffect(() => {
    const unsubscribe = trackingEngine.subscribe(setState);
    return unsubscribe;
  }, []);

  useEffect(() => {
    void trackingEngine.refreshPermission(devTestMode);
  }, [devTestMode]);

  const startTracking = useCallback(
    (customName?: string) =>
      trackingEngine.startTracking({ useTestMode: devTestMode, customName }),
    [devTestMode]
  );

  const stopTracking = useCallback(
    (customName?: string) => trackingEngine.stopTracking(customName),
    []
  );

  const locateOnce = useCallback(
    () => trackingEngine.locateOnce(devTestMode),
    [devTestMode]
  );

  const retryPersistence = useCallback(
    () => trackingEngine.retryPersistence(),
    []
  );

  return {
    tracking: state,
    startTracking,
    stopTracking,
    locateOnce,
    retryPersistence,
  };
}
