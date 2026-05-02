export const enUS = {
  common: {
    cancel: 'Cancel',
    close: 'Close',
    create: 'Create',
    delete: 'Delete',
  },
  dashboard: {
    connection: {
      disconnected: 'Disconnected',
      gatewayOnline: 'Gateway Online',
      restoreWebsocket: 'Network disconnected. Attempting to restore websocket connection...',
    },
    floor: {
      add: 'Add Floor',
      agentCount: '{count} agents',
      confirmDelete: 'Delete "{name}"? Agents on this floor will be unassigned.',
      current: 'current',
      exampleName: 'e.g. Engineering',
      manager: 'Floor Manager',
      manage: 'Manage Floors',
      new: 'New Floor',
    },
    language: {
      label: 'Language',
    },
    sidebar: {
      access: 'Access',
      cloudflare: 'Cloudflare',
      main: 'Main',
      overview: 'Overview',
      remote: 'Remote',
      terminal: 'Terminal',
    },
  },
  terminal: {
    closeTab: 'Close',
    defaultBadge: 'Default',
    defaultProfile: 'Default Profile',
    emptyHint: 'Click an agent to open a terminal.',
    emptyTitle: 'No terminal open',
    new: 'New Terminal',
    newWithProfile: 'New Terminal ({profile})',
    noProfiles: 'No shell profiles were detected on this machine.',
    openDefault: 'Open default terminal',
    openWith: 'Open With',
    oneOffHint: 'Open a one-off terminal with this shell',
    profileHelp: 'Choose a shell for this tab, or change the default profile.',
    setDefaultHint: 'Use when pressing the New Terminal button',
  },
} as const;

type WidenStrings<T> = {
  readonly [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends Record<string, unknown>
      ? WidenStrings<T[K]>
      : T[K];
};

export type TranslationResource = WidenStrings<typeof enUS>;
