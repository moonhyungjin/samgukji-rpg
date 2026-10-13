import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HEADER, centerOf } from './headerLayout';
import type { Rect } from './headerLayout';

type Slot = { id: string; regions?: Rect[] };
const slots = (JSON.parse(readFileSync(fileURLToPath(new URL('../../../../docs/art/battle-slots.json', import.meta.url)), 'utf-8')) as { slots: Slot[] }).slots;
const regionsOf = (id: string) => slots.find((s) => s.id === id)?.regions ?? [];

describe('헤더 고정 영역: 코드와 슬롯 정의(docs/art/battle-slots.json)가 같다', () => {
  it('A1~A9의 좌표가 일치한다', () => {
    expect(regionsOf('A1')).toEqual([HEADER.background]);
    expect(regionsOf('A2')).toEqual([HEADER.badge.left, HEADER.badge.right]);
    expect(regionsOf('A3')).toEqual([HEADER.plate.left, HEADER.plate.right]);
    expect(regionsOf('A4')).toEqual([HEADER.name.left, HEADER.name.right]);
    expect(regionsOf('A5')).toEqual([HEADER.round]);
    expect(regionsOf('A6')).toEqual([HEADER.moraleBar]);
    expect(regionsOf('A8')).toEqual([HEADER.moraleNumbers.left, HEADER.moraleNumbers.right]);
    expect(regionsOf('A9')).toEqual([HEADER.moraleLabel]);
  });

  it('라운드는 화면 정가운데, 진영 표지는 좌우 대칭이다', () => {
    expect(centerOf(HEADER.round).x).toBe(640);
    for (const key of ['badge', 'plate', 'name'] as const) expect(centerOf(HEADER[key].left).x + centerOf(HEADER[key].right).x).toBe(1280);
  });
});
