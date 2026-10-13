import type { Rect } from './slotLayout';
import { regionAt, relativeTo } from './slotLayout';
import { CARD_H, CARD_W, WORLD_H, WORLD_W } from './theme';

/**
 * 하단 지휘 영역의 고정 좌표 (논리 화면 1280×900 기준).
 * 패널과 패널 안 부품의 원본은 docs/art/battle-slots.json의 E1~E7 regions다 (Lab 에셋 검수에서 고친다). 카드 행동 메뉴(E8~E10)는 코드 값이고 commandLayout.test.ts가 JSON과 같은지 확인한다.
 * 중앙 지휘 패널(DOCK)은 양쪽 카드 사이에 놓이고, 패널 안 부품(COMMAND_PARTS)은 패널 왼쪽 위가 원점이다.
 * 카드 행동 메뉴(CARD_MENU)는 카드 왼쪽 위가 원점이다.
 */
export const COMMAND_DOCK: Rect = regionAt('E1');

const inDock = (id: string, index = 0): Rect => relativeTo(COMMAND_DOCK, regionAt(id, index));

export const COMMAND_PARTS = {
  /** E2 패널 제목 "전투 지휘" */
  title: inDock('E2'),
  /** E3 지금 행동하는 장수 (이름, 병종, AP, 병력) */
  actor: inDock('E3'),
  /** E4 안내 문구와 오류 */
  notice: inDock('E4'),
  /** E5 "남은 전투를 AI에게 맡기기" 버튼 */
  autoplay: inDock('E5'),
  /** E6 진행 중 표시 */
  progress: inDock('E6', 0),
  /** E6 건너뛰기 버튼 */
  skip: inDock('E6', 1),
  /** E7 전투 결과 (종료 패널 전체) */
  result: inDock('E7'),
} as const satisfies Record<string, Rect>;

/** 카드 위에 뜨는 행동 메뉴: 공격 쪽 카드는 왼쪽, 방어 쪽 카드는 오른쪽에 붙는다 */
export const CARD_MENU = {
  side: 16,
  top: 7,
  width: 184,
  /** 메뉴 틀의 표시 높이 (행동이 많으면 최대 180까지 늘어난다) */
  height: CARD_H,
  pad: 3,
  optionH: 34,
} as const;

/** E9 메뉴 틀 (카드 안 좌표) */
export const cardMenuRect = (side: 'attacker' | 'defender'): Rect => ({
  x: side === 'attacker' ? CARD_MENU.side : CARD_W - CARD_MENU.side - CARD_MENU.width,
  y: CARD_MENU.top,
  w: CARD_MENU.width,
  h: CARD_MENU.height,
});

/** E10 메뉴 첫 줄 (카드 안 좌표) */
export const cardMenuFirstOption = (side: 'attacker' | 'defender'): Rect => {
  const m = cardMenuRect(side);
  return { x: m.x + CARD_MENU.pad, y: m.y + CARD_MENU.pad, w: m.w - CARD_MENU.pad * 2, h: CARD_MENU.optionH };
};

/** 패널 안 부품의 화면 좌표 */
export const onDock = (part: Rect): Rect => ({ x: COMMAND_DOCK.x + part.x, y: COMMAND_DOCK.y + part.y, w: part.w, h: part.h });

const pct = (value: number, whole: number) => `${(value / whole) * 100}%`;

/** 논리 좌표 영역을 화면 전체 대비 % 위치로 (패널 자체) */
export const dockStyle = () => ({ left: pct(COMMAND_DOCK.x, WORLD_W), top: pct(COMMAND_DOCK.y, WORLD_H), width: pct(COMMAND_DOCK.w, WORLD_W), height: pct(COMMAND_DOCK.h, WORLD_H) });

/** 패널 안 부품을 패널 대비 % 위치로 */
export const partStyle = (part: Rect) => ({ left: pct(part.x, COMMAND_DOCK.w), top: pct(part.y, COMMAND_DOCK.h), width: pct(part.w, COMMAND_DOCK.w), height: pct(part.h, COMMAND_DOCK.h) });

/** 카드 행동 메뉴를 카드 대비 % 위치로 */
export const menuStyle = (side: 'attacker' | 'defender') => {
  const r = cardMenuRect(side);
  return { left: pct(r.x, CARD_W), top: pct(r.y, CARD_H), width: pct(r.w, CARD_W) };
};
