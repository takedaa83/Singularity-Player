import { Track } from '../types';

export const DEMO_TRACKS: Track[] = [
  {
    id: 'demo-song-1',
    title: 'SoundHelix Song 1 (Synth & Drum)',
    artist: 'SoundHelix',
    album: 'Helix Experiments Vol. 1',
    genre: 'Electronic',
    year: 2018,
    trackNumber: 1,
    duration: 372, // 6:12
    bitrate: 128,
    sampleRate: 44100,
    fileSize: 5957014,
    mimeType: 'audio/mpeg',
    coverArtUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=80',
    source: 'demo',
    streamUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    filePath: null,
    addedAt: Date.now() - 3000
  },
  {
    id: 'demo-song-2',
    title: 'SoundHelix Song 2 (Ambient Synth)',
    artist: 'SoundHelix',
    album: 'Helix Experiments Vol. 1',
    genre: 'Ambient',
    year: 2018,
    trackNumber: 2,
    duration: 425, // 7:05
    bitrate: 128,
    sampleRate: 44100,
    fileSize: 6813292,
    mimeType: 'audio/mpeg',
    coverArtUrl: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=500&auto=format&fit=crop&q=80',
    source: 'demo',
    streamUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    filePath: null,
    addedAt: Date.now() - 2000
  },
  {
    id: 'demo-song-3',
    title: 'SoundHelix Song 4 (Melodic Chill)',
    artist: 'SoundHelix',
    album: 'Helix Experiments Vol. 1',
    genre: 'Chillout',
    year: 2019,
    trackNumber: 4,
    duration: 302, // 5:02
    bitrate: 128,
    sampleRate: 44100,
    fileSize: 4835848,
    mimeType: 'audio/mpeg',
    coverArtUrl: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=500&auto=format&fit=crop&q=80',
    source: 'demo',
    streamUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
    filePath: null,
    addedAt: Date.now() - 1000
  }
];
