import { describe, expect, it } from 'vitest';
import { BattleEngine } from '../src';
import type { BattleInput, LineupEntry } from '../src';
import { testBalance, testData } from './fixtures';

// 전멸하면 그쪽 사기는 바로 0 (상대 100). 양쪽이 동시에 전멸하면 건드리지 않는다.
const front = (characterId: string): LineupEntry => ({ characterId, row: 'front' });
const input = (overrides: Partial<BattleInput> = {}): BattleInput => ({ data: testData, balance: testBalance, attacker: [front('inf')], defender: [front('infWeak')], seed: 1, recordEvents: true, ...overrides });

describe('전멸하면 사기가 바로 0이 된다', () => {
  it('방어측이 전멸하면 방어측 사기가 0, 공격측이 100이다', () => {
    const engine = new BattleEngine(input());
    const victim = engine.state.units.find((u) => u.side === 'defender')!;
    const killer = engine.state.units.find((u) => u.side === 'attacker')!;
    victim.troops = 1;
    engine.perform(killer, { kind: 'skill', skillId: testData.unitTypes[killer.unitType].basicSkillId, targetUid: victim.uid });
    expect(victim.isDead).toBe(true);
    expect(engine.state.defenderMorale).toBe(0);
    expect(engine.events.filter((e) => e.type === 'morale').pop()).toMatchObject({ defenderMorale: 0 });
  });

  it('군단이 남아 있으면 사기는 전멸 한 번(−onUnitDestroyed)만큼만 움직인다', () => {
    const engine = new BattleEngine(input({ defender: [front('infWeak'), front('inf')] }));
    const victim = engine.state.units.find((u) => u.side === 'defender')!;
    const killer = engine.state.units.find((u) => u.side === 'attacker')!;
    victim.troops = 1;
    const before = engine.state.defenderMorale;
    engine.perform(killer, { kind: 'skill', skillId: testData.unitTypes[killer.unitType].basicSkillId, targetUid: victim.uid });
    expect(victim.isDead).toBe(true);
    expect(engine.state.defenderMorale).toBeLessThan(before);
    expect(engine.state.defenderMorale).toBeGreaterThan(0);
  });
});
