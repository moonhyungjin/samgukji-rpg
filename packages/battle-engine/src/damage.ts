import { effectiveStat, moraleMultiplier, relativeTroopFactor, selfTroopFactor, tieredTroopFactor, troopFactor } from './stats';
import type { AdditiveDamage, BalanceConfig, CharacterState, GameData, SkillData, TraitData } from './types';

export const DEFAULT_ADDITIVE: AdditiveDamage = { attackMul: 10, defenseMul: 8, intellectMul: 10, resistMul: 7, min: 10, scale: 10 };

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
    const mode = b.troopFactor.mode ?? 'absolute';
    if (mode === 'tiered') return tieredTroopFactor(b, this.strength(attacker));
    if (mode === 'relative') {
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

  /**
   * 스탯과 병종으로 정해지는 핵심 피해 (스킬 계수 포함, 병력·열·가드 등 배수 전).
   * divide: 기준 스탯 × attackScale × 스킬 계수 ÷ (1 + 방어 × scale)
   * additive(원작 방식): (병종 보정 + 대상 취약 보정 + 공격 × attackMul − 방어 × defenseMul, 최소 min) × scale × 스킬 계수
   */
  core(attacker: CharacterState, defender: CharacterState, skill: SkillData): { base: number; mitigation: number } {
    const b = this.balance;
    const physical = skill.scalesWith === 'attack';
    const attackStat = physical ? attacker.stats.attack : attacker.stats.intellect;
    const defenseStat = physical ? Math.max(0, defender.stats.defense - (skill.ignoreDefense ?? 0)) : defender.stats.intellect;

    if (b.damage.formula === 'additive') {
      const a = b.damage.additive ?? DEFAULT_ADDITIVE;
      const key = physical ? 'physical' : 'magic';
      const typeBonus = this.data.unitTypes[attacker.unitType]?.typeBonus?.[key] ?? 0;
      const vulnerability = this.data.unitTypes[defender.unitType]?.vulnerability?.[key] ?? 0;
      const statPart = effectiveStat(b, attackStat) * (physical ? a.attackMul : a.intellectMul) - effectiveStat(b, defenseStat) * (physical ? a.defenseMul : a.resistMul);
      return { base: Math.max(a.min, typeBonus + vulnerability + statPart) * a.scale * skill.power, mitigation: 1 };
    }

    // divide: 곱하는 순서를 예전과 같게 두려고 경감(mitigation)은 따로 돌려주고 마지막에 곱한다 (반올림 결과 보존)
    const scale = physical ? b.damage.defenseScale : b.damage.resistScale;
    return { base: effectiveStat(b, attackStat) * b.damage.attackScale * skill.power, mitigation: 1 / (1 + effectiveStat(b, defenseStat) * scale) };
  }

  damage(attacker: CharacterState, defender: CharacterState, skill: SkillData, attackerMoraleShare: number): number {
    const b = this.balance;
    const physical = skill.scalesWith === 'attack';

    const { base, mitigation } = this.core(attacker, defender, skill);
    const raw =
      base *
      this.traitMultiplier(attacker, defender) *
      this.rowMultiplier(attacker, defender) *
      this.troopMultiplier(attacker, defender, physical) *
      this.guardMultiplier(defender) *
      this.typeMultiplier(defender, physical) *
      moraleMultiplier(b, attackerMoraleShare) *
      mitigation;

    const amount = Math.max(b.damage.minDamage, Math.round(raw));
    return this.capAtTroops() ? Math.min(amount, Math.max(attacker.troops, b.damage.minDamage)) : amount;
  }

  /** tiered 방식이고 capAtTroops이면 공격 피해가 공격자의 현재 병력을 넘지 않는다 (원작 규칙) */
  private capAtTroops(): boolean {
    const t = this.balance.troopFactor;
    return t.mode === 'tiered' && (t.tiered?.capAtTroops ?? true);
  }

  /** 반격 비율. 공격한 쪽 기술의 counterRate (원작처럼 기술마다 다르다). 없으면 balance.counter.rate */
  counterRate(attackSkill: SkillData): number {
    return attackSkill.counterRate ?? this.balance.counter.rate;
  }

  /**
   * 반격 피해 = 반격자가 공격자를 기본 계수(1)로 친 피해 × 공격 기술의 반격 비율.
   * 반격자의 일반공격 스킬은 계산 종류(공격/지력)만 쓰고, 계수와 방어 무시는 쓰지 않는다.
   * 반격자의 병력은 호출하는 쪽이 정한다 (엔진은 맞기 전 병력을 넘긴다).
   */
  counterDamage(counterer: CharacterState, target: CharacterState, counterSkill: SkillData, attackSkill: SkillData, countererMoraleShare: number): number {
    const plain = { ...counterSkill, power: 1, ignoreDefense: 0 };
    return Math.round(this.damage(counterer, target, plain, countererMoraleShare) * this.counterRate(attackSkill));
  }

  /** 병사 회복량. 기본은 병력 보정과 사기 보정을 받지 않고, heal.useTroopFactor를 켜면 시전자의 병력 보정을 곱한다. */
  heal(healer: CharacterState, skill: SkillData): number {
    const b = this.balance;
    const base = effectiveStat(b, healer.stats.intellect) * b.heal.scale * skill.power;
    if (!b.heal.useTroopFactor) return Math.round(base);
    const mode = b.troopFactor.mode ?? 'absolute';
    const factor =
      mode === 'relative' ? selfTroopFactor(b, healer.troops, healer.maxTroops) : mode === 'tiered' ? tieredTroopFactor(b, this.strength(healer)) : troopFactor(b, this.strength(healer));
    return Math.round(base * factor);
  }
}
