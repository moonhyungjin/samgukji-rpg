import { regionAt } from './slotLayout';
export type { Rect } from './slotLayout';
import type { Rect } from './slotLayout';

/**
 * 전투 화면 상단 헤더의 고정 영역 (논리 화면 1280×900 기준 좌표).
 * 좌표의 원본은 docs/art/battle-slots.json의 regions다 (Lab 에셋 검수에서 고친다). 사람이 읽는 설명은 docs/art/battle-slots.md의 "A 헤더".
 * 층 순서(아래 → 위): 배경 띠 → 진영색 판 → 진영 표지 테두리 → 진영 이름 글자.
 */
export const HEADER = {
  /** A1 헤더 배경 띠 */
  background: regionAt('A1'),
  /** A2 진영 표지 테두리 (좌/우) */
  badge: { left: regionAt('A2', 0), right: regionAt('A2', 1) },
  /** A3 진영색 판: 테두리 안쪽. 넘치는 부분은 잘라 낸다 */
  plate: { left: regionAt('A3', 0), right: regionAt('A3', 1) },
  /** A4 진영 이름 글자 영역 (가운데 정렬) */
  name: { left: regionAt('A4', 0), right: regionAt('A4', 1) },
  /** A5 라운드 표시 */
  round: regionAt('A5'),
  /** A6 사기 바 */
  moraleBar: regionAt('A6'),
  /** A7 사기 포인터: 가로는 바 구간(x, w), 세로는 영역 높이 */
  moralePointer: regionAt('A7'),
  /** A8 사기 숫자 (좌/우) */
  moraleNumbers: { left: regionAt('A8', 0), right: regionAt('A8', 1) },
  /** A9 사기 가운데 배지/글자 */
  moraleLabel: regionAt('A9'),
};

export const centerOf = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
