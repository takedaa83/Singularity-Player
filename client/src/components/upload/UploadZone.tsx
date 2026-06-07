import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { UploadCloud, FileAudio, Check, AlertCircle, Loader2 } from 'lucide-react';
import { useLibraryDB } from '../../hooks/useLibraryDB';
import { Track } from '../../types';

interface UploadZoneProps {
  onClose: () => void;
  triggerRefresh: () => void;
}

export const UploadZone: React.FC<UploadZoneProps> = ({ onClose, triggerRefresh }) => {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [parsedTracks, setParsedTracks] = useState<Track[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { saveTrack } = useLibraryDB();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => {
    setDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      await uploadFiles(files);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) {
      await uploadFiles(files);
    }
  };

  const uploadFiles = async (files: File[]) => {
    setError(null);

    const allowedExts = ['.mp3', '.flac', '.wav', '.aac', '.m4a', '.ogg', '.opus', '.aiff', '.wma', '.webm'];
    const maxFileSize = 100 * 1024 * 1024; // 100MB

    const validFiles: File[] = [];
    const invalidFiles: string[] = [];

    for (const file of files) {
      const ext = file.name.includes('.') ? file.name.substring(file.name.lastIndexOf('.')).toLowerCase() : '';
      const isValidType = file.type.startsWith('audio/') || allowedExts.includes(ext);

      if (!isValidType) {
        invalidFiles.push(`"${file.name}" (unsupported file type)`);
      } else if (file.size > maxFileSize) {
        invalidFiles.push(`"${file.name}" (exceeds 100MB limit)`);
      } else {
        validFiles.push(file);
      }
    }

    if (invalidFiles.length > 0) {
      setError(`Skipped invalid files: ${invalidFiles.join(', ')}`);
    }

    if (validFiles.length === 0) {
      return;
    }

    setLoading(true);
    const formData = new FormData();
    validFiles.forEach(f => formData.append('files', f));

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Upload failed');
      }

      const data = await res.json();
      if (data.success && Array.isArray(data.tracks)) {
        setParsedTracks(data.tracks);
        if (data.tracks.length > 0) {
          setEditingIndex(0); // edit first track
        }
      }
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Failed to upload files.');
    } finally {
      setLoading(false);
    }
  };

  // Metadata editor update handler
  const handleMetaChange = (field: keyof Track, val: any) => {
    if (editingIndex === null) return;
    const updated = [...parsedTracks];
    updated[editingIndex] = {
      ...updated[editingIndex],
      [field]: val
    };
    setParsedTracks(updated);
  };

  // Save parsed tracks to IndexedDB
  const handleSaveAll = async () => {
    for (const track of parsedTracks) {
      await saveTrack(track);
    }
    triggerRefresh();
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4 text-white"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="w-full max-w-xl bg-neutral-900 border border-neutral-800 rounded-2xl p-6 flex flex-col gap-6 shadow-2xl"
      >
        
        {/* Header */}
        <div className="flex justify-between items-center border-b border-white/5 pb-4">
          <div>
            <h3 className="text-lg font-bold tracking-wide">Upload Tracks</h3>
            <p className="text-xs text-neutral-400">Add local audio files to your private library</p>
          </div>
          <button 
            onClick={onClose}
            className="text-xs text-neutral-400 hover:text-white hover:underline"
          >
            Close
          </button>
        </div>

        {/* Upload Dropzone */}
        {parsedTracks.length === 0 && (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`h-64 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-4 cursor-pointer transition-all ${
              dragging 
                ? 'border-white bg-white/10' 
                : 'border-neutral-700 bg-neutral-800/50 hover:border-neutral-600 hover:bg-neutral-800'
            }`}
          >
            <input
              type="file"
              multiple
              accept="audio/*"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
            />
            {loading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-10 h-10 text-white animate-spin" />
                <span className="text-sm font-medium">Extracting ID3 tags and cover art...</span>
              </div>
            ) : (
              <>
                <div className="p-4 rounded-full bg-neutral-800 border border-neutral-700 text-white">
                  <UploadCloud className="w-8 h-8" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold">Drag & Drop files here, or click to browse</p>
                  <p className="text-xs text-neutral-500 mt-1">Supports MP3, FLAC, WAV, AAC, M4A up to 100MB</p>
                </div>
              </>
            )}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="p-4 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center gap-3 text-red-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Metadata tag correction fields */}
        {parsedTracks.length > 0 && editingIndex !== null && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 border-b border-white/5 pb-3">
              <FileAudio className="w-5 h-5 text-white" />
              <span className="text-sm font-semibold">
                Verify File Metadata ({editingIndex + 1} of {parsedTracks.length})
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-neutral-500 font-semibold uppercase">Title</label>
                <input
                  type="text"
                  value={parsedTracks[editingIndex].title}
                  onChange={(e) => handleMetaChange('title', e.target.value)}
                  className="px-3.5 py-2.5 rounded-lg bg-neutral-800 border border-neutral-700 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-neutral-500 font-semibold uppercase">Artist</label>
                <input
                  type="text"
                  value={parsedTracks[editingIndex].artist}
                  onChange={(e) => handleMetaChange('artist', e.target.value)}
                  className="px-3.5 py-2.5 rounded-lg bg-neutral-800 border border-neutral-700 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-neutral-500 font-semibold uppercase">Album</label>
                <input
                  type="text"
                  value={parsedTracks[editingIndex].album || ''}
                  onChange={(e) => handleMetaChange('album', e.target.value)}
                  className="px-3.5 py-2.5 rounded-lg bg-neutral-800 border border-neutral-700 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-neutral-500 font-semibold uppercase">Genre</label>
                <input
                  type="text"
                  value={parsedTracks[editingIndex].genre || ''}
                  onChange={(e) => handleMetaChange('genre', e.target.value)}
                  className="px-3.5 py-2.5 rounded-lg bg-neutral-800 border border-neutral-700 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white"
                />
              </div>
            </div>

            {/* Pagination buttons for correcting tags */}
            <div className="flex justify-between items-center border-t border-white/5 pt-4 mt-2">
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingIndex(prev => prev !== null && prev > 0 ? prev - 1 : prev)}
                  disabled={editingIndex === 0}
                  className="px-3.5 py-2 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 text-xs font-semibold disabled:opacity-30"
                >
                  Previous
                </button>
                <button
                  onClick={() => setEditingIndex(prev => prev !== null && prev < parsedTracks.length - 1 ? prev + 1 : prev)}
                  disabled={editingIndex === parsedTracks.length - 1}
                  className="px-3.5 py-2 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 text-xs font-semibold disabled:opacity-30"
                >
                  Next
                </button>
              </div>

              <button
                onClick={handleSaveAll}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-white text-black hover:bg-neutral-200 font-medium text-xs"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save All to Library</span>
              </button>
            </div>
          </div>
        )}

      </motion.div>
    </motion.div>
  );
};
export default UploadZone;
