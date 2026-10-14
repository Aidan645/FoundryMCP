import { useState, useEffect } from 'react';

export type LayoutMode = 'auto' | 'phone' | 'tablet';

export function useDeviceLayout() {
  const [mode, setMode] = useState<LayoutMode>(() => {
    return (localStorage.getItem('foundry_hub_layout_mode') as LayoutMode) || 'auto';
  });
  const [windowWidth, setWindowWidth] = useState<number>(() => {
    return typeof window !== 'undefined' ? window.innerWidth : 1024;
  });

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const setLayoutMode = (newMode: LayoutMode) => {
    localStorage.setItem('foundry_hub_layout_mode', newMode);
    setMode(newMode);
  };

  const isMobile = mode === 'phone' || (mode === 'auto' && windowWidth < 768);

  return { isMobile, mode, setLayoutMode, windowWidth };
}
