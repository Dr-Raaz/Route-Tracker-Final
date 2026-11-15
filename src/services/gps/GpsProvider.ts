import type {
  GpsError,
  GpsErrorCode,
  GpsPermissionStatus,
  GpsProvider,
  GpsSample,
  GpsWatchCallbacks,
  GpsWatchOptions,
} from '../../types/gps';

function mapGeolocationPosition(pos: GeolocationPosition): GpsSample {
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    timestamp: pos.timestamp || Date.now(),
    accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : 25,
    altitude:
      pos.coords.altitude !== null && Number.isFinite(pos.coords.altitude)
        ? pos.coords.altitude
        : null,
    speed:
      pos.coords.speed !== null && Number.isFinite(pos.coords.speed) && pos.coords.speed >= 0
        ? pos.coords.speed
        : null,
    heading:
      pos.coords.heading !== null && Number.isFinite(pos.coords.heading) && pos.coords.heading >= 0
        ? pos.coords.heading
        : null,
  };
}

function mapGeolocationError(err: GeolocationPositionError): GpsError {
  let code: GpsErrorCode = 'UNKNOWN';
  let message = 'Unable to retrieve GPS position.';

  switch (err.code) {
    case err.PERMISSION_DENIED:
      code = 'PERMISSION_DENIED';
      message =
        'Location permission was denied. Enable location access in your browser settings to record GPS journeys.';
      break;
    case err.POSITION_UNAVAILABLE:
      code = 'POSITION_UNAVAILABLE';
      message =
        'GPS signal is temporarily unavailable. Move outdoors or check device location services.';
      break;
    case err.TIMEOUT:
      code = 'TIMEOUT';
      message = 'Waiting for GPS satellite fix timed out. Retrying automatically.';
      break;
  }

  return {
    code,
    message,
    timestamp: Date.now(),
  };
}

/**
 * Standard Web Geolocation API provider.
 * Note: Browser background tracking when screen is locked or tab is suspended
 * is constrained by OS/browser power policies.
 */
export class BrowserGeolocationProvider implements GpsProvider {
  readonly kind = 'browser-geolocation' as const;
  readonly supportsReliableBackgroundTracking = false;

  async checkPermission(): Promise<GpsPermissionStatus> {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      return 'unsupported';
    }
    if ('permissions' in navigator && typeof navigator.permissions.query === 'function') {
      try {
        const status = await navigator.permissions.query({ name: 'geolocation' });
        if (status.state === 'granted' || status.state === 'denied' || status.state === 'prompt') {
          return status.state;
        }
      } catch {
        return 'unknown';
      }
    }
    return 'unknown';
  }

  requestInitialPosition(): Promise<GpsSample> {
    return new Promise((resolve, reject) => {
      if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
        reject({
          code: 'UNSUPPORTED',
          message: 'Geolocation API is not supported by this browser.',
          timestamp: Date.now(),
        } satisfies GpsError);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(mapGeolocationPosition(pos)),
        (err) => reject(mapGeolocationError(err)),
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 15000,
        }
      );
    });
  }

  startWatching(options: GpsWatchOptions, callbacks: GpsWatchCallbacks): () => void {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      callbacks.onError({
        code: 'UNSUPPORTED',
        message: 'Geolocation API is not supported by this browser.',
        timestamp: Date.now(),
      });
      return () => {};
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => callbacks.onSample(mapGeolocationPosition(pos)),
      (err) => callbacks.onError(mapGeolocationError(err)),
      {
        enableHighAccuracy: options.highAccuracy,
        maximumAge: 0,
        timeout: Math.max(12000, options.targetIntervalMs * 2),
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }
}

/**
 * Predefined coastal out-and-back / loop path in San Francisco (Crissy Field / Marina Green)
 * used ONLY when the user explicitly enables Development GPS Test Mode.
 * Deliberately revisits the central promenade segment so multi-visit route inspection
 * can also be verified deterministically.
 */
