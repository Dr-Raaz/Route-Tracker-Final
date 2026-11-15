import React from 'react';

interface RouteMiniPreviewProps {
  coordinates: [number, number][]; // [lng, lat][]
  className?: string;
}

export const RouteMiniPreview: React.FC<RouteMiniPreviewProps> = ({
  coordinates,
  className = '',
}) => {
  if (!coordinates || coordinates.length < 2) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800/70 text-slate-400 dark:text-slate-500 ${className}`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 64 64" className="w-8 h-8" fill="none">
          <circle cx="32" cy="32" r="5" fill="#10B981" />
        </svg>
      </div>
    );
  }

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const [lng, lat] of coordinates) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  const width = 96;
  const height = 72;
  const pad = 10;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const spanLng = Math.max(1e-6, maxLng - minLng);
  const spanLat = Math.max(1e-6, maxLat - minLat);

  // Preserve geographic aspect ratio using cos(midLat)
  const midLatRad = (((minLat + maxLat) / 2) * Math.PI) / 180;
  const correctedSpanLng = spanLng * Math.cos(midLatRad);
  const scale = Math.min(innerW / correctedSpanLng, innerH / spanLat);

  const drawnW = correctedSpanLng * scale;
  const drawnH = spanLat * scale;
  const offsetX = pad + (innerW - drawnW) / 2;
  const offsetY = pad + (innerH - drawnH) / 2;

  const projected = coordinates.map(([lng, lat]) => {
    const x = offsetX + (lng - minLng) * Math.cos(midLatRad) * scale;
    const y = offsetY + (maxLat - lat) * scale;
    return [Number(x.toFixed(1)), Number(y.toFixed(1))] as const;
  });

  const pathData = projected
    .map(([x, y], idx) => `${idx === 0 ? 'M' : 'L'}${x} ${y}`)
    .join(' ');
  const start = projected[0];
  const end = projected[projected.length - 1];

  return (
    <div
      className={`rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 overflow-hidden ${className}`}
      aria-hidden="true"
    >
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
        <path
          d={pathData}
          fill="none"
          stroke="#2563EB"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={start[0]} cy={start[1]} r="3.5" fill="#10B981" stroke="#ffffff" strokeWidth="1.2" />
        <circle cx={end[0]} cy={end[1]} r="3.5" fill="#E11D48" stroke="#ffffff" strokeWidth="1.2" />
      </svg>
    </div>
  );
};
