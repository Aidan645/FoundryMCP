import React, { useState } from 'react';
import { ActiveScene } from '../types/foundry';
import {
  MapPin,
  Compass,
  Monitor,
  Crosshair,
  Sparkles
} from 'lucide-react';

interface ProjectorBarProps {
  activeScene: ActiveScene | null;
  onSendCommand: (action: string, params: Record<string, any>) => Promise<any>;
}

export const ProjectorBar: React.FC<ProjectorBarProps> = ({
  activeScene,
  onSendCommand,
}) => {
  const [activeCell, setActiveCell] = useState<{ x: number; y: number } | null>(null);
  const [customX, setCustomX] = useState<number>(2000);
  const [customY, setCustomY] = useState<number>(1500);
  const [pingStatus, setPingStatus] = useState<string | null>(null);

  const sceneWidth = activeScene?.width || 4000;
  const sceneHeight = activeScene?.height || 3000;

  const handlePing = async (x: number, y: number, cellIndex?: { x: number; y: number }) => {
    try {
      if (cellIndex) {
        setActiveCell(cellIndex);
        setTimeout(() => setActiveCell(null), 1500);
      }
      setPingStatus(`Pinged at (${Math.round(x)}, ${Math.round(y)})`);
      await onSendCommand('PING_CANVAS', { x, y });
      setTimeout(() => setPingStatus(null), 2500);
    } catch (err: any) {
      setPingStatus(`Ping failed: ${err.message}`);
      setTimeout(() => setPingStatus(null), 3000);
    }
  };

  // 8x8 radar grid
  const gridSize = 8;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg">
            <Monitor className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              Projector & Tabletop Canvas Radar
            </h3>
            <p className="text-xs text-slate-400">
              Active Scene: <span className="text-amber-400 font-semibold">{activeScene?.name || 'No Active Scene'}</span>{' '}
              ({sceneWidth} × {sceneHeight} px)
            </p>
          </div>
        </div>

        {pingStatus && (
          <span className="text-xs bg-slate-950 text-amber-400 border border-amber-500/40 px-3 py-1 rounded-md animate-fade-in font-mono">
            {pingStatus}
          </span>
        )}
      </div>

      <div className="flex flex-col lg:flex-row items-center gap-6">
        {/* Radar Mini-Grid */}
        <div className="relative p-3 bg-slate-950 rounded-xl border border-slate-800 flex-shrink-0 shadow-inner">
          <div className="absolute top-1 left-2 text-[9px] text-slate-500 font-mono">
            Tabletop Map Viewport
          </div>
          <div className="grid grid-cols-8 gap-1 w-64 h-48 mt-4 bg-slate-900/50 p-1 rounded-lg border border-slate-800">
            {Array.from({ length: gridSize * gridSize }).map((_, i) => {
              const col = i % gridSize;
              const row = Math.floor(i / gridSize);
              const isPinged = activeCell?.x === col && activeCell?.y === row;

              const targetX = (col + 0.5) * (sceneWidth / gridSize);
              const targetY = (row + 0.5) * (sceneHeight / gridSize);

              return (
                <button
                  key={i}
                  onClick={() => handlePing(targetX, targetY, { x: col, y: row })}
                  className={`w-full h-full rounded transition relative overflow-hidden ${
                    isPinged
                      ? 'bg-amber-400 scale-105 shadow-lg shadow-amber-500/50'
                      : 'bg-slate-850 hover:bg-amber-500/30 border border-slate-800/80 hover:border-amber-500/60'
                  }`}
                  title={`Ping (${Math.round(targetX)}, ${Math.round(targetY)})`}
                >
                  {isPinged && (
                    <span className="absolute inset-0 rounded-full border-2 border-white animate-ping" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Controls & Quick Presets */}
        <div className="flex-1 space-y-3 w-full">
          <p className="text-xs text-slate-300 font-medium">
            Click on any coordinate cell on the radar grid above to flash a glowing ping animation on the GM / Projector display.
          </p>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={() => handlePing(sceneWidth / 2, sceneHeight / 2)}
              className="bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Compass className="w-3.5 h-3.5 text-amber-400" />
              <span>Center Map</span>
            </button>
            <button
              onClick={() => handlePing(sceneWidth * 0.25, sceneHeight * 0.25)}
              className="bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Crosshair className="w-3.5 h-3.5 text-blue-400" />
              <span>Top-Left Quadrant</span>
            </button>
            <button
              onClick={() => handlePing(sceneWidth * 0.75, sceneHeight * 0.75)}
              className="bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Crosshair className="w-3.5 h-3.5 text-emerald-400" />
              <span>Bottom-Right Quadrant</span>
            </button>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <span className="text-xs text-slate-400">Manual (X, Y):</span>
            <input
              type="number"
              value={customX}
              onChange={(e) => setCustomX(Number(e.target.value))}
              className="w-20 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white"
              placeholder="X"
            />
            <input
              type="number"
              value={customY}
              onChange={(e) => setCustomY(Number(e.target.value))}
              className="w-20 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white"
              placeholder="Y"
            />
            <button
              onClick={() => handlePing(customX, customY)}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3 py-1 rounded text-xs transition"
            >
              Ping
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
