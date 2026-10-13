/**
 * 전투 화면 상단 헤더의 고정 영역 (논리 화면 1280×900 기준 좌표).
 * 원본은 docs/art/battle-slots.md의 "A 헤더"와 docs/art/battle-slots.json의 regions이고, headerLayout.test.ts가 둘이 같은지 확인한다.
 * 층 순서(아래 → 위): 배경 띠 → 진영색 판 → 진영 표지 테두리 → 진영 이름 글자.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const HEADER = {
  /** A1 헤더 배경 띠 */
  background: { x: 0, y: 0, w: 1280, h: 70 },
  /** A2 진영 표지 테두리 (좌/우) */
  badge: { left: { x: 10, y: 6, w: 350, h: 58 }, right: { x: 920, y: 6, w: 350, h: 58 } },
  /** A3 진영색 판: 테두리 안쪽. 넘치는 부분은 잘라 낸다 */
  plate: { left: { x: 18, y: 12, w: 334, h: 46 }, right: { x: 928, y: 12, w: 334, h: 46 } },
  /** A4 진영 이름 글자 영역 (가운데 정렬) */
  name: { left: { x: 40, y: 16, w: 290, h: 38 }, right: { x: 950, y: 16, w: 290, h: 38 } },
  /** A5 라운드 표시, 화면 정가운데 */
  round: { x: 560, y: 2, w: 160, h: 36 },
  /** A6 사기 바 */
  moraleBar: { x: 420, y: 44, w: 440, h: 14 },
  /** A8 사기 숫자 (좌/우) */
  moraleNumbers: { left: { x: 372, y: 42, w: 44, h: 18 }, right: { x: 864, y: 42, w: 44, h: 18 } },
  /** A9 사기 가운데 배지/글자 */
  moraleLabel: { x: 610, y: 40, w: 60, h: 22 },
} as const;

export const centerOf = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
