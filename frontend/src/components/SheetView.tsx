import React, { useState } from 'react';
import { Actor, FoundryItem } from '../types/foundry';
import {
  Shield,
  Heart,
  Zap,
  Swords,
  BookOpen,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Crosshair,
  Footprints,
  PenTool
} from 'lucide-react';
import { StylusCanvasOverlay } from './StylusCanvasOverlay';
import { AbilityRollSheet } from './mobile/AbilityRollSheet';
import { MobileActionRow } from './mobile/MobileActionRow';
import { BottomSheet } from './ui/BottomSheet';

interface SheetViewProps {
  actor: Actor | null;
  onSendCommand: (action: string, params: Record<string, any>) => Promise<any>;
  foundryUrl?: string;
  isMobile?: boolean;
  mobileSubView?: 'stats' | 'combat';
}

export const SheetView: React.FC<SheetViewProps> = ({
  actor,
  onSendCommand,
  foundryUrl = 'http://localhost:30000',
  isMobile = false,
  mobileSubView = 'stats',
}) => {
  const [viewMode, setViewMode] = useState<'quick' | 'native'>('quick');
  const [itemCategory, setItemCategory] = useState<'all' | 'weapon' | 'spell' | 'feat' | 'equipment'>('all');
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [rollFeedback, setRollFeedback] = useState<string | null>(null);

  // Mobile ability selector modal
  const [selectedAbilityKey, setSelectedAbilityKey] = useState<string | null>(null);
  // Mobile item inspector modal
  const [inspectedItem, setInspectedItem] = useState<FoundryItem | null>(null);

  if (!actor) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-slate-400">
        <Shield className="w-16 h-16 text-slate-600 mb-4 animate-pulse" />
        <p className="text-lg font-medium">No Character Selected</p>
        <p className="text-sm text-slate-500 mt-1">
          Select an actor from the top dropdown or create one in Foundry VTT.
        </p>
      </div>
    );
  }

  const { attributes, abilities = {}, skills = {}, details = {} } = actor.system;
  const hp = attributes.hp || { value: 0, max: 0, temp: 0 };
  const ac = attributes.ac?.value ?? 10;
  const speed = attributes.movement?.walk ?? 30;
  const init = attributes.init?.total ?? 0;
  const inspiration = attributes.inspiration;

  const handleUseItem = async (item: FoundryItem) => {
    try {
      setBusyItemId(item.id);
      setRollFeedback(`Rolling ${item.name}...`);
      await onSendCommand('USE_ITEM', {
        actorId: actor.id,
        itemId: item.id,
      });
      setRollFeedback(`Used: ${item.name}`);
      setTimeout(() => setRollFeedback(null), 3000);
    } catch (err: any) {
      setRollFeedback(`Error: ${err.message}`);
      setTimeout(() => setRollFeedback(null), 4000);
    } finally {
      setBusyItemId(null);
    }
  };

  const handleRollStat = async (type: 'ability' | 'save' | 'skill', key: string, label: string) => {
    try {
      setRollFeedback(`Rolling ${label}...`);
      await onSendCommand('ROLL_ABILITY_OR_SKILL', {
        actorId: actor.id,
        type,
        key,
      });
      setRollFeedback(`Rolled: ${label}`);
      setTimeout(() => setRollFeedback(null), 3000);
    } catch (err: any) {
      setRollFeedback(`Error: ${err.message}`);
      setTimeout(() => setRollFeedback(null), 4000);
    }
  };

  const filteredItems = (actor.items || []).filter(item => {
    if (itemCategory === 'all') return true;
    if (itemCategory === 'weapon') return item.type === 'weapon';
    if (itemCategory === 'spell') return item.type === 'spell';
    if (itemCategory === 'feat') return item.type === 'feat';
    if (itemCategory === 'equipment') return item.type === 'equipment' || item.type === 'consumable' || item.type === 'loot';
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Desktop Mode Switcher Header: Hidden on mobile */}
      {!isMobile && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-3 rounded-xl shadow-lg">
          <div className="flex items-center gap-3">
            <img
              src={actor.img || '/icons/svg/mystery-man.svg'}
              alt={actor.name}
              className="w-12 h-12 rounded-lg object-cover border border-amber-500/30 bg-slate-800 shadow"
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2394a3b8"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>';
              }}
            />
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                {actor.name}
                {inspiration && (
                  <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 shadow-sm">
                    <Sparkles className="w-3 h-3 text-amber-400" /> Inspired
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                Level {details.level || 1} {details.race || ''} {actor.type.toUpperCase()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {rollFeedback && (
              <span className="text-xs bg-slate-800 text-amber-400 border border-slate-700 px-3 py-1.5 rounded-md animate-fade-in font-mono">
                {rollFeedback}
              </span>
            )}
            <div className="inline-flex rounded-lg bg-slate-950 p-1 border border-slate-800">
              <button
                onClick={() => setViewMode('quick')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  viewMode === 'quick'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Stylus & Dashboard
              </button>
              <button
                onClick={() => setViewMode('native')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  viewMode === 'native'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Native Foundry Sheet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Roll feedback floating toast on mobile */}
      {isMobile && rollFeedback && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-slate-900 border border-amber-500/50 text-amber-400 text-xs font-mono font-bold px-4 py-2 rounded-full shadow-2xl animate-fade-in">
          {rollFeedback}
        </div>
      )}

      {viewMode === 'native' && !isMobile ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
          <div className="p-3 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>Direct Foundry VTT Sheet Frame ({foundryUrl})</span>
            <a
              href={`${foundryUrl}/game`}
              target="_blank"
              rel="noreferrer"
              className="text-amber-400 hover:underline flex items-center gap-1 font-medium"
            >
              Open in full window <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <iframe
            src={`${foundryUrl}/game`}
            title="Foundry VTT Native Sheet"
            className="w-full h-[700px] border-0"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
          />
        </div>
      ) : (
        /* Stylus & Quick Dashboard View */
        <div className="space-y-4 relative">
          <StylusCanvasOverlay
            actorId={actor.id}
            actorName={actor.name}
            isMobile={isMobile}
          />

          {/* MOBILE VIEW: Compact Combat Header & Filtered SubView */}
          {isMobile ? (
            <>
              {/* Horizontal Scrollable Combat Pill Strip */}
              <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                {/* AC Pill */}
                <div className="shrink-0 bg-slate-900 border border-slate-800 px-3 py-2 rounded-xl flex items-center gap-2 shadow-sm">
                  <Shield className="w-4 h-4 text-amber-400" />
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Armor</span>
                    <span className="text-base font-black text-white">{ac}</span>
                  </div>
                </div>

                {/* Initiative Pill (1-Tap Roll) */}
                <button
                  onClick={() => handleRollStat('ability', 'dex', 'Initiative')}
                  className="shrink-0 bg-slate-900 hover:bg-slate-850 active:scale-95 border border-slate-800 hover:border-emerald-500/40 px-3 py-2 rounded-xl flex items-center gap-2 shadow-sm transition"
                >
                  <Zap className="w-4 h-4 text-emerald-400" />
                  <div className="text-left">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Initiative</span>
                    <span className="text-base font-black text-emerald-400">
                      {init >= 0 ? `+${init}` : init}
                    </span>
                  </div>
                </button>

                {/* Speed Pill */}
                <div className="shrink-0 bg-slate-900 border border-slate-800 px-3 py-2 rounded-xl flex items-center gap-2 shadow-sm">
                  <Footprints className="w-4 h-4 text-blue-400" />
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Speed</span>
                    <span className="text-base font-black text-white">{speed} <span className="text-xs font-normal text-slate-400">ft</span></span>
                  </div>
                </div>

                {/* Level / Class Pill */}
                <div className="shrink-0 bg-slate-900 border border-slate-800 px-3 py-2 rounded-xl flex items-center gap-2 shadow-sm">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Level</span>
                    <span className="text-base font-black text-white">{details.level || 1}</span>
                  </div>
                </div>
              </div>

              {/* Mobile Sub-Views: Stats vs Combat */}
              {mobileSubView === 'stats' ? (
                /* 3x2 Ability Score Grid (1-Tap to open roll sheet) */
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(abilities).map(([key, ab]) => {
                      const mod = ab.mod ?? Math.floor(((ab.value || 10) - 10) / 2);
                      const modStr = mod >= 0 ? `+${mod}` : `${mod}`;
                      return (
                        <button
                          key={key}
                          onClick={() => setSelectedAbilityKey(key)}
                          className="bg-slate-900 hover:bg-slate-800 active:scale-95 border border-slate-800 rounded-xl p-3 flex flex-col items-center justify-between shadow-sm transition select-none"
                        >
                          <span className="text-xs uppercase font-black text-slate-400 tracking-wider">
                            {key}
                          </span>
                          <span className="text-2xl font-black text-amber-400 my-0.5">{modStr}</span>
                          <span className="text-[10px] text-slate-500 font-mono">{ab.value}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Combat SubView: Dense Mobile Action Rows */
                <div className="space-y-3">
                  {/* Category Pills */}
                  <div className="flex gap-1 overflow-x-auto no-scrollbar py-1">
                    {(['all', 'weapon', 'spell', 'feat', 'equipment'] as const).map(cat => (
                      <button
                        key={cat}
                        onClick={() => setItemCategory(cat)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize whitespace-nowrap transition ${
                          itemCategory === cat
                            ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                            : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {filteredItems.length === 0 ? (
                    <div className="py-12 text-center text-slate-500 text-xs">
                      No items in "{itemCategory}".
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredItems.map(item => (
                        <MobileActionRow
                          key={item.id}
                          item={item}
                          onUseItem={handleUseItem}
                          onInspectItem={(it) => setInspectedItem(it)}
                          isBusy={busyItemId === item.id}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            /* DESKTOP / TABLET VIEW: Unchanged full dashboard */
            <>
              {/* Top Combat Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl flex items-center gap-3.5 shadow-md">
                  <div className="p-3 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <Shield className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-400 font-medium">Armor Class</p>
                    <p className="text-2xl font-black text-white">{ac}</p>
                  </div>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl flex items-center gap-3.5 shadow-md">
                  <div className="p-3 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">
                    <Heart className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-baseline">
                      <p className="text-xs uppercase tracking-wider text-slate-400 font-medium">Hit Points</p>
                      <span className="text-xs text-slate-400">
                        {hp.value} / {hp.max}
                        {hp.temp ? ` (+${hp.temp})` : ''}
                      </span>
                    </div>
                    <div className="w-full bg-slate-950 rounded-full h-2 mt-2 overflow-hidden border border-slate-800">
                      <div
                        className="bg-red-500 h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(100, Math.max(0, (hp.value / (hp.max || 1)) * 100))}%`
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div
                  onClick={() => handleRollStat('ability', 'dex', 'Initiative')}
                  className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl flex items-center justify-between cursor-pointer hover:border-amber-500/50 hover:bg-slate-850 transition-all shadow-md group"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:bg-emerald-500/20">
                      <Zap className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider text-slate-400 font-medium">Initiative</p>
                      <p className="text-2xl font-black text-white">
                        {init >= 0 ? `+${init}` : init}
                      </p>
                    </div>
                  </div>
                  <Crosshair className="w-4 h-4 text-slate-600 group-hover:text-amber-400 transition-colors" />
                </div>

                <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl flex items-center gap-3.5 shadow-md">
                  <div className="p-3 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    <Footprints className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-400 font-medium">Speed</p>
                    <p className="text-2xl font-black text-white">{speed} <span className="text-sm font-normal text-slate-400">ft</span></p>
                  </div>
                </div>
              </div>

              {/* Ability Scores Grid */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {Object.entries(abilities).map(([key, ab]) => {
                  const mod = ab.mod ?? Math.floor(((ab.value || 10) - 10) / 2);
                  const modStr = mod >= 0 ? `+${mod}` : `${mod}`;
                  return (
                    <div
                      key={key}
                      className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col items-center justify-between hover:border-slate-700 transition shadow-sm"
                    >
                      <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">
                        {key}
                      </span>
                      <div className="my-1 text-center">
                        <span className="text-2xl font-black text-amber-400">{modStr}</span>
                        <span className="block text-[11px] text-slate-500">{ab.value}</span>
                      </div>
                      <div className="w-full flex gap-1 mt-1">
                        <button
                          onClick={() => handleRollStat('ability', key, `${key.toUpperCase()} Check`)}
                          className="flex-1 text-[10px] bg-slate-950 hover:bg-slate-800 text-slate-300 py-1 rounded border border-slate-800 font-medium transition"
                          title="Ability Check"
                        >
                          Check
                        </button>
                        <button
                          onClick={() => handleRollStat('save', key, `${key.toUpperCase()} Save`)}
                          className="flex-1 text-[10px] bg-slate-950 hover:bg-slate-800 text-slate-300 py-1 rounded border border-slate-800 font-medium transition"
                          title="Saving Throw"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Action Cards & Inventory */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Swords className="w-5 h-5 text-amber-400" />
                    <h3 className="text-base font-bold text-white">Action Cards & Inventory</h3>
                    <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">
                      {filteredItems.length}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                    {(['all', 'weapon', 'spell', 'feat', 'equipment'] as const).map(cat => (
                      <button
                        key={cat}
                        onClick={() => setItemCategory(cat)}
                        className={`px-2.5 py-1 text-xs rounded font-medium capitalize transition-all ${
                          itemCategory === cat
                            ? 'bg-amber-500 text-slate-950 font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredItems.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-sm">
                    No items found in category "{itemCategory}".
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredItems.map(item => {
                      const qty = item.system?.quantity ?? 1;
                      const isBusy = busyItemId === item.id;
                      return (
                        <div
                          key={item.id}
                          className="bg-slate-950/70 border border-slate-800 hover:border-slate-700 rounded-lg p-3 flex flex-col justify-between gap-2 transition group shadow-sm"
                        >
                          <div className="flex items-start gap-3">
                            <img
                              src={item.img || '/icons/svg/item-bag.svg'}
                              alt={item.name}
                              className="w-10 h-10 rounded object-cover bg-slate-900 border border-slate-800 flex-shrink-0"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2364748b"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>';
                              }}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-1">
                                <h4 className="text-sm font-semibold text-slate-100 truncate group-hover:text-amber-400 transition-colors">
                                  {item.name}
                                </h4>
                                {qty > 1 && (
                                  <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono">
                                    ×{qty}
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">
                                {item.type} {item.system?.actionType ? `• ${item.system.actionType}` : ''}
                              </span>
                            </div>
                          </div>

                          {item.system?.description?.value && (
                            <p
                              className="text-xs text-slate-400 line-clamp-2"
                              dangerouslySetInnerHTML={{
                                __html: item.system.description.value.replace(/<[^>]*>?/gm, '')
                              }}
                            />
                          )}

                          <div className="pt-2 border-t border-slate-900 flex items-center justify-end">
                            <button
                              disabled={isBusy}
                              onClick={() => handleUseItem(item)}
                              className="w-full bg-amber-500/10 hover:bg-amber-500 text-amber-400 hover:text-slate-950 border border-amber-500/30 text-xs font-bold py-1.5 px-3 rounded transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                              {isBusy ? (
                                <span className="animate-spin text-xs">⌛</span>
                              ) : (
                                <Sparkles className="w-3.5 h-3.5" />
                              )}
                              <span>Roll / Use</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Ability Roll Bottom Sheet on Mobile */}
      {selectedAbilityKey && abilities[selectedAbilityKey] && (
        <AbilityRollSheet
          isOpen={Boolean(selectedAbilityKey)}
          onClose={() => setSelectedAbilityKey(null)}
          abilityKey={selectedAbilityKey}
          abilityName={selectedAbilityKey.toUpperCase()}
          score={abilities[selectedAbilityKey].value || 10}
          mod={abilities[selectedAbilityKey].mod ?? Math.floor(((abilities[selectedAbilityKey].value || 10) - 10) / 2)}
          saveBonus={abilities[selectedAbilityKey].save ?? abilities[selectedAbilityKey].mod ?? 0}
          skills={Object.entries(skills)
            .filter(([_, sk]: [string, any]) => sk.ability === selectedAbilityKey)
            .map(([k, sk]: [string, any]) => ({
              key: k,
              label: k.charAt(0).toUpperCase() + k.slice(1),
              total: sk.total ?? sk.mod ?? 0,
              proficient: Boolean(sk.proficient),
            }))}
          onRollStat={handleRollStat}
        />
      )}

      {/* Item Inspector Bottom Sheet on Mobile */}
      {inspectedItem && (
        <BottomSheet
          isOpen={Boolean(inspectedItem)}
          onClose={() => setInspectedItem(null)}
          title={inspectedItem.name}
          subtitle={`${inspectedItem.type.toUpperCase()} ${inspectedItem.system?.actionType ? `• ${inspectedItem.system.actionType}` : ''}`}
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800">
              <img
                src={inspectedItem.img || '/icons/svg/item-bag.svg'}
                alt=""
                className="w-12 h-12 rounded-lg object-cover bg-slate-900 border border-slate-700"
              />
              <div className="flex-1">
                <span className="text-xs font-mono text-slate-400 block">
                  Quantity: {inspectedItem.system?.quantity ?? 1}
                </span>
                {inspectedItem.system?.range?.value && (
                  <span className="text-xs text-slate-400 block">
                    Range: {inspectedItem.system.range.value} ft
                  </span>
                )}
              </div>
            </div>

            {inspectedItem.system?.description?.value && (
              <div
                className="prose prose-invert prose-xs text-slate-300 leading-relaxed max-h-60 overflow-y-auto"
                dangerouslySetInnerHTML={{
                  __html: inspectedItem.system.description.value
                }}
              />
            )}

            <button
              onClick={() => {
                handleUseItem(inspectedItem);
                setInspectedItem(null);
              }}
              className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg transition"
            >
              <Sparkles className="w-4 h-4" />
              <span>Roll / Use Item</span>
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
};
