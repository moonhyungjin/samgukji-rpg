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
const hit = (target: string) => ({ kind: 'skill' as const, skillId: 'hit', targetUid: target });
const types = (events: BattleEvent[]) => events.map((e) => e.type);

describe('가드: 시작값과 가드 커맨드', () => {
  it('가드를 쓸 수 있는 병종만 시작 확률을 가진다', () => {
    const engine = new BattleEngine(input([front('shield'), front('inf')], [front('inf')]));
    expect(unit(engine, 'attacker:0').guardRate).toBe(50);
    expect(unit(engine, 'attacker:1').guardRate).toBe(0);
  });

  it('가드 커맨드는 AP 1을 쓰고 가드 확률을 +70%p 올린다 (50 → 120)', () => {
    const engine = new BattleEngine(input([front('shield')], [front('inf')]));
    const shield = unit(engine, 'attacker:0');
    engine.perform(shield, { kind: 'skill', skillId: 'guard', targetUid: shield.uid });
    expect(shield.guardRate).toBe(120);
    expect(shield.ap).toBe(3);
    expect(engine.events).toContainEqual({ type: 'guardChange', round: 0, unit: 'attacker:0', rate: 120, reason: 'raise' });
  });

  it('여러 번 쓰면 쌓이고 100%를 넘을 수 있다', () => {
    const engine = new BattleEngine(input([front('shield')], [front('inf')]));
    const shield = unit(engine, 'attacker:0');
    for (let i = 0; i < 3; i++) engine.perform(shield, { kind: 'skill', skillId: 'guard', targetUid: shield.uid });
    expect(shield.guardRate).toBe(50 + 70 * 3);
  });

  it('가드는 가드를 쓸 수 있는 병종만 고를 수 있고, 대상은 자기 자신뿐이다', () => {
    const engine = new BattleEngine(input([front('shield'), front('inf')], [front('inf')]));
    const shield = unit(engine, 'attacker:0');
    const plain = unit(engine, 'attacker:1');
    expect(engine.getLegalCommands(shield).find((c) => c.skillId === 'guard')?.targetUids).toEqual(['attacker:0']);
    expect(engine.getLegalCommands(plain).find((c) => c.skillId === 'guard')).toBeUndefined();
    expect(() => engine.perform(plain, { kind: 'skill', skillId: 'guard', targetUid: plain.uid })).toThrow(/Illegal/);
    expect(() => engine.perform(shield, { kind: 'skill', skillId: 'guard', targetUid: 'attacker:1' })).toThrow(/Illegal/);
  });
});

