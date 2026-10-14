import React from 'react';
import { FoundryItem } from '../../types/foundry';
import { Sparkles, ChevronRight } from 'lucide-react';

interface MobileActionRowProps {
  item: FoundryItem;
  onUseItem: (item: FoundryItem) => void;
  onInspectItem: (item: FoundryItem) => void;
  isBusy?: boolean;
}

export const MobileActionRow: React.FC<MobileActionRowProps> = ({
  item,
  onUseItem,
  onInspectItem,
  isBusy = false,
}) => {
  const qty = item.system?.quantity ?? 1;
  const actionType = item.system?.actionType || '';
  const range = item.system?.range?.value ? `${item.system.range.value}ft` : '';

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-slate-900 border border-slate-800 rounded-xl select-none hover:border-slate-700 transition">
      {/* Left: Tapping item details opens inspector */}
      <button
        onClick={() => onInspectItem(item)}
        className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
      >
        <img
          src={item.img || '/icons/svg/item-bag.svg'}
          alt=""
          className="w-10 h-10 rounded-lg object-cover bg-slate-950 border border-slate-800 shrink-0"
          onError={(e) => {
            (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2364748b"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>';
          }}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-100 truncate">{item.name}</span>
            {qty > 1 && (
              <span className="text-[10px] bg-slate-800 text-slate-400 px-1 rounded font-mono shrink-0">
                ×{qty}
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
            <span className="uppercase font-semibold text-slate-500">{item.type}</span>
            {actionType && <span>• {actionType}</span>}
            {range && <span>• {range}</span>}
          </div>
        </div>
      </button>

      {/* Right: Fast-Forward 1-Tap Roll Button */}
      <button
        disabled={isBusy}
        onClick={() => {
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(15);
          }
          onUseItem(item);
        }}
        className="shrink-0 h-10 px-3 bg-amber-500/10 hover:bg-amber-500 active:scale-95 text-amber-400 hover:text-slate-950 border border-amber-500/30 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition disabled:opacity-40"
      >
        {isBusy ? (
          <span className="animate-spin text-xs">⌛</span>
        ) : (
          <Sparkles className="w-3.5 h-3.5" />
        )}
        <span>Roll</span>
      </button>
    </div>
  );
};
