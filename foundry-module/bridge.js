/**
 * Foundry Tabletop Hub & MCP Bridge
 * Bidirectional WebSocket bridge for Foundry VTT (v12 - v14+)
 * D&D 5e v4+ / 2024 Compatible
 */

const MODULE_ID = "foundry-hub-bridge";

// Utility function to safely serialize an actor including derived stats
function serializeActor(actor) {
  if (!actor) return null;
  const obj = actor.toObject ? actor.toObject() : actor;
  const sys = actor.system || {};

  return {
    id: actor.id,
    name: actor.name,
    type: actor.type,
    img: actor.img,
    ownership: actor.ownership,
    hasPlayerOwner: actor.hasPlayerOwner,
    system: {
      ...obj.system,
      attributes: {
        hp: sys.attributes?.hp || { value: 0, max: 0, temp: 0 },
        ac: sys.attributes?.ac || { value: 10 },
        movement: sys.attributes?.movement || {},
        init: sys.attributes?.init || { total: 0, bonus: 0 },
        inspiration: Boolean(sys.attributes?.inspiration)
      },
      abilities: sys.abilities || {},
      skills: sys.skills || {},
      spells: sys.spells || {},
      details: sys.details || {}
    },
    items: (actor.items?.contents || []).map(item => ({
      id: item.id,
      name: item.name,
      type: item.type,
      img: item.img,
      system: item.system || {},
      hasActivities: Boolean(item.system?.activities?.size)
    }))
  };
}

/**
 * Ambiguity-Safe Tiered Document Resolver
 * Enforces strict 3-tier matching:
 * 1. Exact ID match
 * 2. Exact case-insensitive Name match
 * 3. Partial / Substring match with ambiguity guard
 */
function resolveDocument(collection, query, label = "Document") {
  if (!query) throw new Error(`${label} query cannot be empty.`);
  const q = String(query).trim();

  // 1. Exact ID / UUID match
  const byId = collection.get ? collection.get(q) : null;
  if (byId) return byId;

  // 2. Exact case-insensitive Name match
  const lowerQ = q.toLowerCase();
  const list = collection.contents || (Array.isArray(collection) ? collection : []);
  const exactMatches = list.filter(d => d.name && d.name.toLowerCase() === lowerQ);
  if (exactMatches.length === 1) return exactMatches[0];
  if (exactMatches.length > 1) {
    const candidates = exactMatches.map(d => `"${d.name}" (id: ${d.id})`).join(", ");
    throw new Error(`Ambiguous ${label} query "${query}". Multiple exact matches found: ${candidates}. Specify exact ID.`);
  }

  // 3. Partial / Substring match with ambiguity guard
  const partialMatches = list.filter(d => d.name && d.name.toLowerCase().includes(lowerQ));
  if (partialMatches.length === 1) return partialMatches[0];
  if (partialMatches.length > 1) {
    const candidates = partialMatches.map(d => `"${d.name}" (id: ${d.id})`).join(", ");
    throw new Error(`Ambiguous ${label} query "${query}". Multiple matches found: ${candidates}. Specify exact name or ID.`);
  }

  throw new Error(`${label} not found for query: "${query}"`);
}

function resolveActor(query) {
  return resolveDocument(game.actors, query, "Actor");
}

function resolveItem(actor, query) {
  return resolveDocument(actor.items, query, "Item");
}

class FoundryHubBridge {
  constructor() {
    this.socket = null;
    this.reconnectTimer = null;
    this.isConnecting = false;
  }

  init() {
    game.settings.register(MODULE_ID, "relayUrl", {
      name: "Tabletop Hub Relay URL",
      hint: "WebSocket URL of the tabletop hub backend (e.g., ws://localhost:8080/ws/foundry)",
      scope: "client",
      config: true,
      type: String,
      default: "ws://localhost:8080/ws/foundry"
    });

    if (!game.user.isGM) {
      console.log(`[${MODULE_ID}] Skipping bridge initialization on non-GM client (${game.user.name}).`);
      return;
    }

    console.log(`[${MODULE_ID}] Initializing Tabletop Hub GM Bridge for user: ${game.user.name}...`);
    this.connect();
    this.registerHooks();
  }

  getRelayUrl() {
    return game.settings.get(MODULE_ID, "relayUrl") || "ws://localhost:8080/ws/foundry";
  }

  connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const url = this.getRelayUrl();
    console.log(`[${MODULE_ID}] Connecting to Hub Relay at ${url}...`);

