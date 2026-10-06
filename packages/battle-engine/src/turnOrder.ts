import type { Rng } from './rng';
import type { BattleState, CharacterState } from './types';

/**
 * 라운드 내 행동 순서. 속도가 높은 순이고, 동률은 난수로 가른다
 * (진영/슬롯 편향을 막기 위해). AP가 0인 유닛은 행동 기회가 없다.
 */
export function buildTurnOrder(state: BattleState, rng: Rng): CharacterState[] {
  return state.units
    .filter((u) => !u.isDead && u.ap > 0)
    .map((unit) => ({ unit, tie: rng() }))
    .sort((a, b) => b.unit.stats.speed - a.unit.stats.speed || a.tie - b.tie)
    .map((entry) => entry.unit);
}
