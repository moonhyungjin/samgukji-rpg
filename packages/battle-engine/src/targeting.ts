import type { Rng } from './rng';
import type { BattleState, CharacterState, TargetRule } from './types';

/**
 * 대상 선택 정책 (시뮬레이션용 AI).
 * lowest-troops: 병력이 가장 적은 적 (집중 공격)
 * highest-damage: 예상 피해가 가장 큰 적 (동률이면 병력이 적은 쪽)
 * random: 무작위
 */
export type TargetPolicy = 'lowest-troops' | 'highest-damage' | 'random';

export class TargetSelector {
  /** 공격 가능한 적. front-first는 전열이 남아 있으면 전열만 대상이 된다. */
  static getValidTargets(actor: CharacterState, state: BattleState, rule: TargetRule): CharacterState[] {
    const enemies = state.units.filter((u) => u.side !== actor.side && !u.isDead);
    if (rule === 'front-first') {
      const front = enemies.filter((u) => u.row === 'front');
      if (front.length > 0) return front;
    }
    return enemies;
  }

  /** 아군(자신 포함) 중 살아 있는 유닛 */
  static getAllies(actor: CharacterState, state: BattleState): CharacterState[] {
    return state.units.filter((u) => u.side === actor.side && !u.isDead);
  }
}

/** 후보 중 하나를 고른다. expectedDamage는 highest-damage 정책에서만 호출된다. */
export function chooseTarget(
  candidates: CharacterState[],
  policy: TargetPolicy,
  rng: Rng,
  expectedDamage: (target: CharacterState) => number,
): CharacterState {
  if (candidates.length === 1) return candidates[0];
  switch (policy) {
    case 'random':
      return candidates[Math.floor(rng() * candidates.length)];
    case 'lowest-troops':
      return candidates.reduce((best, c) => (c.troops < best.troops ? c : best));
    case 'highest-damage':
      return candidates.reduce((best, c) => {
        const eb = expectedDamage(best);
        const ec = expectedDamage(c);
        if (ec !== eb) return ec > eb ? c : best;
        return c.troops < best.troops ? c : best;
      });
  }
}
