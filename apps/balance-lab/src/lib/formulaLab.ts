import { DamageCalculator, effectiveStat, moraleMultiplier } from '@samgukji/battle-engine';
import type { BalanceConfig, CharacterState, GameData, Row, SkillData } from '@samgukji/battle-engine';
import { referenceData, referenceUnit } from './matchup';

/**
 * 공식 실험대의 입력. 병종을 고르면 병종 값으로 채워지고, 각 값은 실험용으로 바꿀 수 있다 (데이터에는 저장되지 않는다).
 * 스탯은 장수 스탯 + 승급 길의 스탯 보정을 더한 "실제 스탯"이다.
 */
export interface FormulaInput {
  attacker: string;
  defender: string;
  /** 공격 쪽 스탯 (물리 공격이면 공격, 책략이면 지력) */
  attackStat: number;
  /** 방어 쪽 스탯 (물리 공격이면 방어, 책략이면 지력) */
  defenseStat: number;
  /** 공격 병종의 병종 보정 (원작식, 격차식의 병종 보정) */
  typeBonus: number;
  /** 방어 병종의 대상 취약 */
  vulnerability: number;
  /** 스킬 계수 */
  power: number;
  attackerTroops: number;
  defenderTroops: number;
  defenderRow: Row;
  guarding: boolean;
}

export interface FormulaResult {
  skill: SkillData;
  physical: boolean;
  /** 곡선을 거친 유효 스탯 */
  effAttack: number;
  effDefense: number;
  /** 원작식의 기본값 (하한 적용 전) */
  rawValue: number;
  /** 스킬 계수까지 곱한 기본 피해 */
  base: number;
  /** 격차식의 격차 배율 / 처음 공식의 방어 경감 (원작식은 1) */
  mitigation: number;
  troop: number;
  row: number;
  taken: number;
  guard: number;
  /** 병종 특성 × 사기 (보통 1) */
  other: number;
  damage: number;
  attackerMaxTroops: number;
  defenderMaxTroops: number;
  /** 같은 피해로 계속 때릴 때 방어 쪽 지금 병력이 전멸할 때까지의 횟수 */
  hitsToKill: number;
}

const SHARE = 50;

/** 고른 병종으로 실험대의 처음 값을 만든다 (기준 장수 스탯 + 병종 보정, 병종 카드의 병종 보정/취약, 스킬 계수, 최대 병력) */
export function defaultFormulaInput(data: GameData, balance: BalanceConfig, attacker: string, defender: string, stat: number, level: number, keep?: Pick<FormulaInput, 'defenderRow' | 'guarding'>): FormulaInput | null {
  const ref = referenceData(data, { stat, level, defenderRow: 'front', guarding: false });
  const aType = ref.unitTypes[attacker];
  const dType = ref.unitTypes[defender];
  if (!aType || !dType) return null;
  const skill = ref.skills[aType.basicSkillId];
  const physical = skill?.scalesWith !== 'intellect';
  const a = referenceUnit(ref, balance, 'attacker', attacker, null);
  const d = referenceUnit(ref, balance, 'defender', defender, null);
  const key = physical ? 'physical' : 'magic';
  return {
    attacker,
    defender,
    attackStat: physical ? a.stats.attack : a.stats.intellect,
    defenseStat: physical ? d.stats.defense : d.stats.intellect,
    typeBonus: aType.typeBonus?.[key] ?? 0,
    vulnerability: dType.vulnerability?.[key] ?? 0,
    power: skill?.power ?? 1,
    attackerTroops: a.maxTroops,
    defenderTroops: d.maxTroops,
    defenderRow: keep?.defenderRow ?? 'front',
    guarding: keep?.guarding ?? false,
  };
}

