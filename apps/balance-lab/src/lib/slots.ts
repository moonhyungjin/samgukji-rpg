import type { LineupEntry, Row } from '@samgukji/battle-engine';
import { resolveLineupSlots } from '@samgukji/battle-engine';
import type { Slots } from '../lab/types';

export const SLOT_COUNT = 6;
export const FRONT_SLOTS = 3;

export function slotRow(index: number): Row {
  return index < FRONT_SLOTS ? 'front' : 'back';
}

/** 엔진 편성 → 슬롯 6칸. 명시한 위치와 빈칸을 보존한다. */
export function slotsFromLineup(lineup: LineupEntry[]): Slots {
  const slots: Slots = Array.from({ length: SLOT_COUNT }, () => null);
  const positions = resolveLineupSlots(lineup);
  for (const [i, entry] of lineup.entries()) {
    const index = (entry.row === 'front' ? 0 : FRONT_SLOTS) + positions[i];
    slots[index] = { characterId: entry.characterId, ...(entry.level === undefined ? {} : { level: entry.level }), ...(entry.unitType === undefined ? {} : { unitType: entry.unitType }) };
  }
  return slots;
}

/** 슬롯 6칸 → 엔진 편성. 빈 칸은 건너뛴다. */
export function lineupFromSlots(slots: Slots): LineupEntry[] {
  const count: Record<Row, number> = { front: 0, back: 0 };
  return slots.flatMap((slot, index) =>
    slot
      ? [{ characterId: slot.characterId, row: slotRow(index), ...(index % FRONT_SLOTS === count[slotRow(index)]++ ? {} : { slot: index % FRONT_SLOTS }), ...(slot.level === undefined ? {} : { level: slot.level }), ...(slot.unitType === undefined ? {} : { unitType: slot.unitType }) }]
      : [],
  );
}
