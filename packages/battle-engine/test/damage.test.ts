import { describe, expect, it } from 'vitest';
import { DamageCalculator } from '../src';
import { makeUnit, testBalance, testData } from './fixtures';

const calc = new DamageCalculator(testBalance, testData);
const hit = testData.skills.hit;
const mind = testData.skills.mind;
const stats = (attack: number, defense: number, intellect: number) => ({
  attack,
  defense,
  intellect,
  speed: 5,
  action: 8,
  diplomacy: 5,
  politics: 5,
  charm: 5,
});

describe('DamageCalculator.damage', () => {
  // 공격 5, 방어 5: 5 × 10 × 1 × (1 / 1.5) = 33.33
  it('기준 피해: 병력 1000, 사기 50, 특성 없음', () => {
    expect(calc.damage(makeUnit(), makeUnit(), hit, 50)).toBe(33);
  });

  it('계열이 달라도 특성이 없으면 피해가 같다 (상성표 없음)', () => {
    const cavalry = makeUnit({ family: 'cavalry' });
    expect(calc.damage(cavalry, makeUnit({ family: 'archer' }), hit, 50)).toBe(33);
    expect(calc.damage(cavalry, makeUnit({ family: 'infantry' }), hit, 50)).toBe(33);
  });

  it('병력이 줄면 피해가 줄고, 하한/상한으로 제한된다', () => {
    expect(calc.damage(makeUnit({ troops: 500 }), makeUnit(), hit, 50)).toBe(17);
    expect(calc.damage(makeUnit({ troops: 100 }), makeUnit(), hit, 50)).toBe(10);
    expect(calc.damage(makeUnit({ troops: 5000 }), makeUnit(), hit, 50)).toBe(58);
  });

  it('방어가 높을수록 피해가 줄어든다', () => {
    const low = calc.damage(makeUnit(), makeUnit({ stats: stats(5, 0, 5) }), hit, 50);
    const high = calc.damage(makeUnit(), makeUnit({ stats: stats(5, 10, 5) }), hit, 50);
    expect(low).toBeGreaterThan(high);
  });

  it('최소 피해는 1이다', () => {
    expect(calc.damage(makeUnit({ stats: stats(0, 5, 5) }), makeUnit(), hit, 50)).toBe(1);
  });

  it('책략은 공격자의 지력과 대상의 지력(저항)을 쓰고 방어는 무시한다', () => {
    const caster = makeUnit({ stats: stats(1, 1, 8) });
    const lowDefense = calc.damage(caster, makeUnit({ stats: stats(5, 0, 5) }), mind, 50);
    const highDefense = calc.damage(caster, makeUnit({ stats: stats(5, 10, 5) }), mind, 50);
    expect(lowDefense).toBe(53); // 8 × 10 / 1.5
    expect(highDefense).toBe(53);
    expect(calc.damage(caster, makeUnit({ stats: stats(5, 5, 10) }), mind, 50)).toBeLessThan(53);
  });

  it('사기가 높은 편의 피해가 커진다', () => {
    expect(calc.damage(makeUnit(), makeUnit(), hit, 100)).toBe(37);
    expect(calc.damage(makeUnit(), makeUnit(), hit, 0)).toBe(30);
  });
});

