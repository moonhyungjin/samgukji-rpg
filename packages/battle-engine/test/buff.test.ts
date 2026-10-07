import { describe, expect, it } from 'vitest';
import { BattleEngine, createDefaultPolicy } from '../src';
import type { BattleEvent, BattleInput, CharacterState, LineupEntry } from '../src';
import { testBalance, testData } from './fixtures';

const input = (attacker: LineupEntry[], defender: LineupEntry[], overrides: Partial<BattleInput> = {}): BattleInput => ({
  data: testData,
  balance: testBalance,
  attacker,
  defender,
  seed: 1,
  recordEvents: true,
  ...overrides,
});

const front = (characterId: string): LineupEntry => ({ characterId, row: 'front' });
const back = (characterId: string): LineupEntry => ({ characterId, row: 'back' });
const unit = (engine: BattleEngine, uid: string): CharacterState => engine.state.units.find((u) => u.uid === uid)!;
const use = (skillId: string, target: string) => ({ kind: 'skill' as const, skillId, targetUid: target });
const buffEvents = (events: BattleEvent[]) => events.filter((e): e is Extract<BattleEvent, { type: 'buff' }> => e.type === 'buff');

describe('스탯 버프 (책사: 공/방/지/속 중 무작위 1~3가지 +1)', () => {
  it('AP 1을 쓰고, 1~3가지 스탯이 중복 없이 +1 오른다', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const engine = new BattleEngine(input([front('inf'), back('advisor')], [front('inf')], { seed }));
      const advisor = unit(engine, 'attacker:1');
      engine.perform(advisor, use('inspire', 'attacker:0'));
      expect(advisor.ap).toBe(3);
      const [event] = buffEvents(engine.events);
      expect(event.changes.length).toBeGreaterThanOrEqual(1);
      expect(event.changes.length).toBeLessThanOrEqual(3);
      expect(new Set(event.changes.map((c) => c.stat)).size).toBe(event.changes.length);
      const target = unit(engine, 'attacker:0');
      for (const c of event.changes) {
        expect(c.amount).toBe(1);
        expect(target.stats[c.stat]).toBe(c.value);
        expect(target.buffs[c.stat]).toBe(1);
      }
    }
  });

  it('여러 시드에서 가짓수 1, 2, 3이 모두 나온다', () => {
    const counts = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) {
      const engine = new BattleEngine(input([front('inf'), back('advisor')], [front('inf')], { seed }));
      engine.perform(unit(engine, 'attacker:1'), use('inspire', 'attacker:0'));
      counts.add(buffEvents(engine.events)[0].changes.length);
    }
    expect([...counts].sort()).toEqual([1, 2, 3]);
  });

  it('같은 시드는 같은 결과다', () => {
    const run = () => {
      const engine = new BattleEngine(input([front('inf'), back('advisor')], [front('inf')], { seed: 9 }));
      engine.perform(unit(engine, 'attacker:1'), use('inspire', 'attacker:0'));
      return buffEvents(engine.events)[0].changes;
    };
    expect(run()).toEqual(run());
  });

  it('한 아군에게 한 번만 쓸 수 있다 (maxStacks 1)', () => {
    const engine = new BattleEngine(input([front('inf'), back('advisor')], [front('inf')]));
    const advisor = unit(engine, 'attacker:1');
    engine.perform(advisor, use('inspire', 'attacker:0'));
    expect(engine.getLegalCommands(advisor).find((c) => c.skillId === 'inspire')?.targetUids).toEqual(['attacker:1']);
    expect(() => engine.perform(advisor, use('inspire', 'attacker:0'))).toThrow();
  });

  it('미리보기는 효과 설명만 주고 상태를 바꾸지 않는다', () => {
    const engine = new BattleEngine(input([front('inf'), back('advisor')], [front('inf')]));
    const p = engine.preview(unit(engine, 'attacker:1'), 'inspire', 'attacker:0');
    expect(p).toMatchObject({ kind: 'buff', effect: { type: 'stats', minCount: 1, maxCount: 3, amount: 1 } });
    expect(unit(engine, 'attacker:0').buffs).toEqual({ attack: 0, defense: 0, intellect: 0, speed: 0 });
  });
});

