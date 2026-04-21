const {
  findAgentCardElement,
  findMiniAvatarElement,
  getAgentGridElements,
  registerAgentGridElements,
} = require('../elements.ts');

function createGridElement(children = []) {
  return {
    isConnected: true,
    querySelector: jest.fn(() => null),
    querySelectorAll: jest.fn((selector) => {
      if (selector === '.agent-card') {
        return children.filter(child => child.className === 'agent-card');
      }
      if (selector === '.mini-avatar') {
        return children.filter(child => child.className === 'mini-avatar');
      }
      return [];
    }),
  };
}

describe('overlay agent grid elements registry', () => {
  afterEach(() => {
    registerAgentGridElements(null);
    delete global.document;
  });

  test('returns the React-registered grid and idle shell elements', () => {
    const elements = {
      grid: createGridElement(),
      idleContainer: { id: 'container' },
      idleCharacter: { id: 'character' },
      idleBubble: { id: 'speech-bubble' },
    };

    registerAgentGridElements(elements);

    expect(getAgentGridElements()).toBe(elements);
  });

  test('finds cards and mini avatars inside the registered grid host only', () => {
    const card = { className: 'agent-card', dataset: { agentId: 'agent-1' } };
    const mini = { className: 'mini-avatar', dataset: { agentId: 'agent-2' } };
    const grid = createGridElement([card, mini]);

    registerAgentGridElements({
      grid,
      idleContainer: null,
      idleCharacter: null,
      idleBubble: null,
    });

    expect(findAgentCardElement('agent-1')).toBe(card);
    expect(findAgentCardElement('agent-2')).toBeNull();
    expect(findMiniAvatarElement('agent-2')).toBe(mini);
    expect(findMiniAvatarElement('agent-1')).toBeNull();
  });

  test('drops a disconnected registration before checking the legacy DOM fallback', () => {
    const staleElements = {
      grid: { ...createGridElement(), isConnected: false },
      idleContainer: null,
      idleCharacter: null,
      idleBubble: null,
    };

    global.document = {
      getElementById: jest.fn(() => null),
    };

    registerAgentGridElements(staleElements);

    expect(getAgentGridElements()).toBeNull();
    expect(global.document.getElementById).toHaveBeenCalledWith('agent-grid');
  });
});
