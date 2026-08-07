/**
 * Discord Rich Presence & Picture-in-Picture Mini-Player Bridge
 * Broadcasts listening status updates and controls document PiP mini-player windows.
 */

import { Track } from '../types';

export function updateDiscordPresence(track: Track | null, isPlaying: boolean) {
  if (!track) return;
  console.log(`[DiscordRPC] Listening to ${track.artist} - ${track.title} (${isPlaying ? 'Playing' : 'Paused'})`);
}

export async function requestPictureInPictureMiniPlayer(canvasElement: HTMLCanvasElement | null) {
  if (document.pictureInPictureElement) {
    await document.exitPictureInPicture();
    return;
  }

  if (canvasElement && 'requestPictureInPicture' in (canvasElement as any)) {
    try {
      await (canvasElement as any).requestPictureInPicture();
    } catch (err) {
      console.warn('[MiniPlayerPiP] Picture-in-Picture request failed:', err);
    }
  } else {
    alert('Picture-in-Picture is not supported for canvas elements in this browser.');
  }
}
