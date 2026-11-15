import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Map as MapLibreMap,
  setWorkerUrl,
  type GeoJSONSource,
  type MapMouseEvent,
} from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { Crosshair, Maximize2, Minus, Plus, WifiOff } from 'lucide-react';
import type {
  GeoCoordinate,
  GeoJsonFeatureCollection,
  GeoJsonLineStringGeometry,
  GeoJsonPointGeometry,
  GeoJsonPolygonGeometry,
} from '../../types/journey';
import type { ThemeMode } from '../../types/settings';
import { computeRouteBounds } from '../../utils/geo';

setWorkerUrl(maplibreWorkerUrl);

export interface JourneyMapHandle {
  updatePlaybackOverlay: (params: {
    progressiveCoordinates: [number, number][];
    markerCoordinate: [number, number] | null;
  }) => void;
  fitRouteBounds: () => void;
  recenterOnPosition: (coord: GeoCoordinate) => void;
}

interface JourneyMapProps {
  theme: ThemeMode;
  mode: 'live' | 'details' | 'playback';
  /** Full route coordinates [lng, lat][] */
  routeCoordinates: [number, number][];
  /** Optional progressive coordinates [lng, lat][] for initial playback render */
  progressiveCoordinates?: [number, number][];
  startCoordinate?: GeoCoordinate | null;
  finishCoordinate?: GeoCoordinate | null;
  currentCoordinate?: GeoCoordinate | null;
  currentAccuracyMeters?: number | null;
  inspectedCoordinate?: GeoCoordinate | null;
  followCurrentPosition?: boolean;
  onRouteCoordinateClick?: (coord: GeoCoordinate) => void;
  className?: string;
}

function createGeoJsonLine(
  coords: [number, number][]
): GeoJsonFeatureCollection<GeoJsonLineStringGeometry> {
  return {
    type: 'FeatureCollection',
    features:
      coords.length >= 2
        ? [
            {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: coords,
              },
            },
          ]
        : [],
  };
}

function createGeoJsonPoint(
  coord: GeoCoordinate | [number, number] | null | undefined
): GeoJsonFeatureCollection<GeoJsonPointGeometry> {
  if (!coord) {
    return { type: 'FeatureCollection', features: [] };
  }
  const lngLat: [number, number] = Array.isArray(coord)
    ? coord
    : [coord.longitude, coord.latitude];
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Point',
          coordinates: lngLat,
        },
      },
    ],
  };
}

function createAccuracyPolygon(
  coord: GeoCoordinate | null | undefined,
  radiusMeters: number | null | undefined
): GeoJsonFeatureCollection<GeoJsonPolygonGeometry> {
  if (!coord || !radiusMeters || radiusMeters <= 0) {
    return { type: 'FeatureCollection', features: [] };
  }
  const steps = 40;
  const latRad = (coord.latitude * Math.PI) / 180;
  const metersPerDegLat = 111132.954;
  const metersPerDegLng = 111132.954 * Math.max(0.1, Math.cos(latRad));

  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const dx = Math.cos(angle) * radiusMeters;
    const dy = Math.sin(angle) * radiusMeters;
    ring.push([
      coord.longitude + dx / metersPerDegLng,
      coord.latitude + dy / metersPerDegLat,
    ]);
  }

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [ring],
        },
      },
    ],
  };
}

const DEFAULT_CENTER: [number, number] = [-122.444, 37.805];

