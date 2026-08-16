import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link as LinkIcon, Loader2, CheckCircle2, AlertCircle, Sparkles, X } from 'lucide-react';
import { api } from '../../utils/api';
import { initDB } from '../../lib/db';
import { useToastStore } from '../../hooks/useToast';
import { useNavigate } from 'react-router-dom';
import { Track, Playlist } from '../../types';

interface SpotifyImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface SpotifyTrackMeta {
  title: string;
  artist: string;
  album?: string;
  durationMs?: number;
  coverArtUrl?: string;
}

async function asyncPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  onCompletedStep?: (completedCount: number, total: number) => void
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIdx = 0;
  let completedCount = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (nextIdx < items.length) {
        const i = nextIdx++;
        try {
          results[i] = await fn(items[i], i);
        } catch {
          // If individual resolve fails, entry remains undefined
        } finally {
          completedCount++;
          if (onCompletedStep) {
            onCompletedStep(completedCount, items.length);
          }
        }
      }
    })
  );

  return results;
}

export const SpotifyImportModal: React.FC<SpotifyImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'parsing' | 'resolving' | 'saving' | 'done' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [playlistTitle, setPlaylistTitle] = useState<string | null>(null);
  const [playlistCover, setPlaylistCover] = useState<string | null>(null);
  const [parsedTracksMeta, setParsedTracksMeta] = useState<SpotifyTrackMeta[]>([]);
  const [resolvedTracks, setResolvedTracks] = useState<Track[]>([]);
  const [resolveProgress, setResolveProgress] = useState(0);

  const { addToast } = useToastStore();
  const navigate = useNavigate();

  const abortControllerRef = useRef<AbortController | null>(null);
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (navTimerRef.current) {
        clearTimeout(navTimerRef.current);
      }
    };
  }, []);

  function handleCancel() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (navTimerRef.current) {
      clearTimeout(navTimerRef.current);
      navTimerRef.current = null;
    }
    setStatus('idle');
    setErrorMessage(null);
    onClose();
  }

  async function handleConvert() {
    if (!url.trim()) {
      setErrorMessage('Please enter a valid Spotify playlist, album, or track link.');
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setErrorMessage(null);
    setStatus('parsing');
    setPlaylistTitle(null);
    setPlaylistCover(null);
    setParsedTracksMeta([]);
    setResolvedTracks([]);
    setResolveProgress(0);

    try {
      // Step 1: Parse Spotify link and scrape metadata keylessly
      const res = await fetch(`${api.baseUrl}/api/spotify/parse-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
        signal: controller.signal
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to parse Spotify link.');
      }

      const data = await res.json();
      if (!isMountedRef.current || controller.signal.aborted) return;

      const title = data.title || 'Spotify Playlist';
      const cover = data.coverArtUrl || null;
      const tracksMeta: SpotifyTrackMeta[] = data.tracks || [];

      setPlaylistTitle(title);
      setPlaylistCover(cover);
      setParsedTracksMeta(tracksMeta);

      if (tracksMeta.length === 0) {
        throw new Error('No tracks found in the provided Spotify link.');
      }

      // Step 2: Match each Spotify track with YouTube audio streams in parallel pool (concurrency = 5)
      setStatus('resolving');

      const tempResolved: Track[] = [];

      const rawResults = await asyncPool(
        tracksMeta,
        5,
        async (meta) => {
          if (controller.signal.aborted) return undefined as any;
          const matchRes = await fetch(`${api.baseUrl}/api/spotify/resolve-track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: meta.title,
              artist: meta.artist,
              album: meta.album,
              durationMs: meta.durationMs
            }),
            signal: controller.signal
          });

          if (matchRes.ok) {
            const trackObj: Track = await matchRes.json();
            if (meta.coverArtUrl && !trackObj.coverArtUrl) {
              trackObj.coverArtUrl = meta.coverArtUrl;
            }
            return trackObj;
          }
          return undefined as any;
        },
        (completedCount, total) => {
          if (isMountedRef.current && !controller.signal.aborted) {
            setResolveProgress(Math.round((completedCount / total) * 100));
          }
        }
      );

      if (!isMountedRef.current || controller.signal.aborted) return;

      // Filter out failed resolutions and deduplicate matched tracks by ID
      const seenIds = new Set<string>();
      const matchedTracks: Track[] = [];

      for (const item of rawResults) {
        if (item && item.id && !seenIds.has(item.id)) {
          seenIds.add(item.id);
          matchedTracks.push(item);
        }
      }

      setResolvedTracks(matchedTracks);

      if (matchedTracks.length === 0) {
        throw new Error('Could not match audio streams for tracks in this link.');
      }

      // Step 3: Batch put into IndexedDB to prevent transaction auto-closing
      setStatus('saving');
      const db = await initDB();
      const newPlaylistId = `spotify-${Date.now()}`;
      const newPlaylist: Playlist = {
        id: newPlaylistId,
        name: title,
        description: `Imported from Spotify (${matchedTracks.length} tracks)`,
        coverUrl: cover || matchedTracks[0]?.coverArtUrl || null,
        trackIds: matchedTracks.map(t => t.id),
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      const tx = db.transaction(['tracks', 'playlists'], 'readwrite');
      const trackStore = tx.objectStore('tracks');
      const playlistStore = tx.objectStore('playlists');

      await Promise.all([
        ...matchedTracks.map(t => trackStore.put(t)),
        playlistStore.put(newPlaylist),
      ]);
      await tx.done;

      if (!isMountedRef.current || controller.signal.aborted) return;

      setStatus('done');
      addToast(`Successfully imported "${newPlaylist.name}" (${matchedTracks.length} tracks)!`, 'success');
      
      if (onSuccess) onSuccess();

      navTimerRef.current = setTimeout(() => {
        if (isMountedRef.current && !controller.signal.aborted) {
          onClose();
          navigate(`/playlist/${newPlaylistId}`);
        }
      }, 1000);

    } catch (err: any) {
      if (err.name === 'AbortError' || controller.signal.aborted) {
        console.log('[Spotify Modal] Import aborted by user.');
        return;
      }
      console.error('[Spotify Modal] Import error:', err);
      if (isMountedRef.current) {
        setStatus('error');
        setErrorMessage(err.message || 'Failed to import Spotify link.');
      }
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="spotify-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          onClick={handleCancel}
        >
          <motion.div
            key="spotify-modal-card"
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ duration: 0.44, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-xl overflow-hidden rounded-2xl bg-neutral-900 border border-neutral-800 shadow-2xl p-6 text-white"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                  <Sparkles className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-xl font-bold tracking-tight">Import Spotify Playlist</h3>
                  <p className="text-xs text-neutral-400">Paste any public Spotify link to convert it into your local player</p>
                </div>
              </div>
              <button
                onClick={handleCancel}
                className="p-2 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Content */}
            <div className="py-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-2 uppercase tracking-wider">
                  Spotify Playlist / Album / Track Link
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500">
                    <LinkIcon className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"
                    disabled={status === 'parsing' || status === 'resolving' || status === 'saving'}
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-neutral-950 border border-neutral-800 text-sm focus:outline-none focus:border-emerald-500 text-white placeholder-neutral-600 transition-all disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Error Display */}
              {errorMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </motion.div>
              )}

              {/* Parsed Playlist Header Preview */}
              {playlistTitle && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-3.5 p-3 rounded-xl bg-neutral-950/90 border border-neutral-800"
                >
                  {playlistCover ? (
                    <img src={playlistCover} alt={playlistTitle} className="w-12 h-12 rounded-lg object-cover shadow-md" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold">
                      🎵
                    </div>
                  )}
                  <div className="overflow-hidden">
                    <h4 className="text-sm font-bold text-white truncate">{playlistTitle}</h4>
                    <p className="text-xs text-neutral-400">{parsedTracksMeta.length} tracks detected</p>
                  </div>
                </motion.div>
              )}

              {/* Progress Display */}
              {(status === 'parsing' || status === 'resolving' || status === 'saving' || status === 'done') && (
                <div className="p-4 rounded-xl bg-neutral-950/80 border border-neutral-800/80 space-y-3">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="flex items-center gap-2 text-emerald-400">
                      {status !== 'done' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {status === 'parsing' && 'Fetching Spotify metadata...'}
                      {status === 'resolving' && `Matching high-fidelity audio streams (${resolveProgress}%)...`}
                      {status === 'saving' && 'Saving playlist into your library...'}
                      {status === 'done' && 'Import Completed Successfully!'}
                    </span>
                    <span className="text-neutral-400">
                      {resolvedTracks.length} / {parsedTracksMeta.length} matched
                    </span>
                  </div>

                  <div className="w-full h-2 rounded-full bg-neutral-800 overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-400"
                      initial={{ width: '0%' }}
                      animate={{ width: `${resolveProgress || (status === 'parsing' ? 15 : status === 'done' ? 100 : 90)}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>

                  {/* Resolved track previews */}
                  {resolvedTracks.length > 0 && (
                    <div className="max-h-36 overflow-y-auto space-y-1.5 pt-2 border-t border-neutral-800/60 pr-1">
                      {resolvedTracks.slice(-5).map((track, idx) => (
                        <div key={`${track.id}-${idx}`} className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-neutral-900/60">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="font-semibold text-white truncate">{track.title}</span>
                          <span className="text-neutral-500 truncate">- {track.artist}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Action Footer */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-800">
              <button
                onClick={handleCancel}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConvert}
                disabled={status === 'parsing' || status === 'resolving' || status === 'saving'}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50"
              >
                {(status === 'parsing' || status === 'resolving' || status === 'saving') ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Converting...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Convert Playlist</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