describe('병종 특성', () => {
  it('damage-dealt: 조건에 맞는 대상에게만 피해가 늘어난다 (창병 → 기병)', () => {
    const spear = makeUnit({ traitIds: ['antiCav'] });
    expect(calc.damage(spear, makeUnit({ family: 'cavalry' }), hit, 50)).toBe(42); // 33.33 × 1.25
    expect(calc.damage(spear, makeUnit({ family: 'infantry' }), hit, 50)).toBe(33);
  });

  it('damage-taken: 조건에 맞는 공격자에게 맞을 때 피해가 늘어난다 (원거리 취약)', () => {
    const fragile = makeUnit({ traitIds: ['fragile'], family: 'archer' });
    expect(calc.damage(makeUnit({ family: 'cavalry' }), fragile, hit, 50)).toBe(50); // 33.33 × 1.5
    expect(calc.damage(makeUnit({ family: 'archer' }), fragile, hit, 50)).toBe(33);
  });

  it('versus.rows: 상대의 열 조건도 쓸 수 있다', () => {
    const striker = makeUnit({ traitIds: ['frontOnly'] });
    expect(calc.damage(striker, makeUnit({ row: 'front' }), hit, 50)).toBe(67);
    expect(calc.damage(striker, makeUnit({ row: 'back' }), hit, 50)).toBe(33);
  });

  it('조건 목록이 비어 있으면 모든 상대에게 적용된다', () => {
    const data = { ...testData, traits: { any: { id: 'any', name: '무조건', kind: 'damage-dealt' as const, versus: { families: [], rows: [] }, multiplier: 2 } } };
    const anyCalc = new DamageCalculator(testBalance, data);
    expect(anyCalc.damage(makeUnit({ traitIds: ['any'] }), makeUnit({ family: 'archer' }), hit, 50)).toBe(67);
  });

  it('여러 특성은 곱해지고, 존재하지 않는 특성 id는 무시한다', () => {
    const spear = makeUnit({ traitIds: ['antiCav', 'missing'] });
    const fragileCav = makeUnit({ family: 'cavalry', traitIds: ['fragile'] });
    // 33.33 × 1.25 (대기병) × 1.5 (공격자가 보병 계열이라 취약 적용)
    expect(calc.damage(spear, fragileCav, hit, 50)).toBe(63); // 62.5 반올림
  });
});

describe('DamageCalculator.counterDamage / heal', () => {
  it('반격 피해는 반격자 일반공격 피해 × counter.rate', () => {
    expect(calc.counterDamage(makeUnit(), makeUnit(), hit, 50)).toBe(Math.round(33 * 0.5));
  });

  it('회복량은 지력 × scale × 스킬 계수 (기본은 병력 보정 없음)', () => {
    const healer = makeUnit({ stats: stats(1, 1, 6), troops: 100 });
    expect(calc.heal(healer, testData.skills.mend)).toBe(60);
  });

  it('heal.useTroopFactor를 켜면 시전자의 병력 보정이 곱해진다', () => {
    const scaled = new DamageCalculator({ ...testBalance, heal: { scale: 10, useTroopFactor: true } }, testData);
    expect(scaled.heal(makeUnit({ stats: stats(1, 1, 6), troops: 500 }), testData.skills.mend)).toBe(30);
    expect(scaled.heal(makeUnit({ stats: stats(1, 1, 6), troops: 1000 }), testData.skills.mend)).toBe(60);
    expect(scaled.heal(makeUnit({ stats: stats(1, 1, 6), troops: 50 }), testData.skills.mend)).toBe(18); // 하한 0.3
  });
});

describe('가드 상태의 받는 피해 보정', () => {
  const data = {
    ...testData,
    unitTypes: {
      ...testData.unitTypes,
      shield: { ...testData.unitTypes.shield, guard: { start: 50, gain: 70, decay: 40, damageTaken: 0.5 } },
    },
  };
  const guarded = new DamageCalculator(testBalance, data);

  it('가드 확률이 있는 동안 받는 피해에 damageTaken을 곱한다', () => {
    const target = makeUnit({ unitType: 'shield', guardRate: 50 });
    expect(guarded.damage(makeUnit(), target, hit, 50)).toBe(17); // 33.33 × 0.5
    expect(guarded.damage(makeUnit(), target, mind, 50)).toBe(17); // 책략도 같다
  });

  it('가드 확률이 0이면(공격해서 해제) 보정이 없다', () => {
    expect(guarded.damage(makeUnit(), makeUnit({ unitType: 'shield', guardRate: 0 }), hit, 50)).toBe(33);
  });

  it('damageTaken을 생략하면 피해가 줄지 않는다', () => {
    expect(calc.damage(makeUnit(), makeUnit({ unitType: 'shield', guardRate: 50 }), hit, 50)).toBe(33);
  });
});

describe('방어 무시 (ignoreDefense)', () => {
  const pierce = { ...hit, ignoreDefense: 2 };
  // 공격 5 × 10 = 50. 방어 5 → 50/1.5 = 33, 방어 5-2=3 → 50/1.3 = 38
  it('물리 공격이 대상의 방어를 그만큼 무시한다', () => {
    expect(calc.damage(makeUnit(), makeUnit(), hit, 50)).toBe(33);
    expect(calc.damage(makeUnit(), makeUnit(), pierce, 50)).toBe(38);
  });

  it('방어가 0 아래로는 내려가지 않는다', () => {
    const lowDef = makeUnit({ stats: stats(5, 1, 5) });
    expect(calc.damage(makeUnit(), lowDef, pierce, 50)).toBe(50);
  });

  it('지력 계열 공격(책략)에는 영향이 없다', () => {
    const magic = { ...mind, ignoreDefense: 3 };
    expect(calc.damage(makeUnit(), makeUnit(), magic, 50)).toBe(calc.damage(makeUnit(), makeUnit(), mind, 50));
  });
});

