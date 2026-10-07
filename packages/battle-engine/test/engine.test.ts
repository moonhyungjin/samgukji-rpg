import { describe, expect, it } from 'vitest';
import { apFromAction, BattleEngine, BattleSimulator, createRng, generateRandomLineup, runBattle } from '../src';
import type { BalanceConfig, BattleInput, LineupEntry } from '../src';
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
  ...overrides,
});

describe('BattleEngine: 6 vs 6', () => {
  it('끝까지 실행되고 결과가 일관적이다', () => {
    const result = runBattle(input());
    expect(['attacker', 'defender']).toContain(result.winner);
    expect(result.rounds).toBeGreaterThan(0);
    expect(result.rounds).toBeLessThanOrEqual(testBalance.maxTurns);
    expect(result.units).toHaveLength(12);
    for (const u of result.units) {
      expect(u.finalTroops).toBeGreaterThanOrEqual(0);
      expect(u.finalTroops).toBeLessThanOrEqual(u.maxTroops);
      expect(u.survived).toBe(u.finalTroops > 0);
    }
  });

  it('같은 시드는 같은 결과(이벤트 포함)를 만든다', () => {
    const a = runBattle(input({ seed: 123, recordEvents: true }));
    const b = runBattle(input({ seed: 123, recordEvents: true }));
    expect(a).toEqual(b);
  });

  it('시드가 다르면 전개가 달라질 수 있다', () => {
    const logs = new Set(Array.from({ length: 20 }, (_, i) => JSON.stringify(runBattle(input({ seed: i, recordEvents: true })).events)));
    expect(logs.size).toBeGreaterThan(1);
  });

  it('AP를 넘겨 행동하지 않는다', () => {
    const result = runBattle(input({ recordEvents: true }));
    const used: Record<string, number> = {};
    for (const e of result.events!) {
      if (e.type === 'action' && e.skillId !== 'wait') used[e.actor] = (used[e.actor] ?? 0) + 1;
    }
    for (const u of result.units) {
      const maxAp = apFromAction(testBalance, testData.characters[u.characterId].stats.action);
      expect(used[u.uid] ?? 0).toBeLessThanOrEqual(maxAp);
    }
  });
});

describe('BattleEngine: 행동 순서와 종료 조건', () => {
  const oneVsOne = (a: string, d: string, balance: BalanceConfig = testBalance) =>
    input({ attacker: [{ characterId: a, row: 'front' }], defender: [{ characterId: d, row: 'front' }], balance, recordEvents: true });

  it('속도가 높은 군단이 먼저 행동한다', () => {
    const result = runBattle(oneVsOne('infSlow', 'infFast'));
    const firstAction = result.events!.find((e) => e.type === 'action');
    expect(firstAction).toMatchObject({ actor: 'defender:0' });
  });

  it('일반공격은 상호 피해를 낳는다 (공격자도 피해를 입는다)', () => {
    const result = runBattle(oneVsOne('inf', 'inf'));
    const damages = result.events!.filter((e) => e.type === 'damage');
    expect(damages[0]).toMatchObject({ kind: 'attack' });
    expect(damages[1]).toMatchObject({ kind: 'counter' });
    const attack = damages[0] as { amount: number };
    const counter = damages[1] as { amount: number };
    expect(counter.amount).toBeGreaterThan(0);
    expect(counter.amount).toBeLessThan(attack.amount);
  });

  it('원거리 공격(counterable: false)은 반격을 받지 않는다', () => {
    const result = runBattle(
      input({ attacker: [{ characterId: 'arc', row: 'back' }], defender: [{ characterId: 'inf', row: 'front' }], recordEvents: true }),
    );
    expect(result.events!.some((e) => e.type === 'damage' && e.kind === 'counter' && e.source === 'defender:0' && e.target === 'attacker:0')).toBe(false);
  });

  it('한쪽이 전멸하면 wipe로 끝난다', () => {
    const strong: BalanceConfig = { ...testBalance, damage: { ...testBalance.damage, attackScale: 1000 } };
    const result = runBattle(oneVsOne('infFast', 'infSlow', strong));
    expect(result.endCause).toBe('wipe');
    expect(result.winner).toBe('attacker');
    expect(result.rounds).toBe(1);
    expect(result.destroyed).toEqual({ attacker: 0, defender: 1 });
    // 죽은 대상은 반격하지 못한다
    expect(result.units.find((u) => u.uid === 'attacker:0')!.damageTaken).toBe(0);
  });

  it('모든 군단의 AP가 0이 되면 no-ap로 끝나고 판정한다', () => {
    const result = runBattle(oneVsOne('infOneAp', 'infOneAp'));
    expect(result.endCause).toBe('no-ap');
    expect(result.rounds).toBe(1);
  });

  it('아무도 대기 외 행동을 하지 않으면 교착으로 끝난다', () => {
    const result = runBattle(
      input({ attacker: [{ characterId: 'geo', row: 'back' }], defender: [{ characterId: 'geo', row: 'back' }] }),
    );
    expect(result.endCause).toBe('stall');
    // 전멸 수와 병력이 같고, 테스트 설정의 사기는 방어측 60:40이라 사기로 갈린다
    expect(result.winner).toBe('defender');
    expect(result.decidedBy).toBe('morale');
  });
});

