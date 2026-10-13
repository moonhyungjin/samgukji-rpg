import { describe, expect, it } from 'vitest';
import { dragRect } from './dragRect';

const box = { x: 100, y: 50, w: 200, h: 80 };

describe('에셋 Viewer: 끌어서 영역 고치기', () => {
  it('옮기면 크기는 그대로, 좌표만 정수로 바뀐다', () => {
    expect(dragRect(box, 'move', 10.4, -5.6)).toEqual({ x: 110, y: 44, w: 200, h: 80 });
  });

  it('오른쪽 아래 모서리는 위치를 두고 크기만 바꾼다', () => {
    expect(dragRect(box, 'se', 20, 10)).toEqual({ x: 100, y: 50, w: 220, h: 90 });
  });

  it('왼쪽 위 모서리는 반대쪽 끝을 고정한다', () => {
    expect(dragRect(box, 'nw', 30, 20)).toEqual({ x: 130, y: 70, w: 170, h: 60 });
  });

  it('크기는 1보다 작아지지 않는다 (끝을 넘겨 끌어도 반대쪽 끝은 그대로)', () => {
    expect(dragRect(box, 'nw', 999, 999)).toEqual({ x: 299, y: 129, w: 1, h: 1 });
    expect(dragRect(box, 'se', -999, -999)).toEqual({ x: 100, y: 50, w: 1, h: 1 });
  });
});
