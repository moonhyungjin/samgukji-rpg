import { describe, expect, it } from 'vitest';
import { BattleEngine, buildUnits, resolveLineupSlots } from '../src';
import type { LineupEntry } from '../src';
import { testBalance, testData } from './fixtures';

describe('고정된 여섯 슬롯', () => {
  it('빈칸과 명시한 위치를 보존하고 기존 편성도 읽는다', () => {
    const lineup: LineupEntry[] = [
      { characterId: 'inf', row: 'front' },
      { characterId: 'inf', row: 'front', slot: 0 },
      { characterId: 'arc', row: 'back', slot: 2 },
    ];
    expect(buildUnits('attacker', lineup, testData, testBalance).map(u => [u.row, u.slot])).toEqual([
      ['front', 1], ['front', 0], ['back', 2],
    ]);
  });

  it('겹치거나 범위를 벗어난 슬롯은 거부한다', () => {
    for (const slot of [-1, 3, 1.5, NaN]) {
      expect(() => resolveLineupSlots([{ characterId: 'inf', row: 'front', slot }])).toThrow(/slot/i);
    }
    expect(() => resolveLineupSlots(Array.from({ length: 2 }, () => ({ characterId: 'inf', row: 'front', slot: 2 })))).toThrow(/Duplicate/);
  });

  for (const side of ['attacker', 'defender'] as const) {
    for (const backSlots of [[2], [0, 2], [0, 1, 2]]) {
      it(`${side}: 후열 ${backSlots.map(s => s + 4)}는 전열 전체 전멸 후 같은 위치로 이동한다`, () => {
        const lineup: LineupEntry[] = [
          { characterId: 'inf', row: 'front', slot: 0 },
          { characterId: 'inf', row: 'front', slot: 1 },
          { characterId: 'inf', row: 'front', slot: 2 },
          ...backSlots.map(slot => ({ characterId: 'arc', row: 'back' as const, slot })),
        ];
        const opponent = side === 'attacker' ? 'defender' : 'attacker';
        const engine = new BattleEngine({ data: testData, balance: testBalance, seed: 1, recordEvents: true,
          attacker: side === 'attacker' ? lineup : [{ characterId: 'infFast', row: 'front' }],
          defender: side === 'defender' ? lineup : [{ characterId: 'infFast', row: 'front' }],
        });
        const actor = engine.state.units.find(u => u.side === opponent)!;
        for (const index of [2, 0, 1]) {
          const target = engine.state.units.find(u => u.uid === `${side}:${index}`)!;
          target.troops = 1;
          engine.perform(actor, { kind: 'skill', skillId: 'hit', targetUid: target.uid });
          const rear = engine.state.units.filter(u => u.side === side && !u.isDead);
          if (index !== 1) {
            expect(rear.filter(u => u.row === 'back').map(u => u.slot)).toEqual(backSlots);
            expect(engine.events.filter(e => e.type === 'rowAdvance')).toHaveLength(0);
          } else {
            expect(rear.map(u => [u.row, u.slot])).toEqual(backSlots.map(s => ['front', s]));
            expect(engine.events.filter(e => e.type === 'rowAdvance')).toHaveLength(1);
          }
        }
      });
    }
    it(`${side}: 처음부터 전열이 비어 있어도 6번은 3번으로 이동한다`, () => {
      const rear: LineupEntry[] = [{ characterId: 'arc', row: 'back', slot: 2 }];
      const front: LineupEntry[] = [{ characterId: 'inf', row: 'front' }];
      const engine = new BattleEngine({ data: testData, balance: testBalance, seed: 1,
        attacker: side === 'attacker' ? rear : front, defender: side === 'defender' ? rear : front });
      expect(engine.state.units.find(u => u.side === side)).toMatchObject({ row: 'front', slot: 2 });
    });
  }
});
