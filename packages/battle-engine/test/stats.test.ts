import { describe, expect, it } from 'vitest';
import { applyStatMods, apFromAction, createRng, DEFAULT_TIERED, relativeTroopFactor, selfTroopFactor, tieredTroopFactor, tieredTroops, totalAp, deriveSeed, effectiveStat, maxTroops, moraleMultiplier, troopFactor } from '../src';
import { testBalance } from './fixtures';

describe('rng', () => {
  it('같은 시드는 같은 수열을 만든다', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('0 이상 1 미만이다', () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('deriveSeed는 반복 번호마다 다른 시드를 만든다', () => {
    const seeds = new Set(Array.from({ length: 100 }, (_, i) => deriveSeed(1, i)));
    expect(seeds.size).toBe(100);
  });
});

describe('maxTroops', () => {
  it('300 + 50 × (레벨 − 1)', () => {
    expect(maxTroops(testBalance, 1)).toBe(300);
    expect(maxTroops(testBalance, 15)).toBe(1000);
    expect(maxTroops(testBalance, 30)).toBe(1750);
  });
});

describe('effectiveStat', () => {
  it('기본 곡선은 그대로 통과한다', () => {
    expect(effectiveStat(testBalance, 0)).toBe(0);
    expect(effectiveStat(testBalance, 5)).toBe(5);
    expect(effectiveStat(testBalance, 10)).toBe(10);
  });

  it('10을 넘으면 마지막 기울기로 연장하고 statCap에서 멈춘다', () => {
    expect(effectiveStat(testBalance, 12)).toBe(12);
    expect(effectiveStat(testBalance, 99)).toBe(15);
  });

  it('곡선 사이는 선형 보간한다', () => {
    const balance = { ...testBalance, statCurve: [0, 10, 20] };
    expect(effectiveStat(balance, 1.5)).toBe(15);
    expect(effectiveStat(balance, 3)).toBe(30);
  });
});

describe('troopFactor', () => {
  it('병력/reference를 하한과 상한으로 자른다', () => {
    expect(troopFactor(testBalance, 1000)).toBe(1);
    expect(troopFactor(testBalance, 500)).toBe(0.5);
    expect(troopFactor(testBalance, 50)).toBe(0.3);
    expect(troopFactor(testBalance, 5000)).toBe(1.75);
  });
});

describe('tieredTroops (구간식, 원작 인원 계산)', () => {
  const b = { ...testBalance, troopFactor: { ...testBalance.troopFactor, mode: 'tiered' as const, tiered: { ...DEFAULT_TIERED } } };
  it('꺾이는 지점(1000)까지는 1명당 1, 4000까지는 0.5, 그 이상은 0.25로 센다', () => {
    expect(tieredTroops(b, 600)).toBe(600);
    expect(tieredTroops(b, 1000)).toBe(1000);
    expect(tieredTroops(b, 1500)).toBe(1250);
    expect(tieredTroops(b, 4000)).toBe(2500);
    expect(tieredTroops(b, 5000)).toBe(2750);
  });
  it('하한(200) 아래로는 내려가지 않고, 보정은 유효 병력 ÷ 기준 병력이다', () => {
    expect(tieredTroops(b, 50)).toBe(200);
    expect(tieredTroopFactor(b, 1500)).toBe(1.25);
  });
});

describe('moraleMultiplier', () => {
  it('사기 50이면 1.0, 100이면 +10%, 0이면 -10%', () => {
    expect(moraleMultiplier(testBalance, 50)).toBeCloseTo(1);
    expect(moraleMultiplier(testBalance, 100)).toBeCloseTo(1.1);
    expect(moraleMultiplier(testBalance, 0)).toBeCloseTo(0.9);
  });
});

describe('병종 스탯 보정 (applyStatMods)', () => {
  const base = { attack: 8, defense: 9, intellect: 4, speed: 5, action: 8, diplomacy: 5, politics: 5, charm: 5 };

  it('캐릭터 기본 스탯에 보정을 더한다', () => {
    expect(applyStatMods(base, { attack: -1, defense: 1, speed: -1 })).toMatchObject({ attack: 7, defense: 10, intellect: 4, speed: 4 });
  });

  it('보정이 없으면 그대로이고, 원본은 바뀌지 않는다', () => {
    expect(applyStatMods(base, undefined)).toEqual(base);
    applyStatMods(base, { attack: 3 });
    expect(base.attack).toBe(8);
  });

  it('0 아래로는 내려가지 않는다', () => {
    expect(applyStatMods({ ...base, speed: 0 }, { speed: -1 }).speed).toBe(0);
  });
});

describe('행동력 → 추가 AP (apFromAction), 총 AP (totalAp)', () => {
  it('행동력 2마다 추가 AP 1 (올림)', () => {
    const ap = (action: number) => apFromAction(testBalance, action);
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(ap)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });

  it('행동력 상한(cap)을 넘는 값은 세지 않는다', () => {
    expect(apFromAction(testBalance, 14)).toBe(5);
  });

  it('balance.action으로 비율과 상한을 바꿀 수 있다', () => {
    const b = { ...testBalance, action: { perAp: 1, cap: 8 } };
    expect(apFromAction(b, 3)).toBe(3);
    expect(apFromAction(b, 12)).toBe(8);
  });

  it('총 AP = 병종 기본 AP + 추가 AP, 최소 1', () => {
    expect(totalAp(testBalance, 2, 3)).toBe(4); // 방패병 기본 2 + 행동력 3(+2)
    expect(totalAp(testBalance, undefined, 6)).toBe(3);
    expect(totalAp(testBalance, 0, 0)).toBe(1);
  });
});

describe('병력 보정: 상대 비교 방식 (relativeTroopFactor)', () => {
  const rel = (mine: number, theirs: number) => relativeTroopFactor(testBalance, mine, theirs);

  it('같은 병력이면 1이고, 큰 쪽이 유리하며, 차이가 작으면 거의 같다 (제곱근)', () => {
    expect(rel(800, 800)).toBe(1);
    expect(rel(1000, 500)).toBeCloseTo(Math.SQRT2, 5); // 1.41
    expect(rel(1000, 900)).toBeCloseTo(Math.sqrt(1000 / 900), 5); // 1.05
    expect(rel(500, 1000)).toBeCloseTo(Math.sqrt(0.5), 5); // 0.71
  });

  it('하한과 상한으로 제한된다 (기본 0.5 ~ 1.5)', () => {
    expect(rel(100, 1000)).toBe(0.5);
    expect(rel(1000, 100)).toBe(1.5);
  });

  it('balance.troopFactor.relative로 하한, 상한, 지수를 바꿀 수 있다', () => {
    const b = { ...testBalance, troopFactor: { ...testBalance.troopFactor, relative: { min: 0.2, max: 3, exponent: 1 } } };
    expect(relativeTroopFactor(b, 1000, 500)).toBe(2);
    expect(relativeTroopFactor(b, 100, 1000)).toBeCloseTo(0.2, 5);
    expect(relativeTroopFactor(b, 1000, 100)).toBe(3);
  });

  it('상대 병력이 0이어도 계산이 깨지지 않는다', () => {
    expect(Number.isFinite(rel(500, 0))).toBe(true);
  });
});

describe('병력 보정: 지력 기반 (selfTroopFactor)', () => {
  const self = (troops: number, max: number) => selfTroopFactor(testBalance, troops, max);

  it('내 최대 병력 대비 현재 병력이다: 병종마다 최대가 달라도 가득 찬 상태는 1', () => {
    expect(self(800, 800)).toBe(1);
    expect(self(1000, 1000)).toBe(1);
    expect(self(400, 800)).toBe(0.5);
  });

  it('하한 0.3, 상한 1', () => {
    expect(self(10, 800)).toBe(0.3);
    expect(self(2000, 800)).toBe(1);
  });
});
