import React from 'react';
import { usePlaybackAnalytics } from '../../hooks/usePlaybackAnalytics';

/**
 * PlaybackAnalyticsTracker is a leaf component rendering null.
 * It encapsulates usePlaybackAnalytics() so that high-frequency
 * 30fps playback updates only trigger re-renders of this leaf,
 * preventing the entire App.tsx layout from re-rendering.
 */
export const PlaybackAnalyticsTracker: React.FC = () => {
  usePlaybackAnalytics();
  return null;
};

export default PlaybackAnalyticsTracker;
