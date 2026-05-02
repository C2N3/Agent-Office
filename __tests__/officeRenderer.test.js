describe('officeRenderer', () => {
  test('loads renderer effects at module evaluation time', () => {
    const { officeRenderer } = require('../src/client/office/officeRenderer.ts');

    expect(typeof officeRenderer.spawnEffect).toBe('function');
    expect(typeof officeRenderer.updateEffects).toBe('function');
    expect(typeof officeRenderer.renderEffects).toBe('function');
  });

  test('exposes characters as an array for dashboard hit testing', () => {
    const { officeCharacters } = require('../src/client/office/character/index.ts');
    const character = { id: 'agent-1' };

    officeCharacters.characters.set(character.id, character);

    expect(officeCharacters.getCharacterArray()).toEqual([character]);

    officeCharacters.characters.clear();
  });
});
