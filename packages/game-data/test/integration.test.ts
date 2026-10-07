import { describe, expect, it } from 'vitest';
import { BattleSimulator, FAMILIES, runBattle } from '@samgukji/battle-engine';
import type { BalanceConfig } from '@samgukji/battle-engine';
import { defaultBalance, gameData, presets } from '../src';

describe('게임 데이터 무결성', () => {
  it('캐릭터는 존재하는 병종을, 병종은 존재하는 스킬/특성을 참조한다', () => {
    for (const c of Object.values(gameData.characters)) {
      expect(gameData.unitTypes[c.unitType], `${c.id} → ${c.unitType}`).toBeDefined();
      expect(c.ap).toBeGreaterThanOrEqual(3);
      expect(c.ap).toBeLessThanOrEqual(5);
    }
    for (const u of Object.values(gameData.unitTypes)) {
      for (const id of [u.basicSkillId, ...u.extraSkillIds]) expect(gameData.skills[id], `${u.id} → ${id}`).toBeDefined();
      for (const id of u.traitIds) expect(gameData.traits[id], `${u.id} → ${id}`).toBeDefined();
      expect(u.allowedRows.length).toBeGreaterThan(0);
    }
  });

  it('1차 병종 6계열이 모두 있다', () => {
    const families = new Set(Object.values(gameData.unitTypes).map((u) => u.family));
    for (const f of FAMILIES) expect(families.has(f), f).toBe(true);
  });

  it('가드 설정과 가드 스킬은 서로 짝이 맞는다', () => {
    for (const u of Object.values(gameData.unitTypes)) {
      const hasGuardSkill = [u.basicSkillId, ...u.extraSkillIds].some((id) => gameData.skills[id]?.kind === 'guard');
      expect(hasGuardSkill, `${u.id}: guard 설정과 guard 스킬`).toBe(u.guard !== undefined);
    }
  });

  it('확정한 병종 설정: 병력 배율, 보병의 가드, 기병은 전열만 공격, 곽가는 도사', () => {
    const { unitTypes, characters } = gameData;
    expect(unitTypes.geomancer.troopScale).toBe(0.6);
    expect(unitTypes.strategist.troopScale).toBe(0.8);
    expect(unitTypes.cavalry.troopScale).toBe(0.8);
    expect(unitTypes.infantry.troopScale).toBe(1);
    expect(unitTypes.infantry.guard).toEqual({ start: 50, gain: 70, decay: 40 });
    expect(unitTypes.infantry.extraSkillIds).toContain('guard');
    expect(unitTypes.cavalry.targetRule).toBe('front-first');
    expect(characters.guoJia.unitType).toBe('taoist');
    expect(characters.guoJia.ap).toBe(4);
    // 책사는 공격 버프(독려), 도사는 방어 버프(결계)를 쓴다
    expect(gameData.skills[unitTypes.strategist.extraSkillIds[0]].buff).toMatchObject({ stat: 'attack', amount: 1 });
    expect(gameData.skills[unitTypes.taoist.extraSkillIds[0]].buff).toMatchObject({ stat: 'defense', amount: 1 });
  });

  it('기본 편성은 전열 3 + 후열 3이다', () => {
    for (const lineup of Object.values(presets)) {
      expect(lineup.filter((e) => e.row === 'front')).toHaveLength(3);
      expect(lineup.filter((e) => e.row === 'back')).toHaveLength(3);
    }
  });
});

describe('실제 데이터로 6 vs 6', () => {
  it('UI 없이 끝까지 실행되고 재현 가능하다', () => {
    const run = () => runBattle({ data: gameData, balance: defaultBalance, attacker: presets.shu, defender: presets.wei, seed: 7, recordEvents: true });
    const result = run();
    expect(result.units).toHaveLength(12);
    expect(result.rounds).toBeLessThanOrEqual(defaultBalance.maxTurns);
    expect(run()).toEqual(result);
  });

  it('1,000회 시뮬레이션이 가능하다', () => {
    const report = BattleSimulator.run({ data: gameData, balance: defaultBalance, teamA: presets.shu, teamB: presets.wei, iterations: 1000, seed: 1 });
    expect(report.teamAWins + report.teamBWins).toBe(1000);
    expect(Object.keys(report.characterStats)).toHaveLength(12);
    expect(report.averageRounds).toBeGreaterThan(0);
  });

  it('무작위 편성 1,000회에서 캐릭터가 있는 모든 병종 계열의 통계가 나온다', () => {
    const report = BattleSimulator.run({ data: gameData, balance: defaultBalance, iterations: 1000, seed: 1, lineups: 'random' });
    for (const f of FAMILIES) {
      const hasCharacter = Object.values(gameData.characters).some((c) => gameData.unitTypes[c.unitType].family === f);
      // 풍수사처럼 병종은 있어도 캐릭터가 없으면 전투에 나오지 않는다
      expect(report.familyStats[f] !== undefined, f).toBe(hasCharacter);
    }
  });
});

describe('숫자를 바꾸면 결과가 달라진다', () => {
  const sim = (balance: BalanceConfig, data = gameData) =>
    BattleSimulator.run({ data, balance, teamA: presets.shu, teamB: presets.wei, iterations: 400, seed: 3, roles: 'alternate' });

  it('보병에 대기병 특성을 붙이면 기병의 생존율이 떨어진다', () => {
    const before = sim(defaultBalance);
    const withTrait = {
      ...gameData,
      unitTypes: { ...gameData.unitTypes, infantry: { ...gameData.unitTypes.infantry, traitIds: ['anti-cavalry'] } },
    };
    const after = sim(defaultBalance, withTrait);
    // 받은 피해량은 병력(1,000)에서 막히므로 지표로 쓸 수 없다. 더 빨리 쓰러지는지를 본다.
    expect(after.familyStats.cavalry!.survivalRate).toBeLessThan(before.familyStats.cavalry!.survivalRate);
  });

  it('반격 비율을 0으로 하면 평균 전투 진행이 달라진다', () => {
    const base = sim(defaultBalance);
    const noCounter = sim({ ...defaultBalance, counter: { rate: 0 } });
    expect(noCounter.averageDestroyed).not.toEqual(base.averageDestroyed);
  });

  it('특정 캐릭터의 스탯을 올리면 그 캐릭터의 피해량이 늘어난다', () => {
    const boosted = {
      ...gameData,
      characters: { ...gameData.characters, guanYu: { ...gameData.characters.guanYu, stats: { ...gameData.characters.guanYu.stats, attack: 15 } } },
    };
    const before = BattleSimulator.run({ data: gameData, balance: defaultBalance, teamA: presets.shu, teamB: presets.wei, iterations: 400, seed: 3 });
    const after = BattleSimulator.run({ data: boosted, balance: defaultBalance, teamA: presets.shu, teamB: presets.wei, iterations: 400, seed: 3 });
    expect(after.characterStats['A:guanYu'].averageDamageDealt).toBeGreaterThan(before.characterStats['A:guanYu'].averageDamageDealt);
  });
});
