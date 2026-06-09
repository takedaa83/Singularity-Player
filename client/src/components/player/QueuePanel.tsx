import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ListMusic, Trash2, X, Plus, GripVertical } from 'lucide-react';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryDB } from '../../hooks/useLibraryDB';
import { Playlist, Track } from '../../types';
import { tokens } from '../../theme/muiTheme';
import { formatDuration } from '../../utils/formatDuration';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface QueuePanelProps {
  onClose: () => void;
  triggerRefresh?: () => void;
}

interface SortableQueueItemProps {
  track: Track;
  idx: number;
  isActive: boolean;
  onPlay: () => void;
  onRemove: () => void;
  formatDuration: (time: number) => string;
}

const SortableQueueItem: React.FC<SortableQueueItemProps> = ({
  track,
  idx,
  isActive,
  onPlay,
  onRemove,
  formatDuration,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `${track.id}-${idx}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center justify-between p-2.5 rounded-lg transition-all border text-xs ${
        isActive
          ? 'bg-white/10 border-neutral-700 now-playing-glow'
          : 'bg-transparent border-neutral-800 hover:bg-neutral-800/50 hover:border-neutral-700'
      }`}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-neutral-600 hover:text-neutral-400 p-1 mr-1 shrink-0"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </div>

      <div onClick={onPlay} className="flex items-center gap-3 truncate flex-1 mr-2 cursor-pointer">
        <span className={`font-mono text-[10px] w-4 text-center shrink-0 ${isActive ? 'text-white' : 'text-neutral-600'}`}>
          {idx + 1}
        </span>
        <div className="flex flex-col truncate">
          <span className={`font-semibold truncate ${isActive ? 'text-white' : 'text-neutral-300'}`}>
            {track.title}
          </span>
          <span className="text-[10px] text-neutral-400 truncate mt-0.5">{track.artist}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className="font-mono text-[10px] text-neutral-500">{formatDuration(track.duration)}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="p-1 rounded hover:bg-neutral-800 hover:text-red-400 text-neutral-500 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};

export const QueuePanel: React.FC<QueuePanelProps> = ({ onClose, triggerRefresh }) => {
  const queue = usePlayerStore(state => state.queue);
  const activeQueueIndex = usePlayerStore(state => state.activeQueueIndex);
  const isPlaying = usePlayerStore(state => state.isPlaying);
  const playTrack = usePlayerStore(state => state.playTrack);
  const setPlaying = usePlayerStore(state => state.setPlaying);
  const removeFromQueue = usePlayerStore(state => state.removeFromQueue);
  const clearQueue = usePlayerStore(state => state.clearQueue);
  const reorderQueue = usePlayerStore(state => state.reorderQueue);
  const { savePlaylist } = useLibraryDB();
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [playlistName, setPlaylistName] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = queue.findIndex((_, idx) => `${queue[idx].id}-${idx}` === active.id);
      const newIndex = queue.findIndex((_, idx) => `${queue[idx].id}-${idx}` === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        const newQueue = arrayMove(queue, oldIndex, newIndex);
        reorderQueue(newQueue);
      }
    }
  };

  const handleTrackClick = (trackIndex: number) => {
    const selectedTrack = queue[trackIndex];
    if (trackIndex === activeQueueIndex) {
      setPlaying(!isPlaying);
    } else {
      playTrack(selectedTrack, queue);
    }
  };

  const handleSaveQueueAsPlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playlistName.trim() || queue.length === 0) return;

    const newPlaylist: Playlist = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 10),
      name: playlistName.trim(),
      description: `Saved from play queue on ${new Date().toLocaleDateString()}`,
      coverUrl: queue[0]?.coverArtUrl || null,
      trackIds: queue.map(t => t.id),
      createdAt: Date.now()
    };

    await savePlaylist(newPlaylist);
    setPlaylistName('');
    setShowSaveForm(false);
    if (triggerRefresh) triggerRefresh();
  };



  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="w-full sm:w-80 h-full fixed sm:relative right-0 top-0 bottom-0 glass-heavy flex flex-col justify-between py-6 px-4 text-white shrink-0 z-50 sm:z-40 border-l border-white/10"
    >
      <div className="flex flex-col gap-6 h-full overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center px-2 shrink-0">
          <div className="flex items-center gap-2">
            <ListMusic className="w-4 h-4 text-white" />
            <h3 className="text-sm font-semibold tracking-wide">Play Queue</h3>
          </div>
          <button 
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded hover:bg-white/5"
            aria-label="Close queue panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Info & Save/Clear actions */}
        {queue.length > 0 && (
          <div className="px-2 flex flex-col gap-2 shrink-0">
            <div className="flex justify-between items-center text-xs text-neutral-400">
              <span>{queue.length} tracks</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowSaveForm(!showSaveForm)}
                  className="flex items-center gap-1 hover:text-white transition-colors font-semibold"
                  style={{ color: showSaveForm ? tokens.colors.primary : undefined }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Save Playlist</span>
                </button>
                <button
                  onClick={clearQueue}
                  className="flex items-center gap-1 hover:text-red-400 font-semibold"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              </div>
            </div>

            <AnimatePresence>
              {showSaveForm && (
                <motion.form
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  onSubmit={handleSaveQueueAsPlaylist}
                  className="overflow-hidden py-1"
                >
                  <input
                    type="text"
                    autoFocus
                    value={playlistName}
                    onChange={(e) => setPlaylistName(e.target.value)}
                    placeholder="Playlist name..."
                    className="w-full px-3 py-1.5 rounded-lg text-xs text-white placeholder-neutral-600 focus:outline-none focus:ring-1 bg-neutral-900 border border-neutral-800"
                    style={{
                      borderColor: tokens.colors.surfaceBorder,
                      outlineColor: tokens.colors.primary,
                    }}
                  />
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Queue List */}
        <div className="flex-1 overflow-y-auto pr-1">
          {queue.length === 0 ? (
            <div className="px-3 py-12 text-xs text-neutral-500 italic text-center">Queue is empty</div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={queue.map((track, idx) => `${track.id}-${idx}`)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-1.5 pb-4">
                  {queue.map((track, idx) => {
                    const isActive = idx === activeQueueIndex;
                    return (
                      <SortableQueueItem
                        key={`${track.id}-${idx}`}
                        track={track}
                        idx={idx}
                        isActive={isActive}
                        onPlay={() => handleTrackClick(idx)}
                        onRemove={() => removeFromQueue(idx)}
                        formatDuration={formatDuration}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default QueuePanel;
