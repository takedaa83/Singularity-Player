import React, { useState, useCallback, lazy, Suspense, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { PlayerBar } from './components/layout/PlayerBar';
import { UploadZone } from './components/upload/UploadZone';
import { QueuePanel } from './components/player/QueuePanel';
import { LyricsPanel } from './components/player/LyricsPanel';
import { Equalizer } from './components/player/Equalizer';
import { ToastContainer } from './components/ui/Toast';
import { useAudioEngine } from './hooks/useAudioEngine';
import { useAmbientColor } from './hooks/useAmbientColor';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { usePlayerStore } from './stores/playerStore';
import { useLibraryDB } from './hooks/useLibraryDB';
import { X } from 'lucide-react';
import { LoadingSkeleton } from './components/ui/LoadingSkeleton';
import { MobileNav } from './components/layout/MobileNav';
import { PlaybackAnalyticsTracker } from './components/analytics/PlaybackAnalyticsTracker';
import { useSettingsStore } from './stores/settingsStore';
import { api } from './utils/api';
import { initDB } from './lib/db';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

// Lazy-load heavy pages for code splitting
const HomePage = lazy(() => import('./components/home/HomePage').then(m => ({ default: m.HomePage })));
const SearchResults = lazy(() => import('./components/search/SearchResults').then(m => ({ default: m.SearchResults })));
const LibraryView = lazy(() => import('./components/library/LibraryView').then(m => ({ default: m.LibraryView })));
const ArtistsView = lazy(() => import('./components/library/ArtistsView').then(m => ({ default: m.ArtistsView })));
const FavoritesView = lazy(() => import('./components/library/FavoritesView').then(m => ({ default: m.FavoritesView })));
const HistoryView = lazy(() => import('./components/library/HistoryView').then(m => ({ default: m.HistoryView })));
const PlaylistView = lazy(() => import('./components/library/PlaylistView').then(m => ({ default: m.PlaylistView })));
const DownloadManagerPanel = lazy(() => import('./components/downloads/DownloadManagerPanel').then(m => ({ default: m.DownloadManagerPanel })));
const SettingsPage = lazy(() => import('./components/settings/SettingsPage').then(m => ({ default: m.SettingsPage })));
const ListeningInsightsPage = lazy(() => import('./components/analytics/ListeningInsightsPage').then(m => ({ default: m.ListeningInsightsPage })));
const ArtistPage = lazy(() => import('./components/discovery/ArtistPage').then(m => ({ default: m.ArtistPage })));
const AlbumPage = lazy(() => import('./components/discovery/AlbumPage').then(m => ({ default: m.AlbumPage })));
const BatchDownloadsPage = lazy(() => import('./components/downloads/BatchDownloadsPage').then(m => ({ default: m.BatchDownloadsPage })));
const SpotifyImportModal = lazy(() => import('./components/library/SpotifyImportModal').then(m => ({ default: m.SpotifyImportModal })));
const TimeCapsuleView = lazy(() => import('./components/stats/TimeCapsuleView').then(m => ({ default: m.TimeCapsuleView })));

import { Visualizer3D } from './components/visualizer/Visualizer3D';
import { VibeMatrixModal } from './components/discovery/VibeMatrixModal';
import { LocalFolderScannerModal } from './components/library/LocalFolderScannerModal';
import { FocusModeModal } from './components/player/FocusModeModal';
import { MusicalDnaModal } from './components/analytics/MusicalDnaModal';
import { MusicQuizModal } from './components/stats/MusicQuizModal';
import { MetadataRepairModal } from './components/library/MetadataRepairModal';
import { StemSeparatorModal } from './components/player/StemSeparatorModal';
import { PitchHarmonizerModal } from './components/player/PitchHarmonizerModal';
import { AiMasteringModal } from './components/player/AiMasteringModal';
import { AiSimilarityModal } from './components/discovery/AiSimilarityModal';
import { AiSongSuggestionsModal } from './components/discovery/AiSongSuggestionsModal';
import { AiPlaylistStudioModal } from './components/discovery/AiPlaylistStudioModal';
import { SimilarityGraphModal } from './components/discovery/SimilarityGraphModal';
import { CommandPaletteModal } from './components/common/CommandPaletteModal';
import { ListenTogetherModal } from './components/social/ListenTogetherModal';
import { singularityEngine } from './services/singularityEngine';

// Page transition variants - Full smooth, velvety fluid transitions
const pageVariants = {
  initial: { opacity: 0, scale: 0.992, y: 8 },
  animate: { 
    opacity: 1, 
    scale: 1,
    y: 0, 
    transition: { 
      duration: 0.46, 
      ease: [0.16, 1, 0.3, 1] 
    } 
  },
  exit: { 
    opacity: 0, 
    scale: 0.992,
    y: -8, 
    transition: { 
      duration: 0.36, 
      ease: [0.16, 1, 0.3, 1] 
    } 
  }
};

// Helper to calculate lighter/darker accent shades for hover/active states
const adjustHexColor = (hex: string, percent: number) => {
  try {
    const cleanHex = hex.replace('#', '');
    const num = parseInt(cleanHex, 16);
    let r = (num >> 16) + Math.round(2.55 * percent);
    let g = ((num >> 8) & 0x00ff) + Math.round(2.55 * percent);
    let b = (num & 0x0000ff) + Math.round(2.55 * percent);

    r = Math.min(255, Math.max(0, r));
    g = Math.min(255, Math.max(0, g));
    b = Math.min(255, Math.max(0, b));

    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  } catch {
    return hex;
  }
};

const PageWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <motion.div {...pageVariants}>{children}</motion.div>
);

