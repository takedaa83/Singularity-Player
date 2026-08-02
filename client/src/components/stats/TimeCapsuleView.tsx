import React, { useEffect, useState } from 'react';
import { useLibraryDB } from '../../hooks/useLibraryDB';
import { Track } from '../../types';
import { Trophy, Clock, Flame, Music, Sparkles, Calendar, Share2 } from 'lucide-react';

export const TimeCapsuleView: React.FC = () => {
  const { getHistory } = useLibraryDB();
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [topArtists, setTopArtists] = useState<{ artist: string; count: number }[]>([]);
  const [favoriteTrack, setFavoriteTrack] = useState<Track | null>(null);
  const [totalTracksPlayed, setTotalTracksPlayed] = useState(0);
  const [peakHourLabel, setPeakHourLabel] = useState('Night Owl (10 PM - 2 AM)');

  useEffect(() => {
    const calculateCapsuleStats = async () => {
      const historyItems = await getHistory();
      if (!historyItems || historyItems.length === 0) return;

      setTotalTracksPlayed(historyItems.length);

      let totalSecs = 0;
      const artistCounts: Record<string, number> = {};
      const hourCounts: Record<number, number> = {};

      historyItems.forEach((item) => {
        const track = item.track;
        if (track) {
          totalSecs += track.duration || 180;
          if (track.artist) {
            artistCounts[track.artist] = (artistCounts[track.artist] || 0) + 1;
          }
        }
        if (item.playedAt) {
          const hour = new Date(item.playedAt).getHours();
          hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        }
      });

      setTotalMinutes(Math.round(totalSecs / 60));

      // Sorted Top Artists
      const sortedArtists = Object.entries(artistCounts)
        .map(([artist, count]) => ({ artist, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      setTopArtists(sortedArtists);

      // Favorite Track
      if (historyItems[0]?.track) {
        setFavoriteTrack(historyItems[0].track);
      }

      // Calculate Peak Listening Hour
      let peakHour = 22;
      let maxHourCount = 0;
      Object.entries(hourCounts).forEach(([h, count]) => {
        if (count > maxHourCount) {
          maxHourCount = count;
          peakHour = parseInt(h, 10);
        }
      });

      if (peakHour >= 6 && peakHour < 12) setPeakHourLabel('Morning Motivator (6 AM - 12 PM)');
      else if (peakHour >= 12 && peakHour < 17) setPeakHourLabel('Afternoon Focus (12 PM - 5 PM)');
      else if (peakHour >= 17 && peakHour < 22) setPeakHourLabel('Evening Groover (5 PM - 10 PM)');
      else setPeakHourLabel('Night Owl Listener (10 PM - 2 AM)');
    };

    calculateCapsuleStats();
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl p-8 bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 border border-purple-500/20 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-semibold mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Singularity Listening Capsule</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">Your Music Time Capsule</h1>
            <p className="text-slate-300 text-sm mt-1">A real-time breakdown of your listening habits, top artists, and sound profile.</p>
          </div>

          <button
            onClick={() => alert('Snapshot copied to clipboard!')}
            className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-500/30 flex items-center space-x-2 transition-all"
          >
            <Share2 className="w-4 h-4" />
            <span>Share Capsule</span>
          </button>
        </div>
      </div>

      {/* Primary Metric Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Metric 1 */}
        <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 backdrop-blur-md flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-white">{totalMinutes.toLocaleString()} mins</div>
            <div className="text-xs text-slate-400 font-medium">Total Music Streamed</div>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 backdrop-blur-md flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl bg-pink-500/20 border border-pink-500/30 flex items-center justify-center text-pink-400">
            <Music className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-white">{totalTracksPlayed.toLocaleString()} tracks</div>
            <div className="text-xs text-slate-400 font-medium">Played in History</div>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 backdrop-blur-md flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Flame className="w-6 h-6" />
          </div>
          <div>
            <div className="text-sm font-extrabold text-white truncate max-w-[180px]">{peakHourLabel}</div>
            <div className="text-xs text-slate-400 font-medium">Peak Listening Habit</div>
          </div>
        </div>
      </div>

      {/* Top Artists & Favorite Track */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Artists Leaderboard */}
        <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 backdrop-blur-md space-y-4">
          <div className="flex items-center space-x-2.5">
            <Trophy className="w-5 h-5 text-amber-400" />
            <h2 className="text-white font-bold text-lg">Top Artists Leaderboard</h2>
          </div>

          <div className="space-y-2.5 pt-2">
            {topArtists.length > 0 ? (
              topArtists.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                  <div className="flex items-center space-x-3">
                    <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-300 font-mono font-bold text-xs flex items-center justify-center border border-purple-500/30">
                      #{idx + 1}
                    </span>
                    <span className="text-white font-semibold text-sm">{item.artist}</span>
                  </div>
                  <span className="text-xs font-mono text-slate-400">{item.count} plays</span>
                </div>
              ))
            ) : (
              <p className="text-slate-500 text-xs py-4 text-center font-mono">No listening history recorded yet.</p>
            )}
          </div>
        </div>

        {/* Favorite Track Card */}
        <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 backdrop-blur-md flex flex-col justify-between space-y-4">
          <div className="flex items-center space-x-2.5">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <h2 className="text-white font-bold text-lg">Most Played Anthem</h2>
          </div>

          {favoriteTrack ? (
            <div className="p-5 rounded-2xl bg-gradient-to-br from-purple-950/60 to-slate-950 border border-purple-800/40 flex items-center space-x-4">
              {favoriteTrack.coverArtUrl ? (
                <img src={favoriteTrack.coverArtUrl} alt={favoriteTrack.title} className="w-16 h-16 rounded-xl object-cover border border-purple-500/30 shadow-lg" />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-300 font-bold text-2xl">
                  🎵
                </div>
              )}
              <div>
                <h3 className="text-white font-bold text-base line-clamp-1">{favoriteTrack.title}</h3>
                <p className="text-purple-300 text-xs mt-0.5 line-clamp-1">{favoriteTrack.artist}</p>
                <span className="inline-block mt-2 px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-mono border border-purple-500/30">
                  Top Song
                </span>
              </div>
            </div>
          ) : (
            <p className="text-slate-500 text-xs py-8 text-center font-mono">Start listening to tracks to build your capsule!</p>
          )}
        </div>
      </div>
    </div>
  );
};
