import { describe, expect, it } from 'vitest';
import { alignRegion, changedRegions, editableIndexes, editModeOf, layerOrder, regionWarnings, setRegion } from './artRegions';
import type { ArtSlot } from './artReview';

const slot = (id: string, extra: Partial<ArtSlot>): ArtSlot => ({ id, group: 'T', name: id, size: '', states: [], ...extra });

describe('에셋 슬롯 영역 편집 규칙', () => {
  it('영역이 없거나 locked면 고칠 수 없다', () => {
    expect(editModeOf(slot('X', {}))).toBe('locked');
    const locked = slot('X', { regions: [{ x: 0, y: 0, w: 1, h: 1 }], edit: 'locked' });
    expect(editModeOf(locked)).toBe('locked');
    expect(editableIndexes(locked)).toEqual([]);
  });

  it('free는 고른 영역만 바뀐다 (소수는 반올림, 크기는 1 이상)', () => {
    const slots = [slot('A', { regions: [{ x: 1, y: 1, w: 5, h: 5 }, { x: 9, y: 9, w: 5, h: 5 }] })];
    const next = setRegion(slots, 'A', 1, { x: 10.4, y: 11.6, w: 0, h: 7 });
    expect(next[0].regions).toEqual([{ x: 1, y: 1, w: 5, h: 5 }, { x: 10, y: 12, w: 1, h: 7 }]);
    expect(slots[0].regions?.[1].x).toBe(9); // 원본은 그대로
  });

  it('mirror는 한쪽을 고치면 반대쪽이 좌우 대칭으로 따라온다 (대칭 유지를 끄면 따로 고친다)', () => {
    const slots = [slot('M', { edit: 'mirror', regions: [{ x: 10, y: 6, w: 350, h: 58 }, { x: 920, y: 6, w: 350, h: 58 }] })];
    expect(setRegion(slots, 'M', 0, { x: 20, y: 8, w: 300, h: 50 })[0].regions).toEqual([{ x: 20, y: 8, w: 300, h: 50 }, { x: 960, y: 8, w: 300, h: 50 }]);
    expect(setRegion(slots, 'M', 1, { x: 900, y: 8, w: 300, h: 50 })[0].regions).toEqual([{ x: 80, y: 8, w: 300, h: 50 }, { x: 900, y: 8, w: 300, h: 50 }]);
    expect(editableIndexes(slots[0])).toEqual([0, 1]);
    // 대칭 유지를 끄면 고른 쪽만 바뀐다
    expect(setRegion(slots, 'M', 1, { x: 900, y: 8, w: 300, h: 50 }, false)[0].regions).toEqual([{ x: 10, y: 6, w: 350, h: 58 }, { x: 900, y: 8, w: 300, h: 50 }]);
  });

  it('cards는 카드 12장의 같은 부품이 같은 만큼 움직이고 커진다', () => {
    // 카드 2장 × 부품 2개 (카드마다 이어짐)
    const slots = [slot('C', { edit: 'cards', parts: 2, regions: [{ x: 10, y: 10, w: 20, h: 5 }, { x: 40, y: 10, w: 8, h: 8 }, { x: 110, y: 100, w: 20, h: 5 }, { x: 140, y: 100, w: 8, h: 8 }] })];
    const next = setRegion(slots, 'C', 0, { x: 12, y: 13, w: 25, h: 5 });
    expect(next[0].regions).toEqual([{ x: 12, y: 13, w: 25, h: 5 }, { x: 40, y: 10, w: 8, h: 8 }, { x: 112, y: 103, w: 25, h: 5 }, { x: 140, y: 100, w: 8, h: 8 }]);
    expect(editableIndexes(slots[0])).toEqual([0, 1]);
  });

  it('follow한 슬롯은 원래 슬롯의 새 영역을 그대로 받는다', () => {
    const slots = [slot('D2', { edit: 'cards', regions: [{ x: 1, y: 1, w: 2, h: 2 }] }), slot('D9', { follow: 'D2', edit: 'locked', regions: [{ x: 1, y: 1, w: 2, h: 2 }] })];
    const next = setRegion(slots, 'D2', 0, { x: 5, y: 6, w: 7, h: 8 });
    expect(next[1].regions).toEqual([{ x: 5, y: 6, w: 7, h: 8 }]);
  });

  it('locked 슬롯은 고치려 해도 그대로다', () => {
    const slots = [slot('L', { edit: 'locked', regions: [{ x: 1, y: 1, w: 2, h: 2 }] })];
    expect(setRegion(slots, 'L', 0, { x: 9, y: 9, w: 9, h: 9 })[0].regions).toEqual([{ x: 1, y: 1, w: 2, h: 2 }]);
  });

  it('화면 밖으로 나가면 경고하고, 저장할 것은 달라진 슬롯만이다', () => {
    expect(regionWarnings(slot('A', { regions: [{ x: 1270, y: 0, w: 20, h: 5 }] }))).toHaveLength(1);
    const loaded = [slot('A', { regions: [{ x: 1, y: 1, w: 2, h: 2 }] }), slot('B', { regions: [{ x: 3, y: 3, w: 2, h: 2 }] })];
    const draft = setRegion(loaded, 'A', 0, { x: 9, y: 9, w: 2, h: 2 });
    expect(Object.keys(changedRegions(loaded, draft))).toEqual(['A']);
  });

  it('다른 영역에 맞춘다 (같은 영역, 같은 크기, 높이, 양 끝)', () => {
    const ref = { x: 0, y: 0, w: 1280, h: 70 };
    const r = { x: 10, y: 6, w: 350, h: 58 };
    expect(alignRegion(r, ref, 'rect')).toEqual(ref);
    expect(alignRegion(r, ref, 'size')).toEqual({ x: 10, y: 6, w: 1280, h: 70 });
    expect(alignRegion(r, ref, 'height')).toEqual({ x: 10, y: 0, w: 350, h: 70 });
    expect(alignRegion(r, ref, 'left')).toEqual({ x: 0, y: 6, w: 350, h: 58 });
    expect(alignRegion(r, ref, 'right')).toEqual({ x: 930, y: 6, w: 350, h: 58 });
  });

  it('층 순서는 layer가 작은 것부터 (아래 → 위)이고, layer가 없는 슬롯은 빠진다', () => {
    const slots = [slot('B', { layer: 2 }), slot('A', { layer: 1 }), slot('C', {})];
    expect(layerOrder(slots).map((s) => s.id)).toEqual(['A', 'B']);
  });
});
