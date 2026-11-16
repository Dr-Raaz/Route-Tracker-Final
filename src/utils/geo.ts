import type { GpsSample } from '../types/gps';
import type {
  FilteredRoutePoint,
  GeoCoordinate,
  GeoJsonFeature,
  GeoJsonLineStringGeometry,
  RouteInspectionResult,
  RouteInspectionVisit,
} from '../types/journey';

const EARTH_RADIUS_METERS = 6371008.8;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle Haversine distance between two WGS84 coordinates in meters.
 */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (lat1 === lat2 && lon1 === lon2) return 0;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const rLat1 = toRadians(lat1);
  const rLat2 = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return EARTH_RADIUS_METERS * c;
}

/**
 * Computes bearing in degrees (0..360) from coordinate 1 to coordinate 2.
 */
export function computeBearingDegrees(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const rLat1 = toRadians(lat1);
  const rLat2 = toRadians(lat2);
  const dLon = toRadians(lon2 - lon1);

  const y = Math.sin(dLon) * Math.cos(rLat2);
  const x =
    Math.cos(rLat1) * Math.sin(rLat2) -
    Math.sin(rLat1) * Math.cos(rLat2) * Math.cos(dLon);

  const theta = Math.atan2(y, x);
  return ((theta * 180) / Math.PI + 360) % 360;
}

/**
 * Evaluates whether a sample is a duplicate of the previous sample.
 */
export function isDuplicateSample(prev: GpsSample | undefined, next: GpsSample): boolean {
  if (!prev) return false;
  if (next.timestamp === prev.timestamp) return true;
  if (
    next.latitude === prev.latitude &&
    next.longitude === prev.longitude &&
    Math.abs(next.timestamp - prev.timestamp) < 1000
  ) {
    return true;
  }
  return false;
}

/**
 * Separates raw GPS measurements from filtered visualization route points.
 * Raw samples are never discarded; this function only builds a clean polyline
 * with cumulative distances while guarding against impossible accuracy jumps.
 */
export function buildFilteredRoutePoints(
  rawSamples: GpsSample[],
  version = 1
): FilteredRoutePoint[] {
  if (rawSamples.length === 0) return [];

  const result: FilteredRoutePoint[] = [];
  let cumulativeDistance = 0;

  let lastAcceptedTimestamp = -Infinity;
  for (let i = 0; i < rawSamples.length; i++) {
    const sample = rawSamples[i];
    if (!Number.isFinite(sample.latitude) || !Number.isFinite(sample.longitude)) {
      continue;
    }

    if (result.length === 0) {
      result.push({
        sample,
        rawIndex: i,
        cumulativeDistanceMeters: 0,
      });
      lastAcceptedTimestamp = sample.timestamp;
      continue;
    }

    // Version 1 routes are chronological. Rejected measurements stay in rawSamples,
    // and the comparison is always against the last accepted route point.
    if (version >= 1 && sample.timestamp <= lastAcceptedTimestamp) continue;

    const prev = result[result.length - 1].sample;
    const distMeters = haversineDistanceMeters(
      prev.latitude,
      prev.longitude,
      sample.latitude,
      sample.longitude
    );
    const dtSeconds = Math.max(0.1, (sample.timestamp - prev.timestamp) / 1000);
    const impliedSpeedMps = distMeters / dtSeconds;

    // Guard against obvious GPS multipath/cold-start jumps when accuracy is poor
    const combinedUncertainty = Math.max(25, prev.accuracy + sample.accuracy);
    const isImpossibleJump =
      (sample.accuracy > 150 && distMeters > combinedUncertainty * 2) ||
      (impliedSpeedMps > 140 && distMeters > combinedUncertainty + 50);

    if (isImpossibleJump) {
      continue;
    }

    cumulativeDistance += distMeters;
    result.push({
      sample,
      rawIndex: i,
      cumulativeDistanceMeters: cumulativeDistance,
    });
    lastAcceptedTimestamp = sample.timestamp;
  }

  return result;
}

/**
 * Downsamples coordinates using uniform stride + endpoints for lightweight History SVG previews.
 */
export function buildPreviewCoordinates(
  points: FilteredRoutePoint[],
  maxPoints = 64
): [number, number][] {
  if (points.length === 0) return [];
  if (points.length <= maxPoints) {
    return points.map((p) => [p.sample.longitude, p.sample.latitude]);
  }
  const coords: [number, number][] = [];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints - 1; i++) {
    const idx = Math.round(i * step);
    const p = points[idx];
    coords.push([p.sample.longitude, p.sample.latitude]);
  }
  const last = points[points.length - 1];
  coords.push([last.sample.longitude, last.sample.latitude]);
  return coords;
}

