import { describe, expect, it } from 'vitest';
import { BattleEngine } from '../src';
import type { BattleEvent, BattleInput, GameData, LineupEntry } from '../src';
import { testBalance, testData } from './fixtures';

// 자동 개인 버프 (병종의 autoBuffSkillId, 군주): 1라운드 시작에 AP 없이 자기 자신에게 한 번 건다 (설계 문서 01)
const data: GameData = {
  ...testData,
  skills: {
    ...testData.skills,
    resolve: { id: 'resolve', name: '위풍', kind: 'buff', scalesWith: 'intellect', power: 0, apCost: 1, counterable: false, area: 'all', buff: { type: 'stats', pool: ['attack', 'defense'], minCount: 2, maxCount: 2, amount: 1 } },
  },
  unitTypes: {
    ...testData.unitTypes,
    lord: { ...testData.unitTypes.inf, id: 'lord', name: '군주', family: 'lord', autoBuffSkillId: 'resolve' },
  },
  characters: {
    ...testData.characters,
    lord: { ...testData.characters.inf, id: 'lord', unitType: 'lord' },
  },
};

const front = (characterId: string): LineupEntry => ({ characterId, row: 'front' });
const input = (attacker: LineupEntry[], defender: LineupEntry[]): BattleInput => ({ data, balance: testBalance, attacker, defender, seed: 3, recordEvents: true });

describe('자동 개인 버프', () => {
  it('1라운드 시작 직후 자기 자신에게만 걸리고 AP를 쓰지 않는다 (범위는 무시)', () => {
    const engine = new BattleEngine(input([front('lord'), front('inf')], [front('inf')]));
    const lord = engine.state.units.find((u) => u.uid === 'attacker:0')!;
    const ap = lord.ap;
    const before = { ...lord.stats };
    engine.nextActor();
    const types = engine.events.map((e) => e.type);
    expect(types.slice(0, 2)).toEqual(['roundStart', 'buff']);
    const buffs = engine.events.filter((e): e is Extract<BattleEvent, { type: 'buff' }> => e.type === 'buff');
    expect(buffs).toHaveLength(1);
    expect(buffs[0]).toMatchObject({ round: 1, source: 'attacker:0', target: 'attacker:0' });
    expect(lord.stats.attack).toBe(before.attack + 1);
    expect(lord.stats.defense).toBe(before.defense + 1);
    expect(lord.ap).toBe(ap);
  });

  it('전투에서 한 번만 걸린다', () => {
    const engine = new BattleEngine(input([front('lord')], [front('inf')]));
    engine.run();
    expect(engine.events.filter((e) => e.type === 'buff')).toHaveLength(1);
  });

  it('자동 버프가 없는 병종만 있으면 결과가 그대로다', () => {
    const plain = new BattleEngine({ ...input([front('inf')], [front('inf')]), data: testData }).run();
    const withLordData = new BattleEngine(input([front('inf')], [front('inf')])).run();
    expect(withLordData).toEqual(plain);
  });
});
