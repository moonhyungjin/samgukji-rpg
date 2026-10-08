import { describe, expect, it } from 'vitest';
import { buildUnits, promotionChain, statModsTotal } from '../src';
import type { GameData, UnitTypeData } from '../src';
import { testBalance, testData } from './fixtures';

// 승급 트리: 보병(0차) → 경기병/중기병(1차) → 경기병→궁기병, 중기병→호표기(2차)
const mk = (id: string, name: string, tier: number, promotesTo: string[], statMods?: UnitTypeData['statMods']): UnitTypeData => ({
  ...testData.unitTypes.inf,
  id,
  name,
  tier,
  promotesTo,
  ...(statMods ? { statMods } : {}),
});

const data: GameData = {
  ...testData,
  unitTypes: {
    ...testData.unitTypes,
    base: mk('base', '기본', 1, ['light', 'heavy'], { attack: 1 }),
    light: mk('light', '경기병', 2, ['archer2'], { attack: 1, speed: 1 }),
    heavy: mk('heavy', '중기병', 2, ['tiger'], { attack: 2, defense: 1 }),
    archer2: mk('archer2', '궁기병', 3, [], { speed: 1 }),
    tiger: mk('tiger', '호표기', 3, [], { attack: 1, defense: 1 }),
  },
};

const stats = (unitType?: string, characterId = 'inf') => buildUnits('attacker', [{ characterId, row: 'front', ...(unitType ? { unitType } : {}) }], data, testBalance)[0].stats;

describe('승급 트리와 스탯 보정 누적 (병종 statMods)', () => {
  it('promotionChain: 뿌리부터 이 병종까지 길을 돌려준다', () => {
    expect(promotionChain(data.unitTypes, 'tiger').map((u) => u.id)).toEqual(['base', 'heavy', 'tiger']);
    expect(promotionChain(data.unitTypes, 'archer2').map((u) => u.id)).toEqual(['base', 'light', 'archer2']);
    expect(promotionChain(data.unitTypes, 'base').map((u) => u.id)).toEqual(['base']);
    // 승급 트리에 없는 병종은 자기 자신뿐이다
    expect(promotionChain(data.unitTypes, 'arc').map((u) => u.id)).toEqual(['arc']);
  });

  it('statModsTotal: 뿌리 병종부터 이 병종까지의 스탯 보정을 모두 더한다', () => {
    expect(statModsTotal(data.unitTypes, 'base')).toEqual({ attack: 1, defense: 0, intellect: 0, speed: 0, action: 0 });
    expect(statModsTotal(data.unitTypes, 'light')).toMatchObject({ attack: 2, speed: 1 }); // 기본 + 경기병
    expect(statModsTotal(data.unitTypes, 'tiger')).toMatchObject({ attack: 4, defense: 2, speed: 0 }); // 기본 + 중기병 + 호표기
    expect(statModsTotal(data.unitTypes, 'archer2')).toMatchObject({ attack: 2, speed: 2 }); // 기본 + 경기병 + 궁기병
  });

  it('같은 장수도 갈래에 따라 스탯이 다르다 (초기 스탯 + 앞 병종부터 지금 병종까지 보정의 합)', () => {
    // 보병A 초기 스탯 공5 방5 속5
    expect(stats('base')).toMatchObject({ attack: 6, defense: 5, speed: 5 });
    expect(stats('light')).toMatchObject({ attack: 7, defense: 5, speed: 6 }); // 기본 공+1, 경기병 공+1 속+1
    expect(stats('heavy')).toMatchObject({ attack: 8, defense: 6, speed: 5 }); // 기본 공+1, 중기병 공+2 방+1
    expect(stats('tiger')).toMatchObject({ attack: 9, defense: 7, speed: 5 }); // 기본 + 중기병 + 호표기
    expect(stats('archer2')).toMatchObject({ attack: 7, defense: 5, speed: 7 }); // 기본 + 경기병 + 궁기병
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
    // 기병A 공격 5 + 기본 병종 1 + 경기병 1
    expect(unit.stats.attack).toBe(7);
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