describe('가드: 대신 맞기', () => {
  // 방어측: 방패병(defender:0)과 보병(defender:1)이 같은 전열. 공격측 기병이 보병을 노린다.
  const setup = (rate: number, seed = 1) => {
    const engine = new BattleEngine(input([front('cav')], [front('shield'), front('inf')], { seed }));
    unit(engine, 'defender:0').guardRate = rate;
    return { engine, cav: unit(engine, 'attacker:0'), shield: unit(engine, 'defender:0'), inf: unit(engine, 'defender:1') };
  };

  it('같은 열의 가드 유닛이 대신 맞고, 막은 만큼 확률이 줄어든다 (120 → 80)', () => {
    const { engine, cav, shield, inf } = setup(120);
    engine.perform(cav, hit('defender:1'));

    expect(engine.events).toContainEqual({ type: 'intercept', round: 0, attacker: 'attacker:0', target: 'defender:1', guardian: 'defender:0' });
    expect(shield.guardRate).toBe(80);
    expect(shield.troops).toBeLessThan(1000);
    expect(inf.troops).toBe(1000);
    const attack = engine.events.find((e) => e.type === 'damage' && e.kind === 'attack');
    expect(attack).toMatchObject({ target: 'defender:0' });
  });

  it('막을 때 AP를 쓰지 않는다', () => {
    const { engine, cav, shield } = setup(120);
    const ap = shield.ap;
    engine.perform(cav, hit('defender:1'));
    expect(shield.ap).toBe(ap);
  });

  it('반격은 실제로 맞은 가드 유닛이 한다', () => {
    const { engine, cav } = setup(120);
    engine.perform(cav, hit('defender:1'));
    const counter = engine.events.find((e) => e.type === 'damage' && e.kind === 'counter');
    expect(counter).toMatchObject({ source: 'defender:0', target: 'attacker:0' });
  });

  it('이벤트 순서: 행동 → 가드 발동 → 확률 감소 → 피해', () => {
    const { engine, cav } = setup(120);
    engine.perform(cav, hit('defender:1'));
    const order = types(engine.events).filter((t) => ['action', 'intercept', 'guardChange', 'damage'].includes(t));
    expect(order.slice(0, 4)).toEqual(['action', 'intercept', 'guardChange', 'damage']);
  });

  it('막은 횟수가 기록된다', () => {
    const { engine, cav } = setup(120);
    engine.perform(cav, hit('defender:1'));
    engine.perform(cav, hit('defender:1'));
    engine.nextActor();
    // 리포트는 전투 종료 후 나오므로 이벤트로 센다
    expect(engine.events.filter((e) => e.type === 'intercept')).toHaveLength(2);
  });

  it('가드 확률이 100% 이상이면 항상 막는다', () => {
    let blocked = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const { engine, cav } = setup(100, seed);
      engine.perform(cav, hit('defender:1'));
      if (engine.events.some((e) => e.type === 'intercept')) blocked++;
    }
    expect(blocked).toBe(100);
  });

  it('가드 확률이 50%이면 대략 절반을 막는다', () => {
    let blocked = 0;
    const n = 400;
    for (let seed = 1; seed <= n; seed++) {
      const { engine, cav } = setup(50, seed);
      engine.perform(cav, hit('defender:1'));
      if (engine.events.some((e) => e.type === 'intercept')) blocked++;
    }
    expect(blocked / n).toBeGreaterThan(0.4);
    expect(blocked / n).toBeLessThan(0.6);
  });

  it('확률이 0이면 막지 못한다', () => {
    const { engine, cav, inf } = setup(0);
    engine.perform(cav, hit('defender:1'));
    expect(engine.events.some((e) => e.type === 'intercept')).toBe(false);
    expect(inf.troops).toBeLessThan(1000);
  });
});

describe('가드: 막지 못하는 경우', () => {
  it('다른 열의 아군은 지키지 못한다', () => {
    const engine = new BattleEngine(input([front('cav')], [front('shield'), back('arc')]));
    unit(engine, 'defender:0').guardRate = 200;
    engine.perform(unit(engine, 'attacker:0'), hit('defender:1')); // 후열 궁병을 공격
    expect(engine.events.some((e) => e.type === 'intercept')).toBe(false);
  });

  it('가드 유닛 자신이 대상이면 가로채지 않는다', () => {
    const engine = new BattleEngine(input([front('cav')], [front('shield'), front('inf')]));
    unit(engine, 'defender:0').guardRate = 200;
    engine.perform(unit(engine, 'attacker:0'), hit('defender:0'));
    expect(engine.events.some((e) => e.type === 'intercept')).toBe(false);
  });

  it('책략은 막지 못한다 (guardable이 아닌 스킬)', () => {
    const engine = new BattleEngine(input([back('str')], [front('shield'), front('inf')]));
    unit(engine, 'defender:0').guardRate = 200;
    engine.perform(unit(engine, 'attacker:0'), { kind: 'skill', skillId: 'mind', targetUid: 'defender:1' });
    expect(engine.events.some((e) => e.type === 'intercept')).toBe(false);
    expect(unit(engine, 'defender:1').troops).toBeLessThan(1000);
  });

  it('전멸한 가드 유닛은 막지 못한다', () => {
    const engine = new BattleEngine(input([front('cav')], [front('shield'), front('inf')]));
    const shield = unit(engine, 'defender:0');
    shield.guardRate = 200;
    shield.troops = 0;
    shield.isDead = true;
    engine.perform(unit(engine, 'attacker:0'), hit('defender:1'));
    expect(engine.events.some((e) => e.type === 'intercept')).toBe(false);
  });

  it('가드 유닛이 여럿이면 확률이 높은 쪽부터 판정한다', () => {
    const engine = new BattleEngine(input([front('cav')], [front('shield'), front('shield'), front('inf')]));
    unit(engine, 'defender:0').guardRate = 100;
    unit(engine, 'defender:1').guardRate = 150;
    engine.perform(unit(engine, 'attacker:0'), hit('defender:2'));
    const intercept = engine.events.find((e) => e.type === 'intercept');
    expect(intercept).toMatchObject({ guardian: 'defender:1' });
    expect(unit(engine, 'defender:1').guardRate).toBe(110);
    expect(unit(engine, 'defender:0').guardRate).toBe(100); // 판정하지 않았으니 그대로
  });
});

