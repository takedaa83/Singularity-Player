import React, { useEffect, useState } from 'react';
import { Box, Typography, Card, CardContent, Grid, Button, Divider, LinearProgress } from '@mui/material';
import { PlayCircle, Award, Calendar, Music, Sparkles, Clock, Heart, Disc } from 'lucide-react';
import { useLibraryDB } from '../../hooks/useLibraryDB';
import { Track, PlaySession } from '../../types';
import { tokens } from '../../theme/muiTheme';
import { ViewHeader } from '../ui/ViewHeader';

export const ListeningInsightsPage: React.FC = () => {
  const { getAllTracks, recordPlaySession } = useLibraryDB();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalHours: 0,
    totalPlays: 0,
    uniqueArtists: 0,
    uniqueTracks: 0,
    streak: 0,
    topTracks: [] as { track: Track; count: number }[],
    topArtists: [] as { artist: string; count: number; duration: number }[],
    genres: [] as { name: string; count: number; percentage: number }[],
  });

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const db = await import('../../lib/db').then((m) => m.initDB());
      const tracks = await db.getAll('tracks');
      const sessions = await db.getAll('playSessions');
      const favorites = await db.getAll('favorites');

      if (sessions.length === 0) {
        setLoading(false);
        return;
      }

      // 1. Total hours & plays
      const totalSeconds = sessions.reduce((sum, s) => sum + s.duration, 0);
      const totalHours = Math.round((totalSeconds / 3600) * 10) / 10;
      const totalPlays = sessions.filter((s) => s.completed).length;

      // Map track id to Track
      const trackMap = new Map<string, Track>();
      for (const t of tracks) trackMap.set(t.id, t);

      // 2. Group sessions by track
      const trackCounts = new Map<string, number>();
      const artistStats = new Map<string, { count: number; duration: number }>();
      const genreCounts = new Map<string, number>();
      const uniqueArtists = new Set<string>();
      const uniqueTracks = new Set<string>();

      for (const s of sessions) {
        const track = trackMap.get(s.trackId);
        if (!track) continue;

        uniqueTracks.add(s.trackId);
        if (track.artist) {
          uniqueArtists.add(track.artist);
          const aStat = artistStats.get(track.artist) || { count: 0, duration: 0 };
          aStat.count += 1;
          aStat.duration += s.duration;
          artistStats.set(track.artist, aStat);
        }

        if (track.genre) {
          genreCounts.set(track.genre, (genreCounts.get(track.genre) || 0) + 1);
        }

        trackCounts.set(s.trackId, (trackCounts.get(s.trackId) || 0) + 1);
      }

      // Top Tracks
      const topTracks = Array.from(trackCounts.entries())
        .map(([id, count]) => ({ track: trackMap.get(id)!, count }))
        .filter((item) => !!item.track)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Top Artists
      const topArtists = Array.from(artistStats.entries())
        .map(([artist, data]) => ({ artist, count: data.count, duration: Math.round(data.duration / 60) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Genre Distribution
      const totalGenresCount = Array.from(genreCounts.values()).reduce((sum, c) => sum + c, 0) || 1;
      const genres = Array.from(genreCounts.entries())
        .map(([name, count]) => ({
          name,
          count,
          percentage: Math.round((count / totalGenresCount) * 100),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // 3. Listening Streak (consecutive days)
      const daySet = new Set<string>();
      for (const s of sessions) {
        daySet.add(new Date(s.startTime).toDateString());
      }
      const sortedDays = Array.from(daySet).map((d) => new Date(d).getTime()).sort((a, b) => a - b);
      
      let streak = 0;
      let currentStreak = 0;
      let prevTime = 0;

      for (const time of sortedDays) {
        if (prevTime === 0) {
          currentStreak = 1;
        } else {
          const diffDays = Math.round((time - prevTime) / (1000 * 60 * 60 * 24));
          if (diffDays === 1) {
            currentStreak++;
          } else if (diffDays > 1) {
            streak = Math.max(streak, currentStreak);
            currentStreak = 1;
          }
        }
        prevTime = time;
      }
      streak = Math.max(streak, currentStreak);

      setStats({
        totalHours,
        totalPlays,
        uniqueArtists: uniqueArtists.size,
        uniqueTracks: uniqueTracks.size,
        streak,
        topTracks,
        topArtists,
        genres,
      });
    } catch (e) {
      console.error('Failed to load analytics page:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  return (
    <Box sx={{ color: 'white', pb: 10 }}>
      <ViewHeader
        icon={Award}
        title="Listening Insights"
        subtitle="Your musical behaviors and listening patterns"
        iconColor={tokens.colors.accent.pink}
      />

      {loading ? (
        <Box sx={{ py: 10, textAlign: 'center' }}>
          <Typography variant="body2" sx={{ color: tokens.colors.textSecondary }}>
            Computing your listening dashboard...
          </Typography>
        </Box>
      ) : stats.totalPlays === 0 ? (
        <Box sx={{ py: 10, textAlign: 'center' }}>
          <Typography variant="h6" sx={{ mb: 1, color: tokens.colors.textPrimary }}>
            No Insights Yet
          </Typography>
          <Typography variant="body2" sx={{ color: tokens.colors.textSecondary, maxWidth: 400, mx: 'auto', mb: 3 }}>
            Listen to more tracks to generate insights. Play count, top artists, and genre distributions will appear here.
          </Typography>
        </Box>
      ) : (
        <Grid container spacing={3}>
          {/* 1. Quick Stats Grid */}
          <Grid size={{ xs: 12 }}>
            <Grid container spacing={2}>
              {/* Card 1: Hours Listened */}
              <Grid size={{ xs: 6, sm: 3 }}>
                <Card sx={{ bgcolor: tokens.colors.surfaceVariant, border: `1px solid ${tokens.colors.surfaceBorder}` }}>
                  <CardContent sx={{ p: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, color: tokens.colors.accent.pink }}>
                      <Clock size={16} />
                      <Typography variant="caption" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Listening Time</Typography>
                    </Box>
                    <Typography variant="h4" sx={{ fontWeight: 800 }}>{stats.totalHours} hrs</Typography>
                  </CardContent>
                </Card>
              </Grid>

              {/* Card 2: Total Plays */}
              <Grid size={{ xs: 6, sm: 3 }}>
                <Card sx={{ bgcolor: tokens.colors.surfaceVariant, border: `1px solid ${tokens.colors.surfaceBorder}` }}>
                  <CardContent sx={{ p: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, color: tokens.colors.primary }}>
                      <PlayCircle size={16} />
                      <Typography variant="caption" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Completed Plays</Typography>
                    </Box>
                    <Typography variant="h4" sx={{ fontWeight: 800 }}>{stats.totalPlays}</Typography>
                  </CardContent>
                </Card>
              </Grid>

              {/* Card 3: Unique Artists */}
              <Grid size={{ xs: 6, sm: 3 }}>
                <Card sx={{ bgcolor: tokens.colors.surfaceVariant, border: `1px solid ${tokens.colors.surfaceBorder}` }}>
                  <CardContent sx={{ p: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, color: tokens.colors.accent.cyan }}>
                      <Disc size={16} />
                      <Typography variant="caption" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Artists Heard</Typography>
                    </Box>
                    <Typography variant="h4" sx={{ fontWeight: 800 }}>{stats.uniqueArtists}</Typography>
                  </CardContent>
                </Card>
              </Grid>

              {/* Card 4: Daily Streak */}
              <Grid size={{ xs: 6, sm: 3 }}>
                <Card sx={{ bgcolor: tokens.colors.surfaceVariant, border: `1px solid ${tokens.colors.surfaceBorder}` }}>
                  <CardContent sx={{ p: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, color: tokens.colors.accent.amber }}>
                      <Calendar size={16} />
                      <Typography variant="caption" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Daily Streak</Typography>
                    </Box>
                    <Typography variant="h4" sx={{ fontWeight: 800 }}>{stats.streak} days</Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Grid>

          {/* 2. Top Tracks */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={{ height: '100%', bgcolor: tokens.colors.surface, border: `1px solid ${tokens.colors.surfaceBorder}` }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Music size={18} color={tokens.colors.primary} />
                  Top Tracks
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {stats.topTracks.map((item, idx) => (
                    <Box key={item.track.id} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: tokens.colors.textTertiary, minWidth: 16 }}>{idx + 1}</Typography>
                      {item.track.coverArtUrl && (
                        <Box component="img" src={item.track.coverArtUrl} sx={{ width: 40, height: 40, borderRadius: 1.5, objectFit: 'cover' }} />
                      )}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{item.track.title}</Typography>
                        <Typography variant="caption" noWrap sx={{ color: tokens.colors.textSecondary }}>{item.track.artist}</Typography>
                      </Box>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: tokens.colors.primary }}>
                        {item.count} play{item.count > 1 ? 's' : ''}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* 3. Top Artists */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={{ height: '100%', bgcolor: tokens.colors.surface, border: `1px solid ${tokens.colors.surfaceBorder}` }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Award size={18} color={tokens.colors.accent.pink} />
                  Top Artists
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                  {stats.topArtists.map((item, idx) => (
                    <Box key={item.artist} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{idx + 1}. {item.artist}</Typography>
                        <Typography variant="caption" sx={{ color: tokens.colors.textTertiary }}>{item.duration} mins listened</Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={Math.min(100, (item.count / (stats.topArtists[0]?.count || 1)) * 100)}
                        sx={{
                          height: 6,
                          borderRadius: 2,
                          bgcolor: 'rgba(255,255,255,0.05)',
                          '& .MuiLinearProgress-bar': { bgcolor: tokens.colors.accent.pink },
                        }}
                      />
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* 4. Genre Breakdown */}
          <Grid size={{ xs: 12 }}>
            <Card sx={{ bgcolor: tokens.colors.surface, border: `1px solid ${tokens.colors.surfaceBorder}` }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Sparkles size={18} color={tokens.colors.accent.amber} />
                  Genre Distribution
                </Typography>
                <Grid container spacing={2}>
                  {stats.genres.map((item) => (
                    <Grid size={{ xs: 12, sm: 6 }} key={item.name}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{item.name}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: tokens.colors.accent.amber }}>{item.percentage}%</Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={item.percentage}
                        sx={{
                          height: 8,
                          borderRadius: 2,
                          bgcolor: 'rgba(255,255,255,0.05)',
                          '& .MuiLinearProgress-bar': { bgcolor: tokens.colors.accent.amber },
                        }}
                      />
                    </Grid>
                  ))}
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>
  );
};

export default ListeningInsightsPage;
