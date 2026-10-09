import { BattleSimulator } from '@samgukji/battle-engine';
import type { BalanceConfig, GameData } from '@samgukji/battle-engine';
import { describe, expect, it } from 'vitest';
import { createDefaultState } from '../lab/defaults';
import { changeLines } from './dataLog';
import { compareRows, formatDelta, makeSnapshot } from './snapshots';

const state = createDefaultState();
const run = (data: GameData, balance: BalanceConfig) => BattleSimulator.run({ data, balance, teamA: [], teamB: [], iterations: 40, seed: 7, lineups: 'random' });

describe('설정 비교', () => {
  it('설정을 저장하면 지금 값의 복사본이 된다 (나중에 고쳐도 저장한 값은 그대로)', () => {
    const snap = makeSnapshot('A', state.data, state.balance);
    expect(snap.balance).toEqual(state.balance);
    expect(snap.balance).not.toBe(state.balance);
    snap.balance.maxTurns += 1;
    expect(state.balance.maxTurns).not.toBe(snap.balance.maxTurns);
  });

  it('같은 설정은 같은 시드에서 같은 결과, 값이 다르면 차이가 표에 나온다', () => {
    // 병력은 어느 피해 공식에서도 쓰인다
    const changed: BalanceConfig = { ...state.balance, troops: { base: state.balance.troops.base * 3, perLevel: state.balance.troops.perLevel * 3 } };
    const rows = compareRows([run(state.data, state.balance), run(state.data, state.balance), run(state.data, changed)]);
    const rounds = rows.find((r) => r.label === '평균 라운드')!;
    expect(rounds.values[0]).toBe(rounds.values[1]);
    expect(rows.some((r) => r.values[0] !== r.values[2])).toBe(true);
    expect(rows.some((r) => r.group.startsWith('병종 계열'))).toBe(true);
  });

  it('실패한 열은 null이고 다른 열은 그대로 나온다', () => {
    const rows = compareRows([run(state.data, state.balance), null]);
    for (const r of rows) expect(r.values[1]).toBeNull();
    expect(rows.find((r) => r.label === '평균 라운드')!.values[0]).toBeGreaterThan(0);
  });

  it('차이 표시: 비율은 %p, 차이가 없으면 표시하지 않는다', () => {
    expect(formatDelta('pct', 0.55, 0.5)).toBe('+5.0%p');
    expect(formatDelta('num2', 3, 3.5)).toBe('-0.50');
    expect(formatDelta('pct', 0.5, 0.5)).toBeNull();
  });

  it('기준과 다른 값을 경로로 알려 준다', () => {
    const changed: BalanceConfig = { ...state.balance, maxTurns: state.balance.maxTurns + 5 };
    const lines = changeLines({ data: state.data, balance: state.balance, presets: state.presets, campaign: state.campaign }, { data: state.data, balance: changed, presets: state.presets, campaign: state.campaign });
    expect(lines).toEqual([`balance.maxTurns: ${state.balance.maxTurns} → ${state.balance.maxTurns + 5}`]);
  });
});