describe('가드: 막기만 하거나 공격만 해야 한다', () => {
  it('공격하면 가드 확률이 모두 사라진다', () => {
    const engine = new BattleEngine(input([front('shield')], [front('inf')]));
    const shield = unit(engine, 'attacker:0');
    shield.guardRate = 200;
    engine.perform(shield, hit('defender:0'));
    expect(shield.guardRate).toBe(0);
    expect(engine.events).toContainEqual({ type: 'guardChange', round: 0, unit: 'attacker:0', rate: 0, reason: 'reset' });
  });

  it('대기하면 가드 확률이 유지된다', () => {
    const engine = new BattleEngine(input([front('shield')], [front('inf')]));
    const shield = unit(engine, 'attacker:0');
    shield.guardRate = 120;
    engine.perform(shield, { kind: 'wait' });
    expect(shield.guardRate).toBe(120);
    expect(engine.events.some((e) => e.type === 'guardChange')).toBe(false);
  });

  it('반격은 공격 커맨드가 아니므로 가드를 풀지 않는다', () => {
    const engine = new BattleEngine(input([front('cav')], [front('shield')]));
    const shield = unit(engine, 'defender:0');
    shield.guardRate = 120;
    engine.perform(unit(engine, 'attacker:0'), hit('defender:0')); // 방패병 본인이 맞고 반격한다
    expect(shield.guardRate).toBe(120);
  });

  it('가드가 없는 군단이 공격해도 가드 이벤트가 생기지 않는다', () => {
    const engine = new BattleEngine(input([front('cav')], [front('inf')]));
    engine.perform(unit(engine, 'attacker:0'), hit('defender:0'));
    expect(engine.events.some((e) => e.type === 'guardChange')).toBe(false);
  });
});

describe('가드: 미리보기', () => {
  it('가드 커맨드는 올린 뒤의 확률을 보여 준다', () => {
    const engine = new BattleEngine(input([front('shield')], [front('inf')]));
    const shield = unit(engine, 'attacker:0');
    expect(engine.preview(shield, 'guard', shield.uid)).toEqual({ kind: 'guard', rateAfter: 120 });
  });

  it('공격 미리보기는 가드가 막을 확률을 알려 준다', () => {
    const engine = new BattleEngine(input([front('cav')], [front('shield'), front('shield'), front('inf')]));
    const cav = unit(engine, 'attacker:0');
    const chance = (g0: number, g1: number) => {
      unit(engine, 'defender:0').guardRate = g0;
      unit(engine, 'defender:1').guardRate = g1;
      const p = engine.preview(cav, 'hit', 'defender:2');
      return p.kind === 'attack' ? p.interceptChance : -1;
    };
    expect(chance(0, 0)).toBe(0);
    expect(chance(120, 0)).toBe(1);
    expect(chance(50, 0)).toBeCloseTo(0.5);
    expect(chance(50, 50)).toBeCloseTo(0.75); // 1 - 0.5 × 0.5
  });

  it('책략은 막히지 않으므로 가드가 있어도 확률이 0이다', () => {
    const engine = new BattleEngine(input([back('str')], [front('shield'), front('inf')]));
    unit(engine, 'defender:0').guardRate = 200;
    const p = engine.preview(unit(engine, 'attacker:0'), 'mind', 'defender:1');
    expect(p.kind === 'attack' ? p.interceptChance : -1).toBe(0);
  });
});