/** 실험값을 넣은 데이터 복사본과 군단을 만든다. 계산은 엔진의 DamageCalculator 그대로다 */
function setup(data: GameData, balance: BalanceConfig, input: FormulaInput, level: number) {
  const base = referenceData(data, { stat: 0, level, defenderRow: input.defenderRow, guarding: false });
  const aType = base.unitTypes[input.attacker];
  const dType = base.unitTypes[input.defender];
  const skill0 = base.skills[aType.basicSkillId];
  const physical = skill0.scalesWith !== 'intellect';
  const key = physical ? 'physical' : 'magic';
  const skill: SkillData = { ...skill0, power: input.power };
  const ref: GameData = {
    ...base,
    skills: { ...base.skills, [skill.id]: skill },
    unitTypes: {
      ...base.unitTypes,
      [aType.id]: { ...base.unitTypes[aType.id], typeBonus: { physical: 0, magic: 0, ...base.unitTypes[aType.id].typeBonus, [key]: input.typeBonus } },
    },
  };
  // 공격 병종과 방어 병종이 같으면 위에서 바꾼 병종에 취약을 덧붙인다
  ref.unitTypes[dType.id] = { ...ref.unitTypes[dType.id], vulnerability: { physical: 0, magic: 0, ...ref.unitTypes[dType.id].vulnerability, [key]: input.vulnerability } };

  const attacker: CharacterState = referenceUnit(ref, balance, 'attacker', aType.id, null);
  const defender: CharacterState = referenceUnit(ref, balance, 'defender', dType.id, input.defenderRow);
  if (physical) {
    attacker.stats = { ...attacker.stats, attack: input.attackStat };
    defender.stats = { ...defender.stats, defense: input.defenseStat };
  } else {
    attacker.stats = { ...attacker.stats, intellect: input.attackStat };
    defender.stats = { ...defender.stats, intellect: input.defenseStat };
  }
  attacker.troops = Math.max(1, Math.round(input.attackerTroops));
  defender.troops = Math.max(1, Math.round(input.defenderTroops));
  defender.guardRate = input.guarding && dType.guard ? Math.max(1, dType.guard.start) : 0;
  return { ref, calc: new DamageCalculator(balance, ref), attacker, defender, skill, physical };
}

/** 공격 스킬이 아니면 null */
export function computeFormula(data: GameData, balance: BalanceConfig, input: FormulaInput, level: number): FormulaResult | null {
  const aType = data.unitTypes[input.attacker];
  if (!aType || !data.unitTypes[input.defender] || data.skills[aType.basicSkillId]?.kind !== 'attack') return null;
  const { calc, attacker, defender, skill, physical } = setup(data, balance, input, level);
  const ignore = physical ? (skill.ignoreDefense ?? 0) : 0;
  const effAttack = effectiveStat(balance, input.attackStat);
  const effDefense = effectiveStat(balance, Math.max(0, input.defenseStat - ignore));
  const a = balance.damage.additive;
  const rawValue = a ? input.typeBonus + input.vulnerability + effAttack * (physical ? a.attackMul : a.intellectMul) - effDefense * (physical ? a.defenseMul : a.resistMul) : 0;
  const core = calc.core(attacker, defender, skill);
  const damage = calc.damage(attacker, defender, skill, SHARE);
  return {
    skill,
    physical,
    effAttack,
    effDefense,
    rawValue,
    base: core.base,
    mitigation: core.mitigation,
    troop: calc.troopMultiplier(attacker, defender, physical),
    row: calc.rowMultiplier(attacker, defender),
    taken: calc.typeMultiplier(defender, physical),
    guard: calc.guardMultiplier(defender),
    other: calc.traitMultiplier(attacker, defender) * moraleMultiplier(balance, SHARE),
    damage,
    attackerMaxTroops: attacker.maxTroops,
    defenderMaxTroops: defender.maxTroops,
    hitsToKill: Math.ceil(defender.troops / Math.max(1, damage)),
  };
}

/** 병력 보정 곡선: 공격 쪽 병력을 0~maxX로 바꿔 가며 병력 보정을 구한다 (나머지 입력은 그대로) */
export function troopCurve(data: GameData, balance: BalanceConfig, input: FormulaInput, level: number, maxX: number, samples = 80): { x: number; y: number }[] {
  const { calc, attacker, defender, physical } = setup(data, balance, input, level);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i <= samples; i++) {
    const x = Math.max(1, Math.round((maxX * i) / samples));
    out.push({ x, y: calc.troopMultiplier({ ...attacker, troops: x }, defender, physical) });
  }
  return out;
}

