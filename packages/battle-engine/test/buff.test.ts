import { describe, expect, it } from 'vitest';
import { BattleEngine, createDefaultPolicy } from '../src';
import type { BattleInput, CharacterState, LineupEntry } from '../src';
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

describe('버프 (책사 공격+1, 도사 방어+1)', () => {
  it('아군의 스탯을 올리고 AP 1을 쓴다', () => {
    const engine = new BattleEngine(input([front('inf'), back('advisor')], [front('inf')]));
    const advisor = unit(engine, 'attacker:1');
    engine.perform(advisor, use('inspire', 'attacker:0'));
    expect(unit(engine, 'attacker:0').stats.attack).toBe(6);
    expect(advisor.ap).toBe(3);
    expect(engine.events).toContainEqual({ type: 'buff', round: 0, source: 'attacker:1', target: 'attacker:0', stat: 'attack', amount: 1, value: 6 });
  });

  it('올라간 스탯이 피해에 반영된다', () => {
    const engine = new BattleEngine(input([front('inf'), back('advisor')], [front('inf')]));
    const target = unit(engine, 'defender:0');
    const attacker = unit(engine, 'attacker:0');
    const before = engine.preview(attacker, 'hit', target.uid);
    engine.perform(unit(engine, 'attacker:1'), use('inspire', attacker.uid));
    const after = engine.preview(attacker, 'hit', target.uid);
    if (before.kind !== 'attack' || after.kind !== 'attack') throw new Error('attack preview expected');
    expect(after.damage).toBeGreaterThan(before.damage);
  });

  it('쌓을 수 있는 횟수(maxStacks)를 넘으면 쓸 수 없다', () => {
    const engine = new BattleEngine(input([front('inf'), back('advisor')], [front('inf')]));
    const advisor = unit(engine, 'attacker:1');
    engine.perform(advisor, use('inspire', 'attacker:0'));
    const legal = engine.getLegalCommands(advisor).find((c) => c.skillId === 'inspire');
    expect(legal?.targetUids).toEqual(['attacker:1']); // 이미 받은 보병은 빠진다
    expect(() => engine.perform(advisor, use('inspire', 'attacker:0'))).toThrow();
  });

  it('maxStacks가 2면 두 번까지 쌓인다', () => {
    const engine = new BattleEngine(input([front('inf'), back('advisor')], [front('inf')]));
    const advisor = unit(engine, 'attacker:1');
    engine.perform(advisor, use('ward', 'attacker:0'));
    engine.perform(advisor, use('ward', 'attacker:0'));
    expect(unit(engine, 'attacker:0').stats.defense).toBe(7);
    expect(engine.getLegalCommands(advisor).find((c) => c.skillId === 'ward')?.targetUids).toEqual(['attacker:1']);
  });

  it('미리보기는 상태를 바꾸지 않는다', () => {
    const engine = new BattleEngine(input([front('inf'), back('advisor')], [front('inf')]));
    const p = engine.preview(unit(engine, 'attacker:1'), 'inspire', 'attacker:0');
    expect(p).toEqual({ kind: 'buff', stat: 'attack', amount: 1, valueAfter: 6 });
    expect(unit(engine, 'attacker:0').stats.attack).toBe(5);
  });
});

describe('버프 AI', () => {
  const policy = createDefaultPolicy();

  it('공격 버프는 물리 공격을 쓰는 아군에게만 쓴다 (책략만 쓰는 아군은 제외)', () => {
    const engine = new BattleEngine(input([front('inf'), back('advisor'), back('str')], [front('inf')], { policy }));
    const advisor = unit(engine, 'attacker:1');
    expect(engine.decide(advisor)).toEqual(use('inspire', 'attacker:0'));
    engine.perform(advisor, use('inspire', 'attacker:0'));
    // 보병이 이미 받았으므로 다음엔 방어 버프, 대상은 전열
    expect(engine.decide(advisor)).toEqual(use('ward', 'attacker:0'));
  });

  it('쓸 대상이 없으면 공격한다', () => {
    const engine = new BattleEngine(input([back('advisor')], [front('inf')], { policy }));
    const advisor = unit(engine, 'attacker:0');
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
