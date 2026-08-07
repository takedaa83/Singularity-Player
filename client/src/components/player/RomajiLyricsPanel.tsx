import React, { useState } from 'react';
import { Languages, Globe2, Sparkles, Volume2 } from 'lucide-react';
import { usePlayerStore } from '../../stores/playerStore';

export const RomajiLyricsPanel: React.FC = () => {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const [showRomaji, setShowRomaji] = useState(true);
  const [showTranslation, setShowTranslation] = useState(true);

  const sampleLyrics = [
    { line: '夜に駆ける (Yoru ni Kakeru)', romaji: 'Yoru ni kakeru', translation: 'Racing into the night' },
    { line: '沈むように溶けてゆくように', romaji: 'Shizumu you ni tokete yuku you ni', translation: 'Sinking down as if melting away' },
    { line: '二人だけの空が広がる夜に', romaji: 'Futari dake no sora ga hirogaru yoru ni', translation: 'In the night where the sky belongs only to us' }
  ];

  return (
    <div className="flex flex-col gap-4 p-4 rounded-xl bg-neutral-900 border border-neutral-800 text-white">
      <div className="flex justify-between items-center pb-2 border-b border-neutral-800">
        <h3 className="text-sm font-bold flex items-center gap-2 text-cyan-400">
          <Languages className="w-4 h-4" /> Romaji & Dual-Language Lyrics
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => setShowRomaji(!showRomaji)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
              showRomaji ? 'bg-cyan-600/30 border-cyan-500 text-cyan-300' : 'bg-neutral-800 border-neutral-700 text-neutral-400'
            }`}
          >
            Romaji
          </button>
          <button
            onClick={() => setShowTranslation(!showTranslation)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
              showTranslation ? 'bg-purple-600/30 border-purple-500 text-purple-300' : 'bg-neutral-800 border-neutral-700 text-neutral-400'
            }`}
          >
            Translation
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-5 py-2">
        {sampleLyrics.map((item, idx) => (
          <div key={idx} className="flex flex-col gap-1">
            <span className="text-base font-bold text-neutral-100">{item.line}</span>
            {showRomaji && <span className="text-xs font-mono text-cyan-300">{item.romaji}</span>}
            {showTranslation && <span className="text-xs italic text-neutral-400">{item.translation}</span>}
          </div>
        ))}
      </div>
    </div>
  );
};
