import { DamageCalculator } from './damage';
import { chooseTarget, TargetSelector } from './targeting';
import type { TargetPolicy } from './targeting';
import type { Rng } from './rng';
import type { BalanceConfig, BattleState, CharacterState, GameData } from './types';

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

export interface DefaultPolicyOptions {
  /** 이 비율 미만으로 병력이 줄어든 아군이 있으면 회복을 우선한다 */
  healThreshold?: number;
  targetPolicy?: TargetPolicy;
}

export function createDefaultPolicy(options: DefaultPolicyOptions = {}): CommandPolicy {
  const healThreshold = options.healThreshold ?? 0.7;
  const targetPolicy = options.targetPolicy ?? 'highest-damage';

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

export const defaultCommandPolicy: CommandPolicy = createDefaultPolicy();
