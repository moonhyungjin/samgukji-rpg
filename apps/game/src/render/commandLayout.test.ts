import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CARD_MENU, COMMAND_DOCK, COMMAND_PARTS, cardMenuFirstOption, cardMenuRect, onDock } from './commandLayout';
import { onCard } from './cardParts';
import type { Rect } from './slotLayout';
import { CARD_H, CARD_W, WORLD_H, WORLD_W, slotPosition } from './theme';

type Slot = { id: string; regions?: Rect[] };
const slots = (JSON.parse(readFileSync(fileURLToPath(new URL('../../../../docs/art/battle-slots.json', import.meta.url)), 'utf-8')) as { slots: Slot[] }).slots;
const regionsOf = (id: string) => slots.find((s) => s.id === id)?.regions ?? [];

// 카드 12장 (공격 6장 → 방어 6장, 열, 칸 순서)
const cards = (['attacker', 'defender'] as const).flatMap((side) => (['front', 'back'] as const).flatMap((row) => [0, 1, 2].map((slot) => ({ side, ...slotPosition(side, row, slot) }))));

describe('지휘 영역: 패널 부품은 docs/art/battle-slots.json을 읽고, 카드 행동 메뉴는 코드 값과 JSON이 같다', () => {
  it('E1~E7은 JSON의 영역을 패널 기준 좌표로 읽는다', () => {
    expect(regionsOf('E1')).toEqual([COMMAND_DOCK]);
    expect(regionsOf('E2')).toEqual([onDock(COMMAND_PARTS.title)]);
    expect(regionsOf('E3')).toEqual([onDock(COMMAND_PARTS.actor)]);
    expect(regionsOf('E4')).toEqual([onDock(COMMAND_PARTS.notice)]);
    expect(regionsOf('E5')).toEqual([onDock(COMMAND_PARTS.autoplay)]);
    expect(regionsOf('E6')).toEqual([onDock(COMMAND_PARTS.progress), onDock(COMMAND_PARTS.skip)]);
    expect(regionsOf('E7')).toEqual([onDock(COMMAND_PARTS.result)]);
  });

  it('E8~E10: 카드 12장마다 선택 영역, 메뉴 틀, 첫 행동 줄이 있다', () => {
    expect(regionsOf('E8')).toEqual(cards.map((c) => onCard(c, { x: 0, y: 0, w: CARD_W, h: CARD_H })));
    expect(regionsOf('E9')).toEqual(cards.map((c) => onCard(c, cardMenuRect(c.side))));
    expect(regionsOf('E10')).toEqual(cards.map((c) => onCard(c, cardMenuFirstOption(c.side))));
  });

  it('지휘 패널은 양쪽 카드 사이에 있고 화면 안에 들어가며, 부품은 패널 안에 들어간다', () => {
    const left = Math.max(...cards.filter((c) => c.side === 'attacker').map((c) => c.x + CARD_W));
    const right = Math.min(...cards.filter((c) => c.side === 'defender').map((c) => c.x));
    expect(COMMAND_DOCK.x).toBeGreaterThanOrEqual(left);
    expect(COMMAND_DOCK.x + COMMAND_DOCK.w).toBeLessThanOrEqual(right);
    expect(COMMAND_DOCK.y + COMMAND_DOCK.h).toBeLessThanOrEqual(WORLD_H);
    expect(COMMAND_DOCK.x + COMMAND_DOCK.w).toBeLessThanOrEqual(WORLD_W);
    for (const [name, p] of Object.entries(COMMAND_PARTS)) {
      expect(p.x >= 0 && p.y >= 0 && p.x + p.w <= COMMAND_DOCK.w && p.y + p.h <= COMMAND_DOCK.h, name).toBe(true);
    }
  });

  it('행동 메뉴는 카드 안쪽에 있고, 방어 쪽은 오른쪽 가장자리에서 같은 여백만큼 떨어진다', () => {
    for (const side of ['attacker', 'defender'] as const) {
      const m = cardMenuRect(side);
      expect(m.x >= 0 && m.x + m.w <= CARD_W, side).toBe(true);
    }
    expect(cardMenuRect('defender').x + cardMenuRect('defender').w).toBe(CARD_W - CARD_MENU.side);
    expect(cardMenuRect('attacker').x).toBe(CARD_MENU.side);
  });
});