/**
 * Converts FilteredRoutePoint[] into a GeoJSON Feature / LineString.
 */
export function routeToGeoJsonLine(
  points: FilteredRoutePoint[]
): GeoJsonFeature<GeoJsonLineStringGeometry> {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: points.map((p) => [p.sample.longitude, p.sample.latitude]),
    },
  };
}

/**
 * Computes [minLng, minLat, maxLng, maxLat] bounding box for points.
 */
export function computeRouteBounds(
  coordinates: [number, number][]
): [[number, number], [number, number]] | null {
  if (coordinates.length === 0) return null;
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const [lng, lat] of coordinates) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }

  if (!Number.isFinite(minLng)) return null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

/**
 * Local equirectangular projection around a reference latitude for accurate short-segment projection.
 */
function toLocalMeters(
  lat: number,
  lon: number,
  refLat: number,
  refLon: number
): { x: number; y: number } {
  const cosLat = Math.cos(toRadians(refLat));
  const x = toRadians(lon - refLon) * EARTH_RADIUS_METERS * cosLat;
  const y = toRadians(lat - refLat) * EARTH_RADIUS_METERS;
  return { x, y };
}

interface ProjectedHit {
  segmentIndex: number;
  fraction: number;
  projectedLat: number;
  projectedLon: number;
  distanceFromTapMeters: number;
}

