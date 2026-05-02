import { resolveAgentContextMenuState } from '../overlayContextMenu.ts';

function createAgentCard(agentId) {
  const element = {
    dataset: { agentId },
    closest: jest.fn((selector) => (selector === '.agent-card' ? element : null)),
  };
  return element;
}

describe('overlay agent context menu', () => {
  test('resolves menu state for an agent card inside the React grid host', () => {
    const card = createAgentCard('agent-1');
    const grid = {
      contains: jest.fn((node) => node === card),
    };

    expect(resolveAgentContextMenuState({
      target: card,
      currentTarget: grid,
      clientX: 42,
      clientY: 64,
    })).toEqual({
      agentId: 'agent-1',
      x: 42,
      y: 64,
    });
  });

  test('ignores targets outside the React grid host', () => {
    const card = createAgentCard('agent-1');
    const grid = {
      contains: jest.fn(() => false),
    };

    expect(resolveAgentContextMenuState({
      target: card,
      currentTarget: grid,
      clientX: 42,
      clientY: 64,
    })).toBeNull();
  });
});
