import React, { useState, useRef } from 'react';
import { X } from 'lucide-react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
}) => {
  const [dragY, setDragY] = useState(0);
  const startY = useRef<number | null>(null);

  if (!isOpen) return null;

  const handleTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) setDragY(delta);
  };

  const handleTouchEnd = () => {
    if (dragY > 90) {
      onClose();
    }
    setDragY(0);
    startY.current = null;
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/70 backdrop-blur-xs transition-opacity animate-fade-in">
      {/* Backdrop overlay */}
      <div className="flex-1" onClick={onClose} />

      <div
        style={{ transform: `translateY(${dragY}px)` }}
        className="bg-slate-900 border-t border-slate-700 rounded-t-2xl shadow-2xl max-h-[85dvh] flex flex-col pb-safe transition-transform duration-150 ease-out"
      >
        {/* Drag Handle & Header */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="pt-3 pb-2 px-4 cursor-grab active:cursor-grabbing select-none border-b border-slate-800"
        >
          <div className="w-10 h-1.5 bg-slate-600 rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <div className="min-w-0 pr-2">
              <h3 className="text-base font-bold text-slate-100 truncate">{title}</h3>
              {subtitle && <p className="text-xs text-slate-400 truncate">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="p-2 -mr-2 text-slate-400 hover:text-white rounded-full transition"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Sheet Content */}
        <div className="p-4 overflow-y-auto overscroll-contain flex-1">
          {children}
        </div>
      </div>
    </div>
  );
};
