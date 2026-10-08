import { describe, expect, it } from 'vitest';
import { buildUnits, promotionBonusTotal, promotionChain } from '../src';
import type { GameData, UnitTypeData } from '../src';
import { testBalance, testData } from './fixtures';

// 승급 트리: 보병(0차) → 경기병/중기병(1차) → 경기병→궁기병, 중기병→호표기(2차)
const mk = (id: string, name: string, tier: number, promotesTo: string[], promotionBonus?: UnitTypeData['promotionBonus'], statMods?: UnitTypeData['statMods']): UnitTypeData => ({
  ...testData.unitTypes.inf,
  id,
  name,
  tier,
  promotesTo,
  ...(promotionBonus ? { promotionBonus } : {}),
  ...(statMods ? { statMods } : {}),
});

const data: GameData = {
  ...testData,
  unitTypes: {
    ...testData.unitTypes,
    base: mk('base', '기본', 1, ['light', 'heavy'], undefined, { attack: 1 }),
    light: mk('light', '경기병', 2, ['archer2'], { attack: 1, speed: 1 }),
    heavy: mk('heavy', '중기병', 2, ['tiger'], { attack: 2, defense: 1 }),
    archer2: mk('archer2', '궁기병', 3, [], { speed: 1 }),
    tiger: mk('tiger', '호표기', 3, [], { attack: 1, defense: 1 }),
  },
};

const stats = (unitType?: string, characterId = 'inf') => buildUnits('attacker', [{ characterId, row: 'front', ...(unitType ? { unitType } : {}) }], data, testBalance)[0].stats;

describe('승급 트리와 승급 스탯 보너스 (병종 promotionBonus)', () => {
  it('promotionChain: 뿌리부터 이 병종까지 길을 돌려준다', () => {
    expect(promotionChain(data.unitTypes, 'tiger').map((u) => u.id)).toEqual(['base', 'heavy', 'tiger']);
    expect(promotionChain(data.unitTypes, 'archer2').map((u) => u.id)).toEqual(['base', 'light', 'archer2']);
    expect(promotionChain(data.unitTypes, 'base').map((u) => u.id)).toEqual(['base']);
    // 승급 트리에 없는 병종은 자기 자신뿐이다
    expect(promotionChain(data.unitTypes, 'arc').map((u) => u.id)).toEqual(['arc']);
  });

  it('누적 승급 보너스: 뿌리는 0이고 승급할 때마다 그 병종의 보너스가 더해진다', () => {
    expect(promotionBonusTotal(data.unitTypes, 'base')).toEqual({ attack: 0, defense: 0, intellect: 0, speed: 0, action: 0 });
    expect(promotionBonusTotal(data.unitTypes, 'light')).toMatchObject({ attack: 1, speed: 1 });
    expect(promotionBonusTotal(data.unitTypes, 'tiger')).toMatchObject({ attack: 3, defense: 2, speed: 0 }); // 중기병 + 호표기
    expect(promotionBonusTotal(data.unitTypes, 'archer2')).toMatchObject({ attack: 1, speed: 2 }); // 경기병 + 궁기병
  });

  it('같은 장수도 갈래에 따라 스탯이 다르다 (초기 스탯 + 그 병종의 보정 + 누적 보너스)', () => {
    // 보병A 초기 스탯 공5 방5 속5. 병종 보정은 병종마다 따로이고 부모에게서 이어지지 않는다 (기본만 공+1)
    expect(stats('base')).toMatchObject({ attack: 6, defense: 5, speed: 5 });
    expect(stats('light')).toMatchObject({ attack: 6, defense: 5, speed: 6 }); // 경기병 보너스 공+1 속+1
    expect(stats('heavy')).toMatchObject({ attack: 7, defense: 6, speed: 5 }); // 중기병 보너스 공+2 방+1
    expect(stats('tiger')).toMatchObject({ attack: 8, defense: 7, speed: 5 }); // 중기병 + 호표기
    expect(stats('archer2')).toMatchObject({ attack: 6, defense: 5, speed: 7 }); // 경기병 + 궁기병
  });

  it('승급할수록 스탯이 오른다', () => {
    expect(stats('heavy').attack).toBeGreaterThan(stats('base').attack);
    expect(stats('tiger').attack).toBeGreaterThan(stats('heavy').attack);
  });

  it('승급 트리 밖의 병종은 보너스 없이 지금과 똑같다', () => {
    const arc = buildUnits('attacker', [{ characterId: 'arc', row: 'front' }], data, testBalance)[0];
    expect(arc.stats).toMatchObject({ attack: 5, defense: 5 });
  });

  it('편성에서 병종을 덮어쓰면 그 병종으로 만든다 (다른 계열로 바꾸는 이벤트도 같다)', () => {
    const unit = buildUnits('attacker', [{ characterId: 'cav', row: 'front', unitType: 'light' }], data, testBalance)[0];
    expect(unit.unitType).toBe('light');
    // 기병A 공격 5 + 경기병 보너스 1 (경기병 자신의 병종 보정은 0)
    expect(unit.stats.attack).toBe(6);
  });

  it('스탯은 0 아래로 내려가지 않는다', () => {
    expect(stats('base', 'infWeak').attack).toBe(1); // 공격 0 + 보정 1
  });

  it('덮어쓴 병종이 없거나 그 열에 못 서면 오류다', () => {
    expect(() => buildUnits('attacker', [{ characterId: 'inf', row: 'front', unitType: 'str' }], data, testBalance)).toThrow();
    expect(() => buildUnits('attacker', [{ characterId: 'inf', row: 'front', unitType: 'nope' }], data, testBalance)).toThrow(/Unknown unit type/);
  });

  it('순환이 있어도 멈춘다', () => {
    const loop: GameData = { ...data, unitTypes: { ...data.unitTypes, a: mk('a', 'A', 1, ['b']), b: mk('b', 'B', 2, ['a']) } };
    expect(promotionChain(loop.unitTypes, 'a').length).toBeLessThanOrEqual(2);
  });
});