describe('피해 무시 버프 (도사: 결계)', () => {
  const dmg = (events: BattleEvent[]) => events.filter((e): e is Extract<BattleEvent, { type: 'damage' }> => e.type === 'damage');

  it('결계를 받으면 다음 피해 1회가 0이 된다', () => {
    const engine = new BattleEngine(input([front('inf'), back('advisor')], [front('inf')]));
    engine.perform(unit(engine, 'attacker:1'), use('ward', 'attacker:0'));
    expect(unit(engine, 'attacker:0').barrier).toBe(1);
    expect(engine.events).toContainEqual({ type: 'barrier', round: 0, unit: 'attacker:0', charges: 1, reason: 'gain' });

    const target = unit(engine, 'attacker:0');
    const before = target.troops;
    engine.perform(unit(engine, 'defender:0'), use('hit', 'attacker:0'));
    expect(target.troops).toBe(before);
    expect(target.barrier).toBe(0);
    const blocked = dmg(engine.events).find((e) => e.target === 'attacker:0' && e.kind === 'attack');
    expect(blocked?.amount).toBe(0);
    expect(engine.events).toContainEqual({ type: 'barrier', round: 0, unit: 'attacker:0', charges: 0, reason: 'block' });

    // 두 번째 공격은 정상적으로 들어간다
    engine.perform(unit(engine, 'defender:0'), use('hit', 'attacker:0'));
    expect(target.troops).toBeLessThan(before);
  });

  it('피해 무시는 사기를 움직이지 않는다 (피해가 0이므로)', () => {
    // 반격이 없는 원거리 공격으로 확인한다 (근접이면 결계를 받은 쪽이 반격하며 사기가 움직인다)
    const engine = new BattleEngine(input([front('inf'), back('advisor')], [front('inf'), back('arc')]));
    engine.perform(unit(engine, 'attacker:1'), use('ward', 'attacker:0'));
    const morale = engine.state.defenderMorale;
    engine.perform(unit(engine, 'defender:1'), use('shoot', 'attacker:0'));
    expect(engine.state.defenderMorale).toBe(morale);
  });

  it('미리보기: 원래 대상에게 결계가 있으면 알려 주고 상태는 바꾸지 않는다', () => {
    const engine = new BattleEngine(input([front('inf'), back('advisor')], [front('inf')]));
    engine.perform(unit(engine, 'attacker:1'), use('ward', 'attacker:0'));
    const p = engine.preview(unit(engine, 'defender:0'), 'hit', 'attacker:0');
    expect(p).toMatchObject({ kind: 'attack', targetBarrier: true });
    expect(unit(engine, 'attacker:0').barrier).toBe(1);
  });

  it('maxStacks 2면 결계가 두 번 쌓인다', () => {
    const engine = new BattleEngine(input([front('inf'), back('advisor')], [front('inf')]));
    const advisor = unit(engine, 'attacker:1');
    engine.perform(advisor, use('ward', 'attacker:0'));
    engine.perform(advisor, use('ward', 'attacker:0'));
    expect(unit(engine, 'attacker:0').barrier).toBe(2);
    expect(engine.getLegalCommands(advisor).find((c) => c.skillId === 'ward')?.targetUids).toEqual(['attacker:1']);
  });
});

