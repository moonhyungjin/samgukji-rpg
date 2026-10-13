import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CARD_PARTS, onCard } from './cardParts';
import type { Rect } from './headerLayout';
import { CARD_H, CARD_W, slotPosition } from './theme';

type Slot = { id: string; regions?: Rect[] };
const slots = (JSON.parse(readFileSync(fileURLToPath(new URL('../../../../docs/art/battle-slots.json', import.meta.url)), 'utf-8')) as { slots: Slot[] }).slots;
const regionsOf = (id: string) => slots.find((s) => s.id === id)?.regions ?? [];

// 카드 12장의 왼쪽 위 좌표 (진영, 열, 칸 순서)
const cards = (['attacker', 'defender'] as const).flatMap((side) => (['front', 'back'] as const).flatMap((row) => [0, 1, 2].map((slot) => slotPosition(side, row, slot))));
const expected = (...parts: Rect[]) => cards.flatMap((card) => parts.map((part) => onCard(card, part)));

describe('군단 카드 부품: 코드(CARD_PARTS)와 슬롯 정의(docs/art/battle-slots.json)가 같다', () => {
  it('카드 틀은 카드 크기이고, 카드는 12장이다', () => {
    expect(CARD_PARTS.frame).toEqual({ x: 0, y: 0, w: CARD_W, h: CARD_H });
    expect(cards).toHaveLength(12);
  });

  it('D1~D9의 좌표가 일치한다', () => {
    expect(regionsOf('D1')).toEqual(expected(CARD_PARTS.frame));
    expect(regionsOf('D2')).toEqual(expected(CARD_PARTS.face));
    expect(regionsOf('D3')).toEqual(expected(CARD_PARTS.name, CARD_PARTS.seal, CARD_PARTS.subtitle));
    expect(regionsOf('D4')).toEqual(expected(CARD_PARTS.troops));
    expect(regionsOf('D5')).toEqual(expected(CARD_PARTS.ap));
    expect(regionsOf('D6')).toEqual(expected(CARD_PARTS.status));
    expect(regionsOf('D7')).toEqual(expected(CARD_PARTS.dead));
    expect(regionsOf('D8')).toEqual(expected(CARD_PARTS.frame));
    expect(regionsOf('D9')).toEqual(expected(CARD_PARTS.face));
  });

  it('모든 부품은 카드 안에 들어간다', () => {
    for (const [name, p] of Object.entries(CARD_PARTS)) {
      expect(p.x >= 0 && p.y >= 0 && p.x + p.w <= CARD_W && p.y + p.h <= CARD_H, name).toBe(true);
    }
  });
});