function projectTapOntoSegment(
  tap: GeoCoordinate,
  a: GpsSample,
  b: GpsSample,
  segmentIndex: number
): ProjectedHit {
  const refLat = (a.latitude + b.latitude) / 2;
  const refLon = (a.longitude + b.longitude) / 2;

  const pA = toLocalMeters(a.latitude, a.longitude, refLat, refLon);
  const pB = toLocalMeters(b.latitude, b.longitude, refLat, refLon);
  const pT = toLocalMeters(tap.latitude, tap.longitude, refLat, refLon);

  const dx = pB.x - pA.x;
  const dy = pB.y - pA.y;
  const lenSq = dx * dx + dy * dy;

  let t = 0;
  if (lenSq > 1e-6) {
    t = ((pT.x - pA.x) * dx + (pT.y - pA.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }

  const projX = pA.x + t * dx;
  const projY = pA.y + t * dy;
  const distFromTap = Math.hypot(pT.x - projX, pT.y - projY);

  const projectedLat = a.latitude + t * (b.latitude - a.latitude);
  const projectedLon = a.longitude + t * (b.longitude - a.longitude);

  return {
    segmentIndex,
    fraction: t,
    projectedLat,
    projectedLon,
    distanceFromTapMeters: distFromTap,
  };
}

/**
 * Inspects any point along the displayed route, identifying the nearest route segment
 * and interpolating timestamps, distance, accuracy, and speed.
 * Also detects multiple chronological visits when the route crosses or revisits the same area.
 */
export function inspectRouteAtCoordinate(
  points: FilteredRoutePoint[],
  tappedCoordinate: GeoCoordinate,
  maxSelectionRadiusMeters = 350
): RouteInspectionResult | null {
  if (points.length === 0) return null;

  if (points.length === 1) {
    const only = points[0];
    const dist = haversineDistanceMeters(
      tappedCoordinate.latitude,
      tappedCoordinate.longitude,
      only.sample.latitude,
      only.sample.longitude
    );
    if (dist > maxSelectionRadiusMeters) return null;

    return {
      tappedCoordinate,
      visits: [
        {
          visitNumber: 1,
          latitude: only.sample.latitude,
          longitude: only.sample.longitude,
          timestamp: only.sample.timestamp,
          isInterpolated: false,
          distanceFromStartMeters: 0,
          accuracyMeters: only.sample.accuracy,
          speedMps: only.sample.speed,
          altitudeMeters: only.sample.altitude,
          segmentIndex: 0,
          segmentFraction: 0,
          beforeSampleTimestamp: only.sample.timestamp,
          afterSampleTimestamp: only.sample.timestamp,
          distanceFromTapMeters: dist,
        },
      ],
    };
  }

  const hits: ProjectedHit[] = [];
  let bestHit: ProjectedHit | null = null;

  for (let i = 0; i < points.length - 1; i++) {
    const hit = projectTapOntoSegment(
      tappedCoordinate,
      points[i].sample,
      points[i + 1].sample,
      i
    );
    hits.push(hit);
    if (!bestHit || hit.distanceFromTapMeters < bestHit.distanceFromTapMeters) {
      bestHit = hit;
    }
  }

  if (!bestHit || bestHit.distanceFromTapMeters > maxSelectionRadiusMeters) {
    return null;
  }

  // Gather candidate hits close to the tapped location (within max(30m, bestDist * 2.2))
  // so that multiple visits along a crossing or out-and-back route are captured.
  const multiVisitThreshold = Math.min(
    maxSelectionRadiusMeters,
    Math.max(35, bestHit.distanceFromTapMeters * 2.2 + 15)
  );

  const candidateHits = hits.filter(
    (h) => h.distanceFromTapMeters <= multiVisitThreshold
  );

  // Cluster contiguous segment hits into distinct chronological visits.
  // Two hits belong to the same visit if their segment indices are consecutive
  // or separated by <= 2 segments / < 15 seconds.
  const clusters: ProjectedHit[][] = [];
  for (const hit of candidateHits) {
    const lastCluster = clusters[clusters.length - 1];
    if (!lastCluster) {
      clusters.push([hit]);
      continue;
    }
    const prevHit = lastCluster[lastCluster.length - 1];
    const timeGapMs =
      points[hit.segmentIndex].sample.timestamp -
      points[prevHit.segmentIndex].sample.timestamp;

    if (hit.segmentIndex - prevHit.segmentIndex <= 2 && timeGapMs < 20_000) {
      lastCluster.push(hit);
    } else {
      clusters.push([hit]);
    }
  }

  // Pick the closest hit within each distinct visit cluster
  const selectedHits = clusters.map((cluster) =>
    cluster.reduce((best, cur) =>
      cur.distanceFromTapMeters < best.distanceFromTapMeters ? cur : best
    )
  );

  // Ensure the global bestHit is represented cleanly
  const visits: RouteInspectionVisit[] = selectedHits.map((hit, idx) => {
    const p1 = points[hit.segmentIndex];
    const p2 = points[hit.segmentIndex + 1];
    const s1 = p1.sample;
    const s2 = p2.sample;
    const t = hit.fraction;

    const snappedStart = t <= 0.02;
    const snappedEnd = t >= 0.98;
    const isDirect = snappedStart || snappedEnd || s1.timestamp === s2.timestamp;
    const directPoint = snappedEnd ? p2 : p1;

    const timestamp = isDirect
      ? directPoint.sample.timestamp
      : Math.round(s1.timestamp + t * (s2.timestamp - s1.timestamp));

    const segDist = p2.cumulativeDistanceMeters - p1.cumulativeDistanceMeters;
    const distanceFromStartMeters = isDirect
      ? directPoint.cumulativeDistanceMeters
      : p1.cumulativeDistanceMeters + t * segDist;

    const accuracyMeters = isDirect
      ? directPoint.sample.accuracy
      : Math.round(s1.accuracy + t * (s2.accuracy - s1.accuracy));

    let speedMps: number | null = null;
    if (isDirect) {
      speedMps = directPoint.sample.speed;
    } else if (s1.speed !== null && s2.speed !== null) {
      speedMps = s1.speed + t * (s2.speed - s1.speed);
    } else if (s1.speed !== null) {
      speedMps = s1.speed;
    } else if (s2.speed !== null) {
      speedMps = s2.speed;
    }

    let altitudeMeters: number | null = null;
    if (isDirect) {
      altitudeMeters = directPoint.sample.altitude;
    } else if (s1.altitude !== null && s2.altitude !== null) {
      altitudeMeters = s1.altitude + t * (s2.altitude - s1.altitude);
    }

    return {
      visitNumber: idx + 1,
      latitude: isDirect ? directPoint.sample.latitude : hit.projectedLat,
      longitude: isDirect ? directPoint.sample.longitude : hit.projectedLon,
      timestamp,
      isInterpolated: !isDirect,
      distanceFromStartMeters,
      accuracyMeters,
      speedMps,
      altitudeMeters,
      segmentIndex: hit.segmentIndex,
      segmentFraction: t,
      beforeSampleTimestamp: s1.timestamp,
      afterSampleTimestamp: s2.timestamp,
      distanceFromTapMeters: hit.distanceFromTapMeters,
    };
  });

  return {
    tappedCoordinate,
    visits,
  };
}
