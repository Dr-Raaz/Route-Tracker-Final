import type { GpsSample } from '../types/gps';
import type { GeoCoordinate, JourneyMetadata, FilteredRoutePoint } from '../types/journey';
import { buildFilteredRoutePoints, buildPreviewCoordinates } from './geo';

export const CURRENT_STATISTICS_VERSION = 1;

export interface JourneyStatistics {
  endedAt: number;
  durationMs: number;
  distanceMeters: number;
  averageSpeedMps: number | null;
  maxSpeedMps: number | null;
  sampleCount: number;
  filteredPointCount: number;
  startLocation: GeoCoordinate | null;
  endLocation: GeoCoordinate | null;
  previewCoordinates: [number, number][];
  filteredPoints: FilteredRoutePoint[];
}

export function validateGpsSample(sample: GpsSample): string | null {
  if (!sample || typeof sample !== 'object') return 'GPS provider returned no measurement.';
  if (!Number.isFinite(sample.latitude) || sample.latitude < -90 || sample.latitude > 90) {
    return 'GPS measurement has an invalid latitude.';
  }
  if (!Number.isFinite(sample.longitude) || sample.longitude < -180 || sample.longitude > 180) {
    return 'GPS measurement has an invalid longitude.';
  }
  if (!Number.isSafeInteger(sample.timestamp) || Math.abs(sample.timestamp) > 8.64e15) {
    return 'GPS measurement has an invalid timestamp.';
  }
  if (!Number.isFinite(sample.accuracy) || sample.accuracy < 0) {
    return 'GPS measurement has invalid accuracy.';
  }
  if (sample.altitude !== null && !Number.isFinite(sample.altitude)) {
    return 'GPS measurement has invalid altitude.';
  }
  if (sample.speed !== null && (!Number.isFinite(sample.speed) || sample.speed < 0)) {
    return 'GPS measurement has invalid speed.';
  }
  if (
    sample.heading !== null &&
    (!Number.isFinite(sample.heading) || sample.heading < 0 || sample.heading > 360)
  ) {
    return 'GPS measurement has invalid heading.';
  }
  return null;
}

/**
 * Canonical, deterministic statistics calculation. Version 0 preserves the
 * pre-Phase-1 route calculation for recovery of old interrupted journeys.
 * Version 1 filters chronologically while retaining all measurements as raw data.
 */
export function calculateJourneyStatistics(
  rawSamples: GpsSample[],
  startedAt: number,
  lifecycleBoundary: number,
  version = CURRENT_STATISTICS_VERSION
): JourneyStatistics {
  const orderedSamples = version === 0
    ? [...rawSamples].sort((a, b) => a.timestamp - b.timestamp)
    : rawSamples;
  const filteredPoints = buildFilteredRoutePoints(orderedSamples, version);
  const distanceMeters = filteredPoints.at(-1)?.cumulativeDistanceMeters ?? 0;
  const durationMs = Math.max(0, lifecycleBoundary - startedAt);
  const speeds = rawSamples
    .map((sample) => sample.speed)
    .filter((speed): speed is number => speed !== null && Number.isFinite(speed) && speed >= 0);
  const first = orderedSamples[0];
  const last = orderedSamples[orderedSamples.length - 1];

  return {
    endedAt: lifecycleBoundary,
    durationMs,
    distanceMeters,
    averageSpeedMps: durationMs > 0 ? distanceMeters / (durationMs / 1000) : null,
    // Reduce instead of spreading: a long recording must not exceed the engine's
    // function-argument limit while computing a simple aggregate.
    maxSpeedMps: speeds.length ? speeds.reduce((maximum, speed) => Math.max(maximum, speed), 0) : null,
    sampleCount: rawSamples.length,
    filteredPointCount: filteredPoints.length,
    startLocation: first ? { latitude: first.latitude, longitude: first.longitude } : null,
    endLocation: last ? { latitude: last.latitude, longitude: last.longitude } : null,
    previewCoordinates: buildPreviewCoordinates(filteredPoints),
    filteredPoints,
  };
}

export function applyJourneyStatistics(
  metadata: JourneyMetadata,
  statistics: JourneyStatistics
): JourneyMetadata {
  const { filteredPoints: _filteredPoints, ...values } = statistics;
  return { ...metadata, ...values };
}
