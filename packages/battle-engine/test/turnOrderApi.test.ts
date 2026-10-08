import { describe, expect, it } from 'vitest';
import { BattleEngine, createDefaultPolicy } from '../src';
import type { BattleEvent, BattleInput, LineupEntry } from '../src';
import { testBalance, testData } from './fixtures';

// 화면이 쓰는 행동 순서: roundStart.order와 remainingTurnOrder()는 엔진이 실제로 행동시키는 순서와 같아야 한다
const front = (characterId: string): LineupEntry => ({ characterId, row: 'front' });
const back = (characterId: string): LineupEntry => ({ characterId, row: 'back' });
const input = (seed: number): BattleInput => ({
  data: testData,
  balance: testBalance,
  attacker: [front('inf'), front('infFast'), back('arc'), back('str')],
  defender: [front('infSlow'), front('cav'), back('geo'), back('arc')],
  seed,
  recordEvents: true,
  policy: createDefaultPolicy(),
});

describe('행동 순서 공개 (roundStart.order, remainingTurnOrder)', () => {
  it('roundStart.order는 그 라운드에 실제로 행동한 순서와 같다 (도중에 전멸하거나 AP가 0이 된 군단만 빠진다)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const engine = new BattleEngine(input(seed));
      engine.run();
      let order: string[] = [];
      let acted: string[] = [];
      const check = () => {
        // 행동한 군단은 order에 있는 순서 그대로 나온다
        const positions = acted.map((uid) => order.indexOf(uid));
        expect(positions.every((p) => p >= 0)).toBe(true);
        expect([...positions].sort((a, b) => a - b)).toEqual(positions);
      };
      for (const e of engine.events as BattleEvent[]) {
        if (e.type === 'roundStart') {
          check();
          order = e.order;
          acted = [];
        } else if (e.type === 'action') acted.push(e.actor);
      }
      check();
    }
  });

  it('remainingTurnOrder()는 nextActor가 앞으로 돌려줄 군단의 순서다 (지금 행동 중인 군단은 빠진다)', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const engine = new BattleEngine(input(seed));
      let expected: string[] | null = null;
      for (let actor = engine.nextActor(); actor; actor = engine.nextActor()) {
        if (expected && expected.length > 0 && engine.events.at(-1)?.type !== 'roundStart') {
          // 같은 라운드 안이면 이번 행동자는 직전에 알려 준 남은 순서 중 (그 사이 빠진 군단을 건너뛴) 첫 군단이다
          expect(expected).toContain(actor.uid);
          expect(expected.slice(0, expected.indexOf(actor.uid)).every((uid) => !engine.remainingTurnOrder().includes(uid))).toBe(true);
        }
        const remaining = engine.remainingTurnOrder();
        expect(remaining).not.toContain(actor.uid);
        engine.perform(actor, engine.decide(actor));
        expected = engine.remainingTurnOrder();
      }
    }
  });

  it('라운드 시작 직후에는 roundStart.order와 (첫 행동자를 뺀) 남은 순서가 이어진다', () => {
    const engine = new BattleEngine(input(3));
    const first = engine.nextActor()!;
    const start = engine.events.find((e): e is Extract<BattleEvent, { type: 'roundStart' }> => e.type === 'roundStart')!;
    expect(start.order[0]).toBe(first.uid);
    expect(engine.remainingTurnOrder()).toEqual(start.order.slice(1));
  });
});
