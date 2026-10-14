import React from 'react';
import { BottomSheet } from '../ui/BottomSheet';
import { Dices, Shield, Sparkles } from 'lucide-react';

interface AbilityRollSheetProps {
  isOpen: boolean;
  onClose: () => void;
  abilityKey: string;
  abilityName: string;
  score: number;
  mod: number;
  saveBonus: number;
  skills: Array<{
    key: string;
    label: string;
    total: number;
    proficient?: boolean;
  }>;
  onRollStat: (type: 'ability' | 'save' | 'skill', key: string, label: string) => Promise<void>;
}

export const AbilityRollSheet: React.FC<AbilityRollSheetProps> = ({
  isOpen,
  onClose,
  abilityKey,
  abilityName,
  score,
  mod,
  saveBonus,
  skills,
  onRollStat,
}) => {
  const modStr = mod >= 0 ? `+${mod}` : `${mod}`;
  const saveStr = saveBonus >= 0 ? `+${saveBonus}` : `${saveBonus}`;

  const handleRoll = async (type: 'ability' | 'save' | 'skill', key: string, label: string) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(15);
    }
    await onRollStat(type, key, label);
    onClose();
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={`${abilityName} Checks & Saves`}
      subtitle={`Score: ${score} (${modStr})`}
    >
      <div className="space-y-4">
        {/* Ability Check & Save Action Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleRoll('ability', abilityKey, `${abilityName} Check`)}
            className="h-14 bg-slate-800 hover:bg-slate-750 active:scale-95 border border-slate-700 rounded-xl flex flex-col items-center justify-center transition"
          >
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Ability Check
            </span>
            <span className="text-lg font-black text-amber-400 font-mono">{modStr}</span>
          </button>

          <button
            onClick={() => handleRoll('save', abilityKey, `${abilityName} Save`)}
            className="h-14 bg-slate-800 hover:bg-slate-750 active:scale-95 border border-amber-500/30 rounded-xl flex flex-col items-center justify-center transition"
          >
            <span className="text-[11px] font-bold text-amber-400/90 uppercase tracking-wider flex items-center gap-1">
              <Shield className="w-3 h-3" /> Saving Throw
            </span>
            <span className="text-lg font-black text-white font-mono">{saveStr}</span>
          </button>
        </div>

        {/* Associated Skills List */}
        {skills.length > 0 && (
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Associated Skills
            </h4>
            <div className="space-y-1.5">
              {skills.map(sk => {
                const totalStr = sk.total >= 0 ? `+${sk.total}` : `${sk.total}`;
                return (
                  <button
                    key={sk.key}
                    onClick={() => handleRoll('skill', sk.key, `${sk.label} Check`)}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-950/80 hover:bg-slate-800 border border-slate-800 active:scale-98 transition"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          sk.proficient ? 'bg-amber-400' : 'bg-slate-700'
                        }`}
                      />
                      <span className="text-xs font-semibold text-slate-200">{sk.label}</span>
                    </div>
                    <span className="text-xs font-black text-amber-400 font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                      {totalStr}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  );
};
