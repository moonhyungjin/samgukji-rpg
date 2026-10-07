import { describe, expect, it } from 'vitest';
import { BattleSimulator, createRng, FAMILIES, generateRandomLineup, runBattle, totalAp } from '@samgukji/battle-engine';
import type { BalanceConfig, CharacterData } from '@samgukji/battle-engine';
import { defaultBalance, gameData, presets } from '../src';

/** 병종 보정까지 반영한 최대 AP */
const maxApOf = (c: CharacterData) =>
  totalAp(defaultBalance, gameData.unitTypes[c.unitType].baseAp, c.stats.action + (gameData.unitTypes[c.unitType].statMods?.action ?? 0));

describe('평범한 장수 (황건적)와 무작위 편성 풀', () => {
  const normal = Object.values(gameData.characters).filter((c) => c.rank === 'normal');
  const elite = Object.values(gameData.characters).filter((c) => (c.rank ?? 'elite') === 'elite');
  const avgStat = (list: typeof normal, key: 'attack' | 'defense' | 'intellect') => list.reduce((sum, c) => sum + c.stats[key], 0) / list.length;

  it('병종마다 평범한 장수가 둘 이상 있고, 네임드 장수보다 스탯이 낮다', () => {
    for (const id of ['shield', 'infantry', 'cavalry', 'archer', 'strategist', 'taoist']) {
      expect(normal.filter((c) => c.unitType === id).length, id).toBeGreaterThanOrEqual(2);
    }
    expect(avgStat(normal, 'attack')).toBeLessThan(avgStat(elite, 'attack'));
    expect(avgStat(normal, 'intellect')).toBeLessThan(avgStat(elite, 'intellect'));
  });

  it('무작위 편성은 기본으로 네임드 장수만 쓰고, pool로 평범한 장수만/모두를 고를 수 있다', () => {
    const ids = (pool?: 'elite' | 'normal' | 'all') =>
      new Set(Array.from({ length: 50 }, (_, i) => generateRandomLineup(gameData, createRng(i + 1), 6, pool)).flat().map((e) => e.characterId));
    for (const id of ids()) expect(gameData.characters[id].rank ?? 'elite').toBe('elite');
    for (const id of ids('normal')) expect(gameData.characters[id].rank).toBe('normal');
    const all = ids('all');
    expect([...all].some((id) => gameData.characters[id].rank === 'normal')).toBe(true);
    expect([...all].some((id) => (gameData.characters[id].rank ?? 'elite') === 'elite')).toBe(true);
  });

  it('무작위 편성에서 사거리 3 병종은 후열에, 사거리 1 병종은 전열에 선다 (사거리 2는 공격할 수 있는 어느 열이든)', () => {
    for (let i = 1; i <= 100; i++) {
      for (const e of generateRandomLineup(gameData, createRng(i), 6, 'all')) {
        const range = gameData.unitTypes[gameData.characters[e.characterId].unitType].range;
        if (range >= 3) expect(e.row, e.characterId).toBe('back');
        else if (range === 1) expect(e.row, e.characterId).toBe('front');
        else expect(['front', 'back'], e.characterId).toContain(e.row);
      }
    }
  });
});

