import { describe, expect, it } from 'vitest';
import { BattleEngine } from '../src';
import type { BattleInput, CharacterState, GameData, LineupEntry } from '../src';
import { testBalance, testData } from './fixtures';

// 범위 버프/치유 스킬: 열 결계(wardRow), 전체 결계(wardAll), 전체 독려(inspireAll), 열 치유(healRow). 모두 AP 2.
const S = testData.skills;
const data: GameData = {
  ...testData,
  skills: {
    ...S,
    wardRow: { ...S.ward, id: 'wardRow', name: '열 결계', apCost: 2, area: 'row' },
    wardAll: { ...S.ward, id: 'wardAll', name: '전체 결계', apCost: 2, area: 'all' },
    inspireAll: { ...S.inspire, id: 'inspireAll', name: '전체 독려', apCost: 2, area: 'all' },
    healRow: { ...S.mend, id: 'healRow', name: '열 치유', apCost: 2, area: 'row' },
  },
  unitTypes: {
    ...testData.unitTypes,
    sorcerer: { ...testData.unitTypes.advisor, id: 'sorcerer', extraSkillIds: ['ward', 'wardRow', 'wardAll', 'inspireAll'] },
    physician: { ...testData.unitTypes.geo, id: 'physician', basicSkillId: 'healRow' },
  },
  characters: {
    ...testData.characters,
    sorcerer: { ...testData.characters.advisor, id: 'sorcerer', unitType: 'sorcerer' },
    physician: { ...testData.characters.geo, id: 'physician', unitType: 'physician' },
  },
};
const front = (characterId: string): LineupEntry => ({ characterId, row: 'front' });
const back = (characterId: string): LineupEntry => ({ characterId, row: 'back' });
const unit = (engine: BattleEngine, uid: string): CharacterState => engine.state.units.find((u) => u.uid === uid)!;
const input = (attacker: LineupEntry[]): BattleInput => ({ data, balance: testBalance, attacker, defender: [front('inf')], seed: 1, recordEvents: true });

// 아군: 전열 보병 3명(attacker:0~2), 후열 술사(attacker:3), 후열 보병(attacker:4)
const team = [front('inf'), front('inf'), front('inf'), back('sorcerer'), back('inf')];
const cast = (engine: BattleEngine, skillId: string, targetUid: string) => engine.perform(unit(engine, 'attacker:3'), { kind: 'skill', skillId, targetUid });
const barrierGains = (engine: BattleEngine) => engine.events.filter((e) => e.type === 'barrier' && e.reason === 'gain');

