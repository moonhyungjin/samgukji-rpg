import { describe, expect, it } from 'vitest';
import { BattleEngine, createDefaultPolicy, reviveRow, reviveTargets } from '../src';
import type { BattleInput, CharacterState, GameData, LineupEntry } from '../src';
import { testBalance, testData } from './fixtures';

// 부활 스킬 "revive": 전멸한 아군을 최대 병력의 25%로 되살린다 (AP 2, 한 전투에 한 번)
const data: GameData = {
  ...testData,
  skills: {
    ...testData.skills,
    revive: { id: 'revive', name: '부활', kind: 'revive', scalesWith: 'intellect', power: 0, apCost: 2, counterable: false, reviveRatio: 0.25, maxUses: 1 },
    // 쓸 수 있는 횟수가 정해진 일반 스킬 (부활이 아니어도 maxUses는 지켜진다)
    onceHit: { ...testData.skills.hit, id: 'onceHit', name: '일격', maxUses: 1 },
  },
  unitTypes: {
    ...testData.unitTypes,
    saint: { ...testData.unitTypes.geo, id: 'saint', extraSkillIds: ['revive'] },
    striker: { ...testData.unitTypes.inf, id: 'striker', basicSkillId: 'onceHit' },
  },
  characters: {
    ...testData.characters,
    saint: { ...testData.characters.geo, id: 'saint', unitType: 'saint' },
    striker: { ...testData.characters.inf, id: 'striker', unitType: 'striker' },
  },
};
const front = (characterId: string): LineupEntry => ({ characterId, row: 'front' });
const back = (characterId: string): LineupEntry => ({ characterId, row: 'back' });
const unit = (engine: BattleEngine, uid: string): CharacterState => engine.state.units.find((u) => u.uid === uid)!;
const input = (attacker: LineupEntry[], overrides: Partial<BattleInput> = {}): BattleInput => ({ data, balance: testBalance, attacker, defender: [front('inf')], seed: 1, recordEvents: true, ...overrides });

// 아군: 전열 보병 2명(attacker:0, 1), 후열 성자(attacker:2), 후열 보병(attacker:3)
const team = [front('inf'), front('inf'), back('saint'), back('inf')];
const kill = (engine: BattleEngine, uid: string) => {
  const u = unit(engine, uid);
  u.troops = 0;
  u.isDead = true;
};
const revive = (engine: BattleEngine, targetUid: string) => engine.perform(unit(engine, 'attacker:2'), { kind: 'skill', skillId: 'revive', targetUid });

