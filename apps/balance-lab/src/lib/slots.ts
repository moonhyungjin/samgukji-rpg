import type { LineupEntry, Row } from '@samgukji/battle-engine';
import type { Slots } from '../lab/types';

export const SLOT_COUNT = 6;
export const FRONT_SLOTS = 3;

export function slotRow(index: number): Row {
  return index < FRONT_SLOTS ? 'front' : 'back';
}

/** 엔진 편성(LineupEntry[]) → 슬롯 6칸. 열마다 앞에서부터 채운다. */
export function slotsFromLineup(lineup: LineupEntry[]): Slots {
  const slots: Slots = Array.from({ length: SLOT_COUNT }, () => null);
  const next: Record<Row, number> = { front: 0, back: FRONT_SLOTS };
  const limit: Record<Row, number> = { front: FRONT_SLOTS, back: SLOT_COUNT };
  for (const entry of lineup) {
    const index = next[entry.row]++;
    if (index >= limit[entry.row]) continue;
    slots[index] = entry.level === undefined ? { characterId: entry.characterId } : { characterId: entry.characterId, level: entry.level };
  }
  return slots;
}

/** 슬롯 6칸 → 엔진 편성. 빈 칸은 건너뛴다. */
export function lineupFromSlots(slots: Slots): LineupEntry[] {
  return slots.flatMap((slot, index) =>
    slot
      ? [{ characterId: slot.characterId, row: slotRow(index), ...(slot.level === undefined ? {} : { level: slot.level }) }]
      : [],
  );
}
