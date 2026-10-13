import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { applyRegionChanges } from './slotsFile';

const real = readFileSync(fileURLToPath(new URL('../../../../../docs/art/battle-slots.json', import.meta.url)), 'utf-8');

describe('슬롯 파일 저장', () => {
  it('바꾸는 것이 없으면 글이 그대로다 (모양과 줄 바꿈 유지)', () => {
    const out = applyRegionChanges(real, {});
    expect(out).toEqual({ text: real });
  });

  it('영역만 바뀌고 나머지는 그대로다', () => {
    const out = applyRegionChanges(real, { A5: [{ x: 500, y: 4, w: 280, h: 40 }] });
    if (!('text' in out)) throw new Error(out.error);
    const before = JSON.parse(real) as { slots: { id: string; regions?: unknown }[] };
    const after = JSON.parse(out.text) as typeof before;
    expect(after.slots.find((s) => s.id === 'A5')?.regions).toEqual([{ x: 500, y: 4, w: 280, h: 40 }]);
    expect(after.slots.filter((s) => s.id !== 'A5')).toEqual(before.slots.filter((s) => s.id !== 'A5'));
    expect(out.text.split(/\r?\n/).length).toBe(real.split(/\r?\n/).length);
  });

  it('영역 개수를 바꾸거나 값이 이상하면 거절한다', () => {
    expect('error' in applyRegionChanges(real, { A5: [] })).toBe(true);
    expect('error' in applyRegionChanges(real, { A5: [{ x: 1, y: 1, w: 0, h: 5 }] })).toBe(true);
    expect('error' in applyRegionChanges(real, { A5: [{ x: 'a', y: 1, w: 3, h: 5 }] })).toBe(true);
    expect('error' in applyRegionChanges(real, { NOPE: [{ x: 1, y: 1, w: 3, h: 5 }] })).toBe(true);
  });
});