    try {
      this.socket = new WebSocket(url);

      this.socket.onopen = () => {
        console.log(`[${MODULE_ID}] Connected to Tabletop Hub Relay!`);
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        this.sendInitialSync();
      };

      this.socket.onmessage = async (event) => {
        try {
          const payload = JSON.parse(event.data);
          await this.handleMessage(payload);
        } catch (err) {
          console.error(`[${MODULE_ID}] Error processing received message:`, err);
        }
      };

      this.socket.onclose = () => {
        console.warn(`[${MODULE_ID}] WebSocket connection closed. Scheduling reconnect...`);
        this.scheduleReconnect();
      };

      this.socket.onerror = (err) => {
        console.error(`[${MODULE_ID}] WebSocket error:`, err);
      };
    } catch (err) {
      console.error(`[${MODULE_ID}] Failed to instantiate WebSocket:`, err);
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  send(data) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    }
  }

  sendInitialSync() {
    const playerActors = (game.actors?.contents || [])
      .filter(a => a.hasPlayerOwner)
      .map(serializeActor);

    const partyActor = game.actors?.getName("Party Inventory") ||
      (game.actors?.contents || []).find(a => a.name.toLowerCase() === "party inventory");

    const journals = (game.journal?.contents || []).map(j => ({
      id: j.id,
      name: j.name,
      pages: (j.pages?.contents || []).map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
        text: p.text?.content || ""
      }))
    }));

    const activeScene = game.scenes?.active ? {
      id: game.scenes.active.id,
      name: game.scenes.active.name,
      width: game.scenes.active.width,
      height: game.scenes.active.height
    } : null;

    this.send({
      type: "INITIAL_SYNC",
      timestamp: Date.now(),
      data: {
        actors: playerActors,
        partyInventory: partyActor ? serializeActor(partyActor) : null,
        journals: journals,
        activeScene: activeScene,
        user: {
          id: game.user.id,
          name: game.user.name,
          isGM: game.user.isGM
        }
      }
    });
  }

  registerHooks() {
    // 1. Chat Message Hook (Roll telemetry, actions, whispers)
    Hooks.on("createChatMessage", (message) => {
      try {
        const rolls = (message.rolls || []).map(r => {
          let isCritical = false;
          let isFumble = false;

          const diceList = r.dice || [];
          for (const d of diceList) {
            const faces = d.faces || 20;
            for (const res of (d.results || [])) {
              if (res.active !== false) {
                if (res.result === faces || (faces === 20 && res.result === 20)) isCritical = true;
                if (res.result === 1) isFumble = true;
              }
            }
          }

          return {
            formula: r.formula,
            total: r.total,
            isCritical,
            isFumble,
            dice: diceList.map(d => ({
              faces: d.faces,
              results: (d.results || []).map(res => ({ result: res.result, active: res.active !== false }))
            }))
          };
        });

        const speakerName = message.speaker?.alias || message.author?.name || "Unknown";
        const actorId = message.speaker?.actor || null;

        this.send({
          type: "ACTION_LOGGED",
          id: message.id,
          timestamp: Date.now(),
          user: message.author?.name || message.user?.name || "GM",
          speaker: speakerName,
          actorId: actorId,
          flavor: message.flavor || "",
          content: message.content || "",
          isRoll: Boolean(message.isRoll),
          whisper: message.whisper || [],
          rolls: rolls
        });
      } catch (err) {
        console.error(`[${MODULE_ID}] Error in createChatMessage hook:`, err);
      }
    });

    // 2. Actor Updated Hook
    Hooks.on("updateActor", (actor, changes) => {
      try {
        this.send({
          type: "ACTOR_UPDATED",
          timestamp: Date.now(),
          actor: serializeActor(actor),
          changes: changes
        });
      } catch (err) {
        console.error(`[${MODULE_ID}] Error in updateActor hook:`, err);
      }
    });

    // 3. Item Lifecycle Hooks (Inventory Changed)
    const handleItemChange = (item, action) => {
      try {
        if (item.parent && item.parent.documentName === "Actor") {
          const actor = item.parent;
          this.send({
            type: "INVENTORY_CHANGED",
            timestamp: Date.now(),
            action: action,
            actorId: actor.id,
            actor: serializeActor(actor),
            item: item.toObject ? item.toObject() : item
          });
        }
      } catch (err) {
        console.error(`[${MODULE_ID}] Error in item change hook:`, err);
      }
    };

    Hooks.on("createItem", (item) => handleItemChange(item, "create"));
    Hooks.on("updateItem", (item) => handleItemChange(item, "update"));
    Hooks.on("deleteItem", (item) => handleItemChange(item, "delete"));

    // 4. Journal Entry Page Updated
    Hooks.on("updateJournalEntryPage", (page) => {
      try {
        const journal = page.parent;
        this.send({
          type: "NOTE_UPDATED",
          timestamp: Date.now(),
          journalId: journal ? journal.id : null,
          journalName: journal ? journal.name : "",
          pageId: page.id,
          name: page.name,
          content: page.text?.content || ""
        });
      } catch (err) {
        console.error(`[${MODULE_ID}] Error in updateJournalEntryPage hook:`, err);
      }
    });

    // 5. Handout Shown Hook
    Hooks.on("showJournalEntry", (doc, options) => {
      try {
        const firstPage = doc.pages?.contents?.[0];
        this.send({
          type: "HANDOUT_SHOWN",
          timestamp: Date.now(),
          journalId: doc.id,
          pageId: firstPage?.id || null,
          title: doc.name,
          pageName: firstPage?.name || doc.name,
          content: firstPage?.text?.content || doc.name,
          src: firstPage?.src || null
        });
      } catch (err) {
        console.error(`[${MODULE_ID}] Error in showJournalEntry hook:`, err);
      }
    });

    // 6. Safe Permanent Tabletop Observer Hook for Player Characters
    Hooks.on("createActor", async (actor) => {
      try {
        // Strict guard: only player-owned characters (never DM-controlled NPCs or secret monsters)
        if (actor.type === "character" && actor.hasPlayerOwner && actor.name !== "Party Inventory") {
          const tabletopUser = game.users?.find(u => u.name === "Tabletop");
          if (tabletopUser && actor.ownership?.[tabletopUser.id] !== CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) {
            const ownership = { ...(actor.ownership || {}), [tabletopUser.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER };
            await actor.update({ ownership });
            console.log(`[${MODULE_ID}] Auto-assigned Observer permissions on player character "${actor.name}" to Tabletop user.`);
          }
        }
      } catch (err) {
        console.error(`[${MODULE_ID}] Error in createActor Tabletop permission hook:`, err);
      }
    });
  }

  async handleMessage(message) {
    if (!message || !message.requestId || !message.action) {
      return;
    }

    const { requestId, action, params = {} } = message;
    let result = null;
    let error = null;

    try {
      switch (action) {
        case "GET_WORLD_SUMMARY": {
          const users = (game.users?.contents || []).map(u => ({
            id: u.id,
            name: u.name,
            role: u.role,
            isGM: u.isGM,
            active: u.active
          }));

          const actors = (game.actors?.contents || []).map(a => ({
            id: a.id,
            name: a.name,
            type: a.type,
            img: a.img,
            hasPlayerOwner: a.hasPlayerOwner
          }));

          const journals = (game.journal?.contents || []).map(j => ({
            id: j.id,
            name: j.name,
            pageCount: j.pages?.size || 0
          }));

          const scenes = (game.scenes?.contents || []).map(s => ({
            id: s.id,
            name: s.name,
            active: s.active
          }));

          const packs = (game.packs?.contents || []).map(p => ({
            id: p.metadata.id,
            label: p.metadata.label,
            type: p.metadata.type,
            package: p.metadata.packageName
          }));

          result = { users, actors, journals, scenes, packs };
          break;
        }

        case "GET_ACTOR_DETAILS": {
          const identifier = params.actorId || params.actorIdOrName || params.name;
          const actor = resolveActor(identifier);
          result = serializeActor(actor);
          break;
        }

        case "SEARCH_COMPENDIUM": {
          const query = (params.query || "").toLowerCase();
          const docType = params.documentType || "Item";
          const limit = Number(params.limit) || 15;
          const matches = [];

          for (const pack of (game.packs?.contents || [])) {
            if (pack.metadata.type !== docType) continue;
            await pack.getIndex();
            for (const entry of pack.index) {
              if (entry.name && entry.name.toLowerCase().includes(query)) {
                matches.push({
                  id: entry._id || entry.id,
                  uuid: entry.uuid || `${pack.metadata.id}.${entry._id}`,
                  name: entry.name,
                  type: entry.type,
                  img: entry.img,
                  pack: pack.metadata.id,
                  packLabel: pack.metadata.label
                });
                if (matches.length >= limit) break;
              }
            }
            if (matches.length >= limit) break;
          }
          result = { matches };
          break;
        }

        case "GRANT_COMPENDIUM_ITEM": {
          const { targetActor: targetIdOrName, itemUuid, quantity = 1 } = params;
          const target = resolveActor(targetIdOrName);

          const itemDoc = await fromUuid(itemUuid);
          if (!itemDoc) throw new Error(`Compendium item not found at UUID: ${itemUuid}`);

          const itemData = itemDoc.toObject();
          if (itemData.system && ("quantity" in itemData.system)) {
            itemData.system.quantity = Number(quantity) || 1;
          }

          const created = await target.createEmbeddedDocuments("Item", [itemData]);
          result = {
            success: true,
            actorId: target.id,
            actorName: target.name,
            createdItems: created.map(i => ({ id: i.id, name: i.name }))
          };
          break;
        }

        case "TRANSFER_ITEM": {
          const { sourceActorId, targetActorId, itemId, quantity = 1 } = params;
          const source = resolveActor(sourceActorId);
          const target = resolveActor(targetActorId);

          const sourceItem = resolveItem(source, itemId);
          const sourceQty = Number(sourceItem.system?.quantity ?? 1);
          const moveQty = Math.max(1, Math.min(Number(quantity) || 1, sourceQty));

          // Safe Stacking Guard:
          // Only stack if mundane stackable consumable/loot without custom active effects
          const isMundaneStackable = ["consumable", "loot"].includes(sourceItem.type);
          const sourceHasEffects = Boolean(sourceItem.effects && sourceItem.effects.size > 0);

          const existingItem = target.items.contents.find(i =>
            i.name.toLowerCase() === sourceItem.name.toLowerCase() &&
            i.type === sourceItem.type &&
            isMundaneStackable &&
            !sourceHasEffects &&
            (!i.effects || i.effects.size === 0)
          );

          if (existingItem) {
            const existingQty = Number(existingItem.system?.quantity ?? 1);
            await existingItem.update({ "system.quantity": existingQty + moveQty });
          } else {
            const itemData = sourceItem.toObject();
            delete itemData._id;
            if (itemData.system && ("quantity" in itemData.system)) {
              itemData.system.quantity = moveQty;
            }
            await target.createEmbeddedDocuments("Item", [itemData]);
          }

          // Decrement or delete from source
          if (sourceQty <= moveQty) {
            await sourceItem.delete();
          } else {
            await sourceItem.update({ "system.quantity": sourceQty - moveQty });
          }

          result = {
            success: true,
            sourceActor: source.name,
            targetActor: target.name,
            itemName: sourceItem.name,
            transferredQuantity: moveQty
          };
          break;
        }

        case "USE_ITEM": {
          const { actorId, itemId, activityId } = params;
          const actor = resolveActor(actorId);
          const item = resolveItem(actor, itemId);

          // D&D 5e (2024 / v4+) Dialog-free Roll Execution:
          // Bypasses prompt modal dialogs so headless executions do not hang
          let usageResult = null;
          if (item.system?.activities?.size) {
            const activity = activityId
              ? item.system.activities.get(activityId)
              : item.system.activities.contents[0];
            if (!activity) throw new Error(`Activity '${activityId}' not found on item '${item.name}'`);
            usageResult = await activity.use({ event: { shiftKey: true } }, { configure: false });
          } else if (typeof item.use === "function") {
            usageResult = await item.use({ legacy: false, event: { shiftKey: true } }, { configure: false });
          } else {
            throw new Error(`Item "${item.name}" cannot be used (no activities or use method).`);
          }

          result = {
            success: true,
            actorId: actor.id,
            itemId: item.id,
            itemName: item.name,
            result: usageResult ? "Executed" : "Triggered"
          };
          break;
        }

        case "ROLL_ABILITY_OR_SKILL": {
          const { actorId, type, key } = params;
          const actor = resolveActor(actorId);

          const rollOptions = { fastForward: true, event: { shiftKey: true }, configure: false };
          let rollResult = null;
          if (type === "skill") {
            if (typeof actor.rollSkill === "function") {
              rollResult = await actor.rollSkill(key, rollOptions);
            } else if (actor.system?.skills?.[key]) {
              rollResult = await actor.rollSkillV2?.(key, rollOptions);
            }
          } else if (type === "save") {
            if (typeof actor.rollAbilitySave === "function") {
              rollResult = await actor.rollAbilitySave(key, rollOptions);
            } else if (typeof actor.rollSavingThrow === "function") {
              rollResult = await actor.rollSavingThrow(key, rollOptions);
            }
          } else {
            // ability test
            if (typeof actor.rollAbilityTest === "function") {
              rollResult = await actor.rollAbilityTest(key, rollOptions);
            }
          }

          result = {
            success: true,
            actorId: actor.id,
            type,
            key,
            total: rollResult?.total || null
          };
          break;
        }

        case "UPSERT_JOURNAL_PAGE": {
          const { journalName = "Party Shared Notes", pageName = "General Notes", markdownContent = "", showToPlayers = false } = params;

          let journal = game.journal.getName(journalName);
          if (!journal) {
            journal = await JournalEntry.create({
              name: journalName,
              ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER }
            });
          }

          let page = journal.pages.getName(pageName);
          if (page) {
            await page.update({ "text.content": markdownContent });
          } else {
            const pageData = {
              name: pageName,
              type: "text",
              text: {
                content: markdownContent,
                format: CONST.JOURNAL_ENTRY_PAGE_FORMATS?.MARKDOWN || 2
              }
            };
            const created = await journal.createEmbeddedDocuments("JournalEntryPage", [pageData]);
            page = created[0];
          }

          if (showToPlayers && page) {
            if (typeof journal.show === "function") {
              await journal.show("text", true);
            }
          }

          result = {
            success: true,
            journalId: journal.id,
            journalName: journal.name,
            pageId: page?.id,
            pageName: page?.name
          };
          break;
        }

        case "SEND_CHAT": {
          const { content, speaker, whisper } = params;
          const chatData = {
            content: content || "",
            speaker: speaker ? { alias: speaker } : ChatMessage.getSpeaker(),
            whisper: Array.isArray(whisper) ? whisper : (whisper ? [whisper] : [])
          };
          const created = await ChatMessage.create(chatData);
          result = { success: true, messageId: created.id };
          break;
        }

        case "PING_CANVAS": {
          const { x = 0, y = 0 } = params;
          if (canvas && typeof canvas.ping === "function") {
            await canvas.ping({ x: Number(x), y: Number(y) });
            result = { success: true, x: Number(x), y: Number(y) };
          } else {
            throw new Error("Canvas is not initialized or canvas.ping is unavailable");
          }
          break;
        }

        case "EXECUTE_SCRIPT": {
          const { code } = params;
          if (!code) throw new Error("No script code provided");
          const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
          const fn = new AsyncFunction("game", "canvas", "ui", "CONST", code);
          const execRes = await fn(game, canvas, ui, CONST);
          result = { success: true, output: execRes };
          break;
        }

        default:
          throw new Error(`Unsupported RPC action: ${action}`);
      }
    } catch (err) {
      console.error(`[${MODULE_ID}] Error executing RPC action ${action}:`, err);
      error = err.message || String(err);
    }

    this.send({
      type: "RPC_RESPONSE",
      requestId: requestId,
      result: result,
      error: error
    });
  }
}

// Single-Leader Lock & Zero-Canvas Mode for Headless Bot
Hooks.once("ready", async () => {
  // If dedicated "MCP Bot" user is active in session, defer bridge connection to MCP Bot
  const botUser = game.users?.find(u => u.name === "MCP Bot" && u.active);
  if (botUser && game.user.id !== botUser.id) {
    console.log(`[${MODULE_ID}] Deferring bridge WebSocket connection to active MCP Bot session (${botUser.name}).`);
    return;
  }

  // Only run bridge on GM or Assistant GM
  if (!game.user.isGM) {
    console.log(`[${MODULE_ID}] Skipping bridge on non-GM client (${game.user.name}).`);
    return;
  }

  // If this is the headless MCP Bot, enable noCanvas mode to reduce GPU/RAM usage by ~85%
  if (game.user.name === "MCP Bot" && !game.settings.get("core", "noCanvas")) {
    console.log(`[${MODULE_ID}] Headless MCP Bot detected. Enabling core.noCanvas mode...`);
    await game.settings.set("core", "noCanvas", true);
    window.location.reload();
    return;
  }

  const bridge = new FoundryHubBridge();
  bridge.init();
  window.foundryHubBridge = bridge;
});
