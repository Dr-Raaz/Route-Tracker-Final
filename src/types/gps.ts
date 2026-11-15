export interface GpsSample {
  latitude: number;
  longitude: number;
  timestamp: number; // Unix epoch ms
  accuracy: number; // meters
  altitude: number | null;
  speed: number | null; // m/s
  heading: number | null; // degrees 0..360
}

export type GpsPermissionStatus =
  | 'prompt'
  | 'granted'
  | 'denied'
  | 'unsupported'
  | 'unknown';

export type GpsErrorCode =
  | 'PERMISSION_DENIED'
  | 'POSITION_UNAVAILABLE'
  | 'TIMEOUT'
  | 'UNSUPPORTED'
  | 'UNKNOWN';

export interface GpsError {
  code: GpsErrorCode;
  message: string;
  timestamp: number;
}

export type GpsProviderKind = 'browser-geolocation' | 'dev-test-route' | 'capacitor-native';

export interface GpsWatchOptions {
  targetIntervalMs: number;
  highAccuracy: boolean;
}

export interface GpsWatchCallbacks {
  onSample: (sample: GpsSample) => void;
  onError: (error: GpsError) => void;
}

/**
 * Platform-agnostic GPS provider contract.
 * Designed so BrowserGeolocationProvider can be swapped for a Capacitor
 * Background Geolocation plugin on Android without altering TrackingEngine or UI.
 */
export interface GpsProvider {
  readonly kind: GpsProviderKind;
  readonly supportsReliableBackgroundTracking: boolean;
  checkPermission(): Promise<GpsPermissionStatus>;
  requestInitialPosition(): Promise<GpsSample>;
  startWatching(options: GpsWatchOptions, callbacks: GpsWatchCallbacks): () => void;
}