describe('공격 종류별 받는 피해 배수 (damageTakenByType)', () => {
  const data = {
    ...testData,
    unitTypes: {
      ...testData.unitTypes,
      str: { ...testData.unitTypes.str, damageTakenByType: { physical: 1.2, magic: 0.8 } },
      inf: { ...testData.unitTypes.inf, damageTakenByType: { physical: 1, magic: 1.1 } },
    },
  };
  const typed = new DamageCalculator(testBalance, data);
  const caster = makeUnit({ unitType: 'str' });
  const fighter = makeUnit({ unitType: 'inf' });

  it('물리 공격은 physical 배수를, 책략은 magic 배수를 곱한다', () => {
    expect(typed.damage(makeUnit(), caster, hit, 50)).toBe(40); // 33.33 × 1.2
    expect(typed.damage(makeUnit(), caster, mind, 50)).toBe(27); // 33.33 × 0.8
    expect(typed.damage(makeUnit(), fighter, hit, 50)).toBe(33); // ×1
    expect(typed.damage(makeUnit(), fighter, mind, 50)).toBe(37); // ×1.1
  });

  it('배수를 생략하면 피해가 변하지 않는다', () => {
    expect(calc.damage(makeUnit(), makeUnit({ unitType: 'str' }), hit, 50)).toBe(33);
    expect(calc.damage(makeUnit(), makeUnit({ unitType: 'str' }), mind, 50)).toBe(33);
  });
});

describe('병종별 반격 비율 (counterRate)', () => {
  const data = {
    ...testData,
    skills: { ...testData.skills, hit: { ...testData.skills.hit, ignoreDefense: 2 } },
    unitTypes: {
      ...testData.unitTypes,
      inf: { ...testData.unitTypes.inf, counterRate: 1 },
      cav: { ...testData.unitTypes.cav, counterRate: 0.9 },
    },
  };
  const c = new DamageCalculator(testBalance, data);
  const hitPlain = testData.skills.hit; // 방어 무시 없음

  it('병종의 counterRate를 쓰고, 없으면 balance.counter.rate를 쓴다', () => {
    expect(c.counterRate(makeUnit({ unitType: 'inf' }))).toBe(1);
    expect(c.counterRate(makeUnit({ unitType: 'cav' }))).toBe(0.9);
    expect(c.counterRate(makeUnit({ unitType: 'arc' }))).toBe(0.5);
  });

  it('반격 피해 = 일반공격 피해 × 반격 비율', () => {
    const base = calc.damage(makeUnit(), makeUnit(), hitPlain, 50);
    expect(c.counterDamage(makeUnit({ unitType: 'inf' }), makeUnit(), hitPlain, 50)).toBe(Math.round(base * 1));
    expect(c.counterDamage(makeUnit({ unitType: 'arc' }), makeUnit(), hitPlain, 50)).toBe(Math.round(base * 0.5));
  });

  it('반격에는 방어 무시가 붙지 않는다', () => {
    const pierceHit = data.skills.hit;
    const attack = c.damage(makeUnit({ unitType: 'inf' }), makeUnit(), pierceHit, 50);
    const counter = c.counterDamage(makeUnit({ unitType: 'inf' }), makeUnit(), pierceHit, 50);
    expect(attack).toBeGreaterThan(counter); // 방어 무시가 있는 공격이 더 아프다 (반격 비율 1이어도)
    expect(counter).toBe(calc.damage(makeUnit(), makeUnit(), hitPlain, 50));
  });
});