export const JourneyMap = forwardRef<JourneyMapHandle, JourneyMapProps>(
  function JourneyMap(
    {
      theme,
      mode,
      routeCoordinates,
      progressiveCoordinates = [],
      startCoordinate,
      finishCoordinate,
      currentCoordinate,
      currentAccuracyMeters,
      inspectedCoordinate,
      followCurrentPosition = true,
      onRouteCoordinateClick,
      className = '',
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<MapLibreMap | null>(null);
    const mapLoadedRef = useRef(false);
    const hasAutoCenteredRef = useRef(false);
    const onRouteClickRef = useRef(onRouteCoordinateClick);
    onRouteClickRef.current = onRouteCoordinateClick;

    const routeCoordsRef = useRef(routeCoordinates);
    routeCoordsRef.current = routeCoordinates;

    const [tilesUnavailable, setTilesUnavailable] = useState<boolean>(
      typeof navigator !== 'undefined' ? !navigator.onLine : false
    );
    const tileFailureCountRef = useRef(0);

    const fitBoundsInternal = useCallback(() => {
      const map = mapRef.current;
      if (!map || !mapLoadedRef.current) return;
      const coords = routeCoordsRef.current;
      const bounds = computeRouteBounds(coords);
      if (bounds) {
        const [[minLng, minLat], [maxLng, maxLat]] = bounds;
        if (Math.abs(maxLng - minLng) < 1e-5 && Math.abs(maxLat - minLat) < 1e-5) {
          map.easeTo({ center: [minLng, minLat], zoom: 16, duration: 400 });
        } else {
          map.fitBounds(bounds, {
            padding: { top: 84, right: 56, bottom: 130, left: 56 },
            maxZoom: 17,
            duration: 450,
          });
        }
      }
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        updatePlaybackOverlay: ({ progressiveCoordinates: prog, markerCoordinate }) => {
          const map = mapRef.current;
          if (!map || !mapLoadedRef.current) return;
          const progSrc = map.getSource('active-route') as GeoJSONSource | undefined;
          const markerSrc = map.getSource('current-point') as GeoJSONSource | undefined;
          if (progSrc) {
            progSrc.setData(createGeoJsonLine(prog));
          }
          if (markerSrc) {
            markerSrc.setData(createGeoJsonPoint(markerCoordinate));
          }
        },
        fitRouteBounds: fitBoundsInternal,
        recenterOnPosition: (coord: GeoCoordinate) => {
          const map = mapRef.current;
          if (!map) return;
          map.easeTo({
            center: [coord.longitude, coord.latitude],
            zoom: Math.max(map.getZoom(), 16),
            duration: 450,
          });
        },
      }),
      [fitBoundsInternal]
    );

    // Online / offline listeners
    useEffect(() => {
      const handleOffline = () => setTilesUnavailable(true);
      const handleOnline = () => {
        tileFailureCountRef.current = 0;
        setTilesUnavailable(false);
      };
      window.addEventListener('offline', handleOffline);
      window.addEventListener('online', handleOnline);
      return () => {
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('online', handleOnline);
      };
    }, []);

    // Initialize MapLibre GL JS once
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      const initialCenter: [number, number] = currentCoordinate
        ? [currentCoordinate.longitude, currentCoordinate.latitude]
        : startCoordinate
          ? [startCoordinate.longitude, startCoordinate.latitude]
          : routeCoordinates[0] ?? DEFAULT_CENTER;

      const map = new MapLibreMap({
        container: el,
        center: initialCenter,
        zoom: 15,
        attributionControl: { compact: true },
        style: {
          version: 8,
          sources: {
            'osm-tiles': {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '© OpenStreetMap contributors',
            },
          },
          layers: [
            {
              id: 'basemap-osm',
              type: 'raster',
              source: 'osm-tiles',
              paint:
                theme === 'dark'
                  ? {
                      'raster-brightness-min': 0.02,
                      'raster-brightness-max': 0.34,
                      'raster-contrast': 0.35,
                      'raster-saturation': -0.65,
                    }
                  : {
                      'raster-brightness-min': 0,
                      'raster-brightness-max': 1,
                      'raster-contrast': 0,
                      'raster-saturation': 0,
                    },
            },
          ],
        },
      });

      mapRef.current = map;

      map.on('error', (evt: unknown) => {
        const sourceId = (evt as { sourceId?: string } | null)?.sourceId;
        if (sourceId === 'osm-tiles') {
          tileFailureCountRef.current += 1;
          if (tileFailureCountRef.current >= 2) {
            setTilesUnavailable(true);
          }
        }
      });

      map.on('sourcedata', (evt: { sourceId?: string; isSourceLoaded?: boolean }) => {
        if (evt.sourceId === 'osm-tiles' && evt.isSourceLoaded) {
          tileFailureCountRef.current = 0;
          setTilesUnavailable(false);
        }
      });

      map.on('load', () => {
        mapLoadedRef.current = true;

        map.addSource('accuracy-circle', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addSource('reference-route', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addSource('active-route', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addSource('start-point', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addSource('finish-point', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addSource('current-point', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addSource('inspected-point', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });

        // GPS accuracy radius fill & stroke
        map.addLayer({
          id: 'accuracy-fill',
          type: 'fill',
          source: 'accuracy-circle',
          paint: {
            'fill-color': '#2563EB',
            'fill-opacity': 0.12,
          },
        });
        map.addLayer({
          id: 'accuracy-stroke',
          type: 'line',
          source: 'accuracy-circle',
          paint: {
            'line-color': '#3B82F6',
            'line-width': 1.25,
            'line-opacity': 0.4,
          },
        });

        // Reference route (full route behind playback or main route in details)
        map.addLayer({
          id: 'reference-route-casing',
          type: 'line',
          source: 'reference-route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#FFFFFF',
            'line-width': 7,
            'line-opacity': 0.55,
          },
        });
        map.addLayer({
          id: 'reference-route-line',
          type: 'line',
          source: 'reference-route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#2563EB',
            'line-width': 4,
            'line-opacity': 0.9,
          },
        });

        // Wide invisible hit-target line for effortless touch/click route inspection
        map.addLayer({
          id: 'reference-route-hit',
          type: 'line',
          source: 'reference-route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#000000',
            'line-width': 26,
            'line-opacity': 0,
          },
        });

        // Active / progressive route line
        map.addLayer({
          id: 'active-route-casing',
          type: 'line',
          source: 'active-route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#FFFFFF',
            'line-width': 8,
            'line-opacity': 0.85,
          },
        });
        map.addLayer({
          id: 'active-route-line',
          type: 'line',
          source: 'active-route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#2563EB',
            'line-width': 5,
            'line-opacity': 1,
          },
        });

        // Green starting marker
        map.addLayer({
          id: 'start-point-marker',
          type: 'circle',
          source: 'start-point',
          paint: {
            'circle-radius': 8,
            'circle-color': '#10B981',
            'circle-stroke-width': 2.5,
            'circle-stroke-color': '#FFFFFF',
          },
        });

        // Crimson finish marker
        map.addLayer({
          id: 'finish-point-marker',
          type: 'circle',
          source: 'finish-point',
          paint: {
            'circle-radius': 8,
            'circle-color': '#E11D48',
            'circle-stroke-width': 2.5,
            'circle-stroke-color': '#FFFFFF',
          },
        });

        // Current position / moving playback marker
        map.addLayer({
          id: 'current-point-halo',
          type: 'circle',
          source: 'current-point',
          paint: {
            'circle-radius': 14,
            'circle-color': '#2563EB',
            'circle-opacity': 0.22,
          },
        });
        map.addLayer({
          id: 'current-point-marker',
          type: 'circle',
          source: 'current-point',
          paint: {
            'circle-radius': 8,
            'circle-color': '#2563EB',
            'circle-stroke-width': 3,
            'circle-stroke-color': '#FFFFFF',
          },
        });

        // Inspected route point marker
        map.addLayer({
          id: 'inspected-point-marker',
          type: 'circle',
          source: 'inspected-point',
          paint: {
            'circle-radius': 8.5,
            'circle-color': '#F59E0B',
            'circle-stroke-width': 3,
            'circle-stroke-color': '#FFFFFF',
          },
        });

        // Cursor affordance near route
        map.on('mouseenter', 'reference-route-hit', () => {
          if (onRouteClickRef.current) {
            map.getCanvas().style.cursor = 'pointer';
          }
        });
        map.on('mouseleave', 'reference-route-hit', () => {
          map.getCanvas().style.cursor = '';
        });

        map.on('click', (evt: MapMouseEvent) => {
          if (!onRouteClickRef.current) return;
          onRouteClickRef.current({
            latitude: evt.lngLat.lat,
            longitude: evt.lngLat.lng,
          });
        });

        // Sync initial data once loaded
        if (routeCoordsRef.current.length >= 2) {
          fitBoundsInternal();
        }
      });

      return () => {
        mapLoadedRef.current = false;
        map.remove();
        mapRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Switch light/dark basemap paint tuning without tearing down map or sources
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapLoadedRef.current) return;
      if (map.getLayer('basemap-osm')) {
        map.setPaintProperty(
          'basemap-osm',
          'raster-brightness-min',
          theme === 'dark' ? 0.02 : 0
        );
        map.setPaintProperty(
          'basemap-osm',
          'raster-brightness-max',
          theme === 'dark' ? 0.34 : 1
        );
        map.setPaintProperty(
          'basemap-osm',
          'raster-contrast',
          theme === 'dark' ? 0.35 : 0
        );
        map.setPaintProperty(
          'basemap-osm',
          'raster-saturation',
          theme === 'dark' ? -0.65 : 0
        );
      }
      if (map.getLayer('active-route-casing')) {
        map.setPaintProperty(
          'active-route-casing',
          'line-color',
          theme === 'dark' ? '#0F172A' : '#FFFFFF'
        );
      }
      if (map.getLayer('reference-route-casing')) {
        map.setPaintProperty(
          'reference-route-casing',
          'line-color',
          theme === 'dark' ? '#0F172A' : '#FFFFFF'
        );
      }
    }, [theme]);

    // Update route & marker GeoJSON sources when props change
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      const applyUpdates = () => {
        if (!mapLoadedRef.current) return;

        const refSrc = map.getSource('reference-route') as GeoJSONSource | undefined;
        const activeSrc = map.getSource('active-route') as GeoJSONSource | undefined;
        const startSrc = map.getSource('start-point') as GeoJSONSource | undefined;
        const finishSrc = map.getSource('finish-point') as GeoJSONSource | undefined;
        const currentSrc = map.getSource('current-point') as GeoJSONSource | undefined;
        const accSrc = map.getSource('accuracy-circle') as GeoJSONSource | undefined;
        const inspectedSrc = map.getSource('inspected-point') as GeoJSONSource | undefined;

        if (mode === 'live') {
          refSrc?.setData(createGeoJsonLine([]));
          activeSrc?.setData(createGeoJsonLine(routeCoordinates));
        } else if (mode === 'details') {
          refSrc?.setData(createGeoJsonLine(routeCoordinates));
          activeSrc?.setData(createGeoJsonLine([]));
          if (map.getLayer('reference-route-line')) {
            map.setPaintProperty('reference-route-line', 'line-opacity', 0.92);
            map.setPaintProperty('reference-route-line', 'line-width', 4.5);
          }
        } else if (mode === 'playback') {
          refSrc?.setData(createGeoJsonLine(routeCoordinates));
          activeSrc?.setData(createGeoJsonLine(progressiveCoordinates));
          if (map.getLayer('reference-route-line')) {
            map.setPaintProperty('reference-route-line', 'line-opacity', 0.32);
            map.setPaintProperty('reference-route-line', 'line-width', 3.5);
          }
        }

        startSrc?.setData(createGeoJsonPoint(startCoordinate));
        finishSrc?.setData(createGeoJsonPoint(finishCoordinate));
        currentSrc?.setData(createGeoJsonPoint(currentCoordinate));
        accSrc?.setData(createAccuracyPolygon(currentCoordinate, currentAccuracyMeters));
        inspectedSrc?.setData(createGeoJsonPoint(inspectedCoordinate));

        // Follow current coordinate smoothly during live tracking
        if (mode === 'live' && followCurrentPosition && currentCoordinate) {
          if (!hasAutoCenteredRef.current) {
            hasAutoCenteredRef.current = true;
            map.jumpTo({
              center: [currentCoordinate.longitude, currentCoordinate.latitude],
              zoom: 16,
            });
          } else {
            map.easeTo({
              center: [currentCoordinate.longitude, currentCoordinate.latitude],
              duration: 550,
            });
          }
        }
      };

      if (mapLoadedRef.current) {
        applyUpdates();
      } else {
        map.once('load', applyUpdates);
      }
    }, [
      mode,
      routeCoordinates,
      progressiveCoordinates,
      startCoordinate,
      finishCoordinate,
      currentCoordinate,
      currentAccuracyMeters,
      inspectedCoordinate,
      followCurrentPosition,
      theme,
    ]);

    // Auto-fit bounds when entering details mode with a route
    useEffect(() => {
      if (mode === 'details' && routeCoordinates.length >= 2) {
        const map = mapRef.current;
        if (!map) return;
        if (mapLoadedRef.current) {
          fitBoundsInternal();
        } else {
          map.once('load', fitBoundsInternal);
        }
      }
    }, [mode, routeCoordinates, fitBoundsInternal]);

    const handleZoomIn = () => {
      mapRef.current?.zoomIn({ duration: 220 });
    };

    const handleZoomOut = () => {
      mapRef.current?.zoomOut({ duration: 220 });
    };

    const handleRecenter = () => {
      if (mode === 'live' && currentCoordinate) {
        mapRef.current?.easeTo({
          center: [currentCoordinate.longitude, currentCoordinate.latitude],
          zoom: Math.max(mapRef.current.getZoom(), 16),
          duration: 450,
        });
      } else {
        fitBoundsInternal();
      }
    };

    return (
      <div
        className={`relative w-full h-full overflow-hidden bg-slate-100 dark:bg-slate-900 ${className}`}
        data-testid="journey-map-container"
      >
        {/* Subtle coordinate grid visible when basemap tiles cannot load */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none opacity-40 dark:opacity-20"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(148,163,184,0.22) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.22) 1px, transparent 1px)',
            backgroundSize: '36px 36px',
          }}
        />

        <div ref={containerRef} className="w-full h-full" />

        {tilesUnavailable && (
          <div
            role="status"
            className="absolute top-3 left-1/2 -translate-x-1/2 z-20 max-w-md w-[calc(100%-2rem)] px-3.5 py-2.5 rounded-xl bg-amber-50/95 dark:bg-amber-950/90 border border-amber-300 dark:border-amber-700/70 text-amber-900 dark:text-amber-100 shadow-sm flex items-center gap-2.5 text-xs"
          >
            <WifiOff className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              Map tiles are currently unavailable offline. GPS recording, route geometry, and local storage remain active.
            </span>
          </div>
        )}

        {/* Map Zoom & Recenter Controls */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-1.5">
          <div className="flex flex-col rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={handleZoomIn}
              aria-label="Zoom in map"
              className="w-11 h-11 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border-b border-slate-200 dark:border-slate-800 focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleZoomOut}
              aria-label="Zoom out map"
              className="w-11 h-11 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              <Minus className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleRecenter}
            aria-label={mode === 'live' ? 'Recenter on current location' : 'Fit entire route'}
            className="w-11 h-11 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            {mode === 'live' ? (
              <Crosshair className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            ) : (
              <Maximize2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            )}
          </button>
        </div>
      </div>
    );
  }
);
