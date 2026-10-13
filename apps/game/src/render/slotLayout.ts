import slotsJson from '../../../../docs/art/battle-slots.json';

/** 논리 화면(1280×900) 위의 영역 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface SlotRow {
  id: string;
  regions?: Rect[];
}

const SLOTS = (slotsJson as unknown as { slots: SlotRow[] }).slots;

/**
 * 전투 화면의 고정 영역은 docs/art/battle-slots.json의 regions가 원본이다 (Lab의 에셋 검수에서 숫자나 드래그로 고친다).
 * 헤더(headerLayout), 카드 부품(cardParts), 지휘 패널(commandLayout)이 이 함수로 좌표를 읽는다.
 */
export function regionAt(id: string, index = 0): Rect {
  const r = SLOTS.find((s) => s.id === id)?.regions?.[index];
  if (!r) throw new Error(`battle-slots.json에 ${id}의 ${index}번째 영역이 없습니다.`);
  return { x: r.x, y: r.y, w: r.w, h: r.h };
}

/** 어떤 기준점(왼쪽 위)에서 본 상대 좌표 */
export const relativeTo = (origin: { x: number; y: number }, r: Rect): Rect => ({ x: r.x - origin.x, y: r.y - origin.y, w: r.w, h: r.h });
