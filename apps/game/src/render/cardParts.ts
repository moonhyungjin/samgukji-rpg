import { CARD_H, CARD_W } from './theme';
import type { Rect } from './headerLayout';

/**
 * 군단 카드(200×112) 안의 부품 위치 (카드 왼쪽 위가 원점).
 * 원본은 docs/art/battle-slots.md의 "D 카드"와 docs/art/battle-slots.json이고, cardParts.test.ts가 둘이 같은지 확인한다.
 * UnitSprite가 이 값으로 그린다.
 */
export const CARD_PARTS = {
  /** D1 카드 틀 */
  frame: { x: 0, y: 0, w: CARD_W, h: CARD_H },
  /** D2 얼굴(초상). 그림이 없으면 D9 병종 표식이 같은 자리에 들어간다 */
  face: { x: 6, y: 6, w: 60, h: 60 },
  /** D3 이름 글자 */
  name: { x: 74, y: 7, w: 114, h: 22 },
  /** D3 한자 인장 */
  seal: { x: 74, y: 30, w: 17, h: 17 },
  /** D3 병종·번호 글자 */
  subtitle: { x: 97, y: 31, w: 91, h: 13 },
  /** D4 병력 숫자 (오른쪽 정렬) */
  troops: { x: 110, y: 57, w: 80, h: 22 },
  /** D5 AP 칸 줄 */
  ap: { x: 10, y: 81, w: 180, h: 11 },
  /** D6 상태 줄 (가드 %, 결계, 버프, 디버프) */
  status: { x: 10, y: 94, w: 180, h: 16 },
  /** D7 전멸 표시 */
  dead: { x: 74, y: 54, w: 90, h: 24 },
} as const satisfies Record<string, Rect>;

/** 카드 부품을 화면 좌표로 옮긴다 (카드의 왼쪽 위 좌표를 더한다) */
export const onCard = (card: { x: number; y: number }, part: Rect): Rect => ({ x: card.x + part.x, y: card.y + part.y, w: part.w, h: part.h });
