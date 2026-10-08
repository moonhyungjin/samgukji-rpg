import { describe, expect, it } from 'vitest';
import { BattleEngine } from '../src';
import type { BattleInput, CharacterState, GameData, LineupEntry } from '../src';
import { testBalance, testData } from './fixtures';

// 동시 타격 스킬 "pierce": 전열 대상을 치면 같은 칸 번호의 후열 군단도 피해 30%로 함께 맞는다
const data: GameData = {
  ...testData,
  skills: { ...testData.skills, pierce: { ...testData.skills.hit, id: 'pierce', name: '관통', behindHit: 0.3 } },
  unitTypes: { ...testData.unitTypes, lancer: { ...testData.unitTypes.inf, id: 'lancer', basicSkillId: 'pierce', range: 3 } },
  characters: { ...testData.characters, lancer: { ...testData.characters.inf, id: 'lancer', unitType: 'lancer' } },
};
const input = (defender: LineupEntry[]): BattleInput => ({ data, balance: testBalance, attacker: [{ characterId: 'lancer', row: 'front' }], defender, seed: 1, recordEvents: true });
const front = (characterId: string): LineupEntry => ({ characterId, row: 'front' });
const back = (characterId: string): LineupEntry => ({ characterId, row: 'back' });
const unit = (engine: BattleEngine, uid: string): CharacterState => engine.state.units.find((u) => u.uid === uid)!;
const pierce = (uid: string) => ({ kind: 'skill' as const, skillId: 'pierce', targetUid: uid });
const damages = (engine: BattleEngine) => engine.events.filter((e) => e.type === 'damage' && e.kind === 'attack'); // 공격 피해만 (반격 제외)

// 방어측: 전열 보병 2명(defender:0, defender:1), 후열 궁병 2명(defender:2 = 후열 칸 0, defender:3 = 후열 칸 1)
const lineup = [front('inf'), front('inf'), back('arc'), back('arc')];

describe('동시 타격 (skill.behindHit)', () => {
  it('전열을 치면 같은 칸 번호의 후열 군단도 함께 맞는다', () => {
    const engine = new BattleEngine(input(lineup));
    expect(unit(engine, 'defender:0').slot).toBe(0);
    expect(unit(engine, 'defender:2').slot).toBe(0);
    engine.perform(unit(engine, 'attacker:0'), pierce('defender:0'));
    const hits = damages(engine);
    expect(hits.map((e) => e.type === 'damage' && e.target)).toEqual(['defender:0', 'defender:2']);
    expect(hits[1]).toMatchObject({ splash: true });
    expect(hits[0]).not.toHaveProperty('splash');
    // 다른 칸 번호(전열 2번 ↔ 후열 2번)는 맞지 않는다
    expect(unit(engine, 'defender:1').troops).toBe(unit(engine, 'defender:1').maxTroops);
    expect(unit(engine, 'defender:3').troops).toBe(unit(engine, 'defender:3').maxTroops);
  });

  it('미리보기가 후열 피해를 알려 주고 실제 피해와 같다', () => {
    const engine = new BattleEngine(input(lineup));
    const actor = unit(engine, 'attacker:0');
    const behind = unit(engine, 'defender:2');
    const preview = engine.preview(actor, 'pierce', 'defender:0');
    if (preview.kind !== 'attack') throw new Error('attack expected');
    engine.perform(actor, pierce('defender:0'));
    expect(preview.alsoHit).toEqual({ uid: 'defender:2', damage: behind.maxTroops - behind.troops });
  });

  it('후열을 직접 치면 동시 타격이 없다', () => {
    const engine = new BattleEngine(input(lineup));
    engine.perform(unit(engine, 'attacker:0'), pierce('defender:2'));
    expect(damages(engine)).toHaveLength(1);
    expect(engine.preview(unit(engine, 'attacker:0'), 'pierce', 'defender:2')).not.toHaveProperty('alsoHit');
  });

  it('같은 칸 번호 후열 군단이 없으면 전열만 맞는다', () => {
    const engine = new BattleEngine(input([front('inf'), front('inf'), back('arc')])); // 후열 칸 1이 비어 있다
    engine.perform(unit(engine, 'attacker:0'), pierce('defender:1'));
    expect(damages(engine)).toHaveLength(1);
  });

  it('동시 타격 스킬이 아니면 전열만 맞는다', () => {
    const engine = new BattleEngine({ ...input(lineup), attacker: [front('inf')] }); // 보통 보병의 공격(hit)
    engine.perform(unit(engine, 'attacker:0'), { kind: 'skill', skillId: 'hit', targetUid: 'defender:0' });
    expect(damages(engine)).toHaveLength(1);
  });

  it('후열 군단의 결계는 동시 타격 피해도 한 번 막는다', () => {
    const engine = new BattleEngine(input(lineup));
    unit(engine, 'defender:2').barrier = 1;
    engine.perform(unit(engine, 'attacker:0'), pierce('defender:0'));
    const hits = damages(engine);
    expect(hits[1]).toMatchObject({ target: 'defender:2', amount: 0, splash: true });
    expect(unit(engine, 'defender:2').barrier).toBe(0);
  });

  it('반격은 조준한 전열 대상만 한다 (후열 군단은 반격하지 않는다)', () => {
    const engine = new BattleEngine(input([front('inf'), front('inf'), back('cav'), back('arc')]));
    engine.perform(unit(engine, 'attacker:0'), pierce('defender:0'));
    const counters = damages(engine).filter((e) => e.type === 'damage' && e.kind === 'counter');
    expect(counters.every((e) => e.type === 'damage' && e.source === 'defender:0')).toBe(true);
  });

  it('후열 군단이 전멸하면 전멸 이벤트가 나온다', () => {
    const engine = new BattleEngine(input(lineup));
    unit(engine, 'defender:2').troops = 1;
    engine.perform(unit(engine, 'attacker:0'), pierce('defender:0'));
    expect(unit(engine, 'defender:2').isDead).toBe(true);
    expect(engine.events.some((e) => e.type === 'unitDestroyed' && e.unit === 'defender:2')).toBe(true);
  });
});
