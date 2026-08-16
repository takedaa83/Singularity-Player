import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Radio, Copy, Check, LogOut, Play, Headphones, Sparkles, X } from 'lucide-react';
import { listenTogetherService, RoomInfo } from '../../services/listenTogetherService';
import { useToast } from '../../hooks/useToast';
import { usePlayerStore } from '../../stores/playerStore';

interface ListenTogetherModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ListenTogetherModal: React.FC<ListenTogetherModalProps> = ({ isOpen, onClose }) => {
  const { toast } = useToast();
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const [activeRoom, setActiveRoom] = useState<string | null>(listenTogetherService.getActiveRoomId());
  const [isHost, setIsHost] = useState(listenTogetherService.getIsHost());
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [userName, setUserName] = useState(listenTogetherService.getClientName());
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setActiveRoom(listenTogetherService.getActiveRoomId());
    setIsHost(listenTogetherService.getIsHost());
  }, [isOpen]);

  const handleCreateRoom = async () => {
    setIsLoading(true);
    const res = await listenTogetherService.createRoom(userName);
    setIsLoading(false);
    if (res.success && res.roomId) {
      setActiveRoom(res.roomId);
      setIsHost(true);
      toast(`Room ${res.roomId} created! Share with friends to sync.`, 'success');
    } else {
      toast(res.error || 'Failed to create room', 'error');
    }
  };

  const handleJoinRoom = async () => {
    if (!roomCodeInput.trim()) return;
    setIsLoading(true);
    const res = await listenTogetherService.joinRoom(roomCodeInput, userName);
    setIsLoading(false);
    if (res.success && res.room) {
      setActiveRoom(res.room.id);
      setIsHost(false);
      toast(`Joined room ${res.room.id}! Playback is now synchronized.`, 'success');
    } else {
      toast(res.error || 'Room not found or expired', 'error');
    }
  };

  const handleLeaveRoom = () => {
    listenTogetherService.leaveRoom();
    setActiveRoom(null);
    setIsHost(false);
    toast('Left listening room', 'info');
  };

  const handleCopyCode = () => {
    if (!activeRoom) return;
    navigator.clipboard.writeText(activeRoom);
    setCopied(true);
    toast(`Room code ${activeRoom} copied!`, 'info');
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.44, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-md bg-neutral-900/95 border border-white/10 rounded-2xl shadow-2xl p-6 text-white overflow-hidden"
        >
          {/* Top Bar */}
          <div className="flex items-center justify-between pb-4 border-b border-white/5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/20 text-primary border border-primary/30">
                <Radio className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-wide">Listen Together</h3>
                <p className="text-xs text-neutral-400">Real-time synchronized listening room</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="py-5 flex flex-col gap-4">
            {/* User Name Input */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-neutral-300">Your Display Name</label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Enter your name"
                className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            {/* Active Room Card */}
            {activeRoom ? (
              <div className="p-4 rounded-xl bg-primary/10 border border-primary/30 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      {isHost ? '👑 You are Room Host' : '🎧 Connected as Listener'}
                    </span>
                  </div>
                  <button
                    onClick={handleLeaveRoom}
                    className="flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 font-semibold transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Leave
                  </button>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-black/40 border border-white/5">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-neutral-400 uppercase font-mono">Room Code</span>
                    <span className="text-lg font-mono font-black text-primary tracking-widest">{activeRoom}</span>
                  </div>
                  <button
                    onClick={handleCopyCode}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-neutral-200 transition-colors flex items-center gap-1.5 text-xs font-semibold"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied' : 'Share'}
                  </button>
                </div>

                {currentTrack && (
                  <div className="flex items-center gap-3 pt-1">
                    <Headphones className="w-4 h-4 text-primary shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-semibold truncate text-white">{currentTrack.title}</span>
                      <span className="text-[10px] text-neutral-400 truncate">{currentTrack.artist}</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Create Room Button */}
                <button
                  onClick={handleCreateRoom}
                  disabled={isLoading}
                  className="w-full py-3 px-4 rounded-xl bg-primary hover:bg-primary/90 active:scale-98 text-white font-bold text-sm shadow-[0_0_20px_var(--primary)] transition-all flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  Create Instant Room (Host)
                </button>

                <div className="flex items-center gap-3 my-1">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-[11px] font-mono text-neutral-500 uppercase">OR JOIN ROOM</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>

                {/* Join Code Input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={roomCodeInput}
                    onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                    placeholder="Enter 6-digit Code (e.g. SING-789)"
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm font-mono text-white placeholder:text-neutral-500 focus:outline-none focus:border-primary transition-colors"
                  />
                  <button
                    onClick={handleJoinRoom}
                    disabled={isLoading || !roomCodeInput.trim()}
                    className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-30 active:scale-95 text-white font-bold text-sm transition-all"
                  >
                    Join
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
