import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, Search, Library, Download, Settings } from 'lucide-react';

export const MobileNav: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsKeyboardOpen(window.innerHeight < 500);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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
    <nav className="block md:hidden fixed bottom-2 left-3 right-3 z-40">
      <div className="flex items-center justify-around h-14 px-1 rounded-2xl border border-white/10 shadow-[0_10px_35px_rgba(0,0,0,0.75)] backdrop-blur-2xl bg-neutral-950/85">
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
              className={`relative flex flex-col items-center justify-center flex-1 py-1 transition-all duration-200 ${
                isActive ? 'text-primary font-bold' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTabGlow"
                  className="absolute inset-x-1 inset-y-0.5 bg-primary/10 rounded-xl border border-primary/20"
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                />
              )}
              <Icon className={`w-5 h-5 relative z-10 transition-transform ${isActive ? 'scale-110 text-primary' : ''}`} />
              <span className="text-[10px] mt-0.5 tracking-tight relative z-10 font-medium select-none">
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