describe('범위 결계/독려 (skill.area)', () => {
  it('열 결계: 고른 아군이 있는 열의 아군 전체가 결계를 받는다', () => {
    const engine = new BattleEngine(input(team));
    cast(engine, 'wardRow', 'attacker:1');
    expect(['attacker:0', 'attacker:1', 'attacker:2'].map((u) => unit(engine, u).barrier)).toEqual([1, 1, 1]);
    expect(unit(engine, 'attacker:4').barrier).toBe(0); // 다른 열
    expect(unit(engine, 'attacker:3').barrier).toBe(0);
    expect(barrierGains(engine)).toHaveLength(3);
  });

  it('전체 결계: 자신을 포함한 아군 전체가 받는다', () => {
    const engine = new BattleEngine(input(team));
    cast(engine, 'wardAll', 'attacker:0');
    expect(engine.state.units.filter((u) => u.side === 'attacker').map((u) => u.barrier)).toEqual([1, 1, 1, 1, 1]);
  });

  it('AP는 한 번만 쓴다 (스킬 값대로)', () => {
    const engine = new BattleEngine(input(team));
    const caster = unit(engine, 'attacker:3');
    const before = caster.ap;
    cast(engine, 'wardAll', 'attacker:0');
    expect(caster.ap).toBe(before - 2);
  });

  it('이미 받은 아군(최대 중첩)은 건너뛰고 나머지만 받는다', () => {
    const engine = new BattleEngine(input(team));
    unit(engine, 'attacker:1').buffUses.wardRow = 2; // 이 스킬을 최대 중첩(시험용 결계는 2회)까지 이미 받은 아군
    cast(engine, 'wardRow', 'attacker:0');
    expect(unit(engine, 'attacker:0').barrier).toBe(1);
    expect(unit(engine, 'attacker:1').barrier).toBe(0);
    expect(unit(engine, 'attacker:2').barrier).toBe(1);
  });

  it('고른 대상이 이미 받은 상태면 고를 수 없다 (범위 스킬도 같다)', () => {
    const engine = new BattleEngine(input(team));
    cast(engine, 'wardAll', 'attacker:0');
    cast(engine, 'wardAll', 'attacker:0'); // 시험용 결계는 최대 중첩 2회라 두 번째에 모두 한도에 닿는다
    const legal = engine.getLegalCommands(unit(engine, 'attacker:3')).find((c) => c.skillId === 'wardAll');
    expect(legal).toBeUndefined();
  });

  it('전체 독려: 아군마다 따로 무작위로 스탯이 오른다', () => {
    const engine = new BattleEngine(input(team));
    cast(engine, 'inspireAll', 'attacker:0');
    const buffs = engine.events.filter((e) => e.type === 'buff');
    expect(buffs).toHaveLength(5);
    expect(new Set(buffs.map((e) => e.type === 'buff' && e.target)).size).toBe(5);
    for (const e of buffs) if (e.type === 'buff') expect(e.changes.length).toBeGreaterThanOrEqual(1);
  });

  it('범위가 없는 스킬은 대상 하나만 받는다', () => {
    const engine = new BattleEngine(input(team));
    cast(engine, 'ward', 'attacker:0');
    expect(engine.state.units.filter((u) => u.side === 'attacker' && u.barrier > 0)).toHaveLength(1);
  });

  it('미리보기: 함께 받는 아군을 알려 준다', () => {
    const engine = new BattleEngine(input(team));
    const preview = engine.preview(unit(engine, 'attacker:3'), 'wardRow', 'attacker:0');
    if (preview.kind !== 'buff') throw new Error('buff expected');
    expect(preview.alsoBuffed).toEqual(['attacker:1', 'attacker:2']);
  });
});

describe('범위 치유 (skill.area)', () => {
  const healTeam = [front('inf'), front('inf'), front('inf'), back('physician'), back('inf')];
  const hurt = (engine: BattleEngine) => {
    for (const uid of ['attacker:0', 'attacker:1', 'attacker:4']) unit(engine, uid).troops = 300; // attacker:2는 가득
  };
  const heal = (engine: BattleEngine, targetUid: string) => engine.perform(unit(engine, 'attacker:3'), { kind: 'skill', skillId: 'healRow', targetUid });
  const healedTargets = (engine: BattleEngine) => engine.events.filter((e) => e.type === 'heal').map((e) => e.type === 'heal' && e.target);

  it('열 치유: 그 열의 다친 아군이 모두 회복하고 가득 찬 아군은 건너뛴다', () => {
    const engine = new BattleEngine(input(healTeam));
    hurt(engine);
    heal(engine, 'attacker:0');
    expect(healedTargets(engine)).toEqual(['attacker:0', 'attacker:1']);
    expect(unit(engine, 'attacker:0').troops).toBeGreaterThan(300);
    expect(unit(engine, 'attacker:4').troops).toBe(300); // 다른 열
  });

  it('고른 대상이 가득 차 있어도 기록하고, 함께 치유하는 가득 찬 아군은 기록하지 않는다', () => {
    const engine = new BattleEngine(input(healTeam));
    hurt(engine);
    heal(engine, 'attacker:2'); // 가득 찬 아군을 골랐다
    expect(healedTargets(engine)).toEqual(['attacker:2', 'attacker:0', 'attacker:1']);
  });

  it('미리보기: 함께 회복하는 아군과 회복량', () => {
    const engine = new BattleEngine(input(healTeam));
    hurt(engine);
    const preview = engine.preview(unit(engine, 'attacker:3'), 'healRow', 'attacker:0');
    if (preview.kind !== 'heal') throw new Error('heal expected');
    expect(preview.alsoHealed?.map((h) => h.uid)).toEqual(['attacker:1', 'attacker:2']);
    expect(preview.alsoHealed?.[1].amount).toBe(0); // 가득 찬 아군
    heal(engine, 'attacker:0');
    expect(unit(engine, 'attacker:1').troops - 300).toBe(preview.alsoHealed![0].amount);
  });
});
