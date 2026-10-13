import { describe, expect, it } from 'vitest';
import { DamageCalculator, buildUnits } from '@samgukji/battle-engine';
import type { BalanceConfig } from '@samgukji/battle-engine';
import { defaultBalance, gameData } from '@samgukji/game-data';
import { explainDamage } from './damageExplain';
import type { ExplainInput } from './damageExplain';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const base: ExplainInput = {
  attackerId: 'guanYu',
  defenderId: 'xuChu',
  skillId: 'cavalry-charge',
  attackerPct: 100,
  defenderPct: 100,
  defenderRow: 'front',
  defenderGuarding: false,
};

function actual(balance: BalanceConfig, input: ExplainInput) {
  const calc = new DamageCalculator(balance, gameData);
  const [a] = buildUnits('attacker', [{ characterId: input.attackerId, row: gameData.unitTypes[gameData.characters[input.attackerId].unitType].allowedRows[0] }], gameData, balance);
  const [d] = buildUnits('defender', [{ characterId: input.defenderId, row: gameData.unitTypes[gameData.characters[input.defenderId].unitType].allowedRows[0] }], gameData, balance);
  d.row = input.defenderRow;
  d.guardRate = 0; // 편성에서는 방패병이 가드 50%로 시작하지만 계산기는 가드 중이 아닌 상태를 기본으로 한다
  return calc.damage(a, d, gameData.skills[input.skillId], 50);
}

