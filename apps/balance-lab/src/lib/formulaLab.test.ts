import { describe, expect, it } from 'vitest';
import { createDefaultState } from '../lab/defaults';
import { computeFormula, defaultFormulaInput, troopCurve } from './formulaLab';
import { matchupTable } from './matchup';

const { data, balance } = createDefaultState();
const ids = Object.keys(data.unitTypes);
const attackers = ids.filter((id) => data.skills[data.unitTypes[id].basicSkillId]?.kind === 'attack');
const level = 15;
const stat = 6;

describe('공식 실험대', () => {
  it('병종 값 그대로면 상성표(엔진 계산)와 같은 피해가 나온다', () => {
    for (const a of attackers.slice(0, 7))
      for (const d of ids.slice(0, 7)) {
        const input = defaultFormulaInput(data, balance, a, d, stat, level)!;
        const result = computeFormula(data, balance, input, level)!;
        const [cell] = matchupTable(data, balance, [a], [d], { stat, level, defenderRow: 'front', guarding: false })[0];
        // 상성표는 열 공격 비율을 곱한 값이다
        const rowAttack = data.skills[data.unitTypes[a].basicSkillId].rowAttack ?? 0;
        expect(rowAttack > 0 ? Math.round(result.damage * rowAttack) : result.damage).toBe(cell.damage);
      }
  });

  it('공격 스탯을 올리면 피해가 줄지 않고, 방어 스탯을 올리면 늘지 않는다', () => {
    const input = defaultFormulaInput(data, balance, attackers[0], ids[0], stat, level)!;
    const base = computeFormula(data, balance, input, level)!.damage;
    expect(computeFormula(data, balance, { ...input, attackStat: input.attackStat + 3 }, level)!.damage).toBeGreaterThanOrEqual(base);
    expect(computeFormula(data, balance, { ...input, defenseStat: input.defenseStat + 3 }, level)!.damage).toBeLessThanOrEqual(base);
  });

  it('스킬 계수를 두 배로 하면 기본 피해가 두 배가 된다', () => {
    const input = defaultFormulaInput(data, balance, attackers[0], ids[0], stat, level)!;
    const one = computeFormula(data, balance, input, level)!;
    const two = computeFormula(data, balance, { ...input, power: input.power * 2 }, level)!;
    expect(two.base).toBeCloseTo(one.base * 2, 6);
  });

  it('원작식에서 병종 보정을 1 올리면 기본값이 1 오른다 (실험값은 데이터를 바꾸지 않는다)', () => {
    const additive = { ...balance, damage: { ...balance.damage, formula: 'additive' as const } };
    const input = defaultFormulaInput(data, additive, attackers[0], ids[0], stat, level)!;
    const before = JSON.stringify(data.unitTypes);
    const r1 = computeFormula(data, additive, input, level)!;
    const r2 = computeFormula(data, additive, { ...input, typeBonus: input.typeBonus + 1 }, level)!;
    expect(r2.rawValue - r1.rawValue).toBeCloseTo(1, 6);
    expect(JSON.stringify(data.unitTypes)).toBe(before);
  });

  it('병력 보정 곡선의 각 점은 그 병력에서 계산한 병력 보정과 같다', () => {
    const input = defaultFormulaInput(data, balance, attackers[0], ids[1], stat, level)!;
    const curve = troopCurve(data, balance, input, level, 3000, 10);
    expect(curve).toHaveLength(11);
    for (const p of curve.slice(1)) expect(p.y).toBeCloseTo(computeFormula(data, balance, { ...input, attackerTroops: p.x }, level)!.troop, 9);
  });
});