describe('대상 열에 따른 주는 피해 배수 (damageDealtByRow)', () => {
  const data = {
    ...testData,
    unitTypes: { ...testData.unitTypes, arc: { ...testData.unitTypes.arc, damageDealtByRow: { front: 0.8, back: 1 } } },
  };
  const rowed = new DamageCalculator(testBalance, data);
  const archer = makeUnit({ unitType: 'arc', family: 'archer' });
  const front = makeUnit({ side: 'defender', row: 'front' });
  const back = makeUnit({ side: 'defender', row: 'back' });

  it('대상이 전열이면 배수를 곱하고 후열이면 그대로다', () => {
    expect(rowed.damage(archer, front, hit, 50)).toBe(27); // 33.33 × 0.8
    expect(rowed.damage(archer, back, hit, 50)).toBe(33);
  });

  it('배수를 생략하면 열과 상관없이 피해가 같다', () => {
    expect(calc.damage(archer, front, hit, 50)).toBe(33);
    expect(calc.damage(archer, back, hit, 50)).toBe(33);
  });

  it('공격하는 쪽 병종의 배수만 쓴다 (맞는 쪽 병종은 영향이 없다)', () => {
    expect(rowed.damage(makeUnit({ unitType: 'inf' }), front, hit, 50)).toBe(33);
    expect(rowed.damage(makeUnit({ unitType: 'inf' }), makeUnit({ unitType: 'arc', row: 'front' }), hit, 50)).toBe(33);
  });
});

describe('병력 보정 방식 (troopFactor.mode)', () => {
  const relative = {
    ...testBalance,
    troopFactor: { ...testBalance.troopFactor, mode: 'relative' as const },
  };
  const abs = new DamageCalculator(testBalance, testData);
  const rel = new DamageCalculator(relative, testData);

  it('기존 방식(absolute)은 병종과 상대에 상관없이 현재 병력 ÷ 기준 병력이다', () => {
    const small = makeUnit({ troops: 800, maxTroops: 800 });
    const big = makeUnit({ troops: 1000, maxTroops: 1000 });
    // 같은 스탯: 병력 800이면 1000일 때의 0.8배
    expect(abs.damage(small, makeUnit(), hit, 50)).toBe(Math.round(33.33 * 0.8));
    expect(abs.damage(big, makeUnit({ troops: 100 }), hit, 50)).toBe(33);
  });

  it('상대 비교(relative), 공격력 기반: 최대 병력이 800인 병종도 가득 차면 불이익이 없다', () => {
    const smallFull = makeUnit({ troops: 800, maxTroops: 800 });
    const sameSize = makeUnit({ troops: 800, maxTroops: 800 });
    expect(rel.damage(smallFull, sameSize, hit, 50)).toBe(33); // 800 대 800 = 1.0
    expect(abs.damage(smallFull, sameSize, hit, 50)).toBe(27); // 기존 방식은 0.8배로 깎임
  });

  it('상대 비교, 공격력 기반: 큰 군단이 작은 군단을 치면 더 아프다', () => {
    const big = makeUnit({ troops: 1000 });
    const smallTarget = makeUnit({ troops: 500 });
    const sameTarget = makeUnit({ troops: 900 });
    const vsSmall = rel.damage(big, smallTarget, hit, 50);
    const vsSame = rel.damage(big, sameTarget, hit, 50);
    expect(vsSmall).toBeGreaterThan(vsSame);
    expect(vsSmall).toBe(Math.round(33.333 * Math.SQRT2)); // 1000 대 500
    expect(vsSame).toBe(Math.round(33.333 * Math.sqrt(1000 / 900))); // 1000 대 900은 거의 같다
  });

  it('상대 비교, 지력 기반: 상대의 병력은 보지 않고 내 최대 병력 대비 현재 병력만 본다', () => {
    const caster = makeUnit({ stats: stats(1, 1, 8), troops: 400, maxTroops: 800 });
    const weakTarget = makeUnit({ troops: 100 });
    const bigTarget = makeUnit({ troops: 1000 });
    expect(rel.damage(caster, weakTarget, mind, 50)).toBe(rel.damage(caster, bigTarget, mind, 50)); // 상대 병력과 무관
    const full = makeUnit({ stats: stats(1, 1, 8), troops: 800, maxTroops: 800 });
    expect(rel.damage(caster, bigTarget, mind, 50)).toBeLessThan(rel.damage(full, bigTarget, mind, 50)); // 내 병력이 절반이면 약해짐
    // 가득 찬 책사(800/800)는 보정 1.0이다 (기존 방식은 0.8)
    expect(rel.damage(full, bigTarget, mind, 50)).toBeGreaterThan(abs.damage(full, bigTarget, mind, 50));
  });

  it('mode를 생략하면 기존 방식이다', () => {
    const noMode = { ...testBalance, troopFactor: { reference: 1000, min: 0.3, max: 1.75 } };
    const u = makeUnit({ troops: 800, maxTroops: 800 });
    expect(new DamageCalculator(noMode, testData).damage(u, makeUnit(), hit, 50)).toBe(abs.damage(u, makeUnit(), hit, 50));
  });

  it('반격도 같은 방식으로 계산된다 (맞은 뒤의 줄어든 병력 기준)', () => {
    const wounded = makeUnit({ troops: 500, maxTroops: 1000 });
    const attacker = makeUnit({ troops: 1000, maxTroops: 1000 });
    // 상대 비교: 반격하는 쪽(500)이 공격자(1000)를 친다 → 비율 0.5의 제곱근
    expect(rel.counterDamage(wounded, attacker, hit, 50)).toBe(Math.round(Math.round(33.333 * Math.sqrt(0.5)) * 0.5));
  });
});

