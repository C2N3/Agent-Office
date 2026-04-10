import type { JsonObject } from './base.js';

export type DashboardOfficeConfig = {
  FRAME_W?: number;
  FRAME_H?: number;
};

export type OfficeCharacterMetadata = {
  project?: string | null;
  tool?: string | null;
} & JsonObject;

export type OfficeBubble = {
  text: string;
  icon?: string | null;
  expiresAt: number;
  isReport?: boolean;
  taskId?: string;
};

export type OfficeCharacter = {
  id: string;
  x: number;
  y: number;
  role?: string | null;
  agentState?: string | null;
  metadata?: OfficeCharacterMetadata | null;
  avatarFile?: string;
  skinIndex?: number;
  bubble?: OfficeBubble | null;
};

export type OfficeCharacters = {
  characters: Map<string, OfficeCharacter>;
  getCharacterArray: () => OfficeCharacter[];
};

export type OfficeRenderer = {
  screenToWorld?: (clientX: number, clientY: number) => { x: number; y: number };
};

export type TerminalAddonLike = {
  fit?: () => void;
};

export type WebLinksAddonLike = {
  activate?: () => void;
  dispose?: () => void;
};

export type TerminalLoadableAddon = TerminalAddonLike | WebLinksAddonLike;

export type TerminalLike = {
  cols: number;
  rows: number;
  write: (data: string) => void;
  writeln: (data: string) => void;
  loadAddon: (addon: TerminalLoadableAddon) => void;
  open: (element: Element) => void;
  focus: () => void;
  dispose: () => void;
  onData: (callback: (data: string) => void) => void;
  hasSelection: () => boolean;
  getSelection: () => string;
  attachCustomKeyEventHandler: (callback: (event: KeyboardEvent) => boolean) => void;
};

export type TerminalCtor = new (options?: {
  fontFamily?: string;
  fontSize?: number;
  lineHeight?: number;
  theme?: Record<string, string>;
  cursorBlink?: boolean;
  scrollback?: number;
}) => TerminalLike;
