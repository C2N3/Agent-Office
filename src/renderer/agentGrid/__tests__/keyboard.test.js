import { installAgentGridKeyboardNavigation } from '../keyboard.ts';

function createAgentCard(agentId) {
  return {
    dataset: { agentId },
    focus: jest.fn(function focus() {
      this.ownerDocument.activeElement = this;
    }),
    matches: jest.fn((selector) => selector === '.agent-card'),
  };
}

function createGrid(cards) {
  const listeners = {};
  const doc = {
    activeElement: null,
    addEventListener: jest.fn((eventName, listener) => {
      listeners[eventName] = listener;
    }),
    removeEventListener: jest.fn(),
  };
  cards.forEach((card) => {
    card.ownerDocument = doc;
  });
  return {
    ownerDocument: doc,
    contains: jest.fn((node) => cards.includes(node)),
    querySelectorAll: jest.fn((selector) => (selector === '.agent-card' ? cards : [])),
    listeners,
  };
}

function keyEvent(key, overrides = {}) {
  return {
    altKey: false,
    ctrlKey: false,
    key,
    metaKey: false,
    preventDefault: jest.fn(),
    shiftKey: false,
    ...overrides,
  };
}

describe('overlay agent grid keyboard navigation', () => {
  beforeEach(() => {
    global.window = {
      electronAPI: {
        focusTerminal: jest.fn(),
      },
    };
  });

  afterEach(() => {
    delete global.window;
  });

  test('focuses the first card on Tab when no agent card is active', () => {
    const first = createAgentCard('agent-1');
    const second = createAgentCard('agent-2');
    const grid = createGrid([first, second]);

    installAgentGridKeyboardNavigation(grid);
    const event = keyEvent('Tab');
    grid.listeners.keydown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(first.focus).toHaveBeenCalled();
    expect(second.focus).not.toHaveBeenCalled();
  });

  test('moves card focus with arrow keys inside the registered grid', () => {
    const first = createAgentCard('agent-1');
    const second = createAgentCard('agent-2');
    const grid = createGrid([first, second]);
    grid.ownerDocument.activeElement = first;

    installAgentGridKeyboardNavigation(grid);
    const event = keyEvent('ArrowRight');
    grid.listeners.keydown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(second.focus).toHaveBeenCalled();
  });

  test('focuses the terminal for the active card on Enter', () => {
    const first = createAgentCard('agent-1');
    const grid = createGrid([first]);
    grid.ownerDocument.activeElement = first;

    installAgentGridKeyboardNavigation(grid);
    grid.listeners.keydown(keyEvent('Enter'));

    expect(global.window.electronAPI.focusTerminal).toHaveBeenCalledWith('agent-1');
  });

  test('removes the document keydown listener on teardown', () => {
    const first = createAgentCard('agent-1');
    const grid = createGrid([first]);

    const teardown = installAgentGridKeyboardNavigation(grid);
    teardown();

    expect(grid.ownerDocument.removeEventListener).toHaveBeenCalledWith('keydown', grid.listeners.keydown);
  });
});
