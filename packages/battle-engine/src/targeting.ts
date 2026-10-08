import { ROW_CAPACITY } from './lineup';
import type { Rng } from './rng';
import type { BattleState, CharacterState, Row, SkillData } from './types';

/**
 * 대상 선택 정책 (시뮬레이션용 AI).
 * lowest-troops: 병력이 가장 적은 적 (집중 공격)
 * highest-damage: 예상 피해가 가장 큰 적 (동률이면 병력이 적은 쪽)
 * random: 무작위
 */
export type TargetPolicy = 'lowest-troops' | 'highest-damage' | 'random';

/** 두 열 사이의 거리: 전열↔전열 1, 후열↔전열(또는 전열↔후열) 2, 후열↔후열 3 */
export function rowDistance(attackerRow: Row, targetRow: Row): number {
  return (attackerRow === 'front' ? 1 : 2) + (targetRow === 'front' ? 1 : 2) - 1;
}

/** 이 열에서 사거리 안에 적을 둘 수 있는가 (후열에 선 사거리 1 병종은 아무도 못 친다) */
export function canAttackFromRow(range: number, row: Row): boolean {
  return range >= rowDistance(row, 'front');
}

export class TargetSelector {
  /** 공격 가능한 적: 공격자와의 거리가 사거리 이하인 살아 있는 적. 전열이 전멸하면 후열이 전열이 되므로 항상 가까운 적이 생긴다. */
  static getValidTargets(actor: CharacterState, state: BattleState, range: number): CharacterState[] {
    return state.units.filter((u) => u.side !== actor.side && !u.isDead && rowDistance(actor.row, u.row) <= range);
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

/** 이 스킬의 버프를 target에게 더 쌓을 수 있는가 */
export function canBuff(target: CharacterState, skill: SkillData): boolean {
  const buff = skill.buff;
  if (!buff || target.isDead) return false;
  return (target.buffUses[skill.id] ?? 0) < (buff.maxStacks ?? 1);
}

/** 부활 스킬로 되살릴 수 있는 전멸한 아군. 시전 횟수가 남아 있어야 하고, 원래 열이나 반대 열에 자리가 있어야 한다. */
export function reviveTargets(actor: CharacterState, state: BattleState, skill: SkillData): CharacterState[] {
  if (skill.kind !== 'revive') return [];
  if ((actor.skillUses?.[skill.id] ?? 0) >= (skill.maxUses ?? 1)) return [];
  return state.units.filter((u) => u.side === actor.side && u.isDead && reviveRow(u, state) !== null);
}

/** 되살아난 군단이 설 열: 원래 열에 자리가 있으면 그 열, 없으면 반대 열, 둘 다 꽉 차 있으면 null */
export function reviveRow(unit: CharacterState, state: BattleState): Row | null {
  const count = (row: Row) => state.units.filter((u) => u.side === unit.side && !u.isDead && u.row === row).length;
  const other: Row = unit.row === 'front' ? 'back' : 'front';
  if (count(unit.row) < ROW_CAPACITY) return unit.row;
  return count(other) < ROW_CAPACITY ? other : null;
}
