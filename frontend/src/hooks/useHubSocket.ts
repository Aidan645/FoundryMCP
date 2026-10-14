import { useEffect, useRef, useState, useCallback } from 'react';
import { Actor, Journal, ActionLog, HandoutEvent, ActiveScene } from '../types/foundry';

interface HubState {
  isFoundryConnected: boolean;
  isWsConnected: boolean;
  actors: Actor[];
  partyInventory: Actor | null;
  journals: Journal[];
  activeScene: ActiveScene | null;
  actionLogs: ActionLog[];
  activeHandout: HandoutEvent | null;
}

export function useHubSocket() {
  const [state, setState] = useState<HubState>({
    isFoundryConnected: false,
    isWsConnected: false,
    actors: [],
    partyInventory: null,
    journals: [],
    activeScene: null,
    actionLogs: [],
    activeHandout: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const fetchInitialState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (res.ok) {
        const data = await res.json();
        setState(prev => ({
          ...prev,
          isFoundryConnected: data.isFoundryConnected ?? prev.isFoundryConnected,
          actors: data.actors || [],
          partyInventory: data.partyInventory || null,
          journals: data.journals || [],
          activeScene: data.activeScene || null,
          actionLogs: data.actionLogs || [],
        }));
      }
    } catch (err) {
      console.warn('Could not fetch initial REST state:', err);
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/client`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setState(prev => ({ ...prev, isWsConnected: true }));
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    ws.onclose = () => {
      setState(prev => ({ ...prev, isWsConnected: false, isFoundryConnected: false }));
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = (e) => {
      console.warn('Hub WebSocket encountered error:', e);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const msgType = msg.type;

        if (msgType === 'FOUNDRY_STATUS') {
          setState(prev => ({ ...prev, isFoundryConnected: Boolean(msg.connected) }));
        } else if (msgType === 'INITIAL_CLIENT_STATE') {
          const s = msg.state || {};
          setState(prev => ({
            ...prev,
            isFoundryConnected: Boolean(msg.connected),
            actors: s.actors || prev.actors,
            partyInventory: s.partyInventory ?? prev.partyInventory,
            journals: s.journals || prev.journals,
            activeScene: s.activeScene ?? prev.activeScene,
          }));
        } else if (msgType === 'SYNC_UPDATE') {
          const s = msg.data || {};
          setState(prev => ({
            ...prev,
            isFoundryConnected: true,
            actors: s.actors || [],
            partyInventory: s.partyInventory || null,
            journals: s.journals || [],
            activeScene: s.activeScene || null,
          }));
        } else if (msgType === 'ACTION_LOGGED') {
          setState(prev => ({
            ...prev,
            actionLogs: [msg, ...prev.actionLogs.slice(0, 99)]
          }));
        } else if (msgType === 'ACTOR_UPDATED') {
          const updatedActor: Actor = msg.actor;
          if (updatedActor) {
            setState(prev => {
              const updatedActors = prev.actors.map(a => a.id === updatedActor.id ? updatedActor : a);
              if (!prev.actors.some(a => a.id === updatedActor.id) && updatedActor.hasPlayerOwner) {
                updatedActors.push(updatedActor);
              }
              const isParty = (prev.partyInventory?.id === updatedActor.id) || (updatedActor.name.toLowerCase() === 'party inventory');
              return {
                ...prev,
                actors: updatedActors,
                partyInventory: isParty ? updatedActor : prev.partyInventory
              };
            });
          }
        } else if (msgType === 'INVENTORY_CHANGED') {
          const actorObj: Actor = msg.actor;
          if (actorObj) {
            setState(prev => ({
              ...prev,
              actors: prev.actors.map(a => a.id === actorObj.id ? actorObj : a),
              partyInventory: (prev.partyInventory?.id === actorObj.id || actorObj.name.toLowerCase() === 'party inventory')
                ? actorObj
                : prev.partyInventory
            }));
          }
        } else if (msgType === 'NOTE_UPDATED') {
          setState(prev => {
            const updatedJournals = prev.journals.map(j => {
              if (j.id === msg.journalId) {
                const updatedPages = j.pages.map(p => {
                  if (p.id === msg.pageId) {
                    return { ...p, name: msg.name || p.name, content: msg.content, text: msg.content };
                  }
                  return p;
                });
                return { ...j, pages: updatedPages };
              }
              return j;
            });
            return { ...prev, journals: updatedJournals };
          });
        } else if (msgType === 'HANDOUT_SHOWN') {
          setState(prev => ({
            ...prev,
            activeHandout: {
              journalId: msg.journalId,
              pageId: msg.pageId,
              title: msg.title || 'Tabletop Handout',
              pageName: msg.pageName,
              content: msg.content || '',
              src: msg.src || null,
            }
          }));
        }
      } catch (err) {
        console.error('Failed to parse incoming WebSocket message:', err);
      }
    };
  }, []);

  useEffect(() => {
    fetchInitialState();
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [fetchInitialState, connect]);

  const sendCommand = async (action: string, params: Record<string, any> = {}) => {
    const res = await fetch('/api/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, params }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Command failed');
    }
    return res.json();
  };

  const dismissHandout = () => {
    setState(prev => ({ ...prev, activeHandout: null }));
  };

  return {
    ...state,
    sendCommand,
    dismissHandout,
    refetchState: fetchInitialState
  };
}
