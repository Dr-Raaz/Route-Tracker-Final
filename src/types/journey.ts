import type { GpsProviderKind, GpsSample } from './gps';

export type JourneyStatus = 'recording' | 'completed' | 'interrupted';
export type JourneySource = 'gps' | 'gpx' | 'dev-test';

export interface GeoCoordinate {
  latitude: number;
  longitude: number;
}

export interface JourneyMetadata {
  id: string;
  name: string;
  createdAt: number;
  startedAt: number;
  endedAt: number | null;
  durationMs: number;
  distanceMeters: number;
  averageSpeedMps: number | null;
  maxSpeedMps: number | null;
  sampleCount: number;
  filteredPointCount: number;
  startLocation: GeoCoordinate | null;
  endLocation: GeoCoordinate | null;
  startLabel?: string;
  endLabel?: string;
  status: JourneyStatus;
  source: JourneySource;
  providerKind: GpsProviderKind;
  /** Compact simplified polyline [lng, lat][] for instant SVG previews in History */
  previewCoordinates: [number, number][];
}

export interface Journey extends JourneyMetadata {
  /** All original, unaltered GPS measurements */
  rawSamples: GpsSample[];
}

export interface FilteredRoutePoint {
  sample: GpsSample;
  rawIndex: number;
  cumulativeDistanceMeters: number;
}

export interface RouteInspectionVisit {
  visitNumber: number;
  latitude: number;
  longitude: number;
  timestamp: number;
  isInterpolated: boolean;
  distanceFromStartMeters: number;
  accuracyMeters: number;
  speedMps: number | null;
  altitudeMeters: number | null;
  segmentIndex: number;
  segmentFraction: number;
  beforeSampleTimestamp: number;
  afterSampleTimestamp: number;
  distanceFromTapMeters: number;
}

export interface RouteInspectionResult {
  tappedCoordinate: GeoCoordinate;
  visits: RouteInspectionVisit[];
}

export type PlaybackSpeed = 1 | 2 | 4 | 8;

export interface GeoJsonLineStringGeometry {
  type: 'LineString';
  coordinates: [number, number][];
}

export interface GeoJsonPointGeometry {
  type: 'Point';
  coordinates: [number, number];
}

export interface GeoJsonPolygonGeometry {
  type: 'Polygon';
  coordinates: [number, number][][];
}

export type GeoJsonGeometry =
  | GeoJsonLineStringGeometry
  | GeoJsonPointGeometry
  | GeoJsonPolygonGeometry;

export interface GeoJsonFeature<G extends GeoJsonGeometry = GeoJsonGeometry> {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: G;
}

export interface GeoJsonFeatureCollection<G extends GeoJsonGeometry = GeoJsonGeometry> {
  type: 'FeatureCollection';
  features: GeoJsonFeature<G>[];
}
