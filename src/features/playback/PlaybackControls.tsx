import React from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import type { PlaybackSpeed } from '../../types/journey';
import { formatDurationMs, formatTimeWithSeconds } from '../../utils/format';

interface PlaybackControlsProps {
  isPlaying: boolean;
  speed: PlaybackSpeed;
  elapsedMs: number;
  totalDurationMs: number;
  currentTimestamp: number;
  disabled?: boolean;
  onTogglePlay: () => void;
  onRestart: () => void;
  onChangeSpeed: (speed: PlaybackSpeed) => void;
  onSeek: (elapsedMs: number) => void;
}

const SPEED_OPTIONS: PlaybackSpeed[] = [1, 2, 4, 8];

export const PlaybackControls: React.FC<PlaybackControlsProps> = ({
  isPlaying,
  speed,
  elapsedMs,
  totalDurationMs,
  currentTimestamp,
  disabled = false,
  onTogglePlay,
  onRestart,
  onChangeSpeed,
  onSeek,
}) => {
  const safeTotal = Math.max(1, totalDurationMs);

  return (
    <div
      className="rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-lg p-3.5 sm:p-4"
      data-testid="playback-controls"
    >
      {/* Timestamp & Elapsed Progress */}
      <div className="flex items-center justify-between gap-3 text-xs">
        <div className="font-mono font-semibold text-slate-900 dark:text-white" data-testid="playback-current-timestamp">
          {formatTimeWithSeconds(currentTimestamp)}
        </div>
        <div className="font-mono text-slate-600 dark:text-slate-300" data-testid="playback-elapsed">
          {formatDurationMs(elapsedMs)} / {formatDurationMs(totalDurationMs)}
        </div>
      </div>

      {/* Timeline Slider */}
      <div className="mt-2">
        <label htmlFor="playback-timeline-slider" className="sr-only">
          Journey playback timeline
        </label>
        <input
          id="playback-timeline-slider"
          type="range"
          min={0}
          max={safeTotal}
          step={100}
          value={Math.min(safeTotal, Math.max(0, elapsedMs))}
          disabled={disabled || totalDurationMs === 0}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="w-full h-2 accent-blue-600 cursor-pointer disabled:opacity-40"
        />
      </div>

      {/* Play, Restart & Speed Controls */}
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onTogglePlay}
            disabled={disabled || totalDurationMs === 0}
            aria-label={isPlaying ? 'Pause playback' : 'Play journey'}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4 fill-current" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Play</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onRestart}
            disabled={disabled || totalDurationMs === 0}
            aria-label="Restart playback"
            className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="hidden sm:inline">Restart</span>
          </button>
        </div>

        {/* Speed Selector */}
        <div
          className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800"
          role="group"
          aria-label="Playback speed"
        >
          {SPEED_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onChangeSpeed(opt)}
              aria-pressed={speed === opt}
              className={`min-h-[36px] min-w-[38px] px-2 rounded-lg text-xs font-mono font-semibold transition-colors ${
                speed === opt
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {opt}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
