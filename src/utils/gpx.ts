import type { GpsSample } from '../types/gps';
import type { Journey } from '../types/journey';
import { calculateJourneyStatistics, CURRENT_STATISTICS_VERSION } from './journeyStats';

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function unescapeXml(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

/**
 * Serializes a Journey into standard GPX 1.1 XML preserving original GPS timestamps,
 * coordinates, elevation, and optional speed/accuracy/heading extensions.
 */
export function exportJourneyToGpx(journey: Journey): string {
  const safeName = escapeXml(journey.name || 'Recorded Journey');
  const startIso = new Date(journey.startedAt).toISOString();

  const trkpts = journey.rawSamples
    .map((s) => {
      const iso = new Date(s.timestamp).toISOString();
      const eleLine =
        s.altitude !== null && Number.isFinite(s.altitude)
          ? `\n        <ele>${s.altitude.toFixed(2)}</ele>`
          : '';
      const extFields: string[] = [];
      if (Number.isFinite(s.accuracy)) {
        extFields.push(`<accuracy>${s.accuracy.toFixed(2)}</accuracy>`);
      }
      if (s.speed !== null && Number.isFinite(s.speed)) {
        extFields.push(`<speed>${s.speed.toFixed(3)}</speed>`);
      }
      if (s.heading !== null && Number.isFinite(s.heading)) {
        extFields.push(`<heading>${s.heading.toFixed(2)}</heading>`);
      }
      const extBlock =
        extFields.length > 0
          ? `\n        <extensions><wayline>${extFields.join('')}</wayline></extensions>`
          : '';

      return `      <trkpt lat="${s.latitude.toFixed(7)}" lon="${s.longitude.toFixed(7)}">${eleLine}
        <time>${iso}</time>${extBlock}
      </trkpt>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Wayline GPS" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${safeName}</name>
    <time>${startIso}</time>
  </metadata>
  <trk>
    <name>${safeName}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}

function extractTagValue(block: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = block.match(regex);
  return match ? match[1].trim() : null;
}

function extractAttr(attrs: string, attrName: string): string | null {
  const regex = new RegExp(`\\b${attrName}\\s*=\\s*["']([^"']+)["']`, 'i');
  const match = attrs.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * Parses a GPX 1.1/1.0 XML string into a validated Journey object ready for IndexedDB storage.
 * Works purely with string parsing (no DOM dependency) so it runs reliably in browser and Node tests.
 */
export function parseGpxToJourney(
  gpxXml: string,
  fallbackName = 'Imported GPX Journey'
): Journey {
  if (!gpxXml || !gpxXml.includes('<gpx')) {
    throw new Error('Invalid GPX file: missing <gpx> root element.');
  }

  const trkBlockMatch = gpxXml.match(/<trk>([\s\S]*?)<\/trk>/i);
  const trkNameRaw = trkBlockMatch ? extractTagValue(trkBlockMatch[1], 'name') : null;
  const metaBlockMatch = gpxXml.match(/<metadata>([\s\S]*?)<\/metadata>/i);
  const metaNameRaw = metaBlockMatch ? extractTagValue(metaBlockMatch[1], 'name') : null;
  const name = unescapeXml(trkNameRaw || metaNameRaw || fallbackName);

  const trkptRegex = /<trkpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/trkpt>)/gi;
  const samples: GpsSample[] = [];
  let fallbackTime = Date.now();

  let match: RegExpExecArray | null;
  while ((match = trkptRegex.exec(gpxXml)) !== null) {
    const attrs = match[1] ?? '';
    const inner = match[2] ?? '';

    const latStr = extractAttr(attrs, 'lat');
    const lonStr = extractAttr(attrs, 'lon');
    if (latStr === null || lonStr === null) continue;

    const latitude = Number.parseFloat(latStr);
    const longitude = Number.parseFloat(lonStr);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      continue;
    }

    const timeStr = extractTagValue(inner, 'time');
    const parsedTime = timeStr ? Date.parse(timeStr) : NaN;
    const timestamp = Number.isFinite(parsedTime) ? parsedTime : fallbackTime;
    fallbackTime = timestamp + 5000;

    const eleStr = extractTagValue(inner, 'ele');
    const ele = eleStr !== null ? Number.parseFloat(eleStr) : NaN;
    const altitude = Number.isFinite(ele) ? ele : null;

    const accStr = extractTagValue(inner, 'accuracy');
    const acc = accStr !== null ? Number.parseFloat(accStr) : NaN;
    const accuracy = Number.isFinite(acc) && acc >= 0 ? acc : 10;

    const speedStr = extractTagValue(inner, 'speed');
    const spd = speedStr !== null ? Number.parseFloat(speedStr) : NaN;
    const speed = Number.isFinite(spd) && spd >= 0 ? spd : null;

    const headStr = extractTagValue(inner, 'heading');
    const hdg = headStr !== null ? Number.parseFloat(headStr) : NaN;
    const heading = Number.isFinite(hdg) ? hdg : null;

    samples.push({
      latitude,
      longitude,
      timestamp,
      accuracy,
      altitude,
      speed,
      heading,
    });
  }

  if (samples.length === 0) {
    throw new Error('No valid track points (<trkpt>) were found in this GPX file.');
  }

  samples.sort((a, b) => a.timestamp - b.timestamp);

  const startedAt = samples[0].timestamp;
  const endedAt = samples[samples.length - 1].timestamp;
  const stats = calculateJourneyStatistics(samples, startedAt, endedAt, CURRENT_STATISTICS_VERSION);
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? `gpx-${crypto.randomUUID()}`
    : `gpx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    name,
    createdAt: Date.now(),
    startedAt,
    endedAt: stats.endedAt,
    durationMs: stats.durationMs,
    distanceMeters: stats.distanceMeters,
    averageSpeedMps: stats.averageSpeedMps,
    maxSpeedMps: stats.maxSpeedMps,
    sampleCount: samples.length,
    filteredPointCount: stats.filteredPointCount,
    startLocation: stats.startLocation,
    endLocation: stats.endLocation,
    status: 'completed',
    source: 'gpx',
    providerKind: 'browser-geolocation',
    previewCoordinates: stats.previewCoordinates,
    sampleRevision: samples.length,
    statisticsVersion: CURRENT_STATISTICS_VERSION,
    finalizationToken: null,
    rawSamples: samples,
  };
}
