import test from 'node:test';
import assert from 'node:assert/strict';
import type { GpsSample } from '../types/gps';
import {
  calculateJourneyStatistics,
  CURRENT_STATISTICS_VERSION,
  validateGpsSample,
} from './journeyStats';

const start = 1_760_000_000_000;

function sample(offset: number, longitude = -122.45, speed: number | null = 2): GpsSample {
  return {
    latitude: 37.8,
    longitude,
    timestamp: start + offset,
    accuracy: 5,
    altitude: 10,
    speed,
    heading: 90,
  };
}

test('canonical statistics keep raw count and maximum speed for route-rejected points', () => {
  const raw = [
    sample(0),
    sample(10_000, -122.449),
    sample(5_000, -122.4485, 70), // earlier than the last accepted point
    sample(15_000, -122.448),
    sample(20_000, -122.1, 70), // poor-position outlier rejected from the route
  ];
  const stats = calculateJourneyStatistics(raw, start, start + 20_000);

  assert.equal(stats.sampleCount, 5);
  assert.equal(stats.filteredPointCount, 3);
  assert.equal(stats.maxSpeedMps, 70);
  assert.equal(stats.endedAt, start + 20_000);
  assert.equal(stats.durationMs, 20_000);
  assert.deepEqual(stats.previewCoordinates, [
    [-122.45, 37.8],
    [-122.449, 37.8],
    [-122.448, 37.8],
  ]);
});

test('sample validation rejects malformed measurements without route-filter involvement', () => {
  assert.equal(validateGpsSample(sample(0)), null);
  assert.match(validateGpsSample({ ...sample(0), latitude: 91 }) ?? '', /latitude/);
  assert.match(validateGpsSample({ ...sample(0), timestamp: 1.5 }) ?? '', /timestamp/);
  assert.match(validateGpsSample({ ...sample(0), accuracy: -1 }) ?? '', /accuracy/);
});

test('statistics version is explicit and deterministic for one raw sequence and boundary', () => {
  const raw = [sample(0), sample(5_000, -122.449), sample(10_000, -122.448)];
  const live = calculateJourneyStatistics(raw, start, start + 11_000, CURRENT_STATISTICS_VERSION);
  const finalized = calculateJourneyStatistics(raw, start, start + 11_000, CURRENT_STATISTICS_VERSION);
  const recovered = calculateJourneyStatistics(raw, start, start + 11_000, CURRENT_STATISTICS_VERSION);

  assert.deepEqual(live, finalized);
  assert.deepEqual(finalized, recovered);
});
