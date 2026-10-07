import { effectiveStat, moraleMultiplier, relativeTroopFactor, selfTroopFactor, troopFactor } from './stats';
import type { BalanceConfig, CharacterState, GameData, SkillData, TraitData } from './types';

function traitApplies(trait: TraitData, other: CharacterState): boolean {
  // versus가 없거나 조건 목록이 비어 있으면 모든 상대에게 적용된다.
  const { versus } = trait;
  if (!versus) return true;
  if (versus.families?.length && !versus.families.includes(other.family)) return false;
  if (versus.rows?.length && !versus.rows.includes(other.row)) return false;
  return true;
}

/**
 * 데미지 공식은 이 클래스 한 곳에서만 정의한다.
 *
 * 피해 = 공격 스탯 × attackScale × 스킬 계수
 *        × 특성 보정 × 병력 보정(공격자) × 사기 보정(공격자 편)
 *        × 경감(1 / (1 + 방어 또는 지력 × scale))
 *
 * 계열 간 상성표는 없다. 병종 차이는 특성(TraitData)으로 표현한다.
 */
export class DamageCalculator {
  constructor(
    private readonly balance: BalanceConfig,
    private readonly data: GameData,
  ) {}

  /** 공격자의 damage-dealt 특성과 방어자의 damage-taken 특성을 곱한다. */
  traitMultiplier(attacker: CharacterState, defender: CharacterState): number {
    let multiplier = 1;
    for (const id of attacker.traitIds) {
      const trait = this.data.traits[id];
      if (trait && trait.kind === 'damage-dealt' && traitApplies(trait, defender)) multiplier *= trait.multiplier;
    }
    for (const id of defender.traitIds) {
      const trait = this.data.traits[id];
      if (trait && trait.kind === 'damage-taken' && traitApplies(trait, attacker)) multiplier *= trait.multiplier;
    }
    return multiplier;
  }

  /**
   * 병력 보정. absolute(기본)는 모든 병종에 같은 기준 병력을 쓴다.
   * relative는 공격 스탯 기반 공격이면 상대 병력과 비교하고, 지력 기반 공격이면 내 최대 병력 대비 현재 병력만 본다.
   */
  troopMultiplier(attacker: CharacterState, defender: CharacterState, physical: boolean): number {
    const b = this.balance;
    if ((b.troopFactor.mode ?? 'absolute') === 'relative') {
      return physical ? relativeTroopFactor(b, this.strength(attacker), this.strength(defender)) : selfTroopFactor(b, attacker.troops, attacker.maxTroops);
    }
    return troopFactor(b, this.strength(attacker));
  }

  /**
   * 병력 보정에 쓰는 병력. 기본은 병종 병력 배율로 나눈 "환산 병력"이다 (징병 비용 때문에 병력이 적은 병종이 피해까지 약해지지 않도록).
   * balance.troopFactor.normalizeByScale가 false이면 실제 병력 수다.
   */
  strength(unit: CharacterState): number {
    if (this.balance.troopFactor.normalizeByScale === false) return unit.troops;
    const scale = this.data.unitTypes[unit.unitType]?.troopScale ?? 1;
    return unit.troops / (scale > 0 ? scale : 1);
  }

  /** 공격자 병종의 "대상 열에 따른 주는 피해" 보정 */
  rowMultiplier(attacker: CharacterState, defender: CharacterState): number {
    const by = this.data.unitTypes[attacker.unitType]?.damageDealtByRow;
    return by ? by[defender.row] : 1;
  }

  /** 공격 종류(물리/책략)에 따른 병종의 받는 피해 보정 */
  typeMultiplier(defender: CharacterState, physical: boolean): number {
    const by = this.data.unitTypes[defender.unitType]?.damageTakenByType;
    if (!by) return 1;
    return physical ? by.physical : by.magic;
  }

  /** 가드 상태(가드 확률 > 0)인 유닛이 받는 피해 보정 */
  guardMultiplier(defender: CharacterState): number {
    if (defender.guardRate <= 0) return 1;
    return this.data.unitTypes[defender.unitType]?.guard?.damageTaken ?? 1;
  }

  damage(attacker: CharacterState, defender: CharacterState, skill: SkillData, attackerMoraleShare: number): number {
    const b = this.balance;
    const physical = skill.scalesWith === 'attack';

    const attackStat = physical ? attacker.stats.attack : attacker.stats.intellect;
    const base = effectiveStat(b, attackStat) * b.damage.attackScale * skill.power;

    const defenseStat = physical
      ? Math.max(0, defender.stats.defense - (skill.ignoreDefense ?? 0))
      : defender.stats.intellect;
    const scale = physical ? b.damage.defenseScale : b.damage.resistScale;
    const mitigation = 1 / (1 + effectiveStat(b, defenseStat) * scale);

    const raw =
      base *
      this.traitMultiplier(attacker, defender) *
      this.rowMultiplier(attacker, defender) *
      this.troopMultiplier(attacker, defender, physical) *
      this.guardMultiplier(defender) *
      this.typeMultiplier(defender, physical) *
      moraleMultiplier(b, attackerMoraleShare) *
      mitigation;

    return Math.max(b.damage.minDamage, Math.round(raw));
  }

  /** 반격 비율. 병종의 counterRate가 있으면 그것을, 없으면 balance.counter.rate를 쓴다. */
  counterRate(counterer: CharacterState): number {
    return this.data.unitTypes[counterer.unitType]?.counterRate ?? this.balance.counter.rate;
  }

  /** 반격 피해. 반격자의 일반공격 피해에 반격 비율을 곱한다. 방어 무시는 반격에는 붙지 않는다. */
  counterDamage(counterer: CharacterState, target: CharacterState, skill: SkillData, countererMoraleShare: number): number {
    const plain = skill.ignoreDefense ? { ...skill, ignoreDefense: 0 } : skill;
    return Math.round(this.damage(counterer, target, plain, countererMoraleShare) * this.counterRate(counterer));
  }

  /** 병사 회복량. 기본은 병력 보정과 사기 보정을 받지 않고, heal.useTroopFactor를 켜면 시전자의 병력 보정을 곱한다. */
  heal(healer: CharacterState, skill: SkillData): number {
    const b = this.balance;
    const base = effectiveStat(b, healer.stats.intellect) * b.heal.scale * skill.power;
    if (!b.heal.useTroopFactor) return Math.round(base);
    const factor = (b.troopFactor.mode ?? 'absolute') === 'relative' ? selfTroopFactor(b, healer.troops, healer.maxTroops) : troopFactor(b, this.strength(healer));
    return Math.round(base * factor);
  }
}
