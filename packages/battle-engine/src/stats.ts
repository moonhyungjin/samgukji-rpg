import type { BalanceConfig } from './types';

/** 스탯 → 유효 스탯. statCurve로 변환하고, 곡선 범위를 넘으면 마지막 기울기로 연장한다. */
export function effectiveStat(balance: BalanceConfig, stat: number): number {
  const curve = balance.statCurve;
  const s = Math.max(0, Math.min(stat, balance.statCap));
  const last = curve.length - 1;
  if (s >= last) {
    const slope = last > 0 ? curve[last] - curve[last - 1] : 0;
    return curve[last] + (s - last) * slope;
  }
  const lo = Math.floor(s);
  const hi = Math.ceil(s);
  if (lo === hi) return curve[lo];
  return curve[lo] + (curve[hi] - curve[lo]) * (s - lo);
}

/** 군단 레벨 → 최대 병력 */
export function maxTroops(balance: BalanceConfig, level: number): number {
  return balance.troops.base + balance.troops.perLevel * (Math.max(1, level) - 1);
}

/** 현재 병력 → 피해 보정. 병력이 많을수록 강하고, 하한/상한으로 눈덩이를 제어한다. */
export function troopFactor(balance: BalanceConfig, currentTroops: number): number {
  const { reference, min, max } = balance.troopFactor;
  return Math.min(max, Math.max(min, currentTroops / reference));
}

/** 사기 비율(자기 편) → 피해 보정. 50이면 1.0 */
export function moraleMultiplier(balance: BalanceConfig, share: number): number {
  return 1 + (balance.morale.maxEffect * (share - 50)) / 50;
}

/** 행동력 스탯 → 캐릭터가 얻는 추가 AP. 행동력 2마다 1 (올림). 행동력 0이면 0 */
export function apFromAction(balance: BalanceConfig, action: number): number {
  const perAp = balance.action?.perAp ?? 2;
  const cap = balance.action?.cap ?? 10;
  return Math.ceil(Math.min(Math.max(action, 0), cap) / perAp);
}

/** 전투 총 AP = 병종 기본 AP + 행동력으로 얻는 추가 AP (최소 1) */
export function totalAp(balance: BalanceConfig, baseAp: number | undefined, action: number): number {
  return Math.max(1, (baseAp ?? 0) + apFromAction(balance, action));
}