describe('부활 (skill.kind = revive)', () => {
  it('전멸한 아군만 대상이고, 아무도 안 죽었으면 쓸 수 없다', () => {
    const engine = new BattleEngine(input(team));
    expect(engine.getLegalCommands(unit(engine, 'attacker:2')).find((c) => c.skillId === 'revive')).toBeUndefined();
    kill(engine, 'attacker:1');
    expect(engine.getLegalCommands(unit(engine, 'attacker:2')).find((c) => c.skillId === 'revive')?.targetUids).toEqual(['attacker:1']);
  });

  it('최대 병력의 비율로 되살아나고 결계는 사라지며 가드는 시작값으로 돌아온다', () => {
    const engine = new BattleEngine(input([front('shield'), front('inf'), back('saint')]));
    const dead = unit(engine, 'attacker:0');
    dead.barrier = 2;
    dead.guardRate = 130;
    kill(engine, 'attacker:0');
    engine.perform(unit(engine, 'attacker:2'), { kind: 'skill', skillId: 'revive', targetUid: 'attacker:0' });
    expect(dead.isDead).toBe(false);
    expect(dead.troops).toBe(Math.round(dead.maxTroops * 0.25));
    expect(dead.barrier).toBe(0);
    expect(dead.guardRate).toBe(50); // 방패병의 가드 시작값
    expect(engine.events).toContainEqual({ type: 'revive', round: 0, source: 'attacker:2', target: 'attacker:0', troopsAfter: dead.troops, row: 'front', slot: expect.any(Number) });
  });

  it('AP를 스킬 값대로 쓰고, 한 전투에 한 번만 쓸 수 있다', () => {
    const engine = new BattleEngine(input(team));
    const caster = unit(engine, 'attacker:2');
    const before = caster.ap;
    kill(engine, 'attacker:1');
    revive(engine, 'attacker:1');
    expect(caster.ap).toBe(before - 2);
    kill(engine, 'attacker:0');
    expect(engine.getLegalCommands(caster).find((c) => c.skillId === 'revive')).toBeUndefined(); // 횟수를 다 썼다
    expect(() => revive(engine, 'attacker:0')).toThrow(/Illegal/);
  });

  it('되살아난 군단은 원래 열의 맨 끝 칸에 선다', () => {
    const engine = new BattleEngine(input(team));
    kill(engine, 'attacker:0');
    revive(engine, 'attacker:0');
    const revived = unit(engine, 'attacker:0');
    expect(revived.row).toBe('front');
    expect(revived.slot).toBe(1); // 전열에는 살아 있는 보병 한 명이 이미 있다
  });

  it('원래 열이 꽉 차 있으면 반대 열로 돌아오고, 둘 다 꽉 차면 대상이 될 수 없다', () => {
    const engine = new BattleEngine(input([front('inf'), back('saint'), back('inf'), back('inf')]));
    const dead = unit(engine, 'attacker:0');
    dead.row = 'back'; // 후열에서 전멸했다고 하자. 후열에는 살아 있는 군단이 이미 3명(성자, 보병, 보병)
    kill(engine, 'attacker:0');
    expect(reviveRow(dead, engine.state)).toBe('front');
    // 전열도 3명으로 채우면 돌아올 자리가 없다
    for (const [i, characterId] of ['inf', 'inf', 'inf'].entries()) {
      engine.state.units.push({ ...unit(engine, 'attacker:2'), uid: `attacker:x${i}`, characterId, row: 'front', slot: i, isDead: false, troops: 100 });
    }
    expect(reviveRow(dead, engine.state)).toBeNull();
    expect(reviveTargets(unit(engine, 'attacker:1'), engine.state, data.skills.revive)).toEqual([]);
  });

  it('미리보기: 되살아날 병력', () => {
    const engine = new BattleEngine(input(team));
    kill(engine, 'attacker:1');
    const preview = engine.preview(unit(engine, 'attacker:2'), 'revive', 'attacker:1');
    expect(preview).toEqual({ kind: 'revive', troops: Math.round(unit(engine, 'attacker:1').maxTroops * 0.25) });
  });

  it('부활은 시전자의 치유 통계에 들어간다', () => {
    const engine = new BattleEngine(input(team));
    kill(engine, 'attacker:1');
    revive(engine, 'attacker:1');
    expect(engine.state.units.find((u) => u.uid === 'attacker:1')!.isDead).toBe(false);
  });
});

describe('maxUses (부활이 아닌 스킬)', () => {
  it('정해진 횟수를 쓰면 더 이상 고를 수 없다', () => {
    const engine = new BattleEngine(input([front('striker')]));
    const actor = unit(engine, 'attacker:0');
    engine.perform(actor, { kind: 'skill', skillId: 'onceHit', targetUid: 'defender:0' });
    expect(engine.getLegalCommands(actor).find((c) => c.skillId === 'onceHit')).toBeUndefined();
  });
});

describe('부활 AI', () => {
  const decide = (engine: BattleEngine, uid: string) => engine.decide(unit(engine, uid));

  it('전멸한 아군이 있으면 가장 병력이 큰 군단부터 되살린다', () => {
    const engine = new BattleEngine({ ...input(team), policy: createDefaultPolicy() });
    kill(engine, 'attacker:0');
    kill(engine, 'attacker:1');
    unit(engine, 'attacker:1').maxTroops = 2000;
    expect(decide(engine, 'attacker:2')).toEqual({ kind: 'skill', skillId: 'revive', targetUid: 'attacker:1' });
  });

  it('횟수를 다 쓰면 다시 고르지 않는다 (불법 커맨드를 내지 않는다)', () => {
    const engine = new BattleEngine({ ...input(team), policy: createDefaultPolicy() });
    kill(engine, 'attacker:1');
    revive(engine, 'attacker:1');
    kill(engine, 'attacker:0');
    const command = decide(engine, 'attacker:2');
    expect(command.kind === 'skill' && command.skillId === 'revive').toBe(false);
  });

  it('죽은 아군이 없으면 부활하지 않는다', () => {
    const engine = new BattleEngine({ ...input(team), policy: createDefaultPolicy() });
    const command = decide(engine, 'attacker:2');
    expect(command.kind === 'skill' && command.skillId === 'revive').toBe(false);
  });

  it('부활이 있어도 전투가 끝까지 돌고 결과가 재현된다', () => {
    const run = () => new BattleEngine({ ...input(team, { defender: [front('inf'), front('cav'), back('arc')] }), policy: createDefaultPolicy() }).run();
    expect(run()).toEqual(run());
  });
});
