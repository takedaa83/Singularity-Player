import React, { useMemo } from 'react';

interface AbstractPlaylistCoverProps {
  name: string;
  id: string;
  size?: 'large' | 'medium' | 'small';
  className?: string;
}

export const AbstractPlaylistCover: React.FC<AbstractPlaylistCoverProps> = ({
  name,
  id,
  size = 'medium',
  className = '',
}) => {
  const styleConfig = useMemo(() => {
    // Generate a simple hash from the playlist id and name
    const str = id + name;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const styleIdx = Math.abs(hash) % 4;
    
    // Lowercase name as requested by the user's premium aesthetic
    const cleanName = name.toLowerCase();

    let dimensionsClass = 'w-24 h-24 sm:w-28 sm:h-28 rounded-xl';
    let textSizeClass = 'text-[13px] font-black p-3.5';
    if (size === 'large') {
      dimensionsClass = 'w-28 h-28 sm:w-32 sm:h-32 rounded-xl';
      textSizeClass = 'text-[15px] font-extrabold p-4';
    } else if (size === 'small') {
      dimensionsClass = 'w-4 h-4 rounded-[4px]';
      textSizeClass = 'hidden';
    }

    // Styles inspired by user reference pictures: newborns (swirling arches), oldiee (pastel gradient), tapestry (teal gradient)
    switch (styleIdx) {
      case 0: // Tapestry style: Teal / Light-Blue / Dark Blue mesh
        return {
          background: 'radial-gradient(circle at 10% 10%, #22d3ee 0%, rgba(34,211,238,0) 80%), radial-gradient(circle at 90% 90%, #0f172a 0%, rgba(15,23,42,0) 80%), radial-gradient(circle at 80% 20%, #06b6d4 0%, rgba(6,182,212,0) 70%), #0891b2',
          textColor: 'text-neutral-900',
          dimensionsClass,
          textSizeClass,
          cleanName,
          hasOverlay: false
        };
      case 1: // Oldiee style: White / Pink / Indigo mesh
        return {
          background: 'radial-gradient(circle at 100% 0%, #fecdd3 0%, rgba(254,205,211,0) 75%), radial-gradient(circle at 0% 100%, #1e3a8a 0%, rgba(30,58,138,0) 75%), radial-gradient(circle at 50% 50%, #ffffff 0%, #f3f4f6 100%)',
          textColor: 'text-neutral-900',
          dimensionsClass,
          textSizeClass,
          cleanName,
          hasOverlay: false
        };
      case 2: // Newborns style: Sunburst spiral arches from left edge
        return {
          background: 'repeating-conic-gradient(from 0deg at 0% 50%, #b2f2bb 0deg 12deg, #e5f9e0 12deg 24deg)',
          textColor: 'text-neutral-900',
          dimensionsClass,
          textSizeClass,
          cleanName,
          hasOverlay: true
        };
      default: // Cosmic lava style: Purple / Coral / Warm Sand
        return {
          background: 'radial-gradient(circle at 20% 80%, #fb7185 0%, rgba(251,113,133,0) 70%), radial-gradient(circle at 80% 20%, #a855f7 0%, rgba(168,85,247,0) 70%), #312e81',
          textColor: 'text-white',
          dimensionsClass,
          textSizeClass,
          cleanName,
          hasOverlay: false
        };
    }
  }, [name, id, size]);

  return (
    <div
      className={`relative overflow-hidden flex flex-col justify-start select-none shrink-0 border border-white/5 ${styleConfig.dimensionsClass} ${className}`}
      style={{
        background: styleConfig.background,
        boxShadow: size !== 'small' ? '0 10px 30px rgba(0,0,0,0.35)' : 'none'
      }}
    >
      {styleConfig.hasOverlay && (
        <div 
          className="absolute inset-0 opacity-20 mix-blend-multiply pointer-events-none"
          style={{
            background: 'radial-gradient(circle at 0% 50%, transparent 40%, rgba(0,0,0,0.6) 100%)',
          }}
        />
      )}
      
      {size !== 'small' && (
        <span 
          className={`font-black tracking-tight leading-none text-left w-full break-all whitespace-pre-wrap select-none lowercase ${styleConfig.textColor} ${styleConfig.textSizeClass}`}
          style={{
            fontFamily: "'Outfit', 'Inter', sans-serif"
          }}
        >
          {styleConfig.cleanName}
        </span>
      )}
    </div>
  );
};

export default AbstractPlaylistCover;