const DEV_TEST_WAYPOINTS: Array<{ lat: number; lng: number; speed: number; acc: number; alt: number }> = [
  { lat: 37.80490, lng: -122.44400, speed: 2.2, acc: 5, alt: 4 },
  { lat: 37.80493, lng: -122.44386, speed: 2.4, acc: 6, alt: 4 },
  { lat: 37.80496, lng: -122.44372, speed: 2.5, acc: 5, alt: 5 },
  { lat: 37.80499, lng: -122.44358, speed: 2.5, acc: 6, alt: 5 },
  { lat: 37.80502, lng: -122.44344, speed: 2.4, acc: 5, alt: 4 },
  { lat: 37.80506, lng: -122.44330, speed: 2.5, acc: 6, alt: 4 },
  { lat: 37.80511, lng: -122.44317, speed: 2.3, acc: 5, alt: 4 },
  { lat: 37.80518, lng: -122.44306, speed: 2.1, acc: 7, alt: 3 },
  { lat: 37.80527, lng: -122.44300, speed: 2.0, acc: 6, alt: 3 },
  { lat: 37.80533, lng: -122.44312, speed: 2.2, acc: 5, alt: 4 },
  { lat: 37.80527, lng: -122.44324, speed: 2.3, acc: 6, alt: 4 },
  { lat: 37.80515, lng: -122.44330, speed: 2.4, acc: 5, alt: 4 },
  // Revisits the Marina Green promenade heading back west
  { lat: 37.80503, lng: -122.44344, speed: 2.4, acc: 6, alt: 4 },
  { lat: 37.80500, lng: -122.44358, speed: 2.5, acc: 5, alt: 5 },
  { lat: 37.80497, lng: -122.44372, speed: 2.4, acc: 6, alt: 5 },
  { lat: 37.80494, lng: -122.44386, speed: 2.3, acc: 5, alt: 4 },
  { lat: 37.80491, lng: -122.44400, speed: 2.1, acc: 6, alt: 4 },
];

/**
 * Development-only GPS Test Provider.
 * Clearly tagged as 'dev-test-route' so simulated runs are never confused with real GPS.
 */
export class DevTestGpsProvider implements GpsProvider {
  readonly kind = 'dev-test-route' as const;
  readonly supportsReliableBackgroundTracking = false;

  private baseTimestamp = Date.now();
  private cursor = 0;

  async checkPermission(): Promise<GpsPermissionStatus> {
    return 'granted';
  }

  async requestInitialPosition(): Promise<GpsSample> {
    this.baseTimestamp = Date.now();
    this.cursor = 0;
    const wp = DEV_TEST_WAYPOINTS[0];
    return {
      latitude: wp.lat,
      longitude: wp.lng,
      timestamp: this.baseTimestamp,
      accuracy: wp.acc,
      altitude: wp.alt,
      speed: wp.speed,
      heading: 78,
    };
  }

  startWatching(_options: GpsWatchOptions, callbacks: GpsWatchCallbacks): () => void {
    // Advance every 1.2s in wall-clock time while emitting 5s-spaced journey timestamps
    // so developers can rapidly test 5s interval recording, route drawing, playback, and multi-visit inspection.
    const timer = window.setInterval(() => {
      this.cursor = (this.cursor + 1) % DEV_TEST_WAYPOINTS.length;
      const wp = DEV_TEST_WAYPOINTS[this.cursor];
      const prev =
        DEV_TEST_WAYPOINTS[(this.cursor - 1 + DEV_TEST_WAYPOINTS.length) % DEV_TEST_WAYPOINTS.length];

      const sampleTimestamp =
        this.baseTimestamp + (this.cursor === 0 ? DEV_TEST_WAYPOINTS.length : this.cursor) * 5000;
      if (this.cursor === 0) {
        this.baseTimestamp = sampleTimestamp;
      }

      const dLat = wp.lat - prev.lat;
      const dLng = wp.lng - prev.lng;
      const heading = ((Math.atan2(dLng, dLat) * 180) / Math.PI + 360) % 360;

      callbacks.onSample({
        latitude: wp.lat,
        longitude: wp.lng,
        timestamp: sampleTimestamp,
        accuracy: wp.acc,
        altitude: wp.alt,
        speed: wp.speed,
        heading,
      });
    }, 1200);

    return () => {
      window.clearInterval(timer);
    };
  }
}

export const browserGeolocationProvider = new BrowserGeolocationProvider();
export const devTestGpsProvider = new DevTestGpsProvider();
