import { describe, expect, it } from 'vitest';
import { unitArt } from './battleArt';

describe('battle art mapping', () => {
  it('maps stable IDs rather than side or display name', () => {
    expect(unitArt({ characterId: 'liuBei', family: 'infantry' })?.commander.texture).toBe('liuBei');
    expect(unitArt({ characterId: 'ytInfantryB', family: 'infantry' })?.soldier.texture).toBe('yellowSoldier');
  });
  it('does not show sword infantry when a character is edited into another class', () => {
    expect(unitArt({ characterId: 'liuBei', family: 'cavalry' })).toBeNull();
    expect(unitArt({ characterId: 'ytShieldA', family: 'shield' })).toBeNull();
  });
  it('does not impersonate a named character using another portrait', () => {
    expect(unitArt({ characterId: 'weiYan', family: 'infantry' })).toBeNull();
  });
});
