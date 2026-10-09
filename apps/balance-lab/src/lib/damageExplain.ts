import { DEFAULT_ADDITIVE, DEFAULT_GAP, DamageCalculator, buildUnits, effectiveStat, moraleMultiplier, tieredTroops } from '@samgukji/battle-engine';
import { promotionChain, statModsTotal } from '@samgukji/battle-engine';
import type { BalanceConfig, CharacterState, GameData, Row } from '@samgukji/battle-engine';
import type { LabTab } from '../lab/NavContext';

export interface ExplainInput {
  attackerId: string;
  /** 이 계산에서 공격자가 맡는 병종 (승급 단계). 생략하면 장수의 병종 */
  attackerUnitType?: string;
  defenderId: string;
  defenderUnitType?: string;
  skillId: string;
  /** 병력 (최대 병력 대비 %) */
  attackerPct: number;
  defenderPct: number;
  defenderRow: Row;
  defenderGuarding: boolean;
  /** 실제 전투의 한 장면을 풀어 볼 때: 군단 레벨과 병력(명)을 그대로 쓴다. 주면 Pct 대신 쓴다 */
  attackerLevel?: number;
  defenderLevel?: number;
  attackerTroops?: number;
  defenderTroops?: number;
}

export interface ExplainRow {
  group: string;
  label: string;
  /** 숫자를 넣어 푼 식 */
  formula: string;
  value: string;
}

/** 공식에 들어가는 값 하나와 그 출처 */
export interface SourceRow {
  label: string;
  value: string;
  /** 어느 탭의 어느 칸에서 가져오는지 */
  where: string;
  tab: LabTab;
  /** 수정하러 갈 때 스크롤할 요소의 CSS 선택자 */
  anchor?: string;
  /** 지금 설정에서 실제 계산에 쓰이는가 */
  used: boolean;
  /** 어떻게 쓰이는지, 또는 왜 안 쓰이는지 */
  note: string;
}

export interface DamageExplanation {
  rows: ExplainRow[];
  sources: SourceRow[];
  /** 엔진이 실제로 계산하는 최종 피해 (일반공격/책략이 한 번 맞을 때) */
  damage: number;
  counter: number;
  critical: number | null;
}

export type ExplainResult = { ok: true; explanation: DamageExplanation } | { ok: false; reason: string };

const round3 = (n: number) => Math.round(n * 1000) / 1000;
export const fmt = (n: number) => String(round3(n));

