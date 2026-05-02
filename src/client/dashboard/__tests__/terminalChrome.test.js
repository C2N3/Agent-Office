import { isOutsideTerminalProfileMenu } from '../terminal/chrome.tsx';

function fakeElement(containedTargets = []) {
  const contained = new Set(containedTargets);
  return {
    contains: jest.fn((target) => contained.has(target)),
  };
}

describe('terminal profile menu chrome', () => {
  test('treats menu and launcher button descendants as inside clicks', () => {
    const menuTarget = {};
    const triggerTarget = {};
    const outsideTarget = {};
    const menuElement = fakeElement([menuTarget]);
    const triggerElement = fakeElement([triggerTarget]);

    expect(isOutsideTerminalProfileMenu(menuTarget, menuElement, triggerElement)).toBe(false);
    expect(isOutsideTerminalProfileMenu(triggerTarget, menuElement, triggerElement)).toBe(false);
    expect(isOutsideTerminalProfileMenu(outsideTarget, menuElement, triggerElement)).toBe(true);
  });

  test('treats missing event targets as outside clicks', () => {
    expect(isOutsideTerminalProfileMenu(null, fakeElement(), fakeElement())).toBe(true);
  });
});
