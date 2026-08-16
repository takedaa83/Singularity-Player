import React, { useMemo } from 'react';
import { X, Sparkles, Activity, Disc, Heart, Zap } from 'lucide-react';
import { usePlayerStore } from '../../stores/playerStore';
import { getAudioFeatures } from '../../utils/musicMath';

interface MusicalDnaModalProps {
  onClose: () => void;
}

export const MusicalDnaModal: React.FC<MusicalDnaModalProps> = ({ onClose }) => {
  const queue = usePlayerStore((s) => s.queue);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const favorites = usePlayerStore((s) => s.favorites);

  // Compute live acoustic feature vectors from user library / queue
  const { metrics, avgBpm, topVibe } = useMemo(() => {
    const candidateTracks = queue.length > 0 ? queue : (currentTrack ? [currentTrack] : []);
    if (candidateTracks.length === 0) {
      return {
        metrics: [
          { label: 'Energy', value: 70, angle: 0 },
          { label: 'Acousticness', value: 40, angle: 60 },
          { label: 'Danceability', value: 65, angle: 120 },
          { label: 'Valence (Mood)', value: 60, angle: 180 },
          { label: 'Speechiness', value: 35, angle: 240 },
          { label: 'Instrumentalness', value: 50, angle: 300 }
        ],
        avgBpm: 120,
        topVibe: 'Eclectic Fusion'
      };
    }

    let totalEnergy = 0;
    let totalAcoustic = 0;
    let totalDance = 0;
    let totalValence = 0;
    let totalInstrumental = 0;
    let totalBpm = 0;

    candidateTracks.forEach((t) => {
      const f = getAudioFeatures(t);
      totalEnergy += f.energy;
      totalAcoustic += f.acousticness;
      totalDance += f.danceability;
      totalValence += f.valence;
      totalInstrumental += f.instrumentalness;
      totalBpm += f.bpm;
    });

    const len = candidateTracks.length;
    const energyVal = Math.round((totalEnergy / len) * 100);
    const acousticVal = Math.round((totalAcoustic / len) * 100);
    const danceVal = Math.round((totalDance / len) * 100);
    const valenceVal = Math.round((totalValence / len) * 100);
    const instrumentalVal = Math.round((totalInstrumental / len) * 100);
    const speechVal = Math.round(((totalEnergy + totalDance) / (2 * len)) * 60);
    const meanBpm = Math.round(totalBpm / len);

    let vibe = 'Dynamic Pop & Melodic Flow';
    if (energyVal > 75 && danceVal > 70) vibe = 'High-Energy Electronic / Dance';
    else if (acousticVal > 60) vibe = 'Warm Acoustic & Organic Indie';
    else if (valenceVal > 70) vibe = 'Euphoric & Upbeat Vibes';
    else if (instrumentalVal > 60) vibe = 'Atmospheric Ambient / Lo-Fi';

    return {
      metrics: [
        { label: 'Energy', value: Math.max(15, Math.min(100, energyVal)), angle: 0 },
        { label: 'Acousticness', value: Math.max(15, Math.min(100, acousticVal)), angle: 60 },
        { label: 'Danceability', value: Math.max(15, Math.min(100, danceVal)), angle: 120 },
        { label: 'Valence (Mood)', value: Math.max(15, Math.min(100, valenceVal)), angle: 180 },
        { label: 'Speechiness', value: Math.max(15, Math.min(100, speechVal)), angle: 240 },
        { label: 'Instrumentalness', value: Math.max(15, Math.min(100, instrumentalVal)), angle: 300 }
      ],
      avgBpm: meanBpm,
      topVibe: vibe
    };
  }, [queue, currentTrack]);

  const size = 300;
  const center = size / 2;
  const radius = 100;

  const getCoordinates = (value: number, angleDeg: number) => {
    const angleRad = (angleDeg - 90) * (Math.PI / 180);
    const r = (value / 100) * radius;
    return {
      x: center + r * Math.cos(angleRad),
      y: center + r * Math.sin(angleRad)
    };
  };

  const points = metrics.map((m) => getCoordinates(m.value, m.angle));
  const pathData = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="relative w-full max-w-lg rounded-2xl bg-neutral-900 border border-neutral-800 p-6 text-white shadow-2xl flex flex-col gap-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-white rounded-full hover:bg-neutral-800 transition-colors"
          aria-label="Close Musical DNA"
        >
          <X className="w-5 h-5" />
        </button>

        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2 text-cyan-400">
            <Sparkles className="w-5 h-5" /> Your Musical DNA
          </h2>
          <p className="text-xs text-neutral-400">Acoustic profile derived from your listening history and saved tracks.</p>
        </div>

        {/* SVG Radar Chart */}
        <div className="flex justify-center items-center py-4 bg-black/40 rounded-xl border border-neutral-800">
          <svg width={size} height={size} className="overflow-visible">
            {/* Grid circles */}
            {[0.25, 0.5, 0.75, 1.0].map((level, idx) => (
              <circle
                key={idx}
                cx={center}
                cy={center}
                r={radius * level}
                fill="none"
                stroke="rgba(255, 255, 255, 0.1)"
                strokeDasharray={idx === 3 ? '0' : '3 3'}
              />
            ))}

            {/* Radar Spoke Axes */}
            {metrics.map((m, idx) => {
              const outer = getCoordinates(100, m.angle);
              const labelPos = getCoordinates(118, m.angle);
              return (
                <g key={idx}>
                  <line x1={center} y1={center} x2={outer.x} y2={outer.y} stroke="rgba(255, 255, 255, 0.15)" />
                  <text
                    x={labelPos.x}
                    y={labelPos.y}
                    fill="#94a3b8"
                    fontSize="10"
                    fontFamily="sans-serif"
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {m.label}
                  </text>
                </g>
              );
            })}

            {/* Polygon Shape */}
            <path d={pathData} fill="rgba(6, 182, 212, 0.25)" stroke="#06b6d4" strokeWidth="2" />

            {/* Point Markers */}
            {points.map((p, idx) => (
              <circle key={idx} cx={p.x} cy={p.y} r="4" fill="#22d3ee" stroke="#083344" strokeWidth="2" />
            ))}
          </svg>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-neutral-800/50 border border-neutral-800">
            <span className="text-neutral-400 block mb-1">Primary Sound Vibe</span>
            <span className="font-semibold text-cyan-300 truncate block">{topVibe}</span>
          </div>
          <div className="p-3 rounded-lg bg-neutral-800/50 border border-neutral-800">
            <span className="text-neutral-400 block mb-1">Mean Track Tempo</span>
            <span className="font-semibold text-cyan-300">{avgBpm} BPM</span>
          </div>
        </div>
      </div>
    </div>
  );
};
