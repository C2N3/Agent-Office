const {
  applyAgentGridLayout,
  showEmptyAgentGridLayout,
} = require('../layoutHost.ts');

function attachClassList(element, initialClassName = '') {
  const classes = new Set(initialClassName.split(/\s+/).filter(Boolean));

  Object.defineProperty(element, 'className', {
    get: () => Array.from(classes).join(' '),
    set: value => {
      classes.clear();
      String(value).split(/\s+/).filter(Boolean).forEach(className => {
        classes.add(className);
      });
    },
  });

  element.classList = {
    add: jest.fn(className => {
      classes.add(className);
    }),
    remove: jest.fn(className => {
      classes.delete(className);
    }),
    contains: className => classes.has(className),
  };

  return element.classList;
}

function createCard(agentId) {
  const card = {
    dataset: { agentId },
    parentNode: null,
    style: {},
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
  attachClassList(card, 'agent-card group-start');
  return card;
}

function createGrid(children = [], partyBackgrounds = []) {
  const grid = {
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
        return grid.children.filter(child => child.classList?.contains('agent-card'));
      }
      if (selector === '.agent-party-bg') {
        return partyBackgrounds;
      }
      return [];
    }),
  };
  attachClassList(grid, 'agent-grid');

  grid.children.forEach(child => {
    child.parentNode = grid;
  });

  return grid;
}

describe('overlay agent grid layout host adapter', () => {
  test('shows the idle shell and clears layout chrome for an empty grid', () => {
    const partyBackground = { remove: jest.fn() };
    const grid = createGrid([], [partyBackground]);
    const idleContainer = { parentNode: null, style: { display: 'none' } };
    grid.classList.add('has-multiple');

    showEmptyAgentGridLayout({ grid, idleContainer });

    expect(grid.classList.contains('has-multiple')).toBe(false);
    expect(partyBackground.remove).toHaveBeenCalledTimes(1);
    expect(grid.appendChild).toHaveBeenCalledWith(idleContainer);
    expect(idleContainer.style.display).toBe('flex');
  });

  test('applies card coordinates and delegates ordering/removal through the card list adapter', () => {
    const stale = createCard('stale');
    const first = createCard('agent-1');
    const second = createCard('agent-2');
    const partyBackground = { remove: jest.fn() };
    const grid = createGrid([stale, first, second], [partyBackground]);
    const idleContainer = { parentNode: grid, style: { display: 'flex' } };
    const beforeRemoveCard = jest.fn();

    applyAgentGridLayout(
      { grid, idleContainer, beforeRemoveCard },
      [
        { card: second, column: 1, row: 1 },
        { card: first, column: 2, row: 1 },
      ],
    );

    expect(idleContainer.style.display).toBe('none');
    expect(grid.classList.contains('has-multiple')).toBe(true);
    expect(partyBackground.remove).toHaveBeenCalledTimes(1);
    expect(second.style).toEqual({ gridColumn: '1', gridRow: '1' });
    expect(first.style).toEqual({ gridColumn: '2', gridRow: '1' });
    expect(second.classList.contains('group-start')).toBe(false);
    expect(first.classList.contains('group-start')).toBe(false);
    expect(grid.children).toEqual([second, first]);
    expect(beforeRemoveCard).toHaveBeenCalledWith(stale);
    expect(stale.remove).toHaveBeenCalledTimes(1);
  });
});
