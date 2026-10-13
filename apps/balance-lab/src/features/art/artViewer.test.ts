import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ART_URLS } from '../../../../game/src/render/battleArt';
import { DEFAULT_GAME_URL, applicableKeys, groupHighlightMessage, groupSlots, highlightMessage, slotColor, viewerImageUrl, viewerSrc } from './artViewer';
import type { ArtSlot } from './artReview';

const slots = (JSON.parse(readFileSync(fileURLToPath(new URL('../../../../../docs/art/battle-slots.json', import.meta.url)), 'utf-8')) as { slots: ArtSlot[] }).slots;

describe('에셋 검수 Viewer 도우미', () => {
  it('슬롯을 고르면 그 영역과 이름을 보내고, 슬롯이 없으면 표시를 지운다', () => {
    const a1 = slots.find((s) => s.id === 'A1');
    expect(highlightMessage(a1)).toEqual({ type: 'art-viewer:highlight', rects: [{ x: 0, y: 0, w: 1280, h: 70, label: 'A1 헤더 배경 띠' }], label: '' });
    expect(highlightMessage(undefined)).toEqual({ type: 'art-viewer:highlight', rects: [], label: '' });
    // 영역이 둘인 슬롯(좌/우)은 첫 상자에만 이름을, 나머지에는 ID만 붙인다
    const a2 = slots.find((s) => s.id === 'A2')!;
    const m2 = highlightMessage(a2);
    if (m2.type !== 'art-viewer:highlight') throw new Error('highlight expected');
    expect(m2.rects.map((r) => r.label)).toEqual(['A2 진영 표지 테두리', 'A2']);
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

  it('같은 그룹의 슬롯을 한꺼번에 표시한다 (헤더 구조 보기)', () => {
    const message = groupHighlightMessage(slots, 'A 헤더');
    if (message.type !== 'art-viewer:highlight') throw new Error('highlight expected');
    const labels = message.rects.map((r) => r.label ?? '');
    for (const id of ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9']) expect(labels.some((l) => l === id || l.startsWith(`${id} `)), id).toBe(true);
    expect(labels.some((l) => l.startsWith('B1'))).toBe(false); // 다른 그룹은 섞이지 않는다
  });
});

// 헤더 고정 배치 (사용자 구상 2026-10-13): 라운드는 화면 정가운데, 진영 표지는 양쪽에 하나씩(좌우 대칭), 사기는 가운데 아래
describe('헤더 고정 영역', () => {
  const rectsOf = (id: string) => slots.find((s) => s.id === id)?.regions ?? [];
  const centerX = (r: { x: number; w: number }) => r.x + r.w / 2;

  it('라운드 표시는 화면 정가운데(x=640)에 있다', () => {
    const [round] = rectsOf('A5');
    expect(centerX(round)).toBe(640);
  });

  it('진영 표지 테두리, 진영색 판, 이름은 좌우 하나씩이고 서로 좌우 대칭이다', () => {
    for (const id of ['A2', 'A3', 'A4']) {
      const [left, right] = rectsOf(id);
      expect(rectsOf(id), id).toHaveLength(2);
      expect(centerX(left) + centerX(right), `${id} 대칭`).toBe(1280);
      expect(left.w, id).toBe(right.w);
    }
  });

  it('진영색 판은 테두리 안쪽에 들어가고, 이름 글자는 진영색 판 안쪽에 들어간다 (넘치면 잘라 내는 층 순서)', () => {
    const inside = (inner: { x: number; y: number; w: number; h: number }, outer: { x: number; y: number; w: number; h: number }) =>
      inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
    for (const i of [0, 1]) {
      expect(inside(rectsOf('A3')[i], rectsOf('A2')[i]), `진영색 판 ${i}`).toBe(true);
      expect(inside(rectsOf('A4')[i], rectsOf('A3')[i]), `이름 ${i}`).toBe(true);
    }
  });

  it('사기 바는 라운드 아래 가운데에 있고 진영 표지와 겹치지 않는다', () => {
    const [round] = rectsOf('A5');
    const [bar] = rectsOf('A6');
    expect(centerX(bar)).toBe(640);
    expect(bar.y).toBeGreaterThanOrEqual(round.y + round.h);
    const overlaps = (a: { x: number; w: number }, b: { x: number; w: number }) => a.x < b.x + b.w && b.x < a.x + a.w;
    for (const badge of rectsOf('A2')) expect(overlaps(bar, badge)).toBe(false);
    for (const n of rectsOf('A8')) for (const badge of rectsOf('A2')) expect(overlaps(n, badge), '사기 숫자').toBe(false);
  });

  it('진영 이름은 그림이 아니라 글자다', () => {
    expect(slots.find((s) => s.id === 'A4')?.codeDrawn).toBe(true);
    expect(slots.find((s) => s.id === 'A4')?.artKeys ?? []).toEqual([]);
  });
});
