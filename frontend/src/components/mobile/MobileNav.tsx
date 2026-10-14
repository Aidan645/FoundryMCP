import React from 'react';
import { User, Swords, Package, Dices, BookOpen } from 'lucide-react';

export type MobileTab = 'sheet' | 'actions' | 'stash' | 'log' | 'notes';

interface MobileNavProps {
  activeTab: MobileTab;
  onChangeTab: (tab: MobileTab) => void;
  unreadLogsCount?: number;
  hasActiveHandout?: boolean;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  activeTab,
  onChangeTab,
  unreadLogsCount = 0,
  hasActiveHandout = false,
}) => {
  const tabs: Array<{
    id: MobileTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: React.ReactNode;
  }> = [
    {
      id: 'sheet',
      label: 'Stats',
      icon: User,
    },
    {
      id: 'actions',
      label: 'Combat',
      icon: Swords,
    },
    {
      id: 'stash',
      label: 'Stash',
      icon: Package,
    },
    {
      id: 'log',
      label: 'Dice',
      icon: Dices,
      badge: unreadLogsCount > 0 ? (
        <span className="w-2 h-2 rounded-full bg-amber-400 absolute top-1.5 right-4" />
      ) : null,
    },
    {
      id: 'notes',
      label: 'Notes',
      icon: BookOpen,
      badge: hasActiveHandout ? (
        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping absolute top-1.5 right-4" />
      ) : null,
    },
  ];

  return (
    <nav className="bg-slate-900 border-t border-slate-800 pb-safe shrink-0 select-none z-40">
      <div className="grid grid-cols-5 h-14">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                if (typeof navigator !== 'undefined' && navigator.vibrate) {
                  navigator.vibrate(10);
                }
                onChangeTab(tab.id);
              }}
              className={`relative flex flex-col items-center justify-center gap-1 transition ${
                isActive
                  ? 'text-amber-400 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'scale-110' : ''} transition-transform`} />
              <span className="text-[10px] tracking-tight">{tab.label}</span>
              {tab.badge}
              {isActive && (
                <span className="absolute bottom-0 w-8 h-0.5 bg-amber-400 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
