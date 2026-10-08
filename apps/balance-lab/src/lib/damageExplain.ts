import { DEFAULT_ADDITIVE, DEFAULT_GAP, DamageCalculator, buildUnits, effectiveStat, moraleMultiplier, tieredTroops } from '@samgukji/battle-engine';
import type { BalanceConfig, CharacterState, GameData, Row } from '@samgukji/battle-engine';

export interface ExplainInput {
  attackerId: string;
  defenderId: string;
  skillId: string;
  /** 병력 (최대 병력 대비 %) */
  attackerPct: number;
  defenderPct: number;
  defenderRow: Row;
  defenderGuarding: boolean;
}

export interface ExplainRow {
  group: string;
  label: string;
  /** 숫자를 넣어 푼 식 */
  formula: string;
  value: string;
}

export interface DamageExplanation {
  rows: ExplainRow[];
  /** 엔진이 실제로 계산하는 최종 피해 (일반공격/책략이 한 번 맞을 때) */
  damage: number;
  counter: number;
  critical: number | null;
}

export type ExplainResult = { ok: true; explanation: DamageExplanation } | { ok: false; reason: string };

const round3 = (n: number) => Math.round(n * 1000) / 1000;
export const fmt = (n: number) => String(round3(n));

function makeUnit(data: GameData, balance: BalanceConfig, side: 'attacker' | 'defender', characterId: string, row: Row | null, pct: number, guarding: boolean): CharacterState {
  const character = data.characters[characterId];
  const type = data.unitTypes[character.unitType];
  // 배치 가능한 열로 만든 뒤 계산할 열로 덮어쓴다 (열 제한은 편성 규칙이고 피해 계산과는 무관하다)
  const [unit] = buildUnits(side, [{ characterId, row: type.allowedRows[0] }], data, balance);
  if (row) unit.row = row;
  unit.troops = Math.max(1, Math.round((unit.maxTroops * Math.min(100, Math.max(1, pct))) / 100));
  unit.guardRate = guarding && type.guard ? Math.max(1, type.guard.start) : 0;
  return unit;
}