const LazyFallback = () => (
  <div className="p-6"><LoadingSkeleton count={8} /></div>
);

export const App: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const [showQueue, setShowQueue] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [showEqualizer, setShowEqualizer] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showSpotifyImport, setShowSpotifyImport] = useState(false);
  const [showVibeMatrix, setShowVibeMatrix] = useState(false);
  const [showFolderScanner, setShowFolderScanner] = useState(false);
  const [showFocusMode, setShowFocusMode] = useState(false);
  const [showMusicalDna, setShowMusicalDna] = useState(false);
  const [showMusicQuiz, setShowMusicQuiz] = useState(false);
  const [showMetadataRepair, setShowMetadataRepair] = useState(false);
  const [showStemSeparator, setShowStemSeparator] = useState(false);
  const [showPitchHarmonizer, setShowPitchHarmonizer] = useState(false);
  const [showAiMastering, setShowAiMastering] = useState(false);
  const [showAiSimilarity, setShowAiSimilarity] = useState(false);
  const [showAiSuggestions, setShowAiSuggestions] = useState(false);
  const [showAiPlaylistStudio, setShowAiPlaylistStudio] = useState(false);
  const [showSimilarityGraph, setShowSimilarityGraph] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showListenTogether, setShowListenTogether] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Multi-select state for library
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());

  // Synchronize theme, accent color, and compact mode with HTML document element classes and variables
  const theme = useSettingsStore((s) => s.settings.theme);
  const accentColor = useSettingsStore((s) => s.settings.accentColor);
  const compactMode = useSettingsStore((s) => s.settings.compactMode);
  const lowPowerMode = useSettingsStore((s) => s.settings.lowPowerMode);

  useEffect(() => {
    const root = document.documentElement;
    
    // 1. Sync theme class
    if (theme === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
    }

    // 2. Sync compact mode class
    if (compactMode) {
      root.classList.add('compact');
    } else {
      root.classList.remove('compact');
    }

    // 3. Sync low power mode class
    const applyLowPower = async () => {
      if (lowPowerMode === 'on') {
        root.classList.add('low-power');
      } else if (lowPowerMode === 'off') {
        root.classList.remove('low-power');
      } else {
        // Auto: check battery level if supported
        if ('getBattery' in navigator) {
          try {
            const battery: any = await (navigator as any).getBattery();
            if (!battery.charging && battery.level < 0.2) {
              root.classList.add('low-power');
            } else {
              root.classList.remove('low-power');
            }
          } catch {
            root.classList.remove('low-power');
          }
        } else {
          root.classList.remove('low-power');
        }
      }
    };
    applyLowPower();

    // 4. Sync dynamic accent properties
    root.style.setProperty('--primary-color', accentColor);
    root.style.setProperty('--primary-light-color', adjustHexColor(accentColor, 15));
    root.style.setProperty('--primary-dark-color', adjustHexColor(accentColor, -15));
    try {
      const cleanHex = accentColor.replace('#', '');
      const num = parseInt(cleanHex, 16);
      const r = (num >> 16) & 255;
      const g = (num >> 8) & 255;
      const b = num & 255;
      root.style.setProperty('--primary-rgb', `${r}, ${g}, ${b}`);
    } catch {}

    // 5. Boot custom SingularityEngine
    singularityEngine.initialize();
  }, [theme, accentColor, compactMode, lowPowerMode]);

  // Audio engine (no longer returns currentTime/duration — uses external store)
  const { seek, getAnalyser } = useAudioEngine();

  // Ambient color engine — extracts dominant colors from album art for dynamic backgrounds
  useAmbientColor();
  const currentTrack = usePlayerStore((s) => s.currentTrack);

  // Keyboard shortcuts — seek is now stable (useCallback-memoized)
  useKeyboardShortcuts(seek, () => setShowCommandPalette(true));

  // Gentle Exponential Decibel Fade-Out Sleep Timer Engine
  const sleepTimerEndTimestamp = usePlayerStore((s) => s.sleepTimerEndTimestamp);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const setSleepTimer = usePlayerStore((s) => s.setSleepTimer);
  const volume = usePlayerStore((s) => s.volume);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const initialVolumeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!sleepTimerEndTimestamp) {
      if (initialVolumeRef.current !== null) {
        setVolume(initialVolumeRef.current);
        initialVolumeRef.current = null;
      }
      return;
    }

    if (initialVolumeRef.current === null) {
      initialVolumeRef.current = volume;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const remainingMs = sleepTimerEndTimestamp - now;

      if (remainingMs <= 0) {
        setPlaying(false);
        if (initialVolumeRef.current !== null) {
          setVolume(initialVolumeRef.current);
          initialVolumeRef.current = null;
        }
        setSleepTimer(null);
      } else if (remainingMs <= 20000 && initialVolumeRef.current !== null) {
        // Smooth exponential decibel fade-out during final 20 seconds
        const ratio = Math.max(0, remainingMs / 20000);
        const fadedVolume = initialVolumeRef.current * Math.pow(ratio, 1.5);
        setVolume(Math.max(0.01, fadedVolume));
      }
    }, 500);

    return () => clearInterval(interval);
  }, [sleepTimerEndTimestamp, setPlaying, setSleepTimer, setVolume]);



  // Playback session analytics tracking
  // handled via <PlaybackAnalyticsTracker /> in render

  // Load favorites and synchronize settings store into player store on mount
  useEffect(() => {
    usePlayerStore.getState().loadFavorites().catch(console.error);

    const playerState = usePlayerStore.getState();
    const settingsState = useSettingsStore.getState().settings;

    // Sync settings values into the player store
    playerState.setVolume(settingsState.volume);
    usePlayerStore.setState({ shuffle: settingsState.shuffle });
    playerState.setRepeat(settingsState.repeat);
    playerState.setCrossfadeDuration(settingsState.crossfadeDuration);
    playerState.setPlaybackSpeed(settingsState.playbackSpeed);
    playerState.setEqualizerBands(settingsState.eqBands);
    playerState.setSpatialAudioEnabled(settingsState.spatialAudioEnabled);
    playerState.setSpatialAudioConfig(settingsState.spatialAudioConfig);
  }, []);

  // History tracking
  const { addHistoryEntry } = useLibraryDB();
  const lastRecordedTrackRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (currentTrack && currentTrack.id !== lastRecordedTrackRef.current) {
      lastRecordedTrackRef.current = currentTrack.id;
      addHistoryEntry(currentTrack.id).catch(() => {});
    }
  }, [currentTrack]);

  // ─── Auto-Sync Engine ─────────────────────────────────────────────────
  const autoSync = useSettingsStore((s) => s.settings.autoSync);
  const lastSyncTimestamp = useSettingsStore((s) => s.settings.lastSyncTimestamp);

  const performPushSync = useCallback(async () => {
    try {
      const db = await initDB();
      const exportData = {
        tracks: await db.getAll('tracks'),
        playlists: await db.getAll('playlists'),
        favorites: await db.getAll('favorites'),
        history: await db.getAll('history'),
        playSessions: await db.getAll('playSessions'),
        searchHistory: await db.getAll('searchHistory'),
        settings: await db.getAll('settings'),
        settingsStore: useSettingsStore.getState().settings,
        version: '2.0.0',
        exportedAt: Date.now(),
      };
      const pushResult = await api.pushSync(exportData);
      useSettingsStore.getState().updateSetting('lastSyncTimestamp', pushResult.syncedAt);
      console.log('[AutoSync] Background push completed at:', new Date(pushResult.syncedAt).toLocaleTimeString());
    } catch (err) {
      console.error('[AutoSync] Background push failed:', err);
    }
  }, []);

  useEffect(() => {
    if (!autoSync) return;

    const runStartupSync = async () => {
      try {
        const status = await api.getSyncStatus();
        if (status.exists && status.syncedAt) {
          const localLastSync = lastSyncTimestamp || 0;
          
          if (status.syncedAt > localLastSync) {
            const data = await api.pullSync();
            if (data && typeof data === 'object') {
              const db = await initDB();
              const stores = ['tracks', 'playlists', 'favorites', 'history', 'playSessions', 'searchHistory', 'settings'] as const;
              
              const txClear = db.transaction(stores, 'readwrite');
              for (const store of stores) {
                await txClear.objectStore(store).clear();
              }
              await txClear.done;

              const txRestore = db.transaction(stores, 'readwrite');
              if (Array.isArray(data.tracks)) {
                const store = txRestore.objectStore('tracks');
                for (const track of data.tracks) await store.put(track);
              }
              if (Array.isArray(data.playlists)) {
                const store = txRestore.objectStore('playlists');
                for (const playlist of data.playlists) await store.put(playlist);
              }
              if (Array.isArray(data.favorites)) {
                const store = txRestore.objectStore('favorites');
                for (const trackId of data.favorites) await store.put(trackId);
              }
              if (Array.isArray(data.history)) {
                const store = txRestore.objectStore('history');
                for (const item of data.history) await store.put(item);
              }
              if (Array.isArray(data.playSessions)) {
                const store = txRestore.objectStore('playSessions');
                for (const session of data.playSessions) await store.put(session);
              }
              if (Array.isArray(data.searchHistory)) {
                const store = txRestore.objectStore('searchHistory');
                for (const query of data.searchHistory) await store.put(query);
              }
              if (Array.isArray(data.settings)) {
                const store = txRestore.objectStore('settings');
                for (const set of data.settings) await store.put(set);
              }
              await txRestore.done;

              if (data.settingsStore) {
                const store = useSettingsStore.getState();
                Object.entries(data.settingsStore).forEach(([key, val]) => {
                  if (key !== 'autoSync' && key !== 'lastSyncTimestamp') {
                    store.updateSetting(key as any, val);
                  }
                });
              }

              useSettingsStore.getState().updateSetting('lastSyncTimestamp', status.syncedAt);
              console.log('[AutoSync] Pulled library updates from server on startup');
              window.location.reload();
            }
          } else if (localLastSync > status.syncedAt) {
            await performPushSync();
          }
        } else {
          await performPushSync();
        }
      } catch (err) {
        console.error('[AutoSync] Startup sync check failed:', err);
      }
    };

    runStartupSync();

    const intervalId = setInterval(() => {
      performPushSync();
    }, 3 * 60 * 1000);

    const handleBeforeUnload = () => {
      performPushSync();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [autoSync, lastSyncTimestamp, performPushSync]);

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  const handleSearchSubmit = useCallback((query: string) => {
    if (query) {
      navigate(`/search?q=${encodeURIComponent(query)}`);
    } else {
      navigate('/');
    }
    setMobileSidebarOpen(false);
  }, [navigate]);

  const handleNavigate = useCallback((view: string) => {
    const routes: Record<string, string> = {
      home: '/',
      search: '/search',
      library: '/library',
      artists: '/artists',
      favorites: '/favorites',
      history: '/history',
      downloads: '/downloads',
      settings: '/settings',
      insights: '/insights',
      capsule: '/capsule',
      'batch-download': '/batch-download',
    };
    navigate(routes[view] || '/');
    setMobileSidebarOpen(false);
  }, [navigate]);

  const handlePlaylistNavigate = useCallback((id: string | null) => {
    if (id) {
      navigate(`/playlist/${id}`);
    }
    setMobileSidebarOpen(false);
  }, [navigate]);

  const searchQuery = searchParams.get('q') || '';
  const playlistMatch = location.pathname.match(/\/playlist\/([^/]+)/);
  const selectedPlaylistId = playlistMatch ? playlistMatch[1] : null;

  return (
    <ErrorBoundary>
      <div className="w-screen h-screen flex flex-col bg-bg-primary overflow-hidden font-sans relative">
      <PlaybackAnalyticsTracker />
      {/* Main Layout Container */}
      <div className="flex-1 flex overflow-hidden relative z-10">

        {/* Mobile Sidebar Overlay */}
        <AnimatePresence>
          {mobileSidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => setMobileSidebarOpen(false)}
            />
          )}
        </AnimatePresence>

        {/* Sidebar Nav */}
        <div className={`
          fixed lg:relative inset-y-0 left-0 z-50 lg:z-20
          transform transition-transform duration-300 ease-out
          ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}>
          <Sidebar
            activeView={location.pathname}
            setActiveView={handleNavigate}
            selectedPlaylistId={selectedPlaylistId}
            setSelectedPlaylistId={handlePlaylistNavigate}
            showEqualizer={showEqualizer}
            setShowEqualizer={setShowEqualizer}
            refreshTrigger={refreshTrigger}
            triggerRefresh={triggerRefresh}
            onUploadClick={() => {
              setShowUpload(true);
              setMobileSidebarOpen(false);
            }}
            onOpenSpotifyImport={() => {
              setShowSpotifyImport(true);
              setMobileSidebarOpen(false);
            }}
            onOpenFocusMode={() => {
              setShowFocusMode(true);
              setMobileSidebarOpen(false);
            }}
            onOpenMusicalDna={() => {
              setShowMusicalDna(true);
              setMobileSidebarOpen(false);
            }}
            onOpenMusicQuiz={() => {
              setShowMusicQuiz(true);
              setMobileSidebarOpen(false);
            }}
            onOpenMetadataRepair={() => {
              setShowMetadataRepair(true);
              setMobileSidebarOpen(false);
            }}
            onOpenStemSeparator={() => {
              setShowStemSeparator(true);
              setMobileSidebarOpen(false);
            }}
            onOpenPitchHarmonizer={() => {
              setShowPitchHarmonizer(true);
              setMobileSidebarOpen(false);
            }}
            onOpenAiMastering={() => {
              setShowAiMastering(true);
              setMobileSidebarOpen(false);
            }}
            onOpenAiSimilarity={() => {
              setShowAiSimilarity(true);
              setMobileSidebarOpen(false);
            }}
            onOpenAiPlaylistStudio={() => {
              setShowAiPlaylistStudio(true);
              setMobileSidebarOpen(false);
            }}
            onOpenListenTogether={() => {
              setShowListenTogether(true);
              setMobileSidebarOpen(false);
            }}
          />
        </div>

        {/* Central Dashboard Panel */}
        <main className="flex-1 flex flex-col overflow-hidden bg-bg-primary">
          <TopBar
            onSearch={handleSearchSubmit}
            searchQuery={searchQuery}
            onUploadClick={() => setShowUpload(true)}
            onMenuClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
            onOpenSpotifyImport={() => setShowSpotifyImport(true)}
          />

          <div className="flex-1 overflow-y-auto overscroll-x-none overscroll-y-contain px-4 sm:px-6 lg:px-8 py-6 pb-44 sm:pb-32 relative">
            <Suspense fallback={<LazyFallback />}>
              <AnimatePresence mode="wait">
                <Routes location={location} key={location.pathname}>
                  <Route path="/" element={
                    <PageWrapper>
                      <HomePage
                        onNavigate={handleNavigate}
                        onSearchFocus={() => navigate('/search')}
                        onUploadClick={() => setShowUpload(true)}
                        onShowEqualizer={() => setShowEqualizer(true)}
                        onSearch={handleSearchSubmit}
                        onOpenSpotifyImport={() => setShowSpotifyImport(true)}
                      />
                    </PageWrapper>
                  } />
                  <Route path="/search" element={
                    <PageWrapper>
                      <SearchResults query={searchQuery} refreshTrigger={triggerRefresh} />
                    </PageWrapper>
                  } />
                  <Route path="/library" element={
                    <PageWrapper>
                      <LibraryView
                        refreshTrigger={refreshTrigger}
                        triggerRefresh={triggerRefresh}
                        isMultiSelectMode={isMultiSelectMode}
                        setIsMultiSelectMode={setIsMultiSelectMode}
                        selectedTrackIds={selectedTrackIds}
                        setSelectedTrackIds={setSelectedTrackIds}
                        onOpenSpotifyImport={() => setShowSpotifyImport(true)}
                      />
                    </PageWrapper>
                  } />
                  <Route path="/artists" element={
                    <PageWrapper>
                      <ArtistsView refreshTrigger={refreshTrigger} triggerRefresh={triggerRefresh} />
                    </PageWrapper>
                  } />
                  <Route path="/favorites" element={
                    <PageWrapper>
                      <FavoritesView refreshTrigger={refreshTrigger} triggerRefresh={triggerRefresh} />
                    </PageWrapper>
                  } />
                  <Route path="/history" element={
                    <PageWrapper>
                      <HistoryView refreshTrigger={refreshTrigger} triggerRefresh={triggerRefresh} />
                    </PageWrapper>
                  } />
                  <Route path="/playlist/:id" element={
                    <PageWrapper>
                      <PlaylistView
                        refreshTrigger={refreshTrigger}
                        triggerRefresh={triggerRefresh}
                      />
                    </PageWrapper>
                  } />
                  <Route path="/downloads" element={
                    <PageWrapper><DownloadManagerPanel /></PageWrapper>
                  } />
                  <Route path="/batch-download" element={
                    <PageWrapper><BatchDownloadsPage /></PageWrapper>
                  } />
                  <Route path="/settings" element={
                    <PageWrapper><SettingsPage /></PageWrapper>
                  } />
                  <Route path="/insights" element={
                    <PageWrapper><ListeningInsightsPage /></PageWrapper>
                  } />
                  <Route path="/capsule" element={
                    <PageWrapper><TimeCapsuleView /></PageWrapper>
                  } />
                  <Route path="/artist/:name" element={
                    <PageWrapper><ArtistPage /></PageWrapper>
                  } />
                  <Route path="/album/:name" element={
                    <PageWrapper><AlbumPage /></PageWrapper>
                  } />
                  {/* Fallback to home */}
                  <Route path="*" element={
                    <PageWrapper>
                      <HomePage
                        onNavigate={handleNavigate}
                        onSearchFocus={() => navigate('/search')}
                        onUploadClick={() => setShowUpload(true)}
                        onShowEqualizer={() => setShowEqualizer(true)}
                        onSearch={handleSearchSubmit}
                        onOpenSpotifyImport={() => setShowSpotifyImport(true)}
                      />
                    </PageWrapper>
                  } />
                </Routes>
              </AnimatePresence>
            </Suspense>
          </div>
        </main>

        {/* Equalizer Overlay */}
        <AnimatePresence>
          {showEqualizer && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
              onClick={() => setShowEqualizer(false)}
            >
              <motion.div
                initial={{ scale: 0.96, opacity: 0, y: 12 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.96, opacity: 0, y: 12 }}
                transition={{ duration: 0.44, ease: [0.16, 1, 0.3, 1] }}
                onClick={(e) => e.stopPropagation()}
                className="relative"
              >
                <Equalizer />
                <button
                  onClick={() => setShowEqualizer(false)}
                  className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
                  aria-label="Close equalizer"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Right side slide-out drawers */}
        <AnimatePresence>
          {showQueue && <QueuePanel onClose={() => setShowQueue(false)} triggerRefresh={triggerRefresh} />}
        </AnimatePresence>
        <AnimatePresence>
          {showLyrics && <LyricsPanel onClose={() => setShowLyrics(false)} />}
        </AnimatePresence>
      </div>

      {/* Upload Dialog */}
      <AnimatePresence>
        {showUpload && (
          <UploadZone
            onClose={() => setShowUpload(false)}
            triggerRefresh={triggerRefresh}
          />
        )}
      </AnimatePresence>

      {/* Spotify Import Modal */}
      <AnimatePresence>
        {showSpotifyImport && (
          <SpotifyImportModal
            isOpen={showSpotifyImport}
            onClose={() => setShowSpotifyImport(false)}
            onSuccess={triggerRefresh}
          />
        )}
      </AnimatePresence>

      {/* 3D Audio Visualizer */}
      <Visualizer3D />

      {/* Vibe Matrix Modal */}
      <VibeMatrixModal
        isOpen={showVibeMatrix}
        onClose={() => setShowVibeMatrix(false)}
      />

      {/* Local Folder Scanner Modal */}
      <LocalFolderScannerModal
        isOpen={showFolderScanner}
        onClose={() => setShowFolderScanner(false)}
        onScanComplete={triggerRefresh}
      />

      {/* Focus Mode & Pomodoro Modal */}
      {showFocusMode && <FocusModeModal onClose={() => setShowFocusMode(false)} />}

      {/* Musical DNA Radar Modal */}
      {showMusicalDna && <MusicalDnaModal onClose={() => setShowMusicalDna(false)} />}

      {/* Music Quiz Trivia Modal */}
      {showMusicQuiz && <MusicQuizModal onClose={() => setShowMusicQuiz(false)} />}

      {/* AI Metadata & Artwork Repair Modal */}
      {showMetadataRepair && <MetadataRepairModal onClose={() => setShowMetadataRepair(false)} />}

      {/* Real-Time AI Stem Separator Modal */}
      {showStemSeparator && <StemSeparatorModal onClose={() => setShowStemSeparator(false)} />}

      {/* AI Pitch Harmonizer & Auto-Tune Modal */}
      {showPitchHarmonizer && <PitchHarmonizerModal onClose={() => setShowPitchHarmonizer(false)} />}

      {/* AI Smart Auto-Mastering Modal */}
      {showAiMastering && <AiMasteringModal onClose={() => setShowAiMastering(false)} />}

      {/* AI Cosine Similarity Song Radar Modal */}
      {showAiSimilarity && <AiSimilarityModal onClose={() => setShowAiSimilarity(false)} />}

      {/* AI Song Suggestions Modal */}
      {showAiSuggestions && <AiSongSuggestionsModal onClose={() => setShowAiSuggestions(false)} />}

      {/* AI Playlist Studio Modal */}
      {showAiPlaylistStudio && (
        <AiPlaylistStudioModal
          onClose={() => setShowAiPlaylistStudio(false)}
          onPlaylistSaved={() => setRefreshTrigger((prev) => prev + 1)}
          onOpenSimilarityGraph={() => setShowSimilarityGraph(true)}
        />
      )}

      {/* Multi-Node Similarity Graph Modal */}
      {showSimilarityGraph && <SimilarityGraphModal onClose={() => setShowSimilarityGraph(false)} />}

      {/* Raycast / Linear Command Palette Modal */}
      {showCommandPalette && (
        <CommandPaletteModal
          onClose={() => setShowCommandPalette(false)}
          onOpenStemSeparator={() => setShowStemSeparator(true)}
          onOpenPitchHarmonizer={() => setShowPitchHarmonizer(true)}
          onOpenAiMastering={() => setShowAiMastering(true)}
          onOpenFocusMode={() => setShowFocusMode(true)}
          onOpenMusicalDna={() => setShowMusicalDna(true)}
          onOpenAiSuggestions={() => setShowAiSuggestions(true)}
          onOpenAiPlaylistStudio={() => setShowAiPlaylistStudio(true)}
        />
      )}

      {/* Listen Together Synchronized Room Modal */}
      {showListenTogether && (
        <ListenTogetherModal
          isOpen={showListenTogether}
          onClose={() => setShowListenTogether(false)}
        />
      )}

      {/* Toast Notifications */}
      <ToastContainer />

      {/* Mobile Navigation Bottom Tabs */}
      <MobileNav />

      {/* Player Bar — no longer passes currentTime/duration */}
      <PlayerBar
        seek={seek}
        showQueue={showQueue}
        setShowQueue={setShowQueue}
        showLyrics={showLyrics}
        setShowLyrics={setShowLyrics}
        showEqualizer={showEqualizer}
        setShowEqualizer={setShowEqualizer}
      />
      </div>
    </ErrorBoundary>
  );
};
export default App;
