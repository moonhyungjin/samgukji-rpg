import { describe, expect, it } from 'vitest';
import { BattleEngine } from '../src';
import type { BalanceConfig, BattleEvent, BattleInput, CharacterState, CommandPolicy, GameData, LineupEntry } from '../src';
import { testBalance, testData } from './fixtures';

// 디버프 (설계 문서 01 6장): 틱 = 고정값 + 걸린 타격 피해 × 비율, 라운드가 끝날 때마다
const balance: BalanceConfig = {
  ...testBalance,
  maxTurns: 3,
  debuffs: {
    burn: { name: '화상', flat: 10, ratio: 0.5, rounds: 2 },
    plague: { name: '역병', flat: 5, ratio: 0.25, rounds: 3 },
  },
};
const data: GameData = {
  ...testData,
  skills: {
    ...testData.skills,
    fire: { ...testData.skills.mind, id: 'fire', name: '화계', debuff: { id: 'burn', chance: 100 } },
    plague: { ...testData.skills.mind, id: 'plague', name: '도술', debuff: { id: 'plague', chance: 100 } },
    never: { ...testData.skills.mind, id: 'never', name: '안 걸림', debuff: { id: 'burn', chance: 0 } },
  },
  unitTypes: {
    ...testData.unitTypes,
    pyro: { ...testData.unitTypes.str, id: 'pyro', basicSkillId: 'fire', extraSkillIds: ['plague', 'never'] },
    maiden: { ...testData.unitTypes.geo, id: 'maiden', cleanseOnHeal: true },
  },
  characters: {
    ...testData.characters,
    pyro: { ...testData.characters.str, id: 'pyro', unitType: 'pyro' },
    maiden: { ...testData.characters.geo, id: 'maiden', unitType: 'maiden' },
  },
};

const front = (characterId: string): LineupEntry => ({ characterId, row: 'front' });
const back = (characterId: string): LineupEntry => ({ characterId, row: 'back' });
const unit = (engine: BattleEngine, uid: string): CharacterState => engine.state.units.find((u) => u.uid === uid)!;
/** 모두 대기하는 AI (라운드는 아무도 행동하지 않으면 교착으로 끝나므로, keepAlive가 있으면 그 군단이 자기 열 아군을 치유해 라운드를 잇는다) */
const waitPolicy =
  (keepAlive?: string): CommandPolicy =>
  ({ actor, state }) => {
    if (actor.uid !== keepAlive) return { kind: 'wait' };
    const ally = state.units.find((u) => u.side === actor.side && !u.isDead && u.uid !== actor.uid)!;
    return { kind: 'skill', skillId: 'mend', targetUid: ally.uid };
  };
const make = (attacker: LineupEntry[], defender: LineupEntry[], overrides: Partial<BattleInput> = {}) =>
  new BattleEngine({ data, balance, attacker, defender, seed: 1, recordEvents: true, policy: waitPolicy(), ...overrides });
const cast = (engine: BattleEngine, actorUid: string, skillId: string, targetUid: string) => engine.perform(unit(engine, actorUid), { kind: 'skill', skillId, targetUid });
const ofType = <T extends BattleEvent['type']>(engine: BattleEngine, type: T) => engine.events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);

describe('디버프: 걸기', () => {
  it('공격이 맞으면 디버프가 걸리고, 틱은 고정값 + 걸린 타격 피해 × 비율이다', () => {
    const engine = make([back('pyro')], [front('inf')]);
    cast(engine, 'attacker:0', 'fire', 'defender:0');
    const hit = ofType(engine, 'damage')[0].amount;
    const target = unit(engine, 'defender:0');
    expect(target.debuffs).toEqual([{ id: 'burn', tick: Math.round(10 + hit * 0.5), roundsLeft: 2, source: 'attacker:0', skillId: 'fire' }]);
    expect(ofType(engine, 'debuffApply')).toEqual([{ type: 'debuffApply', round: 0, unit: 'defender:0', source: 'attacker:0', debuffId: 'burn', name: '화상', tick: Math.round(10 + hit * 0.5), rounds: 2, refresh: false }]);
  });

  it('확률 0이면 걸리지 않고, 결계로 피해가 0이 된 타격도 걸지 않는다', () => {
    const engine = make([back('pyro')], [front('inf')]);
    cast(engine, 'attacker:0', 'never', 'defender:0');
    expect(unit(engine, 'defender:0').debuffs ?? []).toEqual([]);
    unit(engine, 'defender:0').barrier = 1;
    cast(engine, 'attacker:0', 'fire', 'defender:0');
    expect(unit(engine, 'defender:0').debuffs ?? []).toEqual([]);
  });

  it('같은 디버프는 갱신되고(쌓이지 않음) 다른 디버프는 함께 걸린다', () => {
    const engine = make([back('pyro')], [front('inf')]);
    cast(engine, 'attacker:0', 'fire', 'defender:0');
    cast(engine, 'attacker:0', 'fire', 'defender:0');
    cast(engine, 'attacker:0', 'plague', 'defender:0');
    const target = unit(engine, 'defender:0');
    expect(target.debuffs!.map((d) => d.id).sort()).toEqual(['burn', 'plague']);
    expect(ofType(engine, 'debuffApply').map((e) => e.refresh)).toEqual([false, true, false]);
  });
});

