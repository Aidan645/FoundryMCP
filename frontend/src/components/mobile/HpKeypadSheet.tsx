import React, { useState } from 'react';
import { BottomSheet } from '../ui/BottomSheet';
import { Heart, ShieldAlert, Sparkles, Plus, Minus } from 'lucide-react';

interface HpKeypadSheetProps {
  isOpen: boolean;
  onClose: () => void;
  currentHp: number;
  maxHp: number;
  tempHp: number;
  onApplyHpChange: (newHp: number, newTempHp: number) => Promise<void>;
}

export const HpKeypadSheet: React.FC<HpKeypadSheetProps> = ({
  isOpen,
  onClose,
  currentHp,
  maxHp,
  tempHp,
  onApplyHpChange,
}) => {
  const [amountStr, setAmountStr] = useState<string>('');
  const [isBusy, setIsBusy] = useState<boolean>(false);

  const amount = parseInt(amountStr, 10) || 0;

  const handleQuickAdd = (delta: number) => {
    setAmountStr(prev => {
      const cur = parseInt(prev, 10) || 0;
      return String(Math.max(1, cur + delta));
    });
  };

  const handleTakeDamage = async () => {
    if (amount <= 0) return;
    setIsBusy(true);
    try {
      let remainingDmg = amount;
      let newTemp = tempHp;
      let newHp = currentHp;

      if (newTemp > 0) {
        if (remainingDmg >= newTemp) {
          remainingDmg -= newTemp;
          newTemp = 0;
        } else {
          newTemp -= remainingDmg;
          remainingDmg = 0;
        }
      }

      newHp = Math.max(0, newHp - remainingDmg);
      await onApplyHpChange(newHp, newTemp);
      setAmountStr('');
      onClose();
    } finally {
      setIsBusy(false);
    }
  };

  const handleHeal = async () => {
    if (amount <= 0) return;
    setIsBusy(true);
    try {
      const newHp = Math.min(maxHp, currentHp + amount);
      await onApplyHpChange(newHp, tempHp);
      setAmountStr('');
      onClose();
    } finally {
      setIsBusy(false);
    }
  };

  const handleSetTempHp = async () => {
    if (amount < 0) return;
    setIsBusy(true);
    try {
      await onApplyHpChange(currentHp, amount);
      setAmountStr('');
      onClose();
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Hit Points Manager"
      subtitle={`Current: ${currentHp} / ${maxHp} HP ${tempHp > 0 ? `(+${tempHp} Temp)` : ''}`}
    >
      <div className="space-y-4">
        {/* HP Progress Bar */}
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-red-500 fill-red-500/20" />
            <div>
              <span className="text-xl font-black text-white">{currentHp}</span>
              <span className="text-xs text-slate-400 font-mono"> / {maxHp}</span>
            </div>
          </div>
          {tempHp > 0 && (
            <span className="text-xs bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 px-2 py-0.5 rounded-full font-bold">
              +{tempHp} Temp
            </span>
          )}
        </div>

        {/* Numeric Display & Quick Chips */}
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
            Amount
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="0"
              className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-2xl font-black text-center text-white focus:outline-none focus:border-amber-500"
            />
            {amountStr && (
              <button
                onClick={() => setAmountStr('')}
                className="px-3 py-3 rounded-xl bg-slate-800 text-xs font-bold text-slate-400 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex gap-1.5 mt-2">
            {[1, 5, 10, 20].map(val => (
              <button
                key={val}
                onClick={() => handleQuickAdd(val)}
                className="flex-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition"
              >
                +{val}
              </button>
            ))}
          </div>
        </div>

        {/* Action Triggers */}
        <div className="grid grid-cols-2 gap-2 pt-2">
          <button
            disabled={isBusy || amount <= 0}
            onClick={handleTakeDamage}
            className="h-12 bg-rose-600 hover:bg-rose-500 active:scale-95 disabled:opacity-40 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-rose-950/50 transition"
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Damage (-{amount || 0})</span>
          </button>

          <button
            disabled={isBusy || amount <= 0}
            onClick={handleHeal}
            className="h-12 bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-40 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 transition"
          >
            <Heart className="w-4 h-4" />
            <span>Heal (+{amount || 0})</span>
          </button>
        </div>

        <button
          disabled={isBusy || amount < 0}
          onClick={handleSetTempHp}
          className="w-full h-11 bg-slate-800 hover:bg-slate-700 active:scale-95 disabled:opacity-40 text-cyan-400 border border-cyan-500/30 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition"
        >
          <Sparkles className="w-4 h-4" />
          <span>Set Temp HP to {amount || 0}</span>
        </button>
      </div>
    </BottomSheet>
  );
};