function makeUnit(data: GameData, balance: BalanceConfig, side: 'attacker' | 'defender', characterId: string, unitTypeId: string, row: Row | null, pct: number, guarding: boolean, level?: number, troops?: number): CharacterState {
  const type = data.unitTypes[unitTypeId];
  // 배치 가능한 열로 만든 뒤 계산할 열로 덮어쓴다 (열 제한은 편성 규칙이고 피해 계산과는 무관하다)
  const [unit] = buildUnits(side, [{ characterId, row: type.allowedRows[0], unitType: unitTypeId, ...(level !== undefined ? { level } : {}) }], data, balance);
  if (row) unit.row = row;
  unit.troops = troops !== undefined ? Math.max(1, Math.round(troops)) : Math.max(1, Math.round((unit.maxTroops * Math.min(100, Math.max(1, pct))) / 100));
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
  const aType = data.unitTypes[input.attackerUnitType ?? attackerChar.unitType];
  const dType = data.unitTypes[input.defenderUnitType ?? defenderChar.unitType];
  if (!aType || !dType) return { ok: false, reason: '병종을 찾을 수 없습니다.' };

  const attacker = makeUnit(data, balance, 'attacker', input.attackerId, aType.id, null, input.attackerPct, false, input.attackerLevel, input.attackerTroops);
  const defender = makeUnit(data, balance, 'defender', input.defenderId, dType.id, input.defenderRow, input.defenderPct, input.defenderGuarding, input.defenderLevel, input.defenderTroops);
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
  /** 승급 길의 스탯 보정 합을 "뿌리 → ... → 지금" 순서의 설명으로 만든다 */
  const modText = (type: typeof aType, k: 'attack' | 'defense' | 'intellect') => {
    const chain = promotionChain(data.unitTypes, type.id);
    const parts = chain.map((u) => `${u.name} ${modOf(u, k)}`).join(' + ');
    return chain.length > 1 ? `승급 길 스탯 보정 ${statModsTotal(data.unitTypes, type.id)[k]} (${parts})` : `병종 보정 ${modOf(type, k)}`;
  };
  const aStat = attacker.stats[statKey];
  const ignore = physical ? (skill.ignoreDefense ?? 0) : 0;
  const dStatFull = defender.stats[defKey];
  const dStat = Math.max(0, dStatFull - ignore);
  add('스탯', `공격자 ${statLabel(statKey)}`, `장수 ${attackerChar.stats[statKey]} + ${modText(aType, statKey)}`, fmt(aStat));
  add('스탯', `방어자 ${physical ? '방어' : '지력 (책략은 지력으로 저항)'}`, `장수 ${defenderChar.stats[defKey]} + ${modText(dType, defKey)}${ignore > 0 ? ` − 방어 무시 ${ignore}` : ''}`, fmt(dStat));

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
  if (mode === 'ratio') troopFormula = `병력 ${attacker.troops} ÷ 최대 병력 ${attacker.maxTroops} = ${Math.round((attacker.troops / attacker.maxTroops) * 100)}% → 구간별 효율${attacker.troops < (balance.troopFactor.ratio?.floorTroops ?? 0) ? ' (하한 병력 아래라 하한)' : ''}`;
  else if (mode === 'tiered') troopFormula = `병력 ${fmt(strengthA)} → 유효 병력 ${fmt(tieredTroops(balance, strengthA))} ÷ ${balance.troopFactor.reference}`;
  else if (mode === 'relative')
    troopFormula = physical
      ? `(내 병력 ${fmt(strengthA)} ÷ 상대 병력 ${fmt(strengthD)})^${balance.troopFactor.relative?.exponent ?? 0.5}`
      : `내 병력 ${attacker.troops} ÷ 내 최대 병력 ${attacker.maxTroops}`;
  else troopFormula = `병력 ${fmt(strengthA)} ÷ ${balance.troopFactor.reference}`;
  add('배수', `병력 보정 (${mode === 'ratio' ? '비율 구간식' : mode === 'tiered' ? '구간식' : mode === 'relative' ? '상대 비교' : '절대'})`, troopFormula, `× ${fmt(troop)}`);
  add('배수', '대상 열 배수', `${aType.name}이(가) ${input.defenderRow === 'front' ? '전열' : '후열'}을 칠 때 (병종 "주는 피해")`, `× ${fmt(rowMul)}`);
  add('배수', '받는 피해 배수', `${dType.name}이(가) ${physical ? '물리 공격' : '책략'}으로 맞을 때 (병종 "받는 피해")`, `× ${fmt(type)}`);
  add('배수', '가드 배수', input.defenderGuarding && dType.guard ? `${dType.name} 가드 중 받는 피해` : '가드 중이 아님', `× ${fmt(guard)}`);
  if (trait !== 1) add('배수', '병종 특성', '공격자/방어자 특성', `× ${fmt(trait)}`);
  if (morale !== 1) add('배수', '사기 보정', `사기 ${share}%`, `× ${fmt(morale)}`);

  // ---- 결과 ----
  const product = core.base * core.mitigation * trait * rowMul * troop * guard * type * morale;
  const singleDamage = calc.damage(attacker, defender, skill, share);
  const rowRatio = (skill.rowAttack ?? 0) > 0 ? skill.rowAttack! : 1;
  const damage = rowRatio === 1 ? singleDamage : Math.round(singleDamage * rowRatio); // 열 공격은 각 군단 피해에 비율을 곱한다 (엔진과 같다)
  const capped = Math.round(product) > singleDamage && singleDamage === Math.max(attacker.troops, balance.damage.minDamage);
  add('결과', '곱한 값', `${fmt(core.base)} × ${fmt(core.mitigation)} × ${fmt(troop)} × ${fmt(rowMul)} × ${fmt(type)} × ${fmt(guard)}${trait !== 1 ? ` × ${fmt(trait)}` : ''}${morale !== 1 ? ` × ${fmt(morale)}` : ''}`, fmt(product));
  add('결과', '최종 피해', `반올림, 최소 ${balance.damage.minDamage}${capped ? ', 공격자의 현재 병력을 넘지 않음 (구간식)' : ''}`, fmt(singleDamage));
  if (rowRatio !== 1) add('결과', '열 공격 비율', `${fmt(singleDamage)} × ${fmt(rowRatio)} (조준한 대상. 같은 열의 다른 군단은 각자 기준 피해 × ${fmt(rowRatio)})`, fmt(damage));
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
  if (!skill.counterable) add('반격', '반격', '이 스킬은 반격을 받지 않습니다 (스킬 표의 "반격 유발")', '0');
  else if (!dType.canCounter) add('반격', '반격', `${dType.name}은(는) 반격하지 않습니다 (병종 "반격함")`, '0');
  else if (!counterSkill || counterSkill.kind !== 'attack') add('반격', '반격', '반격할 일반공격이 없습니다', '0');
  else if (defender.troops - applied <= 0 && balance.counter.onDestroy !== true) add('반격', '반격', '방어자가 전멸해서 반격하지 못합니다 (밸런스의 "맞아서 전멸해도 반격"이 꺼져 있음)', '0');
  else {
    const rate = calc.counterRate(skill);
    const power = dType.counterPower ?? 1;
    const plain = calc.damage(defender, attacker, { ...counterSkill, power: 1, ignoreDefense: 0 }, share);
    counter = calc.counterDamage(defender, attacker, counterSkill, skill, share);
    add('반격', '반격 피해', `방어자가 공격자를 계수 1로 친 피해 ${fmt(plain)} (맞기 전 병력 ${defender.troops}) × 반격 비율 ${fmt(rate)}${power !== 1 ? ` × 반격 배율 ${fmt(power)}` : ''}`, fmt(counter));
    add('반격', '공격자 병력 변화', `${attacker.troops} − ${Math.min(counter, attacker.troops)}`, `${Math.max(0, attacker.troops - counter)} / ${attacker.maxTroops}`);
  }

  // ---- 공식에 들어가는 값과 출처 ----
  const sources: SourceRow[] = [];
  const unitAnchor = (id: string) => `[data-unittype="${id}"]`;
  const gapCfg = balance.damage.gap ?? DEFAULT_GAP;
  const typeBonusUsed = formula === 'additive' || (formula === 'gap' && gapCfg.bonusDiv > 0);
  const typeBonusNote = typeBonusUsed
    ? formula === 'additive'
      ? '원작식: 기본값에 더해집니다'
      : `격차식: (병종 보정 + 대상 취약) ÷ ${gapCfg.bonusDiv}만큼 격차에 더해집니다`
    : formula === 'gap'
      ? '격차식에서는 "병종 보정 나누기"가 0이라 쓰지 않습니다'
      : '처음 공식에서는 쓰지 않습니다';
  const kindName = physical ? '물리' : '책략';
  const src = (row: SourceRow) => sources.push(row);

  src({ label: `병종 보정 ${kindName} (공격 병종: ${aType.name})`, value: fmt(aType.typeBonus?.[key] ?? 0), where: `병종 · 스킬 탭 > ${aType.name} 카드 > 피해 배수 · 반격 > 병종 보정 ${kindName}`, tab: 'data', anchor: unitAnchor(aType.id), used: typeBonusUsed, note: typeBonusNote });
  src({ label: `대상 취약 ${kindName} (방어 병종: ${dType.name})`, value: fmt(dType.vulnerability?.[key] ?? 0), where: `병종 · 스킬 탭 > ${dType.name} 카드 > 피해 배수 · 반격 > 취약 ${kindName}`, tab: 'data', anchor: unitAnchor(dType.id), used: typeBonusUsed, note: typeBonusUsed ? '맞는 쪽 병종의 값이 더해집니다 (공격 병종의 것이 아닙니다)' : typeBonusNote });
  const modTotal = statModsTotal(data.unitTypes, aType.id);
  src({
    label: `스탯 보정 누적 (${aType.name})`,
    value: (['attack', 'defense', 'intellect', 'speed', 'action'] as const).map((k) => `${({ attack: '공', defense: '방', intellect: '지', speed: '속', action: '행' })[k]}${modTotal[k]}`).join(' '),
    where: `병종 · 스킬 탭 > 승급 길(${promotionChain(data.unitTypes, aType.id).map((u) => u.name).join(' → ')})의 각 카드 > 스탯 보정`,
    tab: 'data',
    anchor: unitAnchor(aType.id),
    used: true,
    note: '장수의 초기 스탯에 더해집니다. 앞 병종(기본 병종 → 1차 → 지금)의 보정을 모두 더한 값입니다',
  });
  src({ label: `주는 피해: 대상 ${input.defenderRow === 'front' ? '전열' : '후열'} (공격 병종: ${aType.name})`, value: `× ${fmt(rowMul)}`, where: `병종 · 스킬 탭 > ${aType.name} 카드 > 피해 배수 · 반격 > 주는 피해 대상 ${input.defenderRow === 'front' ? '전열' : '후열'}`, tab: 'data', anchor: unitAnchor(aType.id), used: true, note: '맞는 쪽이 있는 열에 따라 곱합니다' });
  src({ label: `받는 피해 ${kindName} (방어 병종: ${dType.name})`, value: `× ${fmt(type)}`, where: `병종 · 스킬 탭 > ${dType.name} 카드 > 피해 배수 · 반격 > 받는 ${kindName}`, tab: 'data', anchor: unitAnchor(dType.id), used: true, note: '공격 종류(물리/책략)에 따라 곱합니다' });
  if (dType.guard) src({ label: `가드 중 받는 피해 (방어 병종: ${dType.name})`, value: `× ${fmt(dType.guard.damageTaken ?? 1)}`, where: `병종 · 스킬 탭 > ${dType.name} 카드 > 가드 > 가드 피해 배수`, tab: 'data', anchor: unitAnchor(dType.id), used: input.defenderGuarding, note: input.defenderGuarding ? '방어자가 가드 중이라 곱합니다' : '방어자가 가드 중일 때만 곱합니다 (지금은 가드 중이 아님)' });
  src({ label: `스킬 계수 (${skill.name})`, value: fmt(skill.power), where: `병종 · 스킬 탭 > 스킬 표 > ${skill.name} > 계수`, tab: 'data', anchor: `[data-skill="${skill.id}"]`, used: true, note: '기본 피해에 곱합니다' });
  if ((skill.behindHit ?? 0) > 0) src({ label: `동시 타격 (${skill.name})`, value: `후열 × ${fmt(skill.behindHit ?? 0)}`, where: `병종 · 스킬 탭 > 스킬 표 > ${skill.name} > 동시 타격`, tab: 'data', anchor: `[data-skill="${skill.id}"]`, used: input.defenderRow === 'front', note: input.defenderRow === 'front' ? '전열 대상을 칠 때 같은 칸 번호 후열 군단도 함께 칩니다 (그 군단 기준 피해 × 이 값, 반격 없음)' : '후열을 직접 칠 때는 동시 타격이 없습니다' });
  if ((skill.rowAttack ?? 0) > 0) src({ label: `열 공격 (${skill.name})`, value: `각 군단 × ${fmt(skill.rowAttack ?? 0)}`, where: `병종 · 스킬 탭 > 스킬 표 > ${skill.name} > 열 공격`, tab: 'data', anchor: `[data-skill="${skill.id}"]`, used: true, note: '조준한 대상이 있는 열 전체를 칩니다. 위 계산의 피해는 조준한 대상 기준이고, 같은 열의 다른 군단은 각자 기준 피해에 이 비율을 곱합니다. 가드로 대신 맞기는 없습니다' });
  if (physical && (skill.ignoreDefense ?? 0) > 0) src({ label: `방어 무시 (${skill.name})`, value: fmt(skill.ignoreDefense ?? 0), where: `병종 · 스킬 탭 > 스킬 표 > ${skill.name} > 방어 무시`, tab: 'data', anchor: `[data-skill="${skill.id}"]`, used: true, note: '방어자의 방어에서 그만큼 뺍니다' });
  if (skill.counterable) src({ label: `반격 비율 (${skill.name})`, value: fmt(skill.counterRate ?? balance.counter.rate), where: `병종 · 스킬 탭 > 스킬 표 > ${skill.name} > 반격 비율`, tab: 'data', anchor: `[data-skill="${skill.id}"]`, used: dType.canCounter, note: dType.canCounter ? '방어자가 반격할 때 곱합니다' : `${dType.name}은(는) 반격하지 않습니다 (병종 카드의 "반격함")` });
  if (skill.counterable && dType.canCounter) src({ label: `반격 배율 (방어 병종: ${dType.name})`, value: `× ${fmt(dType.counterPower ?? 1)}`, where: `병종 · 스킬 탭 > ${dType.name} 카드 > 피해 배수 · 반격 > 반격 배율`, tab: 'data', anchor: unitAnchor(dType.id), used: true, note: '반격하는 병종의 세기: 반격 피해에 곱합니다 (반격 비율은 공격한 쪽 스킬의 값)' });
  src({
    label: '공식 계수',
    value: formula === 'gap' ? `공격 계수 ${balance.damage.attackScale}, 격차 1점당 ${gapCfg.perPoint}, 하한 ${gapCfg.min}` : formula === 'additive' ? `공격 ×${(balance.damage.additive ?? DEFAULT_ADDITIVE).attackMul}, 방어 ×${(balance.damage.additive ?? DEFAULT_ADDITIVE).defenseMul}` : `공격 계수 ${balance.damage.attackScale}, 방어 계수 ${balance.damage.defenseScale}`,
    where: '밸런스 탭 > 피해 공식',
    tab: 'balance',
    used: true,
    note: formula === 'gap' ? '격차식' : formula === 'additive' ? '원작식' : '처음 공식',
  });
  src({ label: '병력 보정 방식', value: mode === 'ratio' ? '비율 구간식' : mode === 'tiered' ? '구간식' : mode === 'relative' ? '상대 비교' : '절대', where: '밸런스 탭 > 병력', tab: 'balance', used: true, note: balance.troopFactor.normalizeByScale === false ? '피해는 실제 병력 수로 계산합니다 (병력이 많은 병종이 더 셉니다)' : '병종 병력 배율은 피해에 영향을 주지 않습니다 (환산 병력)' });
  src({ label: `병력 배율 (${aType.name})`, value: `× ${fmt(aType.troopScale ?? 1)}`, where: `병종 · 스킬 탭 > ${aType.name} 카드 > 병력 배율`, tab: 'data', anchor: unitAnchor(aType.id), used: true, note: balance.troopFactor.normalizeByScale === false ? '최대 병력을 정하고, 실제 병력이 많으면 피해도 큽니다' : '최대 병력(HP)만 정하고 피해에는 영향이 없습니다' });
  if (balance.critical && balance.critical.chance > 0) src({ label: '크리티컬', value: `${balance.critical.chance}% 확률로 ×${balance.critical.multiplier}`, where: '밸런스 탭 > 피해 공식 > 모든 공식에 공통', tab: 'balance', used: true, note: '반격과 치유에는 적용되지 않습니다' });

  return { ok: true, explanation: { rows, sources, damage, counter, critical } };
}