describe('디버프: 라운드 끝의 틱', () => {
  it('라운드가 끝날 때 틱이 들어가고, 지속이 다 되면 끝난다 (결계로 막지 못한다)', () => {
    // 아군 풍수사가 라운드마다 치유해서 전투가 이어진다 (maxTurns 3)
    const engine = make([back('pyro'), back('geo'), front('inf')], [front('inf')], { policy: waitPolicy('attacker:1') });
    cast(engine, 'attacker:0', 'fire', 'defender:0');
    const target = unit(engine, 'defender:0');
    const tick = target.debuffs![0].tick;
    target.barrier = 5;
    const before = target.troops;
    engine.run();
    const ticks = ofType(engine, 'debuffTick');
    expect(ticks.map((e) => [e.round, e.amount])).toEqual([
      [1, tick],
      [2, tick],
    ]);
    expect(target.troops).toBe(before - tick * 2);
    expect(target.barrier).toBe(5);
    expect(ofType(engine, 'debuffEnd')).toEqual([{ type: 'debuffEnd', round: 2, unit: 'defender:0', debuffId: 'burn', name: '화상', reason: 'expire' }]);
    expect(target.debuffs).toEqual([]);
  });

  it('틱으로 병력이 0이 되면 전멸이고, 처치와 피해는 디버프를 건 군단의 기록이다', () => {
    const engine = make([back('pyro')], [front('inf')]);
    cast(engine, 'attacker:0', 'fire', 'defender:0');
    const target = unit(engine, 'defender:0');
    target.troops = 1;
    const result = engine.run();
    expect(ofType(engine, 'unitDestroyed')).toEqual([{ type: 'unitDestroyed', round: 1, unit: 'defender:0', by: 'attacker:0' }]);
    expect(result.endCause).toBe('wipe');
    expect(result.winner).toBe('attacker');
    const pyro = result.units.find((u) => u.uid === 'attacker:0')!;
    expect(pyro.kills).toBe(1);
  });
});

describe('디버프: 해제', () => {
  it('해제하는 병종(cleanseOnHeal)의 치유는 디버프를 모두 지운다', () => {
    const engine = make([front('inf'), back('maiden')], [back('pyro')]);
    cast(engine, 'defender:0', 'fire', 'attacker:0');
    cast(engine, 'defender:0', 'plague', 'attacker:0');
    cast(engine, 'attacker:1', 'mend', 'attacker:0');
    expect(unit(engine, 'attacker:0').debuffs).toEqual([]);
    expect(ofType(engine, 'debuffEnd').map((e) => [e.debuffId, e.reason])).toEqual([
      ['burn', 'cleanse'],
      ['plague', 'cleanse'],
    ]);
  });

  it('다른 치유는 디버프를 지우지 않는다', () => {
    const engine = make([front('inf'), back('geo')], [back('pyro')]);
    cast(engine, 'defender:0', 'fire', 'attacker:0');
    cast(engine, 'attacker:1', 'mend', 'attacker:0');
    expect(unit(engine, 'attacker:0').debuffs!.map((d) => d.id)).toEqual(['burn']);
  });
});

describe('디버프가 없는 데이터', () => {
  it('balance.debuffs만 있고 디버프를 거는 스킬이 없으면 결과가 그대로다 (난수를 쓰지 않는다)', () => {
    const input: BattleInput = { data: testData, balance: { ...testBalance }, attacker: [front('inf'), back('str')], defender: [front('inf'), back('arc')], seed: 7, recordEvents: true };
    const plain = new BattleEngine(input).run();
    const withConfig = new BattleEngine({ ...input, balance: { ...testBalance, debuffs: balance.debuffs } }).run();
    expect(withConfig).toEqual(plain);
  });
});
