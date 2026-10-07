import { describe, expect, it } from 'vitest';
import { BattleEngine } from '../src';
import type { BattleInput, LineupEntry } from '../src';
import { testBalance, testData } from './fixtures';

const team6: LineupEntry[] = [
  { characterId: 'inf', row: 'front' },
  { characterId: 'cav', row: 'front' },
  { characterId: 'inf', row: 'front' },
  { characterId: 'arc', row: 'back' },
  { characterId: 'str', row: 'back' },
  { characterId: 'geo', row: 'back' },
];

const input = (overrides: Partial<BattleInput> = {}): BattleInput => ({
  data: testData,
  balance: testBalance,
  attacker: team6,
  defender: team6,
  seed: 1,
  recordEvents: true,
  ...overrides,
});

describe('단계별 진행 API', () => {
  it('nextActor / decide / perform으로 진행해도 run()과 완전히 같은 결과(이벤트 포함)다', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const expected = new BattleEngine(input({ seed })).run();

      const engine = new BattleEngine(input({ seed }));
      for (let actor = engine.nextActor(); actor; actor = engine.nextActor()) {
        engine.perform(actor, engine.decide(actor));
      }
      expect(engine.result(), `seed ${seed}`).toEqual(expected);
    }
  });

  it('전투가 끝나면 nextActor는 계속 null이고 finished가 true다', () => {
    const engine = new BattleEngine(input());
    expect(engine.finished).toBe(false);
    engine.run();
    expect(engine.finished).toBe(true);
    expect(engine.nextActor()).toBeNull();
    expect(engine.nextActor()).toBeNull();
  });

  it('끝나기 전에 result()를 부르면 오류, 끝난 뒤에는 몇 번을 불러도 같은 결과다', () => {
    const engine = new BattleEngine(input());
    expect(() => engine.result()).toThrow(/not finished/);
    const first = engine.run();
    expect(engine.result()).toBe(first);
    // battleEnd 이벤트가 한 번만 기록된다
    expect(engine.events.filter((e) => e.type === 'battleEnd')).toHaveLength(1);
  });

  it('끝난 전투에는 perform을 할 수 없다', () => {
    const engine = new BattleEngine(input());
    engine.run();
    const unit = engine.state.units[0];
    expect(() => engine.perform(unit, { kind: 'wait' })).toThrow(/already finished/);
  });
});

describe('getLegalCommands / perform 검증', () => {
  const start = (attacker: LineupEntry[], defender: LineupEntry[]) => {
    const engine = new BattleEngine(input({ attacker, defender }));
    const actor = engine.nextActor()!;
    return { engine, actor };
  };

  it('보병은 전열이 있는 동안 전열만 공격할 수 있다', () => {
    const engine = new BattleEngine(
      input({
        attacker: [{ characterId: 'infFast', row: 'front' }],
        defender: [
          { characterId: 'inf', row: 'front' },
          { characterId: 'arc', row: 'back' },
        ],
      }),
    );
    const actor = engine.nextActor()!;
    expect(actor.uid).toBe('attacker:0');
    const [attack] = engine.getLegalCommands(actor);
    expect(attack.skillId).toBe('hit');
    expect(attack.targetUids).toEqual(['defender:0']);
  });

  it('궁병은 전열과 후열 모두 공격할 수 있다', () => {
    const { engine } = start(
      [{ characterId: 'arc', row: 'back' }],
      [
        { characterId: 'inf', row: 'front' },
        { characterId: 'arc', row: 'back' },
      ],
    );
    // 먼저 행동하는 유닛과 무관하게 공격측 궁병을 직접 찾는다
    const archer = engine.state.units.find((u) => u.uid === 'attacker:0')!;
    const attack = engine.getLegalCommands(archer).find((c) => c.skillId === 'shoot')!;
    expect(attack.targetUids.sort()).toEqual(['defender:0', 'defender:1']);
  });

  it('풍수사의 치유 대상은 아군(자신 포함)이다', () => {
    const { engine, actor } = start(
      [
        { characterId: 'inf', row: 'front' },
        { characterId: 'geo', row: 'back' },
      ],
      [{ characterId: 'inf', row: 'front' }],
    );
    // 가장 먼저 행동하는 유닛이 풍수사가 아닐 수 있으므로 풍수사를 직접 찾는다
    const geo = engine.state.units.find((u) => u.characterId === 'geo')!;
    expect(actor).toBeDefined();
    const heal = engine.getLegalCommands(geo).find((c) => c.skillId === 'mend')!;
    expect(heal.targetUids.sort()).toEqual(['attacker:0', 'attacker:1']);
  });

  it('AP가 부족하면 그 스킬은 목록에서 빠진다', () => {
    const { engine, actor } = start([{ characterId: 'infOneAp', row: 'front' }], [{ characterId: 'inf', row: 'front' }]);
    expect(engine.getLegalCommands(actor)).toHaveLength(1);
    actor.ap = 0;
    expect(engine.getLegalCommands(actor)).toEqual([]);
  });

  it('규칙에 맞지 않는 커맨드는 거절한다', () => {
    const engine = new BattleEngine(
      input({
        attacker: [{ characterId: 'infFast', row: 'front' }],
        defender: [
          { characterId: 'inf', row: 'front' },
          { characterId: 'arc', row: 'back' },
        ],
      }),
    );
    const actor = engine.nextActor()!;
    // 전열이 남아 있는데 후열을 공격
    expect(() => engine.perform(actor, { kind: 'skill', skillId: 'hit', targetUid: 'defender:1' })).toThrow(/Illegal/);
    // 이 병종이 쓸 수 없는 스킬
    expect(() => engine.perform(actor, { kind: 'skill', skillId: 'mend', targetUid: 'attacker:0' })).toThrow(/Illegal/);
    // 존재하지 않는 대상
    expect(() => engine.perform(actor, { kind: 'skill', skillId: 'hit', targetUid: 'nobody' })).toThrow(/Illegal/);
    // 거절된 커맨드는 상태를 바꾸지 않는다
    expect(actor.ap).toBe(4);
    expect(engine.events.some((e) => e.type === 'action')).toBe(false);
  });

  it('대기는 AP를 쓰지 않는다', () => {
    const { engine, actor } = start([{ characterId: 'inf', row: 'front' }], [{ characterId: 'inf', row: 'front' }]);
    const ap = actor.ap;
    engine.perform(actor, { kind: 'wait' });
    expect(actor.ap).toBe(ap);
  });
});

