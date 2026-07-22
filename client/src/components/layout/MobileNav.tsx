import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, Search, Library, Download, Settings } from 'lucide-react';

export const MobileNav: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    const updateKeyboardState = () => {
      if (viewport) {
        const keyboardHeight = window.innerHeight - viewport.height;
        setIsKeyboardOpen(keyboardHeight > 150);
      } else {
        setIsKeyboardOpen(window.innerHeight < 500);
      }
    };

    viewport?.addEventListener('resize', updateKeyboardState);
    viewport?.addEventListener('scroll', updateKeyboardState);
    window.addEventListener('resize', updateKeyboardState);

    return () => {
      viewport?.removeEventListener('resize', updateKeyboardState);
      viewport?.removeEventListener('scroll', updateKeyboardState);
      window.removeEventListener('resize', updateKeyboardState);
    };
  }, []);

  if (isKeyboardOpen) return null;

  const navItems = [
    { label: 'Home', path: '/', icon: Home },
    { label: 'Search', path: '/search', icon: Search },
    { label: 'Library', path: '/library', icon: Library },
    { label: 'Downloads', path: '/downloads', icon: Download },
    { label: 'Settings', path: '/settings', icon: Settings },
  ];

  const triggerHaptic = () => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(8); } catch (_) {}
    }
  };

  return (
    <nav className="block md:hidden fixed bottom-1.5 left-2.5 right-2.5 z-40 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-around h-15 px-1 rounded-2xl border border-white/12 shadow-[0_12px_40px_rgba(0,0,0,0.85)] backdrop-blur-2xl bg-neutral-950/90 gpu-accelerated">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              onClick={() => {
                triggerHaptic();
                navigate(item.path);
              }}
              aria-label={`Navigate to ${item.label}`}
              className={`relative flex flex-col items-center justify-center flex-1 h-12 py-1 active:scale-95 transition-all duration-200 ${
                isActive ? 'text-primary font-bold' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTabGlow"
                  className="absolute inset-x-1 inset-y-0.5 bg-primary/15 rounded-xl border border-primary/30 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <Icon className={`w-5 h-5 relative z-10 transition-transform ${isActive ? 'scale-110 text-primary' : ''}`} />
              <span className="text-[10px] mt-0.5 tracking-tight relative z-10 font-semibold select-none">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileNav;
