import React, { useState } from 'react';
import { FolderSearch, Folder, Check, AlertCircle, Loader2, X, Music } from 'lucide-react';
import { useLibraryDB } from '../../hooks/useLibraryDB';
import { Track } from '../../types';

interface LocalFolderScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanComplete?: () => void;
}

export const LocalFolderScannerModal: React.FC<LocalFolderScannerModalProps> = ({ isOpen, onClose, onScanComplete }) => {
  const { saveTrack } = useLibraryDB();
  const [folderPath, setFolderPath] = useState('C:\\Users\\abc\\Music');
  const [isScanning, setIsScanning] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [scannedTracks, setScannedTracks] = useState<Track[]>([]);

  if (!isOpen) return null;

  const handleStartScan = async () => {
    if (!folderPath.trim()) return;

    setIsScanning(true);
    setStatusMessage('Scanning PC directory for audio files...');
    setScannedTracks([]);

    try {
      const res = await fetch('/api/library/scan-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: folderPath.trim() }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to scan directory');
      }

      const data = await res.json();
      const tracks: Track[] = data.tracks || [];

      setStatusMessage(`Found ${data.totalFilesFound} audio files. Adding ${tracks.length} tracks to library...`);

      // Save tracks to local IndexedDB library
      for (const track of tracks) {
        await saveTrack(track);
      }

      setScannedTracks(tracks);
      setStatusMessage(`Successfully imported ${tracks.length} tracks into your library!`);
      if (onScanComplete) onScanComplete();
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message || 'Directory scan failed'}`);
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl relative flex flex-col space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <FolderSearch className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg">PC Music Folder Scanner</h2>
              <p className="text-xs text-slate-400">Scan local folders to import MP3, FLAC & M4A tracks</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Input Form */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
            <Folder className="w-3.5 h-3.5 text-blue-400" />
            <span>Local PC Folder Directory Path:</span>
          </label>
          <input
            type="text"
            value={folderPath}
            onChange={(e) => setFolderPath(e.target.value)}
            placeholder="e.g. C:\Users\abc\Music or D:\Audio\Playlists"
            className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 transition-all font-mono"
          />
        </div>

        {/* Status Area */}
        {statusMessage && (
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 flex items-center space-x-2.5">
            {isScanning ? (
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
            ) : scannedTracks.length > 0 ? (
              <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            )}
            <span className="line-clamp-2">{statusMessage}</span>
          </div>
        )}

        {/* Scan Results List Preview */}
        {scannedTracks.length > 0 && (
          <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 no-scrollbar border-t border-slate-800 pt-3">
            {scannedTracks.slice(0, 10).map((t, idx) => (
              <div key={idx} className="flex items-center space-x-3 p-2 rounded-lg bg-slate-950/50 text-xs">
                <Music className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-white font-medium truncate">{t.title}</p>
                  <p className="text-slate-400 text-[11px] truncate">{t.artist}</p>
                </div>
              </div>
            ))}
            {scannedTracks.length > 10 && (
              <p className="text-[11px] text-slate-500 text-center pt-1 font-mono">
                + {scannedTracks.length - 10} more tracks imported
              </p>
            )}
          </div>
        )}

        {/* Buttons */}
        <div className="flex items-center justify-end space-x-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-semibold transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleStartScan}
            disabled={isScanning || !folderPath.trim()}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-500/25 flex items-center space-x-2 transition-all disabled:opacity-50"
          >
            {isScanning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FolderSearch className="w-4 h-4" />
            )}
            <span>{isScanning ? 'Scanning Directory...' : 'Start Folder Scan'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
