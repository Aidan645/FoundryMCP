export interface FoundryItem {
  id: string;
  name: string;
  type: string;
  img: string;
  hasActivities?: boolean;
  system: {
    quantity?: number;
    description?: {
      value?: string;
    };
    equipped?: boolean;
    actionType?: string;
    level?: number;
    school?: string;
    uses?: {
      value?: number;
      max?: number;
    };
    damage?: {
      parts?: [string, string][];
    };
    [key: string]: any;
  };
}

export interface ActorAttributes {
  hp: {
    value: number;
    max: number;
    temp?: number;
  };
  ac: {
    value: number;
  };
  movement?: {
    walk?: number;
    fly?: number;
    swim?: number;
  };
  init?: {
    total?: number;
    bonus?: number;
  };
  inspiration?: boolean;
}

export interface ActorAbility {
  value: number;
  mod: number;
  save?: number;
}

export interface ActorSkill {
  value: number;
  total?: number;
  label?: string;
  ability?: string;
}

export interface Actor {
  id: string;
  name: string;
  type: string;
  img: string;
  hasPlayerOwner?: boolean;
  system: {
    attributes: ActorAttributes;
    abilities: Record<string, ActorAbility>;
    skills: Record<string, ActorSkill>;
    spells?: Record<string, { value: number; max: number }>;
    details?: {
      level?: number;
      race?: string;
      background?: string;
      alignment?: string;
    };
    [key: string]: any;
  };
  items: FoundryItem[];
}

export interface JournalPage {
  id: string;
  name: string;
  type?: string;
  text?: string;
  content?: string;
}

export interface Journal {
  id: string;
  name: string;
  pages: JournalPage[];
}

export interface RollDiceResult {
  faces: number;
  results: {
    result: number;
    active: boolean;
  }[];
}

export interface RollData {
  formula: string;
  total: number;
  isCritical: boolean;
  isFumble: boolean;
  dice?: RollDiceResult[];
}

export interface ActionLog {
  id: string;
  timestamp: number;
  user: string;
  speaker: string;
  actorId?: string | null;
  flavor?: string;
  content: string;
  isRoll: boolean;
  whisper?: string[];
  rolls: RollData[];
}

export interface HandoutEvent {
  journalId?: string | null;
  pageId?: string | null;
  title: string;
  pageName?: string;
  content: string;
  src?: string | null;
}

export interface ActiveScene {
  id: string;
  name: string;
  width: number;
  height: number;
}
