import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HEADER } from './headerLayout';
import type { Rect } from './headerLayout';
import { WORLD_H, WORLD_W } from './theme';

type Slot = { id: string; edit?: string; layer?: number; regions?: Rect[] };
const slots = (JSON.parse(readFileSync(fileURLToPath(new URL('../../../../docs/art/battle-slots.json', import.meta.url)), 'utf-8')) as { slots: Slot[] }).slots;
const slot = (id: string) => slots.find((s) => s.id === id);

describe('헤더 고정 영역: 좌표의 원본은 docs/art/battle-slots.json이고 코드가 그대로 읽는다', () => {
  it('A1~A9를 읽어 온다', () => {
    expect(slot('A1')?.regions).toEqual([HEADER.background]);
    expect(slot('A2')?.regions).toEqual([HEADER.badge.left, HEADER.badge.right]);
    expect(slot('A3')?.regions).toEqual([HEADER.plate.left, HEADER.plate.right]);
    expect(slot('A4')?.regions).toEqual([HEADER.name.left, HEADER.name.right]);
    expect(slot('A5')?.regions).toEqual([HEADER.round]);
    expect(slot('A6')?.regions).toEqual([HEADER.moraleBar]);
    expect(slot('A7')?.regions).toEqual([HEADER.moralePointer]);
    expect(slot('A8')?.regions).toEqual([HEADER.moraleNumbers.left, HEADER.moraleNumbers.right]);
    expect(slot('A9')?.regions).toEqual([HEADER.moraleLabel]);
  });

  it('A10(헤더 장식)은 없앴다', () => {
    expect(slot('A10')).toBeUndefined();
  });

  it('좌우로 나뉜 영역(mirror)은 좌/우 두 개이고, 층 순서(layer)가 정해져 있다', () => {
    for (const s of slots.filter((x) => x.edit === 'mirror')) expect(s.regions, s.id).toHaveLength(2);
    // 아래 → 위: 배경 띠 → 진영색 판 → 진영 표지 테두리
    expect(slot('A1')!.layer!).toBeLessThan(slot('A3')!.layer!);
    expect(slot('A3')!.layer!).toBeLessThan(slot('A2')!.layer!);
  });

  it('헤더 영역은 모두 화면 안에 있다', () => {
    for (const s of slots.filter((x) => x.id.startsWith('A'))) {
      for (const r of s.regions ?? []) expect(r.x >= 0 && r.y >= 0 && r.x + r.w <= WORLD_W && r.y + r.h <= WORLD_H, s.id).toBe(true);
    }
  });
});
