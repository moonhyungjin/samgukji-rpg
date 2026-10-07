import { describe, expect, it } from 'vitest';
import { BattleEngine, runBattle } from '../src';
import type { BalanceConfig, BattleInput, LineupEntry } from '../src';
import { testBalance, testData } from './fixtures';

const team: LineupEntry[] = [
  { characterId: 'inf', row: 'front' },
  { characterId: 'cav', row: 'front' },
  { characterId: 'arc', row: 'back' },
  { characterId: 'str', row: 'back' },
  { characterId: 'geo', row: 'back' },
];

const input = (critical?: BalanceConfig['critical'], seed = 1): BattleInput => ({
  data: testData,
  balance: { ...testBalance, critical },
  attacker: team,
  defender: team,
  seed,
  recordEvents: true,
});

describe('크리티컬 (balance.critical)', () => {
  it('확률 0이거나 설정이 없으면 꺼져 있고, 시드 결과가 설정이 없을 때와 같다', () => {
    const off = runBattle(input(undefined));
    expect(runBattle(input({ chance: 0, multiplier: 2 }))).toEqual(off);
    expect(off.events!.some((e) => e.type === 'damage' && e.critical)).toBe(false);
  });

  it('확률 100%면 공격 피해(일반공격과 책략)가 모두 크리티컬이고 반격은 아니다', () => {
    const result = runBattle(input({ chance: 100, multiplier: 2 }));
    const damages = result.events!.filter((e) => e.type === 'damage');
    const attacks = damages.filter((e) => e.type === 'damage' && e.kind === 'attack' && e.amount > 0);
    const counters = damages.filter((e) => e.type === 'damage' && e.kind === 'counter');
    expect(attacks.length).toBeGreaterThan(0);
    expect(attacks.every((e) => e.type === 'damage' && e.critical === true)).toBe(true);
    expect(counters.length).toBeGreaterThan(0);
    expect(counters.every((e) => e.type === 'damage' && e.critical === undefined)).toBe(true);
    // 책략(지력 공격)에도 적용된다
    expect(result.events!.some((e) => e.type === 'action' && ['mind'].includes(e.skillId))).toBe(true);
  });

  it('피해는 배율만큼 커진다 (첫 공격으로 비교)', () => {
    const first = (critical?: BalanceConfig['critical']) => {
      const events = runBattle(input(critical)).events!;
      return events.find((e) => e.type === 'damage' && e.kind === 'attack')!;
    };
    const normal = first(undefined);
    const crit = first({ chance: 100, multiplier: 2 });
    if (normal.type !== 'damage' || crit.type !== 'damage') throw new Error('damage expected');
    expect(crit.amount).toBe(normal.amount * 2);
  });

  it('미리보기에 확률과 크리티컬 피해가 나온다 (꺼져 있으면 없다)', () => {
    const preview = (critical?: BalanceConfig['critical']) => {
      const engine = new BattleEngine(input(critical));
      const actor = engine.nextActor()!;
      const cmd = engine.getLegalCommands(actor).find((c) => c.skillId === 'hit' || c.skillId === 'shoot' || c.skillId === 'mind')!;
      return engine.preview(actor, cmd.skillId, cmd.targetUids[0]);
    };
    const off = preview(undefined);
    const on = preview({ chance: 25, multiplier: 2 });
    if (off.kind !== 'attack' || on.kind !== 'attack') throw new Error('attack expected');
    expect(off.criticalChance).toBeUndefined();
    expect(on.criticalChance).toBe(25);
    expect(on.criticalDamage).toBe(Math.min(off.damage * 2, on.targetTroopsAfter + on.damage));
  });
});