describe('피해 계산기 (explainDamage)', () => {
  it('세 공식 모두 엔진이 실제로 계산하는 피해와 같은 값을 보여 준다', () => {
    for (const formula of ['gap', 'additive', 'divide'] as const) {
      const balance = clone(defaultBalance);
      balance.damage.formula = formula;
      const r = explainDamage(gameData, balance, base);
      if (!r.ok) throw new Error(r.reason);
      expect(r.explanation.damage, formula).toBe(actual(balance, base));
      expect(r.explanation.rows.some((row) => row.label === '최종 피해' && row.value === String(r.explanation.damage)), formula).toBe(true);
    }
  });

  it('병종 값을 바꾸면 계산이 따라 바뀐다 (받는 피해 배수)', () => {
    const before = explainDamage(gameData, defaultBalance, base);
    const data = clone(gameData);
    // 줄이는 쪽으로 바꾼다 (올리면 피해가 공격자의 현재 병력으로 잘릴 수 있다)
    data.unitTypes.shield.damageTakenByType = { physical: 0.5, magic: 1 };
    const after = explainDamage(data, defaultBalance, base);
    if (!before.ok || !after.ok) throw new Error('explain failed');
    expect(after.explanation.damage).toBeLessThan(before.explanation.damage);
    expect(after.explanation.rows.find((r) => r.label === '받는 피해 배수')!.value).toBe('× 0.5');
  });

  it('가드 중이면 가드 배수가 붙고 피해가 줄어든다', () => {
    const plain = explainDamage(gameData, defaultBalance, base);
    const guarded = explainDamage(gameData, defaultBalance, { ...base, defenderGuarding: true });
    if (!plain.ok || !guarded.ok) throw new Error('explain failed');
    expect(guarded.explanation.damage).toBeLessThan(plain.explanation.damage);
    expect(guarded.explanation.rows.find((r) => r.label === '가드 배수')!.value).not.toBe('× 1');
  });

  it('반격: 반격하지 않는 스킬/병종에는 0과 이유를 보여 준다, 반격이 있으면 엔진 값과 같다', () => {
    // 궁병 화살은 반격을 받지 않는다
    const shot = explainDamage(gameData, defaultBalance, { ...base, attackerId: 'huangZhong', skillId: 'archer-shot' });
    if (!shot.ok) throw new Error(shot.reason);
    expect(shot.explanation.counter).toBe(0);
    expect(shot.explanation.rows.some((r) => r.group === '반격' && r.formula.includes('반격을 받지 않습니다'))).toBe(true);

    const melee = explainDamage(gameData, defaultBalance, { ...base, attackerId: 'liuBei', skillId: 'infantry-attack', defenderId: 'weiYan' });
    if (!melee.ok) throw new Error(melee.reason);
    expect(melee.explanation.counter).toBeGreaterThan(0);
  });

  it('공격 스킬이 아니면 안내 문구를 돌려준다', () => {
    const r = explainDamage(gameData, defaultBalance, { ...base, skillId: 'heal' });
    expect(r.ok).toBe(false);
  });

  it('반격 배율: 반격하는 병종의 값이 반격 피해에 곱해지고 출처 표에 나온다', () => {
    const data = clone(gameData);
    const input = { ...base, attackerId: 'liuBei', attackerUnitType: 'infantry', skillId: 'infantry-attack', defenderId: 'weiYan', defenderUnitType: 'infantry' };
    const plain = explainDamage(data, defaultBalance, input);
    data.unitTypes.infantry.counterPower = 2;
    const strong = explainDamage(data, defaultBalance, input);
    if (!plain.ok || !strong.ok) throw new Error('explain failed');
    expect(plain.explanation.counter).toBeGreaterThan(0);
    expect(Math.abs(strong.explanation.counter - plain.explanation.counter * 2)).toBeLessThanOrEqual(1); // 반올림 차이
    expect(strong.explanation.sources.some((r) => r.label.startsWith('반격 배율') && r.value === '× 2')).toBe(true);
    expect(strong.explanation.rows.some((r) => r.group === '반격' && r.formula.includes('반격 배율 2'))).toBe(true);
  });

  it('동시 타격: 전열 대상일 때만 쓰이고 출처 표에 나온다', () => {
    const input = { ...base, attackerId: 'liuBei', attackerUnitType: 'assault-infantry', skillId: 'assault-infantry-infantry-attack', defenderId: 'weiYan', defenderUnitType: 'infantry' };
    const front = explainDamage(gameData, defaultBalance, input);
    const back = explainDamage(gameData, defaultBalance, { ...input, defenderRow: 'back' });
    if (!front.ok || !back.ok) throw new Error('explain failed');
    const row = (r: typeof front) => r.explanation.sources.find((x) => x.label.startsWith('동시 타격'));
    expect(row(front)).toMatchObject({ used: true, value: `후열 × ${gameData.skills['assault-infantry-infantry-attack'].behindHit}` }); // Lab에서 고치는 값이라 데이터에서 읽는다
    expect(row(back)).toMatchObject({ used: false });
  });

  it('열 공격: 출처 표에 비율이 나오고 최종 피해는 단일 공격보다 비율만큼 낮다', () => {
    const input = { ...base, attackerId: 'huangZhong', attackerUnitType: 'crossbow', skillId: 'crossbow-archer-shot', defenderId: 'weiYan', defenderUnitType: 'infantry' };
    const row = explainDamage(gameData, defaultBalance, input);
    if (!row.ok) throw new Error(row.reason);
    expect(row.explanation.sources.some((x) => x.label.startsWith('열 공격') && x.used)).toBe(true);
    // 최종 피해는 엔진이 조준한 대상에게 주는 피해(열 공격 비율 적용)와 같다
    const engineDamage = (() => {
      const calc = new DamageCalculator(defaultBalance, gameData);
      const [a] = buildUnits('attacker', [{ characterId: 'huangZhong', row: 'front', unitType: 'crossbow' }], gameData, defaultBalance);
      const [d] = buildUnits('defender', [{ characterId: 'weiYan', row: 'front', unitType: 'infantry' }], gameData, defaultBalance);
      d.guardRate = 0;
      const skill = gameData.skills['crossbow-archer-shot'];
      return Math.round(calc.damage(a, d, skill, 50) * skill.rowAttack!);
    })();
    expect(row.explanation.damage).toBe(engineDamage);
  });
});
