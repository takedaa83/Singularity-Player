import React, { useState } from 'react';
import { X, Wrench, CheckCircle2, Sparkles, Image as ImageIcon } from 'lucide-react';
import { usePlayerStore } from '../../stores/playerStore';
import { fixTrackMetadata } from '../../services/metadataFixerService';

interface MetadataRepairModalProps {
  onClose: () => void;
}

export const MetadataRepairModal: React.FC<MetadataRepairModalProps> = ({ onClose }) => {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const [isFixing, setIsFixing] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [fixedInfo, setFixedInfo] = useState<any>(null);

  const handleFixMetadata = async () => {
    if (!currentTrack) return;
    setIsFixing(true);
    try {
      const result = await fixTrackMetadata(currentTrack);
      setFixedInfo(result);
      setIsDone(true);
      // Update store
      usePlayerStore.setState({
        currentTrack: {
          ...currentTrack,
          title: result.title,
          artist: result.artist,
          album: result.album,
          coverUrl: result.coverUrl || currentTrack.coverUrl,
          genre: result.genre || currentTrack.genre
        }
      });
    } catch (e) {
      console.error(e);
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="relative w-full max-w-lg rounded-2xl bg-neutral-900 border border-neutral-800 p-6 text-white shadow-2xl flex flex-col gap-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-white rounded-full hover:bg-neutral-800 transition-colors"
          aria-label="Close Metadata Repair"
        >
          <X className="w-5 h-5" />
        </button>

        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2 text-emerald-400">
            <Wrench className="w-5 h-5" /> AI Metadata & Artwork Repair
          </h2>
          <p className="text-xs text-neutral-400">Automatically clean YouTube clutter titles and fetch 4K HD artwork from iTunes.</p>
        </div>

        {currentTrack ? (
          <div className="p-4 rounded-xl bg-black/40 border border-neutral-800 flex items-center gap-4">
            <img
              src={fixedInfo?.coverUrl || currentTrack.coverUrl || '/icons.svg'}
              alt={currentTrack.title}
              className="w-16 h-16 rounded-lg object-cover bg-neutral-800 border border-neutral-700"
            />
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold truncate">{fixedInfo?.title || currentTrack.title}</span>
              <span className="text-xs text-neutral-400 truncate">{fixedInfo?.artist || currentTrack.artist}</span>
              <span className="text-[10px] text-emerald-400 font-mono mt-1">{fixedInfo?.album || currentTrack.album || 'Single'}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-neutral-400">No active track selected for metadata repair.</p>
        )}

        {isDone ? (
          <div className="p-4 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 text-sm font-medium flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            Metadata cleaned and upgraded to HD artwork!
          </div>
        ) : (
          <button
            onClick={handleFixMetadata}
            disabled={!currentTrack || isFixing}
            className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold text-sm transition-all shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            {isFixing ? 'Scrubbing & Fetching HD Covers...' : 'Repair Current Track Metadata'}
          </button>
        )}
      </div>
    </div>
  );
};
