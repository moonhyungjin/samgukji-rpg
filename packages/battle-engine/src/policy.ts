import { DamageCalculator } from './damage';
import { canBuff, chooseTarget, TargetSelector } from './targeting';
import type { TargetPolicy } from './targeting';
import type { Rng } from './rng';
import type { BalanceConfig, BattleState, CharacterState, GameData, SkillData } from './types';

export type Command = { kind: 'wait' } | { kind: 'skill'; skillId: string; targetUid: string };

export interface PolicyContext {
  state: BattleState;
  actor: CharacterState;
  data: GameData;
  balance: BalanceConfig;
  rng: Rng;
}

/**
 * 커맨드 선택 정책. 실제 게임에서는 플레이어가 고르지만,
 * Balance Lab 시뮬레이션에서는 사람이 없으므로 정책이 대신 고른다.
 */
export type CommandPolicy = (ctx: PolicyContext) => Command;

/**
 * 가드를 쓸 수 있는 군단의 AI.
 * protect: 지킬 같은 열 아군이 있는 동안은 가드 확률을 목표까지 올리고 유지한다 (공격하면 가드가 풀리므로 공격하지 않는다)
 * never: 가드를 쓰지 않고 항상 공격한다
 */
export type GuardMode = 'protect' | 'never';

export interface DefaultPolicyOptions {
  /** 이 비율 미만으로 병력이 줄어든 아군이 있으면 회복을 우선한다 */
  healThreshold?: number;
  targetPolicy?: TargetPolicy;
  guardMode?: GuardMode;
  /** protect 모드에서 이 확률(%p)까지 가드를 올린다. 이보다 낮아지면 다시 올린다 */
  guardTarget?: number;
}

export function createDefaultPolicy(options: DefaultPolicyOptions = {}): CommandPolicy {
  const healThreshold = options.healThreshold ?? 0.7;
  const targetPolicy = options.targetPolicy ?? 'highest-damage';
  const guardMode = options.guardMode ?? 'protect';
  const guardTarget = options.guardTarget ?? 100;

  return ({ state, actor, data, balance, rng }) => {
    const unitType = data.unitTypes[actor.unitType];
    const skills = [unitType.basicSkillId, ...unitType.extraSkillIds]
      .map((id) => data.skills[id])
      .filter((s) => s.apCost <= actor.ap);

    const heal = skills.find((s) => s.kind === 'heal');
    if (heal) {
      const wounded = TargetSelector.getAllies(actor, state)
        .filter((u) => u.troops < u.maxTroops * healThreshold)
        .sort((a, b) => a.troops / a.maxTroops - b.troops / b.maxTroops);
      if (wounded.length > 0) return { kind: 'skill', skillId: heal.id, targetUid: wounded[0].uid };
    }

    if (guardMode === 'protect' && unitType.guard) {
      // 지킬 아군: 같은 열에서 아직 싸울 수 있는(AP가 남은) 아군. 다들 AP가 바닥났으면 지킬 필요가 없다.
      const hasAllyToProtect = state.units.some(
        (u) => u.side === actor.side && !u.isDead && u.uid !== actor.uid && u.row === actor.row && u.ap > 0,
      );
      if (hasAllyToProtect) {
        const guard = skills.find((s) => s.kind === 'guard');
        if (guard && actor.guardRate < guardTarget) return { kind: 'skill', skillId: guard.id, targetUid: actor.uid };
        return { kind: 'wait' }; // 가드를 유지하며 AP를 아낀다
      }
    }

    // 버프: 쓸 수 있는 대상이 남아 있으면 공격보다 먼저 쓴다.
    for (const buff of skills.filter((s) => s.kind === 'buff' && s.buff)) {
      const target = chooseBuffTarget(actor, state, data, buff);
      if (target) return { kind: 'skill', skillId: buff.id, targetUid: target.uid };
    }

    const attack = skills.find((s) => s.kind === 'attack');
    if (attack) {
      const targets = TargetSelector.getValidTargets(actor, state, unitType.targetRule);
      if (targets.length > 0) {
        const moraleShare = actor.side === 'defender' ? state.defenderMorale : 100 - state.defenderMorale;
        const calc = targetPolicy === 'highest-damage' ? new DamageCalculator(balance, data) : null;
        const target = chooseTarget(targets, targetPolicy, rng, (t) => (calc ? calc.damage(actor, t, attack, moraleShare) : 0));
        return { kind: 'skill', skillId: attack.id, targetUid: target.uid };
      }
    }

    return { kind: 'wait' };
  };
}

/**
 * 버프를 받을 아군. 아직 이 스킬을 받지 않은 아군 중에서 고른다.
 * stats(책사): 주력 공격 스탯(공격 또는 지력)이 가장 높은 아군, barrier(도사): 전열 우선, 방어가 낮은 아군.
 * AP가 남지 않은 아군은 고르지 않는다 (받아도 쓸 곳이 없다).
 */
function chooseBuffTarget(actor: CharacterState, state: BattleState, data: GameData, skill: SkillData): CharacterState | null {
  const buff = skill.buff!;
  const candidates = TargetSelector.getAllies(actor, state).filter((u) => canBuff(u, skill) && u.ap > 0);
  if (candidates.length === 0) return null;
  if (buff.type === 'stats') {
    const main = (u: CharacterState) => (data.skills[data.unitTypes[u.unitType].basicSkillId].scalesWith === 'attack' ? u.stats.attack : u.stats.intellect);
    return candidates.reduce((best, c) => (main(c) > main(best) ? c : best));
  }
  const rowRank = (u: CharacterState) => (u.row === 'front' ? 0 : 1);
  return candidates.reduce((best, c) => {
    if (rowRank(c) !== rowRank(best)) return rowRank(c) < rowRank(best) ? c : best;
    return c.stats.defense < best.stats.defense ? c : best;
  });
}

export const defaultCommandPolicy: CommandPolicy = createDefaultPolicy();