describe('버프 AI', () => {
  const policy = createDefaultPolicy();

  it('스탯 버프는 주력 스탯이 가장 높은 아군에게 쓴다', () => {
    // 보병(공격 5)보다 지력 8인 참모/책사가 주력 스탯이 높다
    const engine = new BattleEngine(input([front('inf'), back('advisor'), back('str')], [front('inf')], { policy }));
    const advisor = unit(engine, 'attacker:1');
    const first = engine.decide(advisor);
    expect(first).toMatchObject({ kind: 'skill', skillId: 'inspire' });
    expect(first.kind === 'skill' && first.targetUid).not.toBe('attacker:0');
  });

  it('결계는 전열 아군에게 쓴다', () => {
    const engine = new BattleEngine(input([front('inf'), back('advisor')], [front('inf')], { policy }));
    const advisor = unit(engine, 'attacker:1');
    engine.perform(advisor, use('inspire', 'attacker:1')); // 스탯 버프를 먼저 소진
    engine.perform(advisor, use('inspire', 'attacker:0'));
    expect(engine.decide(advisor)).toEqual(use('ward', 'attacker:0'));
  });

  it('쓸 대상이 없으면 공격한다', () => {
    const engine = new BattleEngine(input([back('advisor')], [front('inf')], { policy }));
    const advisor = unit(engine, 'attacker:0');
    engine.perform(advisor, use('inspire', advisor.uid));
    engine.perform(advisor, use('ward', advisor.uid));
    engine.perform(advisor, use('ward', advisor.uid));
    expect(engine.decide(advisor)).toEqual(use('mind', 'defender:0'));
  });
});

describe('가드 AI: 지킬 아군', () => {
  const policy = createDefaultPolicy({ guardMode: 'protect' });

  it('같은 열 아군이 싸울 수 있는 동안은 가드를 올린다', () => {
    const engine = new BattleEngine(input([front('shield'), front('inf')], [front('inf')], { policy }));
    const shield = unit(engine, 'attacker:0');
    expect(engine.decide(shield)).toEqual(use('guard', shield.uid));
  });

  it('같은 열 아군이 모두 AP를 다 썼으면 지킬 필요가 없어 공격한다', () => {
    const engine = new BattleEngine(input([front('shield'), front('inf')], [front('inf')], { policy }));
    unit(engine, 'attacker:1').ap = 0;
    expect(engine.decide(unit(engine, 'attacker:0'))).toEqual(use('hit', 'defender:0'));
  });
});

describe('버프 AI 성향 (buffMode)', () => {
  const lineup = () => new BattleEngine(input([front('inf'), back('advisor')], [front('inf')], { policy: createDefaultPolicy() }));
  const decideWith = (buffMode: 'first' | 'opening' | 'half' | 'never', round?: number) => {
    const engine = new BattleEngine(input([front('inf'), back('advisor')], [front('inf')], { policy: createDefaultPolicy({ buffMode }) }));
    if (round !== undefined) engine.state.round = round;
    return engine.decide(unit(engine, 'attacker:1'));
  };
  void lineup;

  it('first: 쓸 대상이 있으면 버프를 먼저 쓴다 (기본)', () => {
    expect(decideWith('first')).toMatchObject({ skillId: 'inspire' });
    expect(decideWith('first', 5)).toMatchObject({ skillId: 'inspire' });
  });

  it('never: 버프 없이 항상 공격한다', () => {
    expect(decideWith('never')).toEqual(use('mind', 'defender:0'));
  });

  it('opening: 1라운드에만 버프를 쓰고 이후에는 공격한다', () => {
    expect(decideWith('opening', 1)).toMatchObject({ skillId: 'inspire' });
    expect(decideWith('opening', 2)).toEqual(use('mind', 'defender:0'));
  });

  it('half: 버프와 공격이 모두 나온다', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const engine = new BattleEngine(input([front('inf'), back('advisor')], [front('inf')], { seed, policy: createDefaultPolicy({ buffMode: 'half' }) }));
      const c = engine.decide(unit(engine, 'attacker:1'));
      kinds.add(c.kind === 'skill' ? c.skillId : c.kind);
    }
    expect(kinds.has('mind')).toBe(true);
    expect(kinds.has('inspire') || kinds.has('ward')).toBe(true);
  });
});
