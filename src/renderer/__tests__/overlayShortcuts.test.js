import { isOpenDashboardShortcut } from '../overlayShortcuts.ts';

describe('overlay dashboard shortcuts', () => {
  test('matches Ctrl/Cmd+D without relying on the rendered button id', () => {
    expect(isOpenDashboardShortcut({ ctrlKey: true, metaKey: false, key: 'd' })).toBe(true);
    expect(isOpenDashboardShortcut({ ctrlKey: false, metaKey: true, key: 'D' })).toBe(true);
    expect(isOpenDashboardShortcut({ ctrlKey: false, metaKey: false, key: 'd' })).toBe(false);
    expect(isOpenDashboardShortcut({ ctrlKey: true, metaKey: false, key: 'x' })).toBe(false);
  });
});