describe('병종 병력 배율은 피해에 영향을 주지 않는다 (normalizeByScale)', () => {
  // inf 병종의 병력 배율을 0.8로 둔다: 최대 병력 800은 "가득 찬 상태"다
  const scaled = {
    ...testData,
    unitTypes: { ...testData.unitTypes, inf: { ...testData.unitTypes.inf, troopScale: 0.8 } },
  };
  const on = new DamageCalculator(testBalance, scaled);
  const off = new DamageCalculator({ ...testBalance, troopFactor: { ...testBalance.troopFactor, normalizeByScale: false } }, scaled);
  const full800 = makeUnit({ unitType: 'inf', troops: 800, maxTroops: 800 });
  const full1000 = makeUnit({ unitType: 'arc', troops: 1000, maxTroops: 1000 });

  it('켜져 있으면(기본) 최대 병력이 800인 병종도 가득 차면 1000인 병종과 같은 세기로 때린다', () => {
    expect(on.damage(full800, makeUnit(), hit, 50)).toBe(33);
    expect(on.damage(full1000, makeUnit(), hit, 50)).toBe(33);
  });

  it('끄면 실제 병력 수만 보므로 0.8배로 약해진다', () => {
    expect(off.damage(full800, makeUnit(), hit, 50)).toBe(27);
  });

  it('설정을 생략하면 켜진 것으로 본다', () => {
    const noFlag = { ...testBalance, troopFactor: { reference: 1000, min: 0.3, max: 1.75 } };
    expect(new DamageCalculator(noFlag, scaled).damage(full800, makeUnit(), hit, 50)).toBe(33);
  });

  it('맞아서 병력이 줄면 가득 찼을 때 대비 비율만큼 약해진다 (환산 병력 400 → 0.4)', () => {
    const half = makeUnit({ unitType: 'inf', troops: 400, maxTroops: 800 });
    expect(on.damage(half, makeUnit(), hit, 50)).toBe(Math.round(33.333 * 0.5));
  });

  it('레벨 차이로 생긴 병력 차이는 그대로 반영된다 (같은 병종, 1000 대 800)', () => {
    const big = makeUnit({ unitType: 'inf', troops: 1000, maxTroops: 1000 });
    expect(on.damage(big, makeUnit(), hit, 50)).toBeGreaterThan(on.damage(full800, makeUnit(), hit, 50) - 1);
    expect(on.damage(big, makeUnit(), hit, 50)).toBe(Math.round(33.333 * 1.25));
  });

  it('상대 비교 방식에서도 환산 병력으로 비교한다 (책사 800 대 방패병 1000은 같은 크기)', () => {
    const relative = new DamageCalculator({ ...testBalance, troopFactor: { ...testBalance.troopFactor, mode: 'relative' as const } }, scaled);
    expect(relative.damage(full800, makeUnit({ unitType: 'arc', troops: 1000, maxTroops: 1000 }), hit, 50)).toBe(33);
  });

  it('치유(병력 보정 적용 시)도 환산 병력을 쓴다', () => {
    const healBalance = { ...testBalance, heal: { scale: 10, useTroopFactor: true } };
    const healScaled = { ...scaled, unitTypes: { ...testData.unitTypes, str: { ...testData.unitTypes.str, troopScale: 0.8 } } };
    const healer = makeUnit({ unitType: 'str', stats: stats(1, 1, 6), troops: 800, maxTroops: 800 });
    expect(new DamageCalculator(healBalance, healScaled).heal(healer, testData.skills.mend)).toBe(60); // 지력 6 × 10 × 1.0
  });
});
