export type KeyboardShortcutEvent = Pick<KeyboardEvent, 'ctrlKey' | 'key' | 'metaKey'>;

export function isOpenDashboardShortcut(event: KeyboardShortcutEvent): boolean {
  return (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd';
}
