export type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se';

/** 끌기 시작 때의 상자와 이동량으로 새 상자를 구한다 (크기는 1 이상, 좌표는 정수) */
export function dragRect(start: { x: number; y: number; w: number; h: number }, mode: DragMode, dx: number, dy: number) {
  if (mode === 'move') return { x: Math.round(start.x + dx), y: Math.round(start.y + dy), w: start.w, h: start.h };
  const west = mode.includes('w');
  const north = mode.includes('n');
  const w = Math.max(1, Math.round(west ? start.w - dx : start.w + dx));
  const h = Math.max(1, Math.round(north ? start.h - dy : start.h + dy));
  return { x: west ? Math.round(start.x + start.w - w) : start.x, y: north ? Math.round(start.y + start.h - h) : start.y, w, h };
}
