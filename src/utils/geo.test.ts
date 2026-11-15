import test from 'node:test';
import assert from 'node:assert/strict';
import type { GpsSample } from '../types/gps';
import {
  buildFilteredRoutePoints,
  haversineDistanceMeters,
  inspectRouteAtCoordinate,
  isDuplicateSample,
} from './geo';
import { exportJourneyToGpx, parseGpxToJourney } from './gpx';
import { getPlaybackFrameAtElapsed } from './playback';
import type { Journey } from '../types/journey';

const baseTime = 1763200000000;

function makeSample(
  lat: number,
  lng: number,
  offsetSec: number,
  accuracy = 6,
  speed: number | null = 1.5
): GpsSample {
  return {
    latitude: lat,
    longitude: lng,
    timestamp: baseTime + offsetSec * 1000,
    accuracy,
    altitude: 12,
    speed,
    heading: 90,
  };
}

test('haversineDistanceMeters computes accurate distance', () => {
  // ~111.19 meters per 0.001 degree of latitude
  const d = haversineDistanceMeters(37.8, -122.45, 37.801, -122.45);
  assert.ok(d > 110 && d < 112.5, `Expected ~111m, got ${d}`);
  assert.equal(haversineDistanceMeters(37.8, -122.45, 37.8, -122.45), 0);
});

test('isDuplicateSample detects identical timestamps and stationary sub-second duplicates', () => {
  const s1 = makeSample(37.8, -122.45, 0);
  const sSameTs = makeSample(37.8001, -122.45, 0);
  const sSubSecSameCoord = { ...s1, timestamp: s1.timestamp + 500 };
  const sFiveSecLater = makeSample(37.8, -122.45, 5);

  assert.equal(isDuplicateSample(s1, sSameTs), true);
  assert.equal(isDuplicateSample(s1, sSubSecSameCoord), true);
  assert.equal(isDuplicateSample(s1, sFiveSecLater), false);
});

test('buildFilteredRoutePoints filters impossible accuracy jumps without mutating raw samples', () => {
  const raw: GpsSample[] = [
    makeSample(37.8, -122.45, 0, 5),
    makeSample(37.8005, -122.45, 5, 5),
    makeSample(37.95, -122.1, 10, 400), // impossible ~35km jump in 5s with 400m accuracy
    makeSample(37.801, -122.45, 15, 6),
  ];

  const filtered = buildFilteredRoutePoints(raw);
  assert.equal(raw.length, 4);
  assert.equal(filtered.length, 3);
  assert.equal(filtered[2].rawIndex, 3);
  assert.ok(filtered[2].cumulativeDistanceMeters < 150);
});

test('inspectRouteAtCoordinate interpolates timestamp and detects multiple visits', () => {
  // Out-and-back route passing near (37.8005, -122.45) at t=5s and again at t=25s
  const raw: GpsSample[] = [
    makeSample(37.8000, -122.45, 0, 5, 2.0),
    makeSample(37.8010, -122.45, 10, 5, 2.0), // midpoint at t=5s is (37.8005, -122.45)
    makeSample(37.8015, -122.45, 15, 5, 2.0),
    makeSample(37.8010, -122.45, 20, 5, 2.0),
    makeSample(37.8000, -122.45, 30, 5, 2.0), // midpoint at t=25s is (37.8005, -122.45)
  ];

  const filtered = buildFilteredRoutePoints(raw);
  const res = inspectRouteAtCoordinate(filtered, {
    latitude: 37.8005,
    longitude: -122.45,
  });

  assert.ok(res !== null);
  assert.equal(res.visits.length, 2);

  const [v1, v2] = res.visits;
  assert.equal(v1.isInterpolated, true);
  assert.ok(Math.abs(v1.timestamp - (baseTime + 5000)) < 150);
  assert.ok(Math.abs(v2.timestamp - (baseTime + 25000)) < 150);
  assert.ok(v2.distanceFromStartMeters > v1.distanceFromStartMeters);
});

test('inspectRouteAtCoordinate marks vertex snap as directly recorded', () => {
  const raw: GpsSample[] = [
    makeSample(37.8000, -122.45, 0, 5),
    makeSample(37.8010, -122.45, 10, 5),
  ];
  const filtered = buildFilteredRoutePoints(raw);
  const res = inspectRouteAtCoordinate(filtered, {
    latitude: 37.8010,
    longitude: -122.45,
  });
  assert.ok(res !== null);
  assert.equal(res.visits[0].isInterpolated, false);
  assert.equal(res.visits[0].timestamp, baseTime + 10000);
});

test('GPX export and import round-trip preserves samples and timestamps', () => {
  const raw: GpsSample[] = [
    makeSample(37.8000, -122.45, 0, 5, 1.4),
    makeSample(37.8005, -122.4504, 5, 7, 1.8),
    makeSample(37.8010, -122.4508, 10, 6, 2.0),
  ];
  const filtered = buildFilteredRoutePoints(raw);

  const journey: Journey = {
    id: 'test-1',
    name: 'Marina Loop & Trail',
    createdAt: baseTime,
    startedAt: baseTime,
    endedAt: baseTime + 10000,
    durationMs: 10000,
    distanceMeters: filtered[2].cumulativeDistanceMeters,
    averageSpeedMps: 1.7,
    maxSpeedMps: 2.0,
    sampleCount: 3,
    filteredPointCount: 3,
    startLocation: { latitude: 37.8, longitude: -122.45 },
    endLocation: { latitude: 37.801, longitude: -122.4508 },
    status: 'completed',
    source: 'gps',
    providerKind: 'browser-geolocation',
    previewCoordinates: [],
    rawSamples: raw,
  };

  const gpx = exportJourneyToGpx(journey);
  const imported = parseGpxToJourney(gpx);

  assert.equal(imported.name, 'Marina Loop & Trail');
  assert.equal(imported.rawSamples.length, 3);
  assert.equal(imported.rawSamples[1].timestamp, baseTime + 5000);
  assert.ok(Math.abs(imported.rawSamples[1].latitude - 37.8005) < 1e-6);
  assert.ok(Math.abs(imported.rawSamples[1].accuracy - 7) < 0.01);
  assert.ok(Math.abs((imported.rawSamples[1].speed ?? 0) - 1.8) < 0.01);
});

test('getPlaybackFrameAtElapsed interpolates position based on actual timestamps', () => {
  // Non-uniform timestamps: 0s -> 10s (100m), 10s -> 12s (100m)
  const raw: GpsSample[] = [
    makeSample(37.8000, -122.45, 0),
    makeSample(37.8010, -122.45, 10),
    makeSample(37.8020, -122.45, 12),
  ];
  const filtered = buildFilteredRoutePoints(raw);

  // At 5s (halfway in time through first segment)
  const f1 = getPlaybackFrameAtElapsed(filtered, 5000);
  assert.ok(f1 !== null);
  assert.ok(Math.abs(f1.latitude - 37.8005) < 1e-6);
  assert.equal(f1.currentTimestamp, baseTime + 5000);

  // At 11s (halfway through second segment)
  const f2 = getPlaybackFrameAtElapsed(filtered, 11000);
  assert.ok(f2 !== null);
  assert.ok(Math.abs(f2.latitude - 37.8015) < 1e-6);
  assert.equal(f2.progressiveCoordinates.length, 3);
});
