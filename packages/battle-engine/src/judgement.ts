import type { BattleState, DecidedBy, MoraleJudgement, Side } from './types';

type Verdict = { winner: Side; decidedBy: DecidedBy };

function aliveUnits(state: BattleState, side: Side) {
  return state.units.filter((u) => u.side === side && !u.isDead);
}

/**
 * 최종 판정. 사기는 피해에 영향을 주지 않고 여기서만 쓰인다 (maxEffect를 올리지 않는 한).
 *
 * tiebreak(기본): 1. 전멸 군단 수가 적은 쪽 → 2. 잔여 병력 합산이 큰 쪽 → 3. 사기가 높은 쪽 → 4. 방어측
 * before-troops: 1. 전멸 군단 수 → 2. 사기 → 3. 잔여 병력 → 4. 방어측
 */
export function judge(state: BattleState, moraleOrder: MoraleJudgement = 'tiebreak'): Verdict {
  const destroyedAttacker = state.initialCount.attacker - aliveUnits(state, 'attacker').length;
  const destroyedDefender = state.initialCount.defender - aliveUnits(state, 'defender').length;
  if (destroyedAttacker !== destroyedDefender) {
    return { winner: destroyedAttacker < destroyedDefender ? 'attacker' : 'defender', decidedBy: 'destroyed' };
  }

  const byMorale = (): Verdict | null => {
    const defender = state.defenderMorale;
    const attacker = 100 - defender;
    if (attacker === defender) return null;
    return { winner: attacker > defender ? 'attacker' : 'defender', decidedBy: 'morale' };
  };

  if (moraleOrder === 'before-troops') {
    const verdict = byMorale();
    if (verdict) return verdict;
  }

  const troopsAttacker = aliveUnits(state, 'attacker').reduce((sum, u) => sum + u.troops, 0);
  const troopsDefender = aliveUnits(state, 'defender').reduce((sum, u) => sum + u.troops, 0);
  if (troopsAttacker !== troopsDefender) {
    return { winner: troopsAttacker > troopsDefender ? 'attacker' : 'defender', decidedBy: 'troops' };
  }

  if (moraleOrder === 'tiebreak') {
    const verdict = byMorale();
    if (verdict) return verdict;
  }

  return { winner: 'defender', decidedBy: 'defender' };
}
