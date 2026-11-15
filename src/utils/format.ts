import type { DistanceUnit } from '../types/settings';

export function formatDurationMs(ms: number): string {
  const safeMs = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function formatDistance(meters: number, unit: DistanceUnit): string {
  if (!Number.isFinite(meters) || meters < 0) {
    return unit === 'km' ? '0 m' : '0 ft';
  }
  if (unit === 'mi') {
    const miles = meters / 1609.344;
    if (miles < 0.1) {
      const feet = Math.round(meters * 3.28084);
      return `${feet} ft`;
    }
    return `${miles.toFixed(2)} mi`;
  }

  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}

export function formatSpeed(mps: number | null | undefined, unit: DistanceUnit): string {
  if (mps === null || mps === undefined || !Number.isFinite(mps) || mps < 0) {
    return '—';
  }
  if (unit === 'mi') {
    const mph = mps * 2.23693629;
    return `${mph.toFixed(1)} mph`;
  }
  const kmh = mps * 3.6;
  return `${kmh.toFixed(1)} km/h`;
}

export function formatCoordinate(value: number, axis: 'lat' | 'lng'): string {
  const abs = Math.abs(value).toFixed(5);
  const hemi =
    axis === 'lat' ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  return `${abs}° ${hemi}`;
}

export function formatCoordsPair(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export function formatDateShort(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(timestamp));
}

export function formatTimeWithSeconds(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp));
}

export function formatDateTimeFull(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp));
}

export function getAccuracyQuality(accuracyMeters: number): {
  label: string;
  tier: 'good' | 'fair' | 'poor';
} {
  if (accuracyMeters <= 15) {
    return { label: `Good (${Math.round(accuracyMeters)} m)`, tier: 'good' };
  }
  if (accuracyMeters <= 45) {
    return { label: `Fair (${Math.round(accuracyMeters)} m)`, tier: 'fair' };
  }
  return { label: `Poor (${Math.round(accuracyMeters)} m)`, tier: 'poor' };
}