describe('preview', () => {
  it('미리보기 값이 실제로 적용되는 피해/반격/회복과 같다', () => {
    let checkedAttack = 0;
    let checkedCounter = 0;
    let checkedHeal = 0;

    for (let seed = 1; seed <= 15; seed++) {
      const engine = new BattleEngine(input({ seed }));
      for (let actor = engine.nextActor(); actor; actor = engine.nextActor()) {
        const command = engine.decide(actor);
        if (command.kind === 'wait') {
          engine.perform(actor, command);
          continue;
        }
        const preview = engine.preview(actor, command.skillId, command.targetUid);
        const before = engine.events.length;
        const actorTroops = actor.troops;
        engine.perform(actor, command);
        const fresh = engine.events.slice(before);

        if (preview.kind === 'attack') {
          const attack = fresh.find((e) => e.type === 'damage' && e.kind === 'attack');
          const counter = fresh.find((e) => e.type === 'damage' && e.kind === 'counter');
          expect(attack?.type === 'damage' ? attack.amount : -1).toBe(preview.damage);
          expect(attack?.type === 'damage' ? attack.troopsAfter : -1).toBe(preview.targetTroopsAfter);
          expect(counter?.type === 'damage' ? counter.amount : 0).toBe(preview.counter);
          expect(actor.troops).toBe(preview.actorTroopsAfter);
          expect(actor.troops).toBe(actorTroops - preview.counter);
          checkedAttack++;
          if (preview.counter > 0) checkedCounter++;
        } else if (preview.kind === 'heal') {
          const heal = fresh.find((e) => e.type === 'heal');
          expect(heal?.type === 'heal' ? heal.amount : -1).toBe(preview.amount);
          checkedHeal++;
        }
      }
    }
    // 세 경우 모두 실제로 검증되었는지 확인한다
    expect(checkedAttack).toBeGreaterThan(50);
    expect(checkedCounter).toBeGreaterThan(10);
    expect(checkedHeal).toBeGreaterThan(0);
  });

  it('미리보기는 상태를 바꾸지 않는다', () => {
    const engine = new BattleEngine(input());
    const actor = engine.nextActor()!;
    const [legal] = engine.getLegalCommands(actor);
    const snapshot = JSON.stringify(engine.state);
    const eventCount = engine.events.length;
    engine.preview(actor, legal.skillId, legal.targetUids[0]);
    expect(JSON.stringify(engine.state)).toBe(snapshot);
    expect(engine.events.length).toBe(eventCount);
  });

  it('남은 병력으로 잘린 값을 돌려준다 (죽는 공격은 반격이 없다)', () => {
    const strong = { ...testBalance, damage: { ...testBalance.damage, attackScale: 1000 } };
    const engine = new BattleEngine(
      input({ balance: strong, attacker: [{ characterId: 'infFast', row: 'front' }], defender: [{ characterId: 'inf', row: 'front' }] }),
    );
    const actor = engine.nextActor()!;
    const preview = engine.preview(actor, 'hit', 'defender:0');
    expect(preview).toMatchObject({ kind: 'attack', damage: 1000, counter: 0, targetTroopsAfter: 0, actorTroopsAfter: 1000 });
  });
});
