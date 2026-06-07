import React, { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import { useLibraryDB } from '../../hooks/useLibraryDB';
import { Track } from '../../types';
import { TrackCard } from '../search/TrackCard';

interface FavoritesViewProps {
  refreshTrigger: number;
  triggerRefresh: () => void;
}

export const FavoritesView: React.FC<FavoritesViewProps> = ({ refreshTrigger, triggerRefresh }) => {
  const [favoriteTracks, setFavoriteTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const { getAllFavorites, getAllTracks } = useLibraryDB();

  useEffect(() => {
    const loadFavorites = async () => {
      setLoading(true);
      try {
        const favIds = await getAllFavorites();
        const allTracks = await getAllTracks();
        
        // Find full track objects matching favIds
        const favTracks = allTracks.filter(t => favIds.includes(t.id));
        
        // Maintain insertion order from favIds
        const sortedFavTracks = favIds
          .map(id => favTracks.find(t => t.id === id))
          .filter((t): t is Track => !!t);

        setFavoriteTracks(sortedFavTracks);
      } catch (e) {
        console.error('Failed to load favorites:', e);
      } finally {
        setLoading(false);
      }
    };
    loadFavorites();
  }, [refreshTrigger]);

  return (
    <div className="flex flex-col gap-6 text-white h-full overflow-y-auto pb-10">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5">
          <Heart className="w-5.5 h-5.5 text-pink-500 fill-pink-500" />
          <h2 className="text-xl font-bold tracking-wide">Favorites</h2>
        </div>
        <p className="text-xs text-neutral-400">
          Your collection of loved tracks ({favoriteTracks.length} tracks)
        </p>
      </div>

      {/* Tracks List */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[...Array(3)].map((_, idx) => (
            <div key={idx} className="h-16 w-full rounded-2xl shimmer" />
          ))}
        </div>
      ) : favoriteTracks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-full bg-pink-500/10 border border-pink-500/20 flex items-center justify-center mb-4">
            <Heart className="w-8 h-8 text-pink-500" />
          </div>
          <h3 className="text-md font-bold mb-1">No Favorites Yet</h3>
          <p className="text-xs text-neutral-400 max-w-sm">
            Click the heart icon on any search result or uploaded file to store them in your favorites list.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {favoriteTracks.map(track => (
            <TrackCard 
              key={track.id} 
              track={track} 
              refreshTrigger={triggerRefresh}
              onDeleteSuccess={triggerRefresh}
            />
          ))}
        </div>
      )}
    </div>
  );
};
export default FavoritesView;
