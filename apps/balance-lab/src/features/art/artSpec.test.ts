import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fileNameOf, fitChecks, hasSpec, specMarkdown } from './artSpec';
import type { ArtSlot } from './artReview';

const slots = (JSON.parse(readFileSync(fileURLToPath(new URL('../../../../../docs/art/battle-slots.json', import.meta.url)), 'utf-8')) as { slots: ArtSlot[] }).slots;
const a2 = slots.find((s) => s.id === 'A2')!;

describe('에셋 제작 명세서와 맞춤 검사', () => {
  it('조건이 있는 슬롯만 명세서를 만들고, 파일 이름은 <ID>_<slug>이다', () => {
    expect(hasSpec(a2)).toBe(true);
    expect(hasSpec(slots.find((s) => s.id === 'B4'))).toBe(false);
    expect(fileNameOf(a2)).toBe('A2_faction-frame.png');
    expect(fileNameOf(slots.find((s) => s.id === 'A3')!)).toBe('A3_faction-plate_<shu|yellow|wei>.png');
  });

  it('A2 명세서에 크기(2배), 투명, 양 끝 고정, 좌우 반전, 겹침이 들어간다', () => {
    const text = specMarkdown(a2, slots);
    expect(text).toContain(`${a2.regions![0].w * 2}×${a2.regions![0].h * 2}`);
    expect(text).toContain('투명 배경');
    expect(text).toContain('양 끝 180px');
    expect(text).toContain('좌우로 뒤집어');
    expect(text).toContain('A3 진영색 판'); // 아래층
    expect(text).toContain('A4 진영 이름');
  });

  it('크기를 바꾸면 명세서도 따라 바뀐다', () => {
    const bigger = { ...a2, regions: [{ x: 0, y: 0, w: 400, h: 70 }, ...(a2.regions ?? []).slice(1)] };
    expect(specMarkdown(bigger, slots)).toContain('800×140');
  });

  it('비율, 크기, 투명 여부를 검사한다', () => {
    const w = a2.regions![0].w;
    const h = a2.regions![0].h;
    const good = fitChecks({ width: w * 2, height: h * 2, hasAlpha: true }, a2);
    expect(good.every((c) => c.ok)).toBe(true);
    const square = fitChecks({ width: 1024, height: 1024, hasAlpha: false }, a2);
    expect(square.filter((c) => !c.ok).map((c) => c.key)).toEqual(['ratio', 'size', 'alpha']);
    expect(fitChecks({ width: w * 2, height: h * 2, hasAlpha: null }, a2).map((c) => c.key)).toEqual(['ratio', 'size']); // 알파를 모르면 검사하지 않는다
    expect(fitChecks({ width: 10, height: 10, hasAlpha: true }, undefined)).toEqual([]);
  });
});
