import { CARD_H, CARD_W } from './theme';
import type { Rect } from './slotLayout';
import { regionAt, relativeTo } from './slotLayout';

/** 기준 카드(D1의 첫 영역)의 왼쪽 위 */
const ORIGIN = regionAt('D1', 0);
/** 기준 카드 안에서 본 부품 위치 (D 슬롯은 카드마다 부품 수만큼 영역이 이어진다) */
const part = (id: string, index: number): Rect => relativeTo(ORIGIN, regionAt(id, index));

/**
 * 군단 카드(200×112) 안의 부품 위치 (카드 왼쪽 위가 원점).
 * 원본은 docs/art/battle-slots.json의 D 슬롯 regions다 (Lab 에셋 검수에서 고치면 카드 12장이 모두 따라온다). 첫 카드(공격 쪽 앞열 1번)에서 본 위치를 쓴다.
 * 사람이 읽는 설명은 docs/art/battle-slots.md의 "D 카드". UnitSprite가 이 값으로 그린다.
 */
export const CARD_PARTS = {
  /** D1 카드 틀 */
  frame: { x: 0, y: 0, w: CARD_W, h: CARD_H },
  /** D2 얼굴(초상). 그림이 없으면 D9 병종 표식이 같은 자리에 들어간다 */
  face: part('D2', 0),
  /** D3 이름 글자 */
  name: part('D3', 0),
  /** D3 한자 인장 */
  seal: part('D3', 1),
  /** D3 병종·번호 글자 */
  subtitle: part('D3', 2),
  /** D4 병력 숫자 (오른쪽 정렬) */
  troops: part('D4', 0),
  /** D5 AP 칸 줄 */
  ap: part('D5', 0),
  /** D6 상태 줄 (가드 %, 결계, 버프, 디버프) */
  status: part('D6', 0),
  /** D7 전멸 표시 */
  dead: part('D7', 0),
} as const satisfies Record<string, Rect>;

/** 카드 부품을 화면 좌표로 옮긴다 (카드의 왼쪽 위 좌표를 더한다) */
export const onCard = (card: { x: number; y: number }, part: Rect): Rect => ({ x: card.x + part.x, y: card.y + part.y, w: part.w, h: part.h });
