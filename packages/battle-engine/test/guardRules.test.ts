import { describe, expect, it } from 'vitest';
import { BattleEngine, createDefaultPolicy } from '../src';
import type { BattleInput, CharacterState, GameData, LineupEntry } from '../src';
import { testBalance, testData } from './fixtures';

// 방패병을 바탕으로 가드 규칙이 다른 병종 셋: 전체 가드(wide), 도술 방어(wise), 공격해도 가드 유지(iron)
const shield = testData.unitTypes.shield;
const data: GameData = {
  ...testData,
  unitTypes: {
    ...testData.unitTypes,
    wide: { ...shield, id: 'wide', guard: { ...shield.guard!, scope: 'all' } },
    wise: { ...shield, id: 'wise', guard: { ...shield.guard!, interceptsMagic: true } },
    iron: { ...shield, id: 'iron', guard: { ...shield.guard!, keepOnAttack: true } },
  },
  characters: {
    ...testData.characters,
    wide: { ...testData.characters.shield, id: 'wide', unitType: 'wide' },
    wise: { ...testData.characters.shield, id: 'wise', unitType: 'wise' },
    iron: { ...testData.characters.shield, id: 'iron', unitType: 'iron' },
  },
};

const input = (attacker: LineupEntry[], defender: LineupEntry[]): BattleInput => ({ data, balance: testBalance, attacker, defender, seed: 1, recordEvents: true });
const front = (characterId: string): LineupEntry => ({ characterId, row: 'front' });
const back = (characterId: string): LineupEntry => ({ characterId, row: 'back' });
const unit = (engine: BattleEngine, uid: string): CharacterState => engine.state.units.find((u) => u.uid === uid)!;
const intercepts = (engine: BattleEngine) => engine.events.filter((e) => e.type === 'intercept');

describe('가드 범위 (scope)', () => {
  // 방어측: 전열 보병(defender:0), 후열 가드 병종(defender:1). 공격측 보병이 전열 보병을 친다.
  const run = (guardChar: string) => {
    const engine = new BattleEngine(input([front('inf')], [front('inf'), back(guardChar)]));
    unit(engine, 'defender:1').guardRate = 100;
    engine.perform(unit(engine, 'attacker:0'), { kind: 'skill', skillId: 'hit', targetUid: 'defender:0' });
    return engine;
  };

  it('같은 열 아군만 지키는 가드는 다른 열 아군을 대신 맞지 않는다', () => {
    expect(intercepts(run('shield'))).toHaveLength(0);
  });

  it('전체 가드는 다른 열 아군도 대신 맞는다 (후열 가드가 전열을 지킨다)', () => {
    const engine = run('wide');
    expect(intercepts(engine)).toEqual([expect.objectContaining({ guardian: 'defender:1', target: 'defender:0' })]);
    expect(unit(engine, 'defender:0').troops).toBe(unit(engine, 'defender:0').maxTroops);
  });

  it('전체 가드도 자기 자신은 지키지 않는다 (자기가 대상이면 그냥 맞는다)', () => {
    const engine = new BattleEngine(input([front('inf')], [front('wide')]));
    unit(engine, 'defender:0').guardRate = 100;
    engine.perform(unit(engine, 'attacker:0'), { kind: 'skill', skillId: 'hit', targetUid: 'defender:0' });
    expect(intercepts(engine)).toHaveLength(0);
  });

  it('미리보기의 가드가 막을 확률에도 전체 가드가 반영된다', () => {
    const engine = new BattleEngine(input([front('inf')], [front('inf'), back('wide')]));
    unit(engine, 'defender:1').guardRate = 60;
    const preview = engine.preview(unit(engine, 'attacker:0'), 'hit', 'defender:0');
    if (preview.kind !== 'attack') throw new Error('attack expected');
    expect(preview.interceptChance).toBeCloseTo(0.6);
  });
});

describe('도술 방어 (interceptsMagic)', () => {
  // 공격측 책사(후열)가 책략(지력 공격, 가드로 막을 수 없는 공격)으로 방어측 전열 보병을 친다. 방어측 같은 열에 가드 병종.
  const run = (guardChar: string) => {
    const engine = new BattleEngine(input([back('str')], [front('inf'), front(guardChar)]));
    unit(engine, 'defender:1').guardRate = 100;
    engine.perform(unit(engine, 'attacker:0'), { kind: 'skill', skillId: 'mind', targetUid: 'defender:0' });
    return engine;
  };

  it('보통 가드는 책략을 막지 못한다', () => {
    expect(intercepts(run('shield'))).toHaveLength(0);
  });

  it('도술 방어 가드는 책략도 대신 맞는다', () => {
    const engine = run('wise');
    expect(intercepts(engine)).toEqual([expect.objectContaining({ guardian: 'defender:1', target: 'defender:0' })]);
  });

  it('도술을 대신 맞으면 가드 확률이 줄고 가드 중 피해 감소를 받는다', () => {
    const engine = run('wise');
    const guardian = unit(engine, 'defender:1');
    expect(guardian.guardRate).toBe(60); // 100 − 감소 40
    expect(guardian.troops).toBeLessThan(guardian.maxTroops);
  });

  it('치유/버프는 상관없고, 도술 방어가 물리 공격 가드를 막지는 않는다 (물리는 모든 가드가 막는다)', () => {
    const engine = new BattleEngine(input([front('inf')], [front('inf'), front('wise')]));
    unit(engine, 'defender:1').guardRate = 100;
    engine.perform(unit(engine, 'attacker:0'), { kind: 'skill', skillId: 'hit', targetUid: 'defender:0' });
    expect(intercepts(engine)).toHaveLength(1);
  });
});

describe('가드 유지 공격 (keepOnAttack)', () => {
  const attackFrom = (guardChar: string) => {
    const engine = new BattleEngine(input([front(guardChar)], [front('inf')]));
    const actor = unit(engine, 'attacker:0');
    actor.guardRate = 90;
    engine.perform(actor, { kind: 'skill', skillId: 'hit', targetUid: 'defender:0' });
    return { engine, actor };
  };

  it('보통 가드는 공격하면 풀린다', () => {
    const { engine, actor } = attackFrom('shield');
    expect(actor.guardRate).toBe(0);
    expect(engine.events.some((e) => e.type === 'guardChange' && e.reason === 'reset')).toBe(true);
  });

  it('가드 유지 병종은 공격해도 가드가 그대로다', () => {
    const { engine, actor } = attackFrom('iron');
    expect(actor.guardRate).toBe(90);
    expect(engine.events.some((e) => e.type === 'guardChange' && e.reason === 'reset')).toBe(false);
  });

  it('가드 AI: 지킬 아군이 있어도 가드 유지 병종은 가드가 목표에 닿으면 대기하지 않고 공격한다', () => {
    const decide = (guardChar: string) => {
      const engine = new BattleEngine({ ...input([front(guardChar), front('inf')], [front('inf')]), policy: createDefaultPolicy() });
      const actor = unit(engine, 'attacker:0');
      actor.guardRate = 100;
      return engine.decide(actor);
    };
    expect(decide('shield')).toEqual({ kind: 'wait' });
    expect(decide('iron')).toMatchObject({ kind: 'skill', skillId: 'hit' });
  });
});
