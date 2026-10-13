import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ART_URLS } from '../../../../game/src/render/battleArt';
import { DEFAULT_GAME_URL, applicableKeys, groupHighlightMessage, groupSlots, highlightMessage, parseRectChange, slotColor, viewerImageUrl, viewerSrc } from './artViewer';
import type { ArtSlot } from './artReview';

const slots = (JSON.parse(readFileSync(fileURLToPath(new URL('../../../../../docs/art/battle-slots.json', import.meta.url)), 'utf-8')) as { slots: ArtSlot[] }).slots;

describe('에셋 검수 Viewer 도우미', () => {
  it('슬롯을 고르면 그 영역과 이름을 보내고, 슬롯이 없으면 표시를 지운다', () => {
    const a1 = slots.find((s) => s.id === 'A1');
    expect(highlightMessage(a1)).toEqual({ type: 'art-viewer:highlight', rects: [{ x: 0, y: 0, w: 1280, h: 70, label: 'A1 헤더 배경 띠', slotId: 'A1', region: 0, layer: 1, editable: true }], label: '' });
    expect(highlightMessage(undefined)).toEqual({ type: 'art-viewer:highlight', rects: [], label: '' });
    // 영역이 둘인 슬롯(좌/우)은 첫 상자에만 이름을, 나머지에는 ID만 붙인다
    const a2 = slots.find((s) => s.id === 'A2')!;
    const m2 = highlightMessage(a2);
    if (m2.type !== 'art-viewer:highlight') throw new Error('highlight expected');
    expect(m2.rects.map((r) => r.label)).toEqual(['A2 진영 표지 테두리', 'A2']);
    // 좌우 대칭(mirror) 슬롯은 양쪽 모두 끌 수 있다 (대칭 유지가 켜져 있으면 반대쪽이 따라온다)
    expect(m2.rects.map((r) => r.editable === true)).toEqual([true, true]);
    expect(m2.rects.every((r) => r.layer === 3)).toBe(true);
    // 코드가 정하는(locked) 슬롯은 끌 수 없다
    const d1 = highlightMessage(slots.find((s) => s.id === 'D1'));
    if (d1.type !== 'art-viewer:highlight') throw new Error('highlight expected');
    expect(d1.rects.some((r) => r.editable)).toBe(false);
  });

  it('게임 서버 주소를 다듬고, 끼워 볼 그림 주소는 Lab 개발 서버를 가리킨다', () => {
    expect(viewerSrc('http://localhost:5174/')).toBe('http://localhost:5174/?viewer=1');
    expect(viewerSrc('  ')).toBe(`${DEFAULT_GAME_URL}/?viewer=1`);
    expect(viewerImageUrl('http://localhost:5173', 'docs/art/a b.png')).toBe('http://localhost:5173/api/art/file/docs/art/a%20b.png');
  });

  it('슬롯 파일의 영역은 논리 화면 안에 있고, artKeys는 모두 게임 텍스처 이름이다', () => {
    for (const s of slots) {
      for (const r of s.regions ?? []) {
        expect(r.w, s.id).toBeGreaterThan(0);
        expect(r.h, s.id).toBeGreaterThan(0);
        expect(r.x >= 0 && r.y >= 0 && r.x + r.w <= 1280 && r.y + r.h <= 900, `${s.id} 영역이 화면 밖`).toBe(true);
      }
      for (const k of applicableKeys(s)) expect(Object.keys(ART_URLS), `${s.id}: ${k}`).toContain(k);
    }
  });

  it('그림을 끼워 볼 수 있는 슬롯은 모두 화면 영역도 갖고 있다', () => {
    for (const s of slots.filter((x) => (x.artKeys ?? []).length > 0)) expect((s.regions ?? []).length, s.id).toBeGreaterThan(0);
  });

  it('구조 보기: 슬롯마다 다른 색이고, 가린 슬롯은 빠지며, 상자의 색이 칩의 색과 같다', () => {
    const members = groupSlots(slots, 'A 헤더');
    const all = groupHighlightMessage(slots, 'A 헤더');
    if (all.type !== 'art-viewer:highlight') throw new Error('highlight expected');
    const colors = new Set(all.rects.map((r) => r.color));
    expect(colors.size).toBe(members.length); // 슬롯 수만큼 서로 다른 색
    const a2 = members.findIndex((m) => m.id === 'A2');
    expect(all.rects.filter((r) => r.label === 'A2' || r.label === 'A2 진영 표지 테두리').every((r) => r.color === slotColor(a2))).toBe(true);
    const onlyA2 = groupHighlightMessage(slots, 'A 헤더', new Set(members.filter((m) => m.id !== 'A2').map((m) => m.id)));
    if (onlyA2.type !== 'art-viewer:highlight') throw new Error('highlight expected');
    expect(onlyA2.rects).toHaveLength(2); // A2는 좌/우 두 상자
    expect(groupHighlightMessage(slots, 'A 헤더', new Set(members.map((m) => m.id)))).toMatchObject({ rects: [] });
  });

  it('구조 보기에서 끌어 고칠 수 있는 것은 고른 슬롯의 상자뿐이다', () => {
    const message = groupHighlightMessage(slots, 'A 헤더', new Set(), 'A5');
    if (message.type !== 'art-viewer:highlight') throw new Error('highlight expected');
    expect(message.rects.filter((r) => r.editable).map((r) => r.slotId)).toEqual(['A5']);
  });

  it('게임 화면이 보낸 영역 변경 메시지를 걸러 읽는다', () => {
    expect(parseRectChange({ type: 'art-viewer:rect-change', slotId: 'A5', region: 0, x: 1, y: 2, w: 3, h: 4 })).toMatchObject({ slotId: 'A5', w: 3 });
    expect(parseRectChange({ type: 'art-viewer:rect-change', slotId: 'A5', region: 0, x: 'a', y: 2, w: 3, h: 4 })).toBeNull();
    expect(parseRectChange({ type: 'other' })).toBeNull();
    expect(parseRectChange(null)).toBeNull();
  });

  it('같은 그룹의 슬롯을 한꺼번에 표시한다 (헤더 구조 보기)', () => {
    const message = groupHighlightMessage(slots, 'A 헤더');
    if (message.type !== 'art-viewer:highlight') throw new Error('highlight expected');
    const labels = message.rects.map((r) => r.label ?? '');
    for (const id of ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9']) expect(labels.some((l) => l === id || l.startsWith(`${id} `)), id).toBe(true);
    expect(labels.some((l) => l.startsWith('B1'))).toBe(false); // 다른 그룹은 섞이지 않는다
  });
});

// 헤더 영역은 Lab 에셋 검수에서 사용자가 숫자/드래그로 고치므로, 위치 자체(가운데 정렬, 겹침 등)는 테스트로 고정하지 않는다.
// 고정하는 것: 좌우 대칭 슬롯의 일관성(headerLayout.test.ts)과 이름은 그림이 아니라 글자라는 점.
describe('헤더 고정 영역', () => {
  it('진영 이름은 그림이 아니라 글자다', () => {
    expect(slots.find((s) => s.id === 'A4')?.codeDrawn).toBe(true);
    expect(slots.find((s) => s.id === 'A4')?.artKeys ?? []).toEqual([]);
  });
});
