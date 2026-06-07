import React, { useEffect, useState, useMemo } from 'react';
import { FolderHeart, CheckSquare, Square, Download, Trash2, Library } from 'lucide-react';
import { useLibraryDB } from '../../hooks/useLibraryDB';
import { Track } from '../../types';
import { TrackCard } from '../search/TrackCard';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../hooks/useToast';
import { useBatchStore } from '../../stores/batchStore';

interface LibraryViewProps {
  refreshTrigger: number;
  triggerRefresh: () => void;
  isMultiSelectMode: boolean;
  setIsMultiSelectMode: (mode: boolean) => void;
  selectedTrackIds: Set<string>;
  setSelectedTrackIds: (ids: Set<string>) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  refreshTrigger,
  triggerRefresh,
  isMultiSelectMode,
  setIsMultiSelectMode,
  selectedTrackIds,
  setSelectedTrackIds
}) => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const { getAllTracks, deleteTrack } = useLibraryDB();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Load local files
  const loadTracks = async () => {
    setLoading(true);
    try {
      const data = await getAllTracks();
      setTracks(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTracks();
  }, [refreshTrigger]);

  const handleToggleSelect = (trackId: string) => {
    const updated = new Set(selectedTrackIds);
    if (updated.has(trackId)) {
      updated.delete(trackId);
    } else {
      updated.add(trackId);
    }
    setSelectedTrackIds(updated);
  };

  const handleToggleSelectAll = () => {
    if (selectedTrackIds.size === tracks.length) {
      setSelectedTrackIds(new Set());
    } else {
      setSelectedTrackIds(new Set(tracks.map(t => t.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (confirm(`Remove the ${selectedTrackIds.size} selected tracks from your library?`)) {
      setLoading(true);
      for (const id of Array.from(selectedTrackIds)) {
        await deleteTrack(id);
      }
      setSelectedTrackIds(new Set());
      setIsMultiSelectMode(false);
      triggerRefresh();
    }
  };

  const handleBatchAddToPackager = () => {
    if (selectedTrackIds.size === 0) return;
    const batchStore = useBatchStore.getState();
    batchStore.addTracks(selectedTracks);
    toast(`Added ${selectedTracks.length} tracks to Batch Packager`, 'success');
    setSelectedTrackIds(new Set());
    setIsMultiSelectMode(false);
    navigate('/batch-download');
  };

  const selectedTracks = useMemo(() => {
    return tracks.filter(t => selectedTrackIds.has(t.id));
  }, [tracks, selectedTrackIds]);

  return (
    <div className="flex flex-col gap-6 text-white h-full overflow-y-auto pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <Library className="w-5.5 h-5.5 text-white" />
            <h2 className="text-xl font-bold tracking-wide">My Uploaded Library</h2>
          </div>
          <p className="text-xs text-neutral-400">
            Manage your offline high-res collections ({tracks.length} tracks)
          </p>
        </div>

        {tracks.length > 0 && (
          <div className="flex items-center gap-3">
            {/* Multi-select toggle button */}
            <button
              onClick={() => {
                setIsMultiSelectMode(!isMultiSelectMode);
                setSelectedTrackIds(new Set());
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border transition-all ${
                isMultiSelectMode
                  ? 'bg-white text-black border-white'
                  : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-white hover:bg-neutral-800'
              }`}
            >
              {isMultiSelectMode ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
              <span>{isMultiSelectMode ? 'Cancel Selection' : 'Multi-Select'}</span>
            </button>

            {/* Batch actions (if select mode active) */}
            {isMultiSelectMode && selectedTrackIds.size > 0 && (
              <>
                <button
                  onClick={handleBatchAddToPackager}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white text-black hover:bg-neutral-200 text-xs font-semibold transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>Add to Batch Packager ({selectedTrackIds.size})</span>
                </button>
                <button
                  onClick={handleDeleteSelected}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 text-xs font-semibold transition-all text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete ({selectedTrackIds.size})</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Select All Toggle in Multi-select Mode */}
      {isMultiSelectMode && tracks.length > 0 && (
        <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg bg-neutral-900 border border-neutral-800">
          <input
            type="checkbox"
            checked={selectedTrackIds.size === tracks.length}
            onChange={handleToggleSelectAll}
            className="w-4 h-4 rounded border-neutral-700 bg-neutral-800 text-white focus:ring-white cursor-pointer"
          />
          <span className="text-xs font-semibold text-neutral-400">
            Select All ({selectedTrackIds.size} of {tracks.length} selected)
          </span>
        </div>
      )}

      {/* Tracks List */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[...Array(5)].map((_, idx) => (
            <div key={idx} className="h-16 w-full rounded-lg shimmer" />
          ))}
        </div>
      ) : tracks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center mb-4">
            <FolderHeart className="w-8 h-8 text-neutral-500" />
          </div>
          <h3 className="text-md font-bold mb-1">Your Library is Empty</h3>
          <p className="text-xs text-neutral-400 max-w-sm">
            Drag and drop your audio files using the "Upload Audio" button in the header to populate your private library.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {tracks.map(track => (
            <TrackCard 
              key={track.id} 
              track={track}
              isMultiSelectMode={isMultiSelectMode}
              isSelected={selectedTrackIds.has(track.id)}
              onToggleSelect={() => handleToggleSelect(track.id)}
              onDeleteSuccess={triggerRefresh}
              refreshTrigger={triggerRefresh}
            />
          ))}
        </div>
      )}
    </div>
  );
};
export default LibraryView;