describe('BattleEngine: 전열 전멸 시 후열 이동', () => {
  const strong: BalanceConfig = { ...testBalance, damage: { ...testBalance.damage, attackScale: 1000 } };
  const attackFront = (defender: LineupEntry[]) =>
    input({ balance: strong, attacker: [{ characterId: 'infFast', row: 'front' }], defender, recordEvents: true });

  it('전열이 전멸하면 후열이 전열이 된다', () => {
    const engine = new BattleEngine(
      attackFront([
        { characterId: 'inf', row: 'front' },
        { characterId: 'arc', row: 'back' },
      ]),
    );
    const result = engine.run();
    const advance = result.events!.find((e) => e.type === 'rowAdvance');
    expect(advance).toMatchObject({ side: 'defender', units: ['defender:1'] });
    const archer = engine.state.units.find((u) => u.uid === 'defender:1')!;
    expect(archer.row).toBe('front');
    expect(archer.slot).toBe(0);
  });

  it('전열이 남아 있는 동안에는 이동하지 않는다', () => {
    const result = runBattle(
      // 방어측이 공격자를 쓰러뜨리지 못하도록 공격력 0인 전열과 공격 수단이 없는 후열로 구성한다
      attackFront([
        { characterId: 'infWeak', row: 'front' },
        { characterId: 'infWeak', row: 'front' },
        { characterId: 'geo', row: 'back' },
      ]),
    );
    let destroyed = 0;
    for (const e of result.events!) {
      if (e.type === 'unitDestroyed' && e.unit.startsWith('defender')) destroyed++;
      if (e.type === 'rowAdvance') {
        expect(destroyed).toBe(2); // 전열 2명이 모두 쓰러진 뒤에만 이동
        return;
      }
    }
    throw new Error('rowAdvance not emitted');
  });

  it('후열만 있는 진영은 시작할 때 후열이 전열이 되고, 이후 쓰러져도 추가 이동 이벤트가 없다', () => {
    const result = runBattle(
      input({
        balance: strong,
        attacker: [{ characterId: 'arc', row: 'back' }],
        defender: [
          { characterId: 'str', row: 'back' },
          { characterId: 'geo', row: 'back' },
        ],
        recordEvents: true,
      }),
    );
    const advances = result.events!.filter((e) => e.type === 'rowAdvance');
    // 시작할 때 양쪽 진영이 한 번씩만 이동한다 (전투 중에는 이동 이벤트가 더 없다)
    expect(advances).toHaveLength(2);
    expect(advances.every((e) => e.round === 0)).toBe(true);
  });

  it('후열에 선 사거리 1 병종은 전열이 살아 있어도 공격할 수 없다', () => {
    const engine = new BattleEngine(
      input({
        attacker: [
          { characterId: 'inf', row: 'front' },
          { characterId: 'inf', row: 'back' },
        ],
        defender: [{ characterId: 'inf', row: 'front' }],
      }),
    );
    // 보병(사거리 1)이 후열에 서 있으면 대상이 없다
    expect(engine.getLegalCommands(engine.state.units[1]).find((c) => c.skillId === 'hit')).toBeUndefined();
    expect(engine.getLegalCommands(engine.state.units[0]).find((c) => c.skillId === 'hit')?.targetUids).toEqual(['defender:0']);
  });
});

describe('BattleEngine: 사기와 회복', () => {
  it('방어측 사기 60에서 시작하고 0~100 안에서 움직인다', () => {
    const result = runBattle(input({ recordEvents: true }));
    const moraleEvents = result.events!.filter((e) => e.type === 'morale');
    expect(moraleEvents.length).toBeGreaterThan(0);
    for (const e of moraleEvents) {
      if (e.type !== 'morale') continue;
      expect(e.defenderMorale).toBeGreaterThanOrEqual(0);
      expect(e.defenderMorale).toBeLessThanOrEqual(100);
    }
    expect(result.defenderMorale).toBeGreaterThanOrEqual(0);
  });

  it('회복은 최대 병력을 넘지 않는다', () => {
    const result = runBattle(input({ recordEvents: true }));
    const heals = result.events!.filter((e) => e.type === 'heal');
    expect(heals.length).toBeGreaterThan(0);
    for (const e of heals) {
      if (e.type !== 'heal') continue;
      expect(e.troopsAfter).toBeLessThanOrEqual(1000);
    }
  });
});

