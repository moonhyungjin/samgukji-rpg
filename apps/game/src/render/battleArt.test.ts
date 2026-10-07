import { describe, expect, it } from 'vitest';
import { battleArtKeys, unitArt } from './battleArt';

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
  it('uses mounted art only for Guan Yu while he is cavalry', () => {
    const art = unitArt({ characterId: 'guanYu', family: 'cavalry' });
    expect(art?.commander.texture).toBe('guanYu');
    expect(art?.commander.displayHeight).toBe(116);
    expect(art?.soldier.texture).toBe('shuCavalry');
    expect(unitArt({ characterId: 'guanYu', family: 'infantry' })).toBeNull();
    expect(unitArt({ characterId: 'zhaoYun', family: 'cavalry' })).toBeNull();
  });
  it('loads only the lineup artwork and deduplicates shared textures', () => {
    expect(battleArtKeys([])).toEqual(['field']);
    expect(battleArtKeys([
      { characterId: 'guanYu', family: 'cavalry' },
      { characterId: 'guanYu', family: 'cavalry' },
      { characterId: 'weiYan', family: 'infantry' },
    ])).toEqual(['field', 'guanYu', 'shuCavalry']);
    expect(battleArtKeys([{ characterId: 'liuBei', family: 'infantry' }])).not.toContain('guanYu');
  });
});
