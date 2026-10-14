import React, { useState } from 'react';
import { ActionLog, Actor } from '../types/foundry';
import {
  Dices,
  Send,
  MessageSquare,
  Sparkles,
  AlertTriangle,
  Lock,
  Filter,
  Flame,
  Skull
} from 'lucide-react';

interface ActionLogFeedProps {
  logs: ActionLog[];
  actors: Actor[];
  activeActor: Actor | null;
  onSendCommand: (action: string, params: Record<string, any>) => Promise<any>;
}

export const ActionLogFeed: React.FC<ActionLogFeedProps> = ({
  logs,
  actors,
  activeActor,
  onSendCommand,
}) => {
  const [filterMode, setFilterMode] = useState<'all' | 'rolls' | 'whispers'>('all');
  const [chatInput, setChatInput] = useState('');
  const [whisperTarget, setWhisperTarget] = useState<string>('public');
  const [isSending, setIsSending] = useState(false);

  const filteredLogs = logs.filter(log => {
    if (filterMode === 'rolls') return log.isRoll || log.rolls?.length > 0;
    if (filterMode === 'whispers') return log.whisper && log.whisper.length > 0;
    return true;
  });

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isSending) return;

    try {
      setIsSending(true);
      const speakerName = activeActor ? activeActor.name : 'Tabletop Player';
      const whisperList: string[] = [];

      if (whisperTarget === 'gm') {
        whisperList.push('GM');
      } else if (whisperTarget !== 'public') {
        whisperList.push(whisperTarget);
      }

      await onSendCommand('SEND_CHAT', {
        content: chatInput.trim(),
        speaker: speakerName,
        whisper: whisperList,
      });

      setChatInput('');
    } catch (err: any) {
      console.error('Failed to send chat message:', err);
    } finally {
      setIsSending(false);
    }
  };

  const formatTimestamp = (ts: number) => {
    if (!ts) return '';
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col h-[700px]">
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <Dices className="w-5 h-5 text-amber-400" />
          <h3 className="font-bold text-white text-base">Live Action & Roll Telemetry</h3>
          <span className="text-xs bg-slate-950 px-2 py-0.5 rounded text-slate-400 border border-slate-800 font-mono">
            {filteredLogs.length} events
          </span>
        </div>

        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <Filter className="w-3.5 h-3.5 text-slate-500 ml-1.5 mr-0.5" />
          {(['all', 'rolls', 'whispers'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setFilterMode(mode)}
              className={`px-2.5 py-1 text-xs rounded font-medium capitalize transition-all ${
                filterMode === mode
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Scrolling Feed */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1.5">
        {filteredLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs text-center p-6">
            <MessageSquare className="w-8 h-8 mb-2 opacity-50" />
            <p className="font-semibold text-slate-300">No actions recorded yet</p>
            <p className="text-slate-500 mt-1">
              Rolls, combat attacks, skill checks, and chat will stream in real-time.
            </p>
          </div>
        ) : (
          filteredLogs.map(log => {
            const hasWhisper = log.whisper && log.whisper.length > 0;
            const primaryRoll = log.rolls?.[0];
            const isCrit = log.rolls?.some(r => r.isCritical);
            const isFumble = log.rolls?.some(r => r.isFumble);

            return (
              <div
                key={log.id}
                className={`p-3.5 rounded-xl border transition-all shadow-md ${
                  isCrit
                    ? 'bg-emerald-950/20 border-emerald-500/60 shadow-emerald-950/30'
                    : isFumble
                    ? 'bg-red-950/25 border-red-500/60 shadow-red-950/30'
                    : hasWhisper
                    ? 'bg-indigo-950/20 border-indigo-500/30'
                    : 'bg-slate-950/70 border-slate-800'
                }`}
              >
                {/* Meta Bar */}
                <div className="flex items-center justify-between gap-2 mb-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      {log.speaker || log.user}
                    </span>
                    {log.flavor && (
                      <span className="text-slate-400 text-[11px] truncate max-w-[200px]">
                        • {log.flavor}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {hasWhisper && (
                      <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-1.5 py-0.5 rounded flex items-center gap-1 font-mono">
                        <Lock className="w-2.5 h-2.5" /> Whisper
                      </span>
                    )}
                    <span className="text-[10px] text-slate-500 font-mono">
                      {formatTimestamp(log.timestamp)}
                    </span>
                  </div>
                </div>

                {/* Badges for Nat 20 / Nat 1 */}
                {isCrit && (
                  <div className="inline-flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-500 text-emerald-400 px-2 py-0.5 rounded text-xs font-black tracking-wide uppercase mb-2 shadow-sm animate-pulse">
                    <Flame className="w-3.5 h-3.5" />
                    <span>Natural 20 • Critical Success!</span>
                  </div>
                )}

                {isFumble && (
                  <div className="inline-flex items-center gap-1.5 bg-red-500/20 border border-red-500 text-red-400 px-2 py-0.5 rounded text-xs font-black tracking-wide uppercase mb-2 shadow-sm">
                    <Skull className="w-3.5 h-3.5" />
                    <span>Natural 1 • Critical Fumble!</span>
                  </div>
                )}

                {/* Primary Roll Display */}
                {primaryRoll && (
                  <div className="my-2 p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-slate-400 font-mono block">
                        Formula: {primaryRoll.formula}
                      </span>
                      {primaryRoll.dice && primaryRoll.dice.length > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                          {primaryRoll.dice.map((d, dIdx) => (
                            <span key={dIdx} className="text-[10px] text-slate-500 font-mono">
                              d{d.faces}: [
                              {d.results.map((r, rIdx) => (
                                <span
                                  key={rIdx}
                                  className={
                                    r.result === d.faces
                                      ? 'text-emerald-400 font-bold'
                                      : r.result === 1
                                      ? 'text-red-400 font-bold'
                                      : 'text-slate-300'
                                  }
                                >
                                  {r.result}
                                  {rIdx < d.results.length - 1 ? ', ' : ''}
                                </span>
                              ))}
                              ]
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="text-right">
                      <span className="text-xs uppercase text-slate-500 block font-bold">Total</span>
                      <span
                        className={`text-2xl font-black font-mono ${
                          isCrit
                            ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                            : isFumble
                            ? 'text-red-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {primaryRoll.total}
                      </span>
                    </div>
                  </div>
                )}

                {/* Chat message content */}
                {log.content && (
                  <div
                    className="text-xs text-slate-300 leading-relaxed break-words"
                    dangerouslySetInnerHTML={{
                      __html: log.content.replace(/<[^>]*>?/gm, '')
                    }}
                  />
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Chat Bar */}
      <form onSubmit={handleSendMessage} className="pt-3 border-t border-slate-800 mt-2">
        <div className="flex items-center gap-2">
          {/* Target Selector */}
          <select
            value={whisperTarget}
            onChange={(e) => setWhisperTarget(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-xs text-slate-300 rounded-lg px-2 py-2 focus:outline-none focus:border-amber-500"
          >
            <option value="public">To: Everyone</option>
            <option value="gm">To: GM (Whisper)</option>
            {actors.map(a => (
              <option key={a.id} value={a.name}>
                To: {a.name}
              </option>
            ))}
          </select>

          {/* Text Input */}
          <input
            type="text"
            placeholder={
              whisperTarget === 'public'
                ? `Say something as ${activeActor?.name || 'Player'}...`
                : `Whisper message to ${whisperTarget}...`
            }
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
          />

          {/* Send Button */}
          <button
            type="submit"
            disabled={!chatInput.trim() || isSending}
            className="bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs transition flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Send</span>
          </button>
        </div>
      </form>
    </div>
  );
};
