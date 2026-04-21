const {
  appendAgentGridCard,
  applyAgentGridCardOrder,
  removeAgentGridCard,
} = require('../cardList.ts');
const { registerAgentGridElements } = require('../elements.ts');

function createCard(agentId) {
  const card = {
    className: 'agent-card',
    dataset: { agentId },
    parentNode: null,
    remove: jest.fn(() => {
      const parent = card.parentNode;
      if (parent && parent.children) {
        const index = parent.children.indexOf(card);
        if (index >= 0) {
          parent.children.splice(index, 1);
        }
      }
      card.parentNode = null;
    }),
  };
  return card;
}

function createGrid(children = []) {
  const grid = {
    isConnected: true,
    children: [...children],
    appendChild: jest.fn(child => {
      const existingIndex = grid.children.indexOf(child);
      if (existingIndex >= 0) {
        grid.children.splice(existingIndex, 1);
      }
      grid.children.push(child);
      child.parentNode = grid;
      return child;
    }),
    querySelectorAll: jest.fn(selector => {
      if (selector === '.agent-card') {
        return grid.children.filter(child => child.className === 'agent-card');
      }
      return [];
    }),
  };

  grid.children.forEach(child => {
    child.parentNode = grid;
  });

  return grid;
}

describe('overlay agent grid card list adapter', () => {
  afterEach(() => {
    registerAgentGridElements(null);
  });

  test('appends cards through the React-registered grid host', () => {
    const grid = createGrid();
    const card = createCard('agent-1');

    registerAgentGridElements({
      grid,
      idleContainer: null,
      idleCharacter: null,
      idleBubble: null,
    });

    expect(appendAgentGridCard(card)).toBe(grid);
    expect(grid.children).toEqual([card]);
    expect(grid.appendChild).toHaveBeenCalledWith(card);
  });

  test('applies card order through one adapter and removes stale cards', () => {
    const stale = createCard('stale');
    const first = createCard('agent-1');
    const second = createCard('agent-2');
    const grid = createGrid([stale, first, second]);
    const beforeRemove = jest.fn();

    applyAgentGridCardOrder(grid, [second, first], beforeRemove);

    expect(grid.children).toEqual([second, first]);
    expect(grid.appendChild.mock.calls.map(([card]) => card.dataset.agentId)).toEqual([
      'agent-2',
      'agent-1',
    ]);
    expect(beforeRemove).toHaveBeenCalledWith(stale);
    expect(stale.remove).toHaveBeenCalledTimes(1);
  });

  test('runs card cleanup before detaching a card', () => {
    const card = createCard('agent-1');
    const grid = createGrid([card]);
    const beforeRemove = jest.fn();

    removeAgentGridCard(card, beforeRemove);

    expect(beforeRemove).toHaveBeenCalledWith(card);
    expect(card.remove).toHaveBeenCalledTimes(1);
    expect(grid.children).toEqual([]);
  });
});
