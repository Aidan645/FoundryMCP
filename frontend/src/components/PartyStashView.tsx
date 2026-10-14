import React, { useState } from 'react';
import { Actor, FoundryItem } from '../types/foundry';
import {
  Package,
  ArrowRightLeft,
  Search,
  Send,
  Layers,
  ShieldAlert,
  ArrowRight,
  ArrowLeft,
  CheckCircle2
} from 'lucide-react';

interface PartyStashViewProps {
  myActor: Actor | null;
  partyInventory: Actor | null;
  allActors: Actor[];
  onSendCommand: (action: string, params: Record<string, any>) => Promise<any>;
}

export const PartyStashView: React.FC<PartyStashViewProps> = ({
  myActor,
  partyInventory,
  allActors,
  onSendCommand,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTargetActorId, setSelectedTargetActorId] = useState<string>('');
  const [transferringItemId, setTransferringItemId] = useState<string | null>(null);
  const [transferQuantity, setTransferQuantity] = useState<number>(1);
  const [selectedItem, setSelectedItem] = useState<{
    item: FoundryItem;
    sourceActorId: string;
    sourceActorName: string;
  } | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  const filterItems = (items: FoundryItem[] = []) => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      item => item.name.toLowerCase().includes(q) || item.type.toLowerCase().includes(q)
    );
  };

  const myItems = filterItems(myActor?.items);
  const partyItems = filterItems(partyInventory?.items);

  // Other player actors for recipient dropdown
  const otherActors = allActors.filter(
    a => a.id !== myActor?.id && a.id !== partyInventory?.id
  );

  const handleQuickTransfer = async (
    item: FoundryItem,
    sourceActorId: string,
    targetActorId: string,
    qty: number
  ) => {
    try {
      setTransferringItemId(item.id);
      setStatusMessage({ text: `Transferring ${qty}× ${item.name}...` });

      await onSendCommand('TRANSFER_ITEM', {
        sourceActorId,
        targetActorId,
        itemId: item.id,
        quantity: qty,
      });

      setStatusMessage({ text: `Transferred ${qty}× ${item.name} successfully!` });
      setTimeout(() => setStatusMessage(null), 3000);
      setSelectedItem(null);
    } catch (err: any) {
      setStatusMessage({ text: `Failed to transfer: ${err.message}`, isError: true });
      setTimeout(() => setStatusMessage(null), 4000);
    } finally {
      setTransferringItemId(null);
    }
  };

  const handleScaffoldPartyActor = async () => {
    try {
      setStatusMessage({ text: 'Scaffolding Party Inventory in Foundry...' });
      await onSendCommand('EXECUTE_SCRIPT', {
        code: `
          let party = game.actors.getName("Party Inventory");
          if (!party) {
            party = await Actor.create({
              name: "Party Inventory",
              type: "npc",
              img: "icons/containers/bags/pack-leather-brown.webp",
              ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER }
            });
          }
          return party.toObject();
        `
      });
      setStatusMessage({ text: 'Party Inventory actor created!' });
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      setStatusMessage({ text: `Scaffold error: ${err.message}`, isError: true });
    }
  };

  return (
    <div className="space-y-6">
      {/* Search and Transfer Header */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Party Stash & Backpack Transfer
            </h2>
            <p className="text-xs text-slate-400">
              Move items atomically between party members and the shared chest
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search items or types..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-3 rounded-lg text-xs font-semibold flex items-center gap-2 ${
            statusMessage.isError
              ? 'bg-red-500/10 border border-red-500/30 text-red-400'
              : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
          }`}
        >
          {statusMessage.isError ? (
            <ShieldAlert className="w-4 h-4" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Split Pane View */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Pane: My Backpack */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col h-[580px]">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <h3 className="font-bold text-white text-sm">
                My Backpack ({myActor?.name || 'No Actor Selected'})
              </h3>
            </div>
            <span className="text-xs bg-slate-950 px-2 py-0.5 rounded text-slate-400 border border-slate-800 font-mono">
              {myItems.length} items
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {myItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs">
                <Layers className="w-8 h-8 mb-2 opacity-50" />
                <span>No items in backpack</span>
              </div>
            ) : (
              myItems.map(item => {
                const qty = item.system?.quantity ?? 1;
                const isSelected = selectedItem?.item.id === item.id;
                const isBusy = transferringItemId === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (myActor) {
                        setSelectedItem({
                          item,
                          sourceActorId: myActor.id,
                          sourceActorName: myActor.name
                        });
                        setTransferQuantity(1);
                      }
                    }}
                    className={`p-2.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-500 text-white'
                        : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={item.img || '/icons/svg/item-bag.svg'}
                        alt={item.name}
                        className="w-8 h-8 rounded object-cover bg-slate-900 border border-slate-800 flex-shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2364748b"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>';
                        }}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate">{item.name}</p>
                        <p className="text-[10px] text-slate-400 capitalize">{item.type}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs font-mono bg-slate-800 px-1.5 py-0.5 rounded text-amber-400 font-bold">
                        ×{qty}
                      </span>
                      {partyInventory && myActor && (
                        <button
                          disabled={isBusy}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickTransfer(item, myActor.id, partyInventory.id, 1);
                          }}
                          className="text-[10px] bg-slate-800 hover:bg-amber-500 hover:text-slate-950 px-2 py-1 rounded font-semibold border border-slate-700 transition"
                          title="Transfer 1 to Party Stash"
                        >
                          To Stash →
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Party Inventory */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col h-[580px]">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
              <h3 className="font-bold text-white text-sm">
                Party Inventory {partyInventory ? '' : '(Not Configured)'}
              </h3>
            </div>
            {partyInventory ? (
              <span className="text-xs bg-slate-950 px-2 py-0.5 rounded text-slate-400 border border-slate-800 font-mono">
                {partyItems.length} items
              </span>
            ) : (
              <button
                onClick={handleScaffoldPartyActor}
                className="text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-2 py-1 rounded transition"
              >
                + Create Stash Actor
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {!partyInventory ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs p-6 text-center">
                <Package className="w-10 h-10 mb-3 text-slate-600" />
                <p className="font-semibold text-slate-300">Party Inventory is not setup</p>
                <p className="mt-1 text-slate-500">
                  Click "+ Create Stash Actor" above or use the AI Agent setup tool.
                </p>
              </div>
            ) : partyItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs">
                <Package className="w-8 h-8 mb-2 opacity-50" />
                <span>The party chest is empty</span>
              </div>
            ) : (
              partyItems.map(item => {
                const qty = item.system?.quantity ?? 1;
                const isSelected = selectedItem?.item.id === item.id;
                const isBusy = transferringItemId === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      setSelectedItem({
                        item,
                        sourceActorId: partyInventory.id,
                        sourceActorName: partyInventory.name
                      });
                      setTransferQuantity(1);
                    }}
                    className={`p-2.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-500 text-white'
                        : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={item.img || '/icons/svg/item-bag.svg'}
                        alt={item.name}
                        className="w-8 h-8 rounded object-cover bg-slate-900 border border-slate-800 flex-shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2364748b"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>';
                        }}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate">{item.name}</p>
                        <p className="text-[10px] text-slate-400 capitalize">{item.type}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs font-mono bg-slate-800 px-1.5 py-0.5 rounded text-amber-400 font-bold">
                        ×{qty}
                      </span>
                      {myActor && (
                        <button
                          disabled={isBusy}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickTransfer(item, partyInventory.id, myActor.id, 1);
                          }}
                          className="text-[10px] bg-slate-800 hover:bg-amber-500 hover:text-slate-950 px-2 py-1 rounded font-semibold border border-slate-700 transition"
                          title="Take 1 into Backpack"
                        >
                          ← Take 1
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Selected Item Transfer Control Modal / Dock */}
      {selectedItem && (
        <div className="bg-slate-900 border-2 border-amber-500/40 rounded-xl p-4 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-in">
          <div className="flex items-center gap-3">
            <img
              src={selectedItem.item.img || '/icons/svg/item-bag.svg'}
              alt={selectedItem.item.name}
              className="w-12 h-12 rounded object-cover bg-slate-950 border border-amber-500/40"
            />
            <div>
              <p className="text-xs text-amber-400 font-semibold uppercase tracking-wider">
                Selected for Transfer:
              </p>
              <h4 className="text-base font-bold text-white">
                {selectedItem.item.name}
              </h4>
              <p className="text-xs text-slate-400">
                From: <span className="font-semibold text-slate-200">{selectedItem.sourceActorName}</span> (Available: {selectedItem.item.system?.quantity ?? 1})
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Quantity Selector */}
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
              <span className="text-xs text-slate-400">Qty:</span>
              <button
                onClick={() => setTransferQuantity(Math.max(1, transferQuantity - 1))}
                className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white flex items-center justify-center"
              >
                -
              </button>
              <span className="text-xs font-mono font-bold text-amber-400 px-1">
                {transferQuantity}
              </span>
              <button
                onClick={() =>
                  setTransferQuantity(
                    Math.min(selectedItem.item.system?.quantity ?? 1, transferQuantity + 1)
                  )
                }
                className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white flex items-center justify-center"
              >
                +
              </button>
              <button
                onClick={() => setTransferQuantity(selectedItem.item.system?.quantity ?? 1)}
                className="text-[10px] text-slate-400 hover:text-white underline ml-1"
              >
                Max
              </button>
            </div>

            {/* Recipient Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">To:</span>
              <select
                value={selectedTargetActorId}
                onChange={(e) => setSelectedTargetActorId(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-amber-500"
              >
                <option value="">Choose Target...</option>
                {partyInventory && selectedItem.sourceActorId !== partyInventory.id && (
                  <option value={partyInventory.id}>Party Inventory (Shared Chest)</option>
                )}
                {myActor && selectedItem.sourceActorId !== myActor.id && (
                  <option value={myActor.id}>{myActor.name} (My Backpack)</option>
                )}
                {otherActors.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} (Player)
                  </option>
                ))}
              </select>
            </div>

            {/* Confirm Transfer Button */}
            <button
              disabled={!selectedTargetActorId || Boolean(transferringItemId)}
              onClick={() => {
                if (selectedTargetActorId) {
                  handleQuickTransfer(
                    selectedItem.item,
                    selectedItem.sourceActorId,
                    selectedTargetActorId,
                    transferQuantity
                  );
                }
              }}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2 rounded-lg transition flex items-center gap-1.5 disabled:opacity-40"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>Transfer Now</span>
            </button>

            <button
              onClick={() => setSelectedItem(null)}
              className="text-xs text-slate-400 hover:text-white px-2 py-1"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
