import React, { useState, useEffect } from 'react';
import { useHubSocket } from './hooks/useHubSocket';
import { SheetView } from './components/SheetView';
import { PartyStashView } from './components/PartyStashView';
import { ActionLogFeed } from './components/ActionLogFeed';
import { SharedNotes } from './components/SharedNotes';
import { ProjectorBar } from './components/ProjectorBar';
import {
  User,
  Shield,
  Package,
  Dices,
  BookOpen,
  Sparkles,
  Wifi,
  WifiOff,
  Heart,
  Plus,
  Minus,
  Radio
} from 'lucide-react';

export function App() {
  const {
    isFoundryConnected,
    isWsConnected,
    actors,
    partyInventory,
    journals,
    activeScene,
    actionLogs,
    activeHandout,
    sendCommand,
    dismissHandout,
  } = useHubSocket();

  const [activeTab, setActiveTab] = useState<'sheet' | 'stash' | 'log' | 'notes'>('sheet');
  const [selectedActorId, setSelectedActorId] = useState<string>(() => {
    return localStorage.getItem('activeActorId') || '';
  });

  // Keep selectedActorId in sync with actors list
  useEffect(() => {
    if (!selectedActorId && actors.length > 0) {
      setSelectedActorId(actors[0].id);
      localStorage.setItem('activeActorId', actors[0].id);
    } else if (selectedActorId && !actors.some(a => a.id === selectedActorId) && actors.length > 0) {
      setSelectedActorId(actors[0].id);
      localStorage.setItem('activeActorId', actors[0].id);
    }
  }, [actors, selectedActorId]);

  const handleSelectActor = (actorId: string) => {
    setSelectedActorId(actorId);
    localStorage.setItem('activeActorId', actorId);
  };

  const activeActor = actors.find(a => a.id === selectedActorId) || null;

  // Quick HP adjustor
  const handleAdjustHp = async (delta: number) => {
    if (!activeActor) return;
    const currentHp = activeActor.system.attributes.hp?.value ?? 0;
    const maxHp = activeActor.system.attributes.hp?.max ?? 10;
    const newHp = Math.max(0, Math.min(maxHp, currentHp + delta));

    try {
      await sendCommand('EXECUTE_SCRIPT', {
        code: `
          const actor = game.actors.get("${activeActor.id}");
          if (actor) {
            await actor.update({ "system.attributes.hp.value": ${newHp} });
            return actor.system.attributes.hp.value;
          }
        `
      });
    } catch (err) {
      console.error('Failed to update HP:', err);
    }
  };

  // Toggle inspiration
  const handleToggleInspiration = async () => {
    if (!activeActor) return;
    const currentInsp = Boolean(activeActor.system.attributes.inspiration);
    try {
      await sendCommand('EXECUTE_SCRIPT', {
        code: `
          const actor = game.actors.get("${activeActor.id}");
          if (actor) {
            await actor.update({ "system.attributes.inspiration": ${!currentInsp} });
            return !${currentInsp};
          }
        `
      });
    } catch (err) {
      console.error('Failed to toggle inspiration:', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navigation Bar */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          {/* Logo & Connection Status */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🎲</span>
              <h1 className="text-base font-black tracking-tight bg-gradient-to-r from-amber-400 to-amber-200 bg-clip-text text-transparent">
                TABLETOP HUB
              </h1>
            </div>

            {/* Connection Indicator Badge */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border tracking-wide uppercase transition-colors ${
                isFoundryConnected
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              }`}
            >
              {isFoundryConnected ? (
                <>
                  <Wifi className="w-3 h-3 text-emerald-400 animate-pulse" />
                  <span>Foundry Live</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3 text-rose-400" />
                  <span>Foundry Offline</span>
                </>
              )}
            </div>
          </div>

          {/* Center/Right Actor Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Actor Selector */}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs">
              <User className="w-3.5 h-3.5 text-amber-400" />
              <select
                value={selectedActorId}
                onChange={(e) => handleSelectActor(e.target.value)}
                className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
              >
                {actors.length === 0 ? (
                  <option value="">No actors found</option>
                ) : (
                  actors.map(a => (
                    <option key={a.id} value={a.id} className="bg-slate-900 text-white">
                      {a.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Quick HP Adjustor */}
            {activeActor && (
              <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs">
                <Heart className="w-3.5 h-3.5 text-red-400" />
                <span className="font-mono font-bold text-slate-200">
                  {activeActor.system.attributes.hp?.value ?? 0}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  /{activeActor.system.attributes.hp?.max ?? 0}
                </span>
                <div className="flex items-center gap-0.5 ml-1">
                  <button
                    onClick={() => handleAdjustHp(-1)}
                    className="w-5 h-5 rounded bg-slate-800 hover:bg-red-500/30 text-slate-300 hover:text-white flex items-center justify-center transition"
                    title="Minus 1 HP"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleAdjustHp(1)}
                    className="w-5 h-5 rounded bg-slate-800 hover:bg-emerald-500/30 text-slate-300 hover:text-white flex items-center justify-center transition"
                    title="Plus 1 HP"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}

            {/* Inspiration Toggle */}
            {activeActor && (
              <button
                onClick={handleToggleInspiration}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border transition ${
                  activeActor.system.attributes.inspiration
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                }`}
                title="Toggle Inspiration"
              >
                <Sparkles className="w-3 h-3" />
                <span>Insp</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Selection */}
        <div className="max-w-7xl mx-auto px-4 flex gap-1 border-t border-slate-800/80 pt-1">
          <button
            onClick={() => setActiveTab('sheet')}
            className={`px-4 py-2 text-xs font-bold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'sheet'
                ? 'border-amber-500 text-amber-400 bg-amber-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Character Sheet</span>
          </button>

          <button
            onClick={() => setActiveTab('stash')}
            className={`px-4 py-2 text-xs font-bold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'stash'
                ? 'border-amber-500 text-amber-400 bg-amber-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Party Stash & Transfer</span>
          </button>

          <button
            onClick={() => setActiveTab('log')}
            className={`px-4 py-2 text-xs font-bold flex items-center gap-2 border-b-2 transition relative ${
              activeTab === 'log'
                ? 'border-amber-500 text-amber-400 bg-amber-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Dices className="w-4 h-4" />
            <span>Action Log & Chat</span>
            {actionLogs.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-400" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('notes')}
            className={`px-4 py-2 text-xs font-bold flex items-center gap-2 border-b-2 transition relative ${
              activeTab === 'notes'
                ? 'border-amber-500 text-amber-400 bg-amber-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Shared Notes</span>
            {activeHandout && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            )}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 py-6 flex-1 w-full space-y-6">
        {activeTab === 'sheet' && (
          <SheetView
            actor={activeActor}
            onSendCommand={sendCommand}
          />
        )}

        {activeTab === 'stash' && (
          <PartyStashView
            myActor={activeActor}
            partyInventory={partyInventory}
            allActors={actors}
            onSendCommand={sendCommand}
          />
        )}

        {activeTab === 'log' && (
          <ActionLogFeed
            logs={actionLogs}
            actors={actors}
            activeActor={activeActor}
            onSendCommand={sendCommand}
          />
        )}

        {activeTab === 'notes' && (
          <SharedNotes
            journals={journals}
            activeHandout={activeHandout}
            onDismissHandout={dismissHandout}
            onSendCommand={sendCommand}
          />
        )}

        {/* Global Handout Modal Listener on Any Tab */}
        {activeTab !== 'notes' && activeHandout && (
          <SharedNotes
            journals={journals}
            activeHandout={activeHandout}
            onDismissHandout={dismissHandout}
            onSendCommand={sendCommand}
          />
        )}

        {/* Projector Mini-Radar Utility Bar */}
        <section className="pt-4">
          <ProjectorBar
            activeScene={activeScene}
            onSendCommand={sendCommand}
          />
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 text-center py-3 text-xs text-slate-500">
        Foundry Tabletop Hub & MCP Bridge • Local WebSocket Middleware & FastMCP Active
      </footer>
    </div>
  );
}

export default App;
