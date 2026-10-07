import type { BalanceConfig, TieredTroopFactor } from './types';

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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * relative 방식: 공격 스탯 기반 공격의 병력 보정. 내 병력과 상대 병력의 비율을 완만하게(exponent) 반영한다.
 * 1000이 500을 치면 크게 유리하고, 1000과 900이면 거의 같다.
 */
export function relativeTroopFactor(balance: BalanceConfig, attackerTroops: number, defenderTroops: number): number {
  const { min, max, exponent } = balance.troopFactor.relative ?? { min: 0.5, max: 1.5, exponent: 0.5 };
  const ratio = Math.max(attackerTroops, 0) / Math.max(defenderTroops, 1);
  return clamp(Math.pow(ratio, exponent), min, max);
}

export const DEFAULT_TIERED: TieredTroopFactor = { knee: 1000, knee2: 4000, rate2: 0.5, rate3: 0.25, floor: 200, capAtTroops: true };

/** tiered 방식: 구간별 효율로 센 유효 병력 (최소 floor) */
export function tieredTroops(balance: BalanceConfig, troops: number): number {
  const { knee, knee2, rate2, rate3, floor } = balance.troopFactor.tiered ?? DEFAULT_TIERED;
  const t = Math.max(0, troops);
  const effective = Math.min(t, knee) + Math.max(0, Math.min(t, knee2) - knee) * rate2 + Math.max(0, t - knee2) * rate3;
  return Math.max(floor, effective);
}

/** tiered 방식의 병력 보정: 유효 병력 ÷ reference */
export function tieredTroopFactor(balance: BalanceConfig, troops: number): number {
  return tieredTroops(balance, troops) / balance.troopFactor.reference;
}

/** relative 방식: 지력 기반 공격과 치유의 병력 보정. 상대는 보지 않고 내 최대 병력 대비 현재 병력만 본다. */
export function selfTroopFactor(balance: BalanceConfig, troops: number, maxTroops: number): number {
  const { min, max } = balance.troopFactor.self ?? { min: 0.3, max: 1 };
  return clamp(troops / Math.max(maxTroops, 1), min, max);
}
