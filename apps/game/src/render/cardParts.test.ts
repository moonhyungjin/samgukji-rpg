import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CARD_PARTS, onCard } from './cardParts';
import type { Rect } from './slotLayout';
import { CARD_H, CARD_W, slotPosition } from './theme';

type Slot = { id: string; edit?: string; parts?: number; follow?: string; regions?: Rect[] };
const slots = (JSON.parse(readFileSync(fileURLToPath(new URL('../../../../docs/art/battle-slots.json', import.meta.url)), 'utf-8')) as { slots: Slot[] }).slots;
const slot = (id: string) => slots.find((s) => s.id === id);

// 카드 12장의 왼쪽 위 좌표 (진영, 열, 칸 순서)
const cards = (['attacker', 'defender'] as const).flatMap((side) => (['front', 'back'] as const).flatMap((row) => [0, 1, 2].map((n) => slotPosition(side, row, n))));
const expected = (...parts: Rect[]) => cards.flatMap((card) => parts.map((part) => onCard(card, part)));

describe('군단 카드 부품: 좌표의 원본은 docs/art/battle-slots.json이고 카드 12장이 같은 위치를 쓴다', () => {
  it('카드 틀은 카드 크기이고, 카드는 12장이다', () => {
    expect(CARD_PARTS.frame).toEqual({ x: 0, y: 0, w: CARD_W, h: CARD_H });
    expect(cards).toHaveLength(12);
    expect(slot('D1')?.regions).toEqual(expected(CARD_PARTS.frame));
  });

  it('D2~D7은 카드 12장에 같은 위치로 이어진다 (Lab이 한 번 고치면 12장에 적용한 결과)', () => {
    expect(slot('D2')?.regions).toEqual(expected(CARD_PARTS.face));
    expect(slot('D3')?.regions).toEqual(expected(CARD_PARTS.name, CARD_PARTS.seal, CARD_PARTS.subtitle));
    expect(slot('D4')?.regions).toEqual(expected(CARD_PARTS.troops));
    expect(slot('D5')?.regions).toEqual(expected(CARD_PARTS.ap));
    expect(slot('D6')?.regions).toEqual(expected(CARD_PARTS.status));
    expect(slot('D7')?.regions).toEqual(expected(CARD_PARTS.dead));
  });

  it('따라오는 슬롯(follow)은 원래 슬롯과 같은 영역이다', () => {
    for (const s of slots.filter((x) => x.follow)) expect(s.regions, s.id).toEqual(slot(s.follow!)?.regions);
  });

  it('모든 부품은 카드 안에 들어간다', () => {
    for (const [name, p] of Object.entries(CARD_PARTS)) {
      expect(p.x >= 0 && p.y >= 0 && p.x + p.w <= CARD_W && p.y + p.h <= CARD_H, name).toBe(true);
    }
  });
});
