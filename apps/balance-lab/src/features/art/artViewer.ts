import type { ArtSlot } from './artReview';

/** Lab → 게임 Viewer 메시지 (게임 쪽 ArtViewer.tsx와 같은 모양) */
export interface ViewerRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 이 상자에 붙일 이름표 */
  label?: string;
  /** 상자와 이름표 색 (CSS 색). 없으면 금색 */
  color?: string;
}

export type ViewerOutgoing =
  | { type: 'art-viewer:highlight'; rects: ViewerRect[]; label: string }
  | { type: 'art-viewer:overrides'; overrides: Record<string, string> };

export const DEFAULT_GAME_URL = 'http://localhost:5174';

/** 그룹 안에서 슬롯마다 다른 색 (표시 상자와 선택 칩이 같은 색을 쓴다) */
export function slotColor(index: number): string {
  return `hsl(${(index * 47 + 40) % 360} 95% 60%)`;
}

/** 한 슬롯의 영역들에 붙일 이름표: 첫 상자는 "ID 이름", 나머지는 "ID"만 */
function rectsOf(slot: ArtSlot, color?: string): ViewerRect[] {
  return (slot.regions ?? []).map((r, i) => ({ ...r, label: i === 0 ? `${slot.id} ${slot.name}` : slot.id, ...(color ? { color } : {}) }));
}

/** 슬롯을 Viewer에 표시하는 메시지. 영역이 없으면 빈 목록(표시 없음) */
export function highlightMessage(slot: ArtSlot | undefined): ViewerOutgoing {
  return { type: 'art-viewer:highlight', rects: slot ? rectsOf(slot) : [], label: '' };
}

/** 그룹에 속한 슬롯들 (그룹 이름이 같은 것, 목록 순서대로) */
export function groupSlots(slots: readonly ArtSlot[], group: string): ArtSlot[] {
  return slots.filter((s) => s.group === group);
}

/**
 * 같은 그룹(A 헤더 등)의 슬롯을 한꺼번에 표시해서 구조를 보여 주는 메시지. 슬롯마다 다른 색이고,
 * `hidden`에 든 슬롯은 뺀다 (겹쳐 보일 때 하나씩 켜고 끄기 위해).
 */
export function groupHighlightMessage(slots: readonly ArtSlot[], group: string, hidden: ReadonlySet<string> = new Set()): ViewerOutgoing {
  const members = groupSlots(slots, group);
  return { type: 'art-viewer:highlight', rects: members.flatMap((s, i) => (hidden.has(s.id) ? [] : rectsOf(s, slotColor(i)))), label: '' };
}

/** 끼워 볼 그림의 주소 (게임 화면이 Lab 개발 서버에서 직접 읽는다) */
export function viewerImageUrl(origin: string, path: string): string {
  // 확장자가 주소 끝에 있어야 PixiJS가 그림으로 읽는다 (그래서 ?path= 형태를 쓰지 않는다)
  return `${origin}/api/art/file/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** Viewer 주소: 게임 서버 주소 뒤에 ?viewer=1 */
export function viewerSrc(gameUrl: string): string {
  const base = gameUrl.trim().replace(/\/+$/, '') || DEFAULT_GAME_URL;
  return `${base}/?viewer=1`;
}

/** 이 슬롯에서 끼워 볼 수 있는 게임 텍스처 목록. 없으면 코드로 그리거나 지금 화면에서 쓰지 않는 슬롯이다 */
export function applicableKeys(slot: ArtSlot | undefined): string[] {
  return slot?.artKeys ?? [];
}
