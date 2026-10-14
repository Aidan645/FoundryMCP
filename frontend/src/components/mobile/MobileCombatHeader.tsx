import React from 'react';
import { Actor } from '../../types/foundry';
import { Heart, Sparkles, Wifi, WifiOff, ChevronDown } from 'lucide-react';

interface MobileCombatHeaderProps {
  actor: Actor | null;
  actors: Actor[];
  onSelectActor: (id: string) => void;
  isFoundryConnected: boolean;
  onOpenHpSheet: () => void;
  onToggleInspiration: () => void;
}

export const MobileCombatHeader: React.FC<MobileCombatHeaderProps> = ({
  actor,
  actors,
  onSelectActor,
  isFoundryConnected,
  onOpenHpSheet,
  onToggleInspiration,
}) => {
  const hp = actor?.system?.attributes?.hp || { value: 0, max: 0, temp: 0 };
  const inspiration = Boolean(actor?.system?.attributes?.inspiration);
  const hpPercent = Math.min(100, Math.max(0, (hp.value / (hp.max || 1)) * 100));

  return (
    <header className="bg-slate-900 border-b border-slate-800 px-3 py-2 flex items-center justify-between gap-2 shrink-0 select-none pt-safe">
      {/* Left: Compact Actor Selector & Live Dot */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className="relative shrink-0">
          <img
            src={actor?.img || '/icons/svg/mystery-man.svg'}
            alt=""
            className="w-9 h-9 rounded-lg object-cover bg-slate-800 border border-slate-700"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2394a3b8"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>';
            }}
          />
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900 ${
              isFoundryConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
            }`}
            title={isFoundryConnected ? 'Foundry Live' : 'Foundry Offline'}
          />
        </div>

        <div className="relative min-w-0 flex-1">
          <select
            value={actor?.id || ''}
            onChange={(e) => onSelectActor(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 text-xs font-bold text-slate-100 rounded-lg py-1.5 pl-2 pr-6 appearance-none focus:outline-none focus:border-amber-500 truncate"
          >
            {actors.map(a => (
              <option key={a.id} value={a.id} className="bg-slate-900 text-white">
                {a.name}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-2 pointer-events-none" />
        </div>
      </div>

      {/* Right: Interactive HP Pill & Inspiration Button */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* HP Pill */}
        <button
          onClick={onOpenHpSheet}
          className="relative overflow-hidden h-9 px-2.5 rounded-lg bg-slate-950 border border-slate-700/80 active:scale-95 transition flex items-center gap-1.5 shadow-sm"
        >
          {/* Subtle background HP bar */}
          <div
            className="absolute left-0 bottom-0 top-0 bg-red-500/20 pointer-events-none transition-all duration-300"
            style={{ width: `${hpPercent}%` }}
          />

          <Heart className="w-3.5 h-3.5 text-red-400 fill-red-400/40 relative z-10 shrink-0" />
          <div className="relative z-10 flex items-baseline gap-0.5 font-mono">
            <span className="text-xs font-black text-white">{hp.value}</span>
            <span className="text-[10px] text-slate-400">/{hp.max}</span>
            {hp.temp ? (
              <span className="text-[10px] text-cyan-400 font-bold ml-0.5">+{hp.temp}</span>
            ) : null}
          </div>
        </button>

        {/* 40x40 Inspiration Button */}
        <button
          onClick={onToggleInspiration}
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition border ${
            inspiration
              ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/30 ring-1 ring-amber-400'
              : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300'
          }`}
          title="Toggle Inspiration"
        >
          <Sparkles className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