describe('가드: AI 정책', () => {
  const decide = (engine: BattleEngine, uid: string) => engine.decide(unit(engine, uid));

  it('protect: 지킬 아군이 있으면 목표(100)까지 가드를 올리고, 넘으면 대기하며 유지한다', () => {
    const engine = new BattleEngine(input([front('shield'), front('inf')], [front('inf')]));
    const shield = unit(engine, 'attacker:0');
    expect(decide(engine, 'attacker:0')).toMatchObject({ kind: 'skill', skillId: 'guard', targetUid: 'attacker:0' }); // 50 < 100
    shield.guardRate = 120;
    expect(decide(engine, 'attacker:0')).toEqual({ kind: 'wait' });
    shield.guardRate = 80; // 막아서 줄었다 → 다시 올린다
    expect(decide(engine, 'attacker:0')).toMatchObject({ skillId: 'guard' });
  });

  it('protect: 지킬 같은 열 아군이 없으면 공격한다', () => {
    const engine = new BattleEngine(input([front('shield'), back('arc')], [front('inf')]));
    expect(decide(engine, 'attacker:0')).toMatchObject({ kind: 'skill', skillId: 'hit' });
  });

  it('never: 가드를 쓰지 않고 항상 공격한다', () => {
    const engine = new BattleEngine(input([front('shield'), front('inf')], [front('inf')], { policy: createDefaultPolicy({ guardMode: 'never' }) }));
    expect(decide(engine, 'attacker:0')).toMatchObject({ kind: 'skill', skillId: 'hit' });
  });

  it('가드를 못 쓰는 병종은 정책이 달라도 항상 공격한다', () => {
    const engine = new BattleEngine(input([front('inf'), front('shield')], [front('inf')]));
    expect(decide(engine, 'attacker:0')).toMatchObject({ skillId: 'hit' });
  });
});

describe('가드: 전투 전체', () => {
  const team: LineupEntry[] = [front('shield'), front('cav'), front('shield'), back('arc'), back('str'), back('geo')];

  it('단계별 진행이 run()과 완전히 같은 결과를 낸다 (이벤트 포함)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const expected = new BattleEngine(input(team, team, { seed })).run();
      const engine = new BattleEngine(input(team, team, { seed }));
      for (let actor = engine.nextActor(); actor; actor = engine.nextActor()) engine.perform(actor, engine.decide(actor));
      expect(engine.result(), `seed ${seed}`).toEqual(expected);
    }
  });

  it('막은 횟수 합이 intercept 이벤트 수와 같고, 가드 확률은 항상 0 이상이다', () => {
    // 기본 AI는 방어가 낮은 후열을 노려 전열이 거의 맞지 않으므로, 무작위 대상 선택으로 전열도 공격받게 한다
    const policy = createDefaultPolicy({ targetPolicy: 'random' });
    let totalBlocks = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const result = new BattleEngine(input(team, team, { seed, policy })).run();
      const intercepts = result.events!.filter((e) => e.type === 'intercept').length;
      expect(result.units.reduce((sum, u) => sum + u.blocks, 0)).toBe(intercepts);
      totalBlocks += intercepts;
      for (const e of result.events!) if (e.type === 'guardChange') expect(e.rate).toBeGreaterThanOrEqual(0);
    }
    expect(totalBlocks).toBeGreaterThan(0);
  });
});
