import { describe, expect, it } from 'vitest';
import { chooseTarget, createRng, judge, TargetSelector } from '../src';
import { makeState, makeUnit } from './fixtures';

const actor = makeUnit({ uid: 'attacker:0', side: 'attacker' });
const eFront = makeUnit({ uid: 'defender:0', side: 'defender', row: 'front' });
const eBack = makeUnit({ uid: 'defender:1', side: 'defender', row: 'back' });

describe('TargetSelector.getValidTargets', () => {
  it('front-first: 전열이 있으면 전열만 대상이다', () => {
    const state = makeState([actor, eFront, eBack]);
    expect(TargetSelector.getValidTargets(actor, state, 'front-first').map((u) => u.uid)).toEqual(['defender:0']);
  });

  it('front-first: 전열이 전멸하면 후열이 대상이 된다', () => {
    const state = makeState([actor, { ...eFront, isDead: true, troops: 0 }, eBack]);
    expect(TargetSelector.getValidTargets(actor, state, 'front-first').map((u) => u.uid)).toEqual(['defender:1']);
  });

  it('any: 전열/후열 모두 대상이다 (기병, 궁병)', () => {
    const state = makeState([actor, eFront, eBack]);
    expect(TargetSelector.getValidTargets(actor, state, 'any').map((u) => u.uid)).toEqual(['defender:0', 'defender:1']);
  });

  it('죽은 적과 아군은 대상이 아니다', () => {
    const ally = makeUnit({ uid: 'attacker:1' });
    const state = makeState([actor, ally, { ...eFront, isDead: true, troops: 0 }]);
    expect(TargetSelector.getValidTargets(actor, state, 'any')).toEqual([]);
  });
});

describe('chooseTarget', () => {
  const rng = createRng(1);
  const a = makeUnit({ uid: 'defender:0', troops: 900 });
  const b = makeUnit({ uid: 'defender:1', troops: 300 });
  const none = () => 0;

  it('lowest-troops: 병력이 가장 적은 대상', () => {
    expect(chooseTarget([a, b], 'lowest-troops', rng, none).uid).toBe('defender:1');
  });

  it('highest-damage: 예상 피해가 가장 큰 대상', () => {
    const expected = (t: { uid: string }) => (t.uid === 'defender:0' ? 120 : 80);
    expect(chooseTarget([a, b], 'highest-damage', rng, expected).uid).toBe('defender:0');
  });

  it('highest-damage: 예상 피해가 같으면 병력이 적은 대상', () => {
    expect(chooseTarget([a, b], 'highest-damage', rng, () => 100).uid).toBe('defender:1');
  });

  it('random: 후보 안에서 고른다', () => {
    for (let i = 0; i < 20; i++) expect(['defender:0', 'defender:1']).toContain(chooseTarget([a, b], 'random', rng, none).uid);
  });

  it('후보가 하나면 그대로 고른다', () => {
    expect(chooseTarget([a], 'random', rng, none)).toBe(a);
  });
});

describe('judge', () => {
  const a = (i: number, troops = 1000, dead = false) => makeUnit({ uid: `attacker:${i}`, side: 'attacker', troops: dead ? 0 : troops, isDead: dead });
  const d = (i: number, troops = 1000, dead = false) => makeUnit({ uid: `defender:${i}`, side: 'defender', troops: dead ? 0 : troops, isDead: dead });

  it('전멸한 군단 수가 적은 쪽이 이긴다 (좌 3 전멸 vs 우 2 전멸 → 우)', () => {
    const state = makeState([a(0, 0, true), a(1, 0, true), a(2, 0, true), a(3), a(4), a(5), d(0, 0, true), d(1, 0, true), d(2), d(3), d(4)]);
    // 공격측 6군단 중 3 전멸, 방어측 5군단 중 2 전멸
    expect(judge(state)).toEqual({ winner: 'defender', decidedBy: 'destroyed' });
  });

  it('전멸 수가 같으면 잔여 병력 합산이 큰 쪽이 이긴다', () => {
    const state = makeState([a(0, 800), a(1, 800), d(0, 500), d(1, 500)]);
    expect(judge(state)).toEqual({ winner: 'attacker', decidedBy: 'troops' });
  });

  it('병력까지 같으면 사기가 높은 쪽이 이긴다', () => {
    const base = makeState([a(0), d(0)]);
    expect(judge({ ...base, defenderMorale: 60 })).toEqual({ winner: 'defender', decidedBy: 'morale' });
    expect(judge({ ...base, defenderMorale: 40 })).toEqual({ winner: 'attacker', decidedBy: 'morale' });
  });

  it('사기까지 같으면(5:5) 방어측이 이긴다', () => {
    const state = { ...makeState([a(0), d(0)]), defenderMorale: 50 };
    expect(judge(state)).toEqual({ winner: 'defender', decidedBy: 'defender' });
  });

  it('tiebreak에서는 병력이 사기보다 먼저다', () => {
    const state = { ...makeState([a(0, 900), d(0, 500)]), defenderMorale: 70 };
    expect(judge(state, 'tiebreak')).toEqual({ winner: 'attacker', decidedBy: 'troops' });
  });

  it('before-troops에서는 사기가 병력보다 먼저다', () => {
    const state = { ...makeState([a(0, 900), d(0, 500)]), defenderMorale: 70 };
    expect(judge(state, 'before-troops')).toEqual({ winner: 'defender', decidedBy: 'morale' });
  });

  it('전멸 군단 수는 사기보다 항상 먼저다', () => {
    const state = { ...makeState([a(0), a(1, 0, true), d(0)]), defenderMorale: 90 };
    expect(judge(state, 'before-troops')).toEqual({ winner: 'defender', decidedBy: 'destroyed' });
  });
});
