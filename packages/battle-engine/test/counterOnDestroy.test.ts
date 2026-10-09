import { describe, expect, it } from 'vitest';
import { BattleEngine } from '../src';
import type { BattleEvent, BattleInput } from '../src';
import { testBalance, testData } from './fixtures';

// 반격은 맞기 전 병력으로 계산한다. counter.onDestroy면 맞아서 전멸해도 반격한다 (주고받기를 동시에)
const input = (onDestroy: boolean): BattleInput => ({
  data: testData,
  balance: { ...testBalance, counter: { ...testBalance.counter, onDestroy } },
  attacker: [{ characterId: 'inf', row: 'front' }],
  // 한 방에 쓰러질 만큼 병력이 적은 적
  defender: [{ characterId: 'inf', row: 'front', troops: 5 }],
  seed: 1,
  recordEvents: true,
});
const strike = (onDestroy: boolean) => {
  const engine = new BattleEngine(input(onDestroy));
  engine.perform(engine.state.units[0], { kind: 'skill', skillId: 'hit', targetUid: 'defender:0' });
  return engine.events.filter((e): e is Extract<BattleEvent, { type: 'damage' }> => e.type === 'damage');
};

describe('맞아서 전멸해도 반격 (counter.onDestroy)', () => {
  it('끄면 막타에는 반격이 없다', () => {
    const hits = strike(false);
    expect(hits.map((e) => e.kind)).toEqual(['attack']);
    expect(hits[0].troopsAfter).toBe(0);
  });

  it('켜면 막타에도 반격이 들어온다 (맞기 전 병력 5로 계산)', () => {
    const hits = strike(true);
    expect(hits.map((e) => e.kind)).toEqual(['attack', 'counter']);
    expect(hits[1].target).toBe('attacker:0');
    expect(hits[1].amount).toBeGreaterThan(0);
  });

  it('미리보기도 같은 규칙이다', () => {
    for (const onDestroy of [false, true]) {
      const engine = new BattleEngine(input(onDestroy));
      const preview = engine.preview(engine.state.units[0], 'hit', 'defender:0');
      if (preview.kind !== 'attack') throw new Error('attack preview');
      expect(preview.counter > 0).toBe(onDestroy);
    }
  });
});
