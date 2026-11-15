import type { FilteredRoutePoint } from '../types/journey';
import { computeBearingDegrees } from './geo';

export interface PlaybackFrameState {
  latitude: number;
  longitude: number;
  bearing: number;
  currentTimestamp: number;
  elapsedMs: number;
  totalDurationMs: number;
  progress: number; // 0..1
  distanceMeters: number;
  speedMps: number | null;
  accuracyMeters: number;
  progressiveCoordinates: [number, number][];
}

/**
 * Computes exact interpolated marker position, timestamp, progressive polyline, and stats
 * for any elapsed time (in ms) along a journey based on actual recorded timestamps.
 */
export function getPlaybackFrameAtElapsed(
  points: FilteredRoutePoint[],
  elapsedMs: number
): PlaybackFrameState | null {
  if (points.length === 0) return null;

  const first = points[0];
  const last = points[points.length - 1];
  const totalDurationMs = Math.max(0, last.sample.timestamp - first.sample.timestamp);

  if (points.length === 1 || totalDurationMs === 0) {
    return {
      latitude: first.sample.latitude,
      longitude: first.sample.longitude,
      bearing: first.sample.heading ?? 0,
      currentTimestamp: first.sample.timestamp,
      elapsedMs: 0,
      totalDurationMs,
      progress: points.length === 1 ? 1 : 0,
      distanceMeters: 0,
      speedMps: first.sample.speed,
      accuracyMeters: first.sample.accuracy,
      progressiveCoordinates: [[first.sample.longitude, first.sample.latitude]],
    };
  }

  const clampedElapsed = Math.max(0, Math.min(totalDurationMs, elapsedMs));
  const targetTs = first.sample.timestamp + clampedElapsed;

  // Binary search for segment [lo, lo+1] spanning targetTs
  let lo = 0;
  let hi = points.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (points[mid].sample.timestamp <= targetTs) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  const p1 = points[lo];
  const p2 = points[Math.min(points.length - 1, lo + 1)];
  const dt = p2.sample.timestamp - p1.sample.timestamp;
  const fraction = dt > 0 ? Math.max(0, Math.min(1, (targetTs - p1.sample.timestamp) / dt)) : 0;

  const latitude = p1.sample.latitude + fraction * (p2.sample.latitude - p1.sample.latitude);
  const longitude = p1.sample.longitude + fraction * (p2.sample.longitude - p1.sample.longitude);

  const bearing =
    p1.sample.latitude === p2.sample.latitude && p1.sample.longitude === p2.sample.longitude
      ? p1.sample.heading ?? 0
      : computeBearingDegrees(
          p1.sample.latitude,
          p1.sample.longitude,
          p2.sample.latitude,
          p2.sample.longitude
        );

  const distanceMeters =
    p1.cumulativeDistanceMeters +
    fraction * (p2.cumulativeDistanceMeters - p1.cumulativeDistanceMeters);

  const speedMps =
    p1.sample.speed !== null && p2.sample.speed !== null
      ? p1.sample.speed + fraction * (p2.sample.speed - p1.sample.speed)
      : p1.sample.speed ?? p2.sample.speed;

  const accuracyMeters = Math.round(
    p1.sample.accuracy + fraction * (p2.sample.accuracy - p1.sample.accuracy)
  );

  const progressiveCoordinates: [number, number][] = [];
  for (let i = 0; i <= lo; i++) {
    progressiveCoordinates.push([points[i].sample.longitude, points[i].sample.latitude]);
  }
  if (fraction > 0) {
    progressiveCoordinates.push([longitude, latitude]);
  }

  return {
    latitude,
    longitude,
    bearing,
    currentTimestamp: Math.round(targetTs),
    elapsedMs: clampedElapsed,
    totalDurationMs,
    progress: totalDurationMs > 0 ? clampedElapsed / totalDurationMs : 0,
    distanceMeters,
    speedMps,
    accuracyMeters,
    progressiveCoordinates,
  };
}
