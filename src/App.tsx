/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from 'react';
import { NavShell, type AppRoute } from './components/NavShell';
import { ChatScreen } from './features/chat/ChatScreen';
import { ConversationScreen } from './features/chat/ConversationScreen';
import { ConnectFriendsScreen } from './features/friends/ConnectFriendsScreen';
import { HistoryScreen } from './features/history/HistoryScreen';
import { JourneyDetailsScreen } from './features/playback/JourneyDetailsScreen';
import { MyProfileScreen } from './features/profile/MyProfileScreen';
import { LiveTrackingScreen } from './features/tracking/LiveTrackingScreen';
import { useJourneys } from './hooks/useJourneys';
import { useSettings } from './hooks/useSettings';
import { useTracking } from './hooks/useTracking';

export default function App() {
  const { settings, updateSettings, persistenceError: settingsPersistenceError } = useSettings();
  const {
    journeys,
    recoveredJourneys,
    anotherContextOwnsRecording,
    loading: journeysLoading,
    error: journeysError,
    refresh: refreshJourneys,
    getJourneyDetails,
    deleteJourney,
    clearAll,
    exportGpx,
    importGpxText,
    dismissRecoveryBanner,
  } = useJourneys();

  const { tracking, startTracking, stopTracking, locateOnce, retryPersistence } = useTracking(
    settings.devTestMode
  );

  const [activeRoute, setActiveRoute] = useState<AppRoute>('live');
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);

  const isRecording =
    tracking.activeJourneyId !== null || tracking.phase === 'requesting-permission';

  const handleNavigate = useCallback((route: 'live' | 'history' | 'chat' | 'friends' | 'profile') => {
    setActiveRoute(route);
  }, []);

  const handleOpenJourney = useCallback((id: string) => {
    setSelectedJourneyId(id);
    setActiveRoute('details');
  }, []);

  const handleStopAndRefresh = useCallback(
    async (customName?: string) => {
      const saved = await stopTracking(customName);
      if (saved) {
        await refreshJourneys();
      }
      return saved;
    },
    [stopTracking, refreshJourneys]
  );

  const handleToggleTheme = useCallback(() => {
    updateSettings({
      theme: settings.theme === 'dark' ? 'light' : 'dark',
    });
  }, [settings.theme, updateSettings]);

  const handleImportGpxFile = useCallback(
    async (xmlText: string, fileName: string) => {
      await importGpxText(xmlText, fileName);
    },
    [importGpxText]
  );

  return (
    <NavShell
      activeRoute={activeRoute}
      isRecording={isRecording}
      journeyCount={journeys.length}
      theme={settings.theme}
      onNavigate={handleNavigate}
      onToggleTheme={handleToggleTheme}
    >
      {activeRoute === 'live' && (
        <LiveTrackingScreen
          tracking={tracking}
          theme={settings.theme}
          unit={settings.unit}
          devTestMode={settings.devTestMode}
          onToggleTheme={handleToggleTheme}
          onEnableDevTestMode={() => updateSettings({ devTestMode: true })}
          onStartTracking={startTracking}
          onStopTracking={handleStopAndRefresh}
          onRetryPersistence={async () => {
            const saved = await retryPersistence();
            if (saved) await refreshJourneys();
            return saved;
          }}
          onLocateOnce={locateOnce}
          onOpenJourney={handleOpenJourney}
        />
      )}

      {activeRoute === 'history' && (
        <HistoryScreen
          journeys={journeys}
          recoveredJourneys={recoveredJourneys}
          anotherContextOwnsRecording={anotherContextOwnsRecording}
          loading={journeysLoading}
          error={journeysError}
          unit={settings.unit}
          onOpenJourney={handleOpenJourney}
          onDeleteJourney={deleteJourney}
          onExportGpx={exportGpx}
          onImportGpxFile={handleImportGpxFile}
          onStartNewTracking={() => setActiveRoute('live')}
          onDismissRecovery={dismissRecoveryBanner}
        />
      )}

      {activeRoute === 'details' && selectedJourneyId && (
        <JourneyDetailsScreen
          journeyId={selectedJourneyId}
          theme={settings.theme}
          unit={settings.unit}
          loadJourney={getJourneyDetails}
          onBack={() => setActiveRoute('history')}
          onExportGpx={exportGpx}
          onDeleteJourney={deleteJourney}
        />
      )}

      {activeRoute === 'chat' && <ChatScreen onOpenConversation={() => setActiveRoute('conversation')} />}

      {activeRoute === 'conversation' && <ConversationScreen onBack={() => setActiveRoute('chat')} />}

      {activeRoute === 'friends' && <ConnectFriendsScreen />}

      {activeRoute === 'profile' && (
        <MyProfileScreen
          settings={settings}
          journeyCount={journeys.length}
          tracking={tracking}
          persistenceError={settingsPersistenceError}
          onUpdateSettings={updateSettings}
          onImportGpxFile={handleImportGpxFile}
          onClearAllData={clearAll}
        />
      )}
    </NavShell>
  );
}
