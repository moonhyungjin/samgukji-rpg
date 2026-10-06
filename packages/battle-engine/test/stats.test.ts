import { describe, expect, it } from 'vitest';
import { createRng, deriveSeed, effectiveStat, maxTroops, moraleMultiplier, troopFactor } from '../src';
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

describe('moraleMultiplier', () => {
  it('사기 50이면 1.0, 100이면 +10%, 0이면 -10%', () => {
    expect(moraleMultiplier(testBalance, 50)).toBeCloseTo(1);
    expect(moraleMultiplier(testBalance, 100)).toBeCloseTo(1.1);
    expect(moraleMultiplier(testBalance, 0)).toBeCloseTo(0.9);
  });
});