/** 공격자/방어자/스킬을 고르면 지금 Lab 값으로 피해가 어떻게 계산되는지 한 단계씩 풀어 준다. 숫자는 모두 DamageCalculator에서 나온다. */
export function explainDamage(data: GameData, balance: BalanceConfig, input: ExplainInput): ExplainResult {
  const attackerChar = data.characters[input.attackerId];
  const defenderChar = data.characters[input.defenderId];
  const skill = data.skills[input.skillId];
  if (!attackerChar || !defenderChar) return { ok: false, reason: '공격자와 방어자를 고르세요.' };
  if (!skill || skill.kind !== 'attack') return { ok: false, reason: '공격 스킬을 고르세요.' };
  const aType = data.unitTypes[attackerChar.unitType];
  const dType = data.unitTypes[defenderChar.unitType];
  if (!aType || !dType) return { ok: false, reason: '병종을 찾을 수 없습니다.' };

  const attacker = makeUnit(data, balance, 'attacker', input.attackerId, null, input.attackerPct, false);
  const defender = makeUnit(data, balance, 'defender', input.defenderId, input.defenderRow, input.defenderPct, input.defenderGuarding);
  const calc = new DamageCalculator(balance, data);
  const physical = skill.scalesWith === 'attack';
  const share = 50;

  const rows: ExplainRow[] = [];
  const add = (group: string, label: string, formula: string, value: string) => rows.push({ group, label, formula, value });

  // ---- 입력 ----
  add('입력', '공격자', `${attackerChar.name} (${aType.name}) · ${skill.name} · 계수 ${fmt(skill.power)}`, `병력 ${attacker.troops} / ${attacker.maxTroops}`);
  add('입력', '방어자', `${defenderChar.name} (${dType.name}) · ${input.defenderRow === 'front' ? '전열' : '후열'}${input.defenderGuarding && dType.guard ? ' · 가드 중' : ''}`, `병력 ${defender.troops} / ${defender.maxTroops}`);

  // ---- 스탯 ----
  const statKey = physical ? 'attack' : 'intellect';
  const defKey = physical ? 'defense' : 'intellect';
  const statLabel = (k: 'attack' | 'defense' | 'intellect') => ({ attack: '공격', defense: '방어', intellect: '지력' })[k];
  const modOf = (type: typeof aType, k: 'attack' | 'defense' | 'intellect') => type.statMods?.[k] ?? 0;
  const aStat = attacker.stats[statKey];
  const ignore = physical ? (skill.ignoreDefense ?? 0) : 0;
  const dStatFull = defender.stats[defKey];
  const dStat = Math.max(0, dStatFull - ignore);
  add('스탯', `공격자 ${statLabel(statKey)}`, `장수 ${attackerChar.stats[statKey]} + 병종 보정 ${modOf(aType, statKey)}`, fmt(aStat));
  add('스탯', `방어자 ${physical ? '방어' : '지력 (책략은 지력으로 저항)'}`, `장수 ${defenderChar.stats[defKey]} + 병종 보정 ${modOf(dType, defKey)}${ignore > 0 ? ` − 방어 무시 ${ignore}` : ''}`, fmt(dStat));

  // ---- 기본 피해 ----
  const core = calc.core(attacker, defender, skill);
  const formula = balance.damage.formula ?? 'divide';
  const effA = effectiveStat(balance, aStat);
  const effD = effectiveStat(balance, dStat);
  const key = physical ? 'physical' : 'magic';
  if (formula === 'additive') {
    const a = balance.damage.additive ?? DEFAULT_ADDITIVE;
    const bonus = aType.typeBonus?.[key] ?? 0;
    const vul = dType.vulnerability?.[key] ?? 0;
    const mulA = physical ? a.attackMul : a.intellectMul;
    const mulD = physical ? a.defenseMul : a.resistMul;
    const raw = bonus + vul + effA * mulA - effD * mulD;
    add('기본 피해', '기본값 (원작식)', `병종 보정 ${bonus} + 대상 취약 ${vul} + ${fmt(effA)} × ${mulA} − ${fmt(effD)} × ${mulD} = ${fmt(raw)}`, fmt(Math.max(a.min, raw)) + (raw < a.min ? ` (하한 ${a.min} 적용)` : ''));
    add('기본 피해', '기본 피해', `기본값 ${fmt(Math.max(a.min, raw))} × 배율 ${a.scale} × 스킬 계수 ${fmt(skill.power)}`, fmt(core.base));
  } else if (formula === 'gap') {
    const g = balance.damage.gap ?? DEFAULT_GAP;
    const bonus = g.bonusDiv > 0 ? ((aType.typeBonus?.[key] ?? 0) + (dType.vulnerability?.[key] ?? 0)) / g.bonusDiv : 0;
    add('기본 피해', '기본 피해 (격차식)', g.baseMode === 'flat' ? `고정 ${g.flat} × 스킬 계수 ${fmt(skill.power)}` : `${fmt(effA)} × 공격 계수 ${balance.damage.attackScale} × 스킬 계수 ${fmt(skill.power)}`, fmt(core.base));
    const gapValue = effA - effD + bonus;
    add('격차 배율', '스탯 격차', `${fmt(effA)} − ${fmt(effD)}${g.bonusDiv > 0 ? ` + 병종 보정 ${fmt(bonus)}` : ''}`, fmt(gapValue));
    const rawMul = 1 + gapValue * g.perPoint;
    add('격차 배율', '격차 배율', `1 + ${fmt(gapValue)} × ${g.perPoint} = ${fmt(rawMul)}`, fmt(core.mitigation) + (rawMul < g.min ? ` (하한 ${g.min} 적용)` : ''));
  } else {
    add('기본 피해', '기본 피해 (처음 공식)', `${fmt(effA)} × 공격 계수 ${balance.damage.attackScale} × 스킬 계수 ${fmt(skill.power)}`, fmt(core.base));
    const scale = physical ? balance.damage.defenseScale : balance.damage.resistScale;
    add('기본 피해', '방어 경감', `1 ÷ (1 + ${fmt(effD)} × ${scale})`, fmt(core.mitigation));
  }

  // ---- 배수 ----
  const trait = calc.traitMultiplier(attacker, defender);
  const rowMul = calc.rowMultiplier(attacker, defender);
  const troop = calc.troopMultiplier(attacker, defender, physical);
  const guard = calc.guardMultiplier(defender);
  const type = calc.typeMultiplier(defender, physical);
  const morale = moraleMultiplier(balance, share);

  const mode = balance.troopFactor.mode ?? 'absolute';
  const strengthA = calc.strength(attacker);
  const strengthD = calc.strength(defender);
  let troopFormula: string;
  if (mode === 'tiered') troopFormula = `병력 ${fmt(strengthA)} → 유효 병력 ${fmt(tieredTroops(balance, strengthA))} ÷ ${balance.troopFactor.reference}`;
  else if (mode === 'relative')
    troopFormula = physical
      ? `(내 병력 ${fmt(strengthA)} ÷ 상대 병력 ${fmt(strengthD)})^${balance.troopFactor.relative?.exponent ?? 0.5}`
      : `내 병력 ${attacker.troops} ÷ 내 최대 병력 ${attacker.maxTroops}`;
  else troopFormula = `병력 ${fmt(strengthA)} ÷ ${balance.troopFactor.reference}`;
  add('배수', `병력 보정 (${mode === 'tiered' ? '구간식' : mode === 'relative' ? '상대 비교' : '절대'})`, troopFormula, `× ${fmt(troop)}`);
  add('배수', '대상 열 배수', `${aType.name}이(가) ${input.defenderRow === 'front' ? '전열' : '후열'}을 칠 때 (병종 "주는 피해")`, `× ${fmt(rowMul)}`);
  add('배수', '받는 피해 배수', `${dType.name}이(가) ${physical ? '물리 공격' : '책략'}으로 맞을 때 (병종 "받는 피해")`, `× ${fmt(type)}`);
  add('배수', '가드 배수', input.defenderGuarding && dType.guard ? `${dType.name} 가드 중 받는 피해` : '가드 중이 아님', `× ${fmt(guard)}`);
  if (trait !== 1) add('배수', '병종 특성', '공격자/방어자 특성', `× ${fmt(trait)}`);
  if (morale !== 1) add('배수', '사기 보정', `사기 ${share}%`, `× ${fmt(morale)}`);

  // ---- 결과 ----
  const product = core.base * core.mitigation * trait * rowMul * troop * guard * type * morale;
  const damage = calc.damage(attacker, defender, skill, share);
  const capped = Math.round(product) > damage && damage === Math.max(attacker.troops, balance.damage.minDamage);
  add('결과', '곱한 값', `${fmt(core.base)} × ${fmt(core.mitigation)} × ${fmt(troop)} × ${fmt(rowMul)} × ${fmt(type)} × ${fmt(guard)}${trait !== 1 ? ` × ${fmt(trait)}` : ''}${morale !== 1 ? ` × ${fmt(morale)}` : ''}`, fmt(product));
  add('결과', '최종 피해', `반올림, 최소 ${balance.damage.minDamage}${capped ? ', 공격자의 현재 병력을 넘지 않음 (구간식)' : ''}`, fmt(damage));
  const applied = Math.min(damage, defender.troops);
  add('결과', '맞은 뒤 방어자 병력', `${defender.troops} − ${applied}${applied < damage ? ' (남은 병력까지만 깎임)' : ''}`, `${defender.troops - applied} / ${defender.maxTroops} (${Math.round((applied / defender.maxTroops) * 100)}% 손실)`);

  let critical: number | null = null;
  const crit = balance.critical;
  if (crit && crit.chance > 0) {
    critical = Math.round(damage * crit.multiplier);
    add('크리티컬', '크리티컬이 나면', `${fmt(damage)} × ${crit.multiplier} (${crit.chance}% 확률)`, fmt(critical));
  }

  // ---- 반격 ----
  let counter = 0;
  const counterSkill = data.skills[dType.basicSkillId];
  if (!skill.counterable) add('반격', '반격', '이 스킬은 반격을 받지 않습니다 (스킬 표의 "반격 받음")', '0');
  else if (!dType.canCounter) add('반격', '반격', `${dType.name}은(는) 반격하지 않습니다 (병종 "반격함")`, '0');
  else if (!counterSkill || counterSkill.kind !== 'attack') add('반격', '반격', '반격할 일반공격이 없습니다', '0');
  else if (defender.troops - applied <= 0) add('반격', '반격', '방어자가 전멸해서 반격하지 못합니다', '0');
  else {
    const rate = calc.counterRate(skill);
    const plain = calc.damage(defender, attacker, { ...counterSkill, power: 1, ignoreDefense: 0 }, share);
    counter = calc.counterDamage(defender, attacker, counterSkill, skill, share);
    add('반격', '반격 피해', `방어자가 공격자를 계수 1로 친 피해 ${fmt(plain)} (맞기 전 병력 ${defender.troops}) × 반격 비율 ${fmt(rate)}`, fmt(counter));
    add('반격', '공격자 병력 변화', `${attacker.troops} − ${Math.min(counter, attacker.troops)}`, `${Math.max(0, attacker.troops - counter)} / ${attacker.maxTroops}`);
  }

  return { ok: true, explanation: { rows, damage, counter, critical } };
}