describe('게임 데이터 무결성', () => {
  it('캐릭터는 존재하는 병종을, 병종은 존재하는 스킬/특성을 참조한다', () => {
    for (const c of Object.values(gameData.characters)) {
      expect(gameData.unitTypes[c.unitType], `${c.id} → ${c.unitType}`).toBeDefined();
      expect(maxApOf(c)).toBeGreaterThanOrEqual(2);
      expect(maxApOf(c)).toBeLessThanOrEqual(5);
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

  // 병종/스킬/특성/밸런스 수치는 Balance Lab에서 계속 조정하므로 값을 고정하지 않고, 데이터가 지켜야 하는 구조 규칙만 확인한다.
  it('병종 데이터의 구조 규칙: 가드/버프 스킬과 설정의 짝, 사거리, 병력 배율, 총 AP', () => {
    const { unitTypes, characters, skills } = gameData;
    for (const u of Object.values(unitTypes)) {
      const hasGuardSkill = u.extraSkillIds.some((id) => skills[id].kind === 'guard');
      expect(u.guard !== undefined, `${u.id}: 가드 설정과 가드 스킬은 짝이다`).toBe(hasGuardSkill);
      expect(u.range, `${u.id} 사거리`).toBeGreaterThanOrEqual(1);
      expect(u.troopScale ?? 1, `${u.id} 병력 배율`).toBeGreaterThan(0);
      expect(u.allowedRows.length, `${u.id} 배치 열`).toBeGreaterThan(0);
      // 후열에만 둘 수 있는 병종이 사거리 1이면 공격할 수 없다
      if (!u.allowedRows.includes('front')) expect(u.range, `${u.id}: 후열 전용인데 사거리 1`).toBeGreaterThanOrEqual(2);
    }
    // 설계 결정: 가드는 방패병이 쓰고 보병은 쓰지 않는다. 책사는 스탯 버프(독려), 도사는 피해 무시(결계)를 쓴다.
    expect(unitTypes.shield.guard).toBeDefined();
    expect(unitTypes.infantry.guard).toBeUndefined();
    const buffOf = (typeId: string) => unitTypes[typeId].extraSkillIds.map((id) => skills[id].buff).find(Boolean);
    expect(buffOf('strategist')?.type).toBe('stats');
    expect(buffOf('taoist')?.type).toBe('barrier');
    expect(characters.guoJia.unitType).toBe('taoist');
    // 풍수사: 기본 공격은 활 공격(공격력 기반, 궁병보다 약하게), 치유만 지력 기반이고 아군만 치료한다
    const geo = unitTypes.geomancer;
    const geoAttack = skills[geo.basicSkillId];
    expect(geoAttack.kind).toBe('attack');
    expect(geoAttack.scalesWith).toBe('attack');
    expect(geoAttack.power).toBeLessThan(skills[unitTypes.archer.basicSkillId].power);
    expect(geoAttack.counterable).toBe(false); // 원거리라 반격을 받지 않는다
    const geoHeal = geo.extraSkillIds.map((id) => skills[id]).find((s) => s.kind === 'heal');
    expect(geoHeal?.scalesWith).toBe('intellect');
    for (const c of Object.values(characters)) {
      expect(maxApOf(c), `${c.name} 총 AP`).toBeGreaterThanOrEqual(1);
      expect(maxApOf(c), `${c.name} 총 AP`).toBeLessThanOrEqual(8);
    }
  });

  it('6 vs 6 기본 편성(촉, 위, 황건적)은 전열 3 + 후열 3이다', () => {
    for (const name of ['shu', 'wei', 'yellow']) {
      expect(presets[name].filter((e) => e.row === 'front'), name).toHaveLength(3);
      expect(presets[name].filter((e) => e.row === 'back'), name).toHaveLength(3);
    }
  });

  it('모든 기본 편성은 1~6군단이고 허용된 열과 열당 3군단 이하를 지킨다', () => {
    for (const [name, lineup] of Object.entries(presets)) {
      expect(lineup.length, name).toBeGreaterThanOrEqual(1);
      expect(lineup.length, name).toBeLessThanOrEqual(6);
      for (const row of ['front', 'back'] as const) expect(lineup.filter((e) => e.row === row).length, `${name} ${row}`).toBeLessThanOrEqual(3);
      for (const e of lineup) {
        const unitType = gameData.unitTypes[gameData.characters[e.characterId].unitType];
        expect(unitType.allowedRows, `${name} ${e.characterId}`).toContain(e.row);
      }
    }
  });

  it('초반 시나리오: 촉은 유관장(보병/방패병/기병)으로, 황건적은 보보방 / 보방궁 / 보보방+궁으로 싸운다', () => {
    const families = (name: string) => presets[name].map((e) => gameData.unitTypes[gameData.characters[e.characterId].unitType].family).sort();
    expect(families('shuStart')).toEqual(['cavalry', 'infantry', 'shield']);
    expect(families('yellowEasy')).toEqual(['infantry', 'infantry', 'shield']);
    expect(families('yellowNormal')).toEqual(['archer', 'infantry', 'shield']);
    expect(families('yellowHard')).toEqual(['archer', 'infantry', 'infantry', 'shield']);
    expect(gameData.characters.liuBei.unitType).toBe('infantry');
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

  // 한 열만 낮추면 기병이 사거리 2일 때 다른 열(후열)을 노려 오히려 피해가 늘 수 있어서 두 열 모두 낮춘다
  it('기병이 주는 피해 배수(열)를 낮추면 기병이 주는 피해가 줄어든다', () => {
    const before = sim(defaultBalance);
    const weakened = {
      ...gameData,
      unitTypes: { ...gameData.unitTypes, cavalry: { ...gameData.unitTypes.cavalry, damageDealtByRow: { front: 0.2, back: 0.2 } } },
    };
    const after = sim(defaultBalance, weakened);
    expect(after.familyStats.cavalry!.averageDamageDealt).toBeLessThan(before.familyStats.cavalry!.averageDamageDealt);
  });

  it('반격 비율을 0으로 하면 평균 전투 진행이 달라진다', () => {
    const base = sim(defaultBalance);
    // 반격 비율은 기술마다 있으므로 모든 기술의 값을 0으로 만든다
    const noCounterData = {
      ...gameData,
      skills: Object.fromEntries(Object.entries(gameData.skills).map(([id, s]) => [id, { ...s, counterRate: 0 }])),
    };
    const noCounter = sim(defaultBalance, noCounterData);
    expect(noCounter.averageDestroyed).not.toEqual(base.averageDestroyed);
  });

  // 올리는 쪽은 한 방 피해가 대상의 남은 병력을 넘어 포화될 수 있어서(원작식 공식), 내리는 쪽으로 확인한다
  it('특정 캐릭터의 공격을 내리면 그 캐릭터의 피해량이 줄어든다', () => {
    const weakened = {
      ...gameData,
      characters: { ...gameData.characters, guanYu: { ...gameData.characters.guanYu, stats: { ...gameData.characters.guanYu.stats, attack: 1 } } },
    };
    const before = BattleSimulator.run({ data: gameData, balance: defaultBalance, teamA: presets.shu, teamB: presets.wei, iterations: 400, seed: 3 });
    const after = BattleSimulator.run({ data: weakened, balance: defaultBalance, teamA: presets.shu, teamB: presets.wei, iterations: 400, seed: 3 });
    expect(after.characterStats['A:guanYu'].averageDamageDealt).toBeLessThan(before.characterStats['A:guanYu'].averageDamageDealt);
  });
});