describe('BattleEngine: 편성 검증', () => {
  it('허용되지 않은 열에는 배치할 수 없다', () => {
    expect(() => runBattle(input({ attacker: [{ characterId: 'str', row: 'front' }] }))).toThrow(/cannot be placed/);
  });

  it('열당 3군단을 넘을 수 없다', () => {
    const four = Array.from({ length: 4 }, () => ({ characterId: 'inf', row: 'front' as const }));
    expect(() => runBattle(input({ attacker: four }))).toThrow(/exceeds/);
  });

  it('병종의 troopScale이 최대 병력에 곱해진다 (같은 레벨에서 풍수사 절반)', () => {
    const data = { ...testData, unitTypes: { ...testData.unitTypes, geo: { ...testData.unitTypes.geo, troopScale: 0.5 } } };
    const engine = new BattleEngine(
      input({ data, attacker: [{ characterId: 'inf', row: 'front' }, { characterId: 'geo', row: 'back' }], defender: [{ characterId: 'inf', row: 'front' }] }),
    );
    const byId = (id: string) => engine.state.units.find((u) => u.characterId === id)!;
    expect(byId('inf').maxTroops).toBe(1000);
    expect(byId('geo').maxTroops).toBe(500);
    expect(byId('geo').troops).toBe(500);
  });

  it('troopScale을 생략하면 1배다', () => {
    const engine = new BattleEngine(input());
    expect(engine.state.units.every((u) => u.maxTroops === 1000)).toBe(true);
  });

  it('진영당 군단 수가 달라도 된다 (6 vs 5)', () => {
    const result = runBattle(input({ defender: team6.slice(0, 5) }));
    expect(result.units).toHaveLength(11);
  });
});

describe('BattleSimulator', () => {
  const base = { data: testData, balance: testBalance, teamA: team6, teamB: team6, iterations: 100, seed: 5 };

  it('승수 합이 반복 횟수와 같다', () => {
    const r = BattleSimulator.run(base);
    expect(r.teamAWins + r.teamBWins).toBe(100);
    expect(r.teamAWinRate + r.teamBWinRate).toBeCloseTo(1, 3);
    expect(r.attackerWinRate + r.defenderWinRate).toBeCloseTo(1, 3);
  });

  it('같은 시드는 같은 보고서를 만든다', () => {
    expect(BattleSimulator.run(base)).toEqual(BattleSimulator.run(base));
  });

  it('alternate는 공방을 번갈아 배정한다', () => {
    const fixed = BattleSimulator.run({ ...base, roles: 'A-attacks' });
    const alt = BattleSimulator.run({ ...base, roles: 'alternate' });
    expect(fixed.attackerWinRate).toBeCloseTo(fixed.teamAWinRate, 3);
    expect(alt.iterations).toBe(100);
  });

  it('캐릭터/병종/스킬 통계를 모은다', () => {
    const r = BattleSimulator.run(base);
    expect(r.characterStats['A:inf']).toBeDefined();
    expect(r.familyStats.infantry!.fielded).toBeGreaterThan(0);
    expect(r.skillStats.hit.uses).toBeGreaterThan(0);
  });

  it('fixed 모드에서 편성이 없으면 오류다', () => {
    expect(() => BattleSimulator.run({ data: testData, balance: testBalance, iterations: 1 })).toThrow(/teamA and teamB/);
  });

  describe('random 편성 모드', () => {
    const random = { data: testData, balance: testBalance, iterations: 200, seed: 9, lineups: 'random' as const };

    it('양 진영을 합산한 캐릭터 통계와 출전률을 낸다', () => {
      const r = BattleSimulator.run(random);
      expect(r.lineups).toBe('random');
      expect(r.characterStats.inf).toBeDefined();
      expect(r.characterStats['A:inf']).toBeUndefined();
      expect(r.characterStats.inf.team).toBeUndefined();
      expect(r.characterStats.inf.pickRate).toBeGreaterThan(0);
      expect(r.characterStats.inf.fielded).toBeGreaterThan(0);
    });

    it('같은 시드는 같은 결과를 만든다', () => {
      expect(BattleSimulator.run(random)).toEqual(BattleSimulator.run(random));
    });

    it('무작위 편성은 항상 규칙을 지킨다 (열 허용, 열당 3군단 이하)', () => {
      const rng = createRng(3);
      for (let i = 0; i < 100; i++) {
        const lineup = generateRandomLineup(testData, rng);
        expect(lineup.length).toBeLessThanOrEqual(6);
        expect(lineup.filter((e) => e.row === 'front').length).toBeLessThanOrEqual(3);
        expect(lineup.filter((e) => e.row === 'back').length).toBeLessThanOrEqual(3);
        for (const e of lineup) {
          const type = testData.unitTypes[testData.characters[e.characterId].unitType];
          expect(type.allowedRows).toContain(e.row);
        }
        expect(() => runBattle(input({ attacker: lineup, defender: lineup }))).not.toThrow();
      }
    });
  });
});
