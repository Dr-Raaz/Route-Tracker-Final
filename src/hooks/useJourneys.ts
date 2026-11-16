import { useCallback, useEffect, useState } from 'react';
import { indexedDbService } from '../services/storage/IndexedDbService';
import type { Journey, JourneyMetadata } from '../types/journey';
import { exportJourneyToGpx, parseGpxToJourney } from '../utils/gpx';

export function useJourneys() {
  const [journeys, setJourneys] = useState<JourneyMetadata[]>([]);
  const [recoveredJourneys, setRecoveredJourneys] = useState<JourneyMetadata[]>([]);
  const [anotherContextOwnsRecording, setAnotherContextOwnsRecording] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await indexedDbService.listJourneys();
      setJourneys(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load saved journeys.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const recovery = await indexedDbService.recoverInterruptedJourneys();
        if (active) {
          setRecoveredJourneys(recovery.recoveredJourneys);
          setAnotherContextOwnsRecording(recovery.anotherContextOwnsRecording);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Unable to access IndexedDB storage.');
        }
      }
      try {
        const list = await indexedDbService.listJourneys();
        if (active) setJourneys(list);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Unable to access IndexedDB storage.');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const getJourneyDetails = useCallback(async (id: string): Promise<Journey | null> => {
    return indexedDbService.getJourney(id);
  }, []);

  const renameJourney = useCallback(
    async (id: string, newName: string) => {
      const full = await indexedDbService.getJourney(id);
      if (!full) return;
      const { rawSamples: _rawSamples, ...metadata } = full;
      const updated: JourneyMetadata = {
        ...metadata,
        name: newName.trim() || full.name,
      };
      await indexedDbService.upsertJourneyMetadata(updated);
      await refresh();
    },
    [refresh]
  );

  const deleteJourney = useCallback(
    async (id: string) => {
      await indexedDbService.deleteJourney(id);
      setRecoveredJourneys((prev) => prev.filter((j) => j.id !== id));
      await refresh();
    },
    [refresh]
  );

  const clearAll = useCallback(async () => {
    await indexedDbService.clearAllJourneys();
    setRecoveredJourneys([]);
    setJourneys([]);
  }, []);

  const exportGpx = useCallback(async (id: string): Promise<void> => {
    const journey = await indexedDbService.getJourney(id);
    if (!journey) {
      throw new Error('Journey not found.');
    }
    const gpx = exportJourneyToGpx(journey);
    const blob = new Blob([gpx], { type: 'application/gpx+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const slug = (journey.name || 'journey')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${slug || 'journey'}.gpx`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  const importGpxText = useCallback(
    async (gpxXml: string, filename?: string): Promise<Journey> => {
      const baseName = filename ? filename.replace(/\.gpx$/i, '') : 'Imported GPX Journey';
      const journey = parseGpxToJourney(gpxXml, baseName);
      const saved = await indexedDbService.saveCompleteJourney(journey);
      await refresh();
      return saved;
    },
    [refresh]
  );

  const dismissRecoveryBanner = useCallback(() => {
    setRecoveredJourneys([]);
  }, []);

  return {
    journeys,
    recoveredJourneys,
    anotherContextOwnsRecording,
    loading,
    error,
    refresh,
    getJourneyDetails,
    renameJourney,
    deleteJourney,
    clearAll,
    exportGpx,
    importGpxText,
    dismissRecoveryBanner,
  };
}
