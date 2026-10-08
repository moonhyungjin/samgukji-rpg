import { describe, expect, it } from 'vitest';
import { BattleEngine } from '../src';
import type { BattleInput, CharacterState, GameData, LineupEntry } from '../src';
import { testBalance, testData } from './fixtures';

// 열 공격 스킬 "volley": 조준한 대상이 있는 열 전체를 각 군단 피해 × 0.5로 친다 (원거리, 반격 없음, 가드로 대신 맞기 없음)
const data: GameData = {
  ...testData,
  skills: { ...testData.skills, volley: { ...testData.skills.shoot, id: 'volley', name: '일제사격', rowAttack: 0.5, apCost: 2 } },
  unitTypes: { ...testData.unitTypes, bowman: { ...testData.unitTypes.arc, id: 'bowman', basicSkillId: 'volley' } },
  characters: { ...testData.characters, bowman: { ...testData.characters.arc, id: 'bowman', unitType: 'bowman' } },
};
const input = (defender: LineupEntry[], overrides: Partial<BattleInput> = {}): BattleInput => ({ data, balance: testBalance, attacker: [{ characterId: 'bowman', row: 'back' }], defender, seed: 1, recordEvents: true, ...overrides });
const front = (characterId: string): LineupEntry => ({ characterId, row: 'front' });
const back = (characterId: string): LineupEntry => ({ characterId, row: 'back' });
const unit = (engine: BattleEngine, uid: string): CharacterState => engine.state.units.find((u) => u.uid === uid)!;
const volley = (uid: string) => ({ kind: 'skill' as const, skillId: 'volley', targetUid: uid });
const hits = (engine: BattleEngine) => engine.events.filter((e) => e.type === 'damage' && e.kind === 'attack');

// 방어측: 전열 3명(defender:0~2), 후열 1명(defender:3)
const lineup = [front('inf'), front('cav'), front('shield'), back('str')];

describe('열 공격 (skill.rowAttack)', () => {
  it('조준한 대상이 있는 열 전체를 치고, 다른 열은 맞지 않는다', () => {
    const engine = new BattleEngine(input(lineup));
    engine.perform(unit(engine, 'attacker:0'), volley('defender:1'));
    const targets = hits(engine).map((e) => e.type === 'damage' && e.target);
    expect(targets).toEqual(['defender:1', 'defender:0', 'defender:2']); // 조준한 대상이 첫 번째, 나머지는 칸 순서
    expect(unit(engine, 'defender:3').troops).toBe(unit(engine, 'defender:3').maxTroops);
  });

  it('후열을 조준하면 후열 전체(여기서는 한 명)만 맞는다', () => {
    const engine = new BattleEngine(input(lineup));
    engine.perform(unit(engine, 'attacker:0'), volley('defender:3'));
    expect(hits(engine)).toHaveLength(1);
  });

  it('조준한 대상의 피해는 단일 공격 피해 × 비율이다', () => {
    const engine = new BattleEngine(input(lineup));
    const single = new BattleEngine(input(lineup, { data: { ...data, skills: { ...data.skills, volley: { ...data.skills.volley, rowAttack: undefined } } } }));
    engine.perform(unit(engine, 'attacker:0'), volley('defender:0'));
    single.perform(unit(single, 'attacker:0'), volley('defender:0'));
    const lost = (e: BattleEngine) => unit(e, 'defender:0').maxTroops - unit(e, 'defender:0').troops;
    expect(Math.abs(lost(engine) - Math.round(lost(single) * 0.5))).toBeLessThanOrEqual(1);
  });

  it('함께 맞은 군단의 피해는 각자 기준으로 계산한다 (방어가 다르면 피해도 다르다)', () => {
    const engine = new BattleEngine(input([front('inf'), front('shield')], { }));
    unit(engine, 'defender:1').stats = { ...unit(engine, 'defender:1').stats, defense: 10 };
    engine.perform(unit(engine, 'attacker:0'), volley('defender:0'));
    const lost = (uid: string) => unit(engine, uid).maxTroops - unit(engine, uid).troops;
    expect(lost('defender:1')).toBeLessThan(lost('defender:0')); // 방어 10인 군단이 덜 맞는다
  });

  it('가드로 대신 맞기는 없다 (열 공격은 모두가 각자 맞는다)', () => {
    const engine = new BattleEngine(input(lineup));
    unit(engine, 'defender:2').guardRate = 100;
    engine.perform(unit(engine, 'attacker:0'), volley('defender:0'));
    expect(engine.events.some((e) => e.type === 'intercept')).toBe(false);
    expect(unit(engine, 'defender:0').troops).toBeLessThan(unit(engine, 'defender:0').maxTroops);
  });

  it('조준한 대상은 일반 피해 이벤트, 함께 맞은 군단은 splash 이벤트다', () => {
    const engine = new BattleEngine(input(lineup));
    engine.perform(unit(engine, 'attacker:0'), volley('defender:0'));
    const events = hits(engine);
    expect(events[0]).not.toHaveProperty('splash');
    expect(events.slice(1).every((e) => e.type === 'damage' && e.splash === true)).toBe(true);
  });

  it('미리보기: 조준한 대상의 피해와 함께 맞는 군단들의 피해가 나온다', () => {
    const engine = new BattleEngine(input(lineup));
    const preview = engine.preview(unit(engine, 'attacker:0'), 'volley', 'defender:0');
    if (preview.kind !== 'attack') throw new Error('attack expected');
    expect(preview.rowHits?.map((h) => h.uid)).toEqual(['defender:1', 'defender:2']);
    engine.perform(unit(engine, 'attacker:0'), volley('defender:0'));
    for (const h of preview.rowHits!) expect(h.damage).toBe(unit(engine, h.uid).maxTroops - unit(engine, h.uid).troops);
    expect(preview.damage).toBe(unit(engine, 'defender:0').maxTroops - unit(engine, 'defender:0').troops);
  });

  it('열 공격이 아닌 스킬은 대상 하나만 맞고 미리보기에 rowHits가 없다', () => {
    const engine = new BattleEngine({ ...input(lineup), attacker: [{ characterId: 'arc', row: 'back' }] });
    engine.perform(unit(engine, 'attacker:0'), { kind: 'skill', skillId: 'shoot', targetUid: 'defender:0' });
    expect(hits(engine)).toHaveLength(1);
    const preview = engine.preview(unit(engine, 'attacker:0'), 'shoot', 'defender:1');
    expect(preview).not.toHaveProperty('rowHits');
  });

  it('열 전체가 전멸할 수 있고 전멸 이벤트가 각각 나온다', () => {
    const engine = new BattleEngine(input(lineup));
    for (const uid of ['defender:0', 'defender:1', 'defender:2']) unit(engine, uid).troops = 1;
    engine.perform(unit(engine, 'attacker:0'), volley('defender:0'));
    expect(engine.events.filter((e) => e.type === 'unitDestroyed')).toHaveLength(3);
  });

  it('AP 소모를 스킬 값대로 쓴다', () => {
    const engine = new BattleEngine(input(lineup));
    const actor = unit(engine, 'attacker:0');
    const before = actor.ap;
    engine.perform(actor, volley('defender:0'));
    expect(actor.ap).toBe(before - 2);
  });
});
