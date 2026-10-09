import type { Family, Row, Side } from '@samgukji/battle-engine';

/** 화면의 논리 좌표계. 실제 크기에 맞춰 통째로 확대/축소한다. */
export const WORLD_W = 1280;
export const WORLD_H = 900;

export const CARD_W = 200;
export const CARD_H = 112;

export const FONT = 'Malgun Gothic, Apple SD Gothic Neo, Noto Sans KR, sans-serif';

export const FAMILY_COLOR: Record<Family, number> = {
  infantry: 0x3f7fbf,
  shield: 0x6c7a99,
  cavalry: 0xc9703a,
  archer: 0x4aa86b,
  strategist: 0x8d5fc4,
  taoist: 0x2fa3a3,
  geomancer: 0xc9a43a,
  lord: 0xb83b3b,
};

export const FAMILY_GLYPH: Record<Family, string> = {
  infantry: '보',
  shield: '방',
  cavalry: '기',
  archer: '궁',
  strategist: '책',
  taoist: '도',
  geomancer: '풍',
  lord: '군',
};

export const SIDE_COLOR: Record<Side, number> = { attacker: 0x5b8cff, defender: 0xff6b6b };

// 공격측은 왼쪽, 방어측은 오른쪽. 안쪽 열이 전열이다 (원작 화면과 같은 배치).
const COLUMN_X: Record<Side, Record<Row, number>> = {
  attacker: { back: 40, front: 270 },
  defender: { front: 810, back: 1040 },
};
const ROW_Y = [510, 636, 762];

/** 카드의 왼쪽 위 좌표. 슬롯이 3칸을 넘으면 마지막 칸에 겹친다 (9대9 확장 시 다시 설계해야 한다). */
export function slotPosition(side: Side, row: Row, slot: number): { x: number; y: number } {
  return { x: COLUMN_X[side][row], y: ROW_Y[Math.min(Math.max(slot, 0), ROW_Y.length - 1)] };
}

export function columnX(side: Side, row: Row): number {
  return COLUMN_X[side][row];
}

/** Shared by the Pixi card and its accessible HTML action surface. */
export function cardLayout(side: Side, row: Row, slot: number) {
  return { ...slotPosition(side, row, slot), width: CARD_W, height: CARD_H };
}
