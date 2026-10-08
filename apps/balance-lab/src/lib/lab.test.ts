import { BattleSimulator, createDefaultPolicy, runBattle } from '@samgukji/battle-engine';
import { defaultBalance, gameData, presets } from '@samgukji/game-data';
import { describe, expect, it } from 'vitest';
import { createDefaultState } from '../lab/defaults';
import { isLabState, normalizeState } from '../lab/LabContext';
import { formatBattleLog } from './battleLog';
import { evaluateReport } from './metrics';
import type { LabState } from '../lab/types';
import { getIn, setIn } from './path';
import { lineupFromSlots, slotsFromLineup } from './slots';

describe('setIn / getIn', () => {
  const base = { a: { b: [1, 2, 3], c: 'x' }, d: 1 };

  it('원본을 바꾸지 않고 경로의 값만 교체한다', () => {
    const next = setIn(base, 'a.b.1', 99);
    expect(next.a.b).toEqual([1, 99, 3]);
    expect(base.a.b).toEqual([1, 2, 3]);
    expect(next.a.c).toBe('x');
    expect(next.d).toBe(1);
  });

  it('없는 중간 경로는 만들어 준다', () => {
    const next = setIn({} as Record<string, unknown>, 'versus.families', ['cavalry']);
    expect(getIn(next, 'versus.families')).toEqual(['cavalry']);
  });

  it('getIn은 없는 경로에서 undefined를 돌려준다', () => {
    expect(getIn(base, 'a.z.y')).toBeUndefined();
    expect(getIn(base, 'a.b.2')).toBe(3);
  });
});

describe('편성 슬롯', () => {
  it('엔진 편성과 슬롯 6칸이 왕복 변환된다', () => {
    const slots = slotsFromLineup(presets.shu);
    expect(slots).toHaveLength(6);
    expect(slots.every((s) => s !== null)).toBe(true);
    expect(lineupFromSlots(slots)).toEqual(presets.shu);
  });

  it('빈 칸은 건너뛰고, 앞 3칸은 전열, 뒤 3칸은 후열이다', () => {
    const slots = slotsFromLineup(presets.shu);
    slots[1] = null;
    slots[4] = null;
    const lineup = lineupFromSlots(slots);
    expect(lineup).toHaveLength(4);
    expect(lineup.filter((e) => e.row === 'front')).toHaveLength(2);
    expect(lineup.filter((e) => e.row === 'back')).toHaveLength(2);
    expect(slotsFromLineup(lineup)).toEqual(slots);
  });

  it('레벨 덮어쓰기를 보존한다', () => {
    const slots = slotsFromLineup([{ characterId: 'guanYu', row: 'front', level: 20 }]);
    expect(lineupFromSlots(slots)).toEqual([{ characterId: 'guanYu', row: 'front', level: 20 }]);
  });
});

describe('Lab 상태', () => {
  it('기본 상태가 상태 검증을 통과하고 JSON으로 왕복한다', () => {
    const state = createDefaultState();
    expect(isLabState(state)).toBe(true);
    expect(isLabState(JSON.parse(JSON.stringify(state)))).toBe(true);
  });

  it('깨진 데이터는 거부한다', () => {
    expect(isLabState(null)).toBe(false);
    expect(isLabState({})).toBe(false);
    expect(isLabState({ ...createDefaultState(), teamA: [] })).toBe(false);
  });

  it('기본 상태를 수정해도 game-data 원본은 바뀌지 않는다', () => {
    const before = gameData.characters.guanYu.stats.attack;
    const state = createDefaultState();
    state.data.characters.guanYu.stats.attack = 15;
    expect(gameData.characters.guanYu.stats.attack).toBe(before);
  });

  it('이후 추가된 설정이 없는 저장 데이터는 기본값으로 채운다', () => {
    const state = createDefaultState();
    const { autoRunIterations: _drop, ...sim } = state.sim;
    const normalized = normalizeState({ ...state, sim: sim as typeof state.sim });
    expect(normalized.sim.autoRunIterations).toBe(state.sim.autoRunIterations);
  });

  it('예전의 목표 지표(targets)는 버리고 경고 기준(warnings)을 기본값으로 채운다', () => {
    const state = createDefaultState();
    const { warnings: _w, ...rest } = state;
    const old = { ...rest, targets: { averageRounds: [3.5, 6.5] } } as unknown as LabState;
    const normalized = normalizeState(old);
    expect(normalized.warnings).toEqual(state.warnings);
    expect('targets' in JSON.parse(JSON.stringify(normalized))).toBe(false);
  });
});

describe('경고 (깨진 곳)', () => {
  const state = createDefaultState();
  const randomReport = () =>
    BattleSimulator.run({ data: state.data, balance: state.balance, iterations: 300, seed: 1, lineups: 'random' });

  it('기준을 결과가 반드시 벗어나도록 좁히면 경고가 나온다', () => {
    const strict = { ...state.warnings, averageRounds: [100, 101] as [number, number], minWipeRate: 1.1 };
    const findings = evaluateReport(randomReport(), strict, state.data);
    expect(findings.some((f) => f.level === 'warn' && f.message.includes('평균 전투 길이'))).toBe(true);
    expect(findings.some((f) => f.level === 'warn' && f.message.includes('전멸로 끝난 전투'))).toBe(true);
    expect(findings.some((f) => f.level === 'ok')).toBe(false);
  });

  it('기준을 아주 넓히면 깨진 곳이 없다고 한 줄로 알린다', () => {
    const loose = { ...state.warnings, averageRounds: [0, 100] as [number, number], familyWinRate: [0, 1] as [number, number], characterWinRate: [0, 1] as [number, number], attackerWinRate: [0, 1] as [number, number], skillDamageRatio: [0, 100] as [number, number], minWipeRate: 0, maxStallRate: 1 };
    const findings = evaluateReport(randomReport(), loose, state.data);
    expect(findings.filter((f) => f.level === 'warn')).toEqual([]);
    expect(findings[0]).toEqual({ level: 'ok', message: expect.stringContaining('깨진 곳이 없습니다') });
  });

  it('고정 편성에서는 병종/장수 승률을 보지 않는다', () => {
    const fixed = BattleSimulator.run({
      data: state.data,
      balance: state.balance,
      teamA: presets.shu,
      teamB: presets.wei,
      iterations: 100,
      roles: 'A-attacks',
    });
    const findings = evaluateReport(fixed, state.warnings, state.data);
    expect(findings.some((f) => f.level === 'info' && f.message.includes('무작위 편성'))).toBe(true);
    expect(findings.some((f) => f.message.includes('공격측 승률 '))).toBe(false);
  });
});

describe('전투 로그', () => {
  it('엔진 이벤트를 읽을 수 있는 로그로 바꾼다', () => {
    const result = runBattle({
      data: gameData,
      balance: defaultBalance,
      attacker: presets.shu,
      defender: presets.wei,
      seed: 4,
      recordEvents: true,
      policy: createDefaultPolicy(),
    });
    const lines = formatBattleLog(result, gameData);
    expect(lines.length).toBeGreaterThan(10);
    expect(lines[0]).toContain('라운드 1');
    expect(lines.at(-1)).toContain('종료');
    expect(lines.some((l) => l.includes('반격'))).toBe(true);
    expect(lines.some((l) => l.includes('undefined'))).toBe(false);
  });
});
