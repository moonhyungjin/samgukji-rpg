import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ART_URLS } from '../../../game/src/render/battleArt';
import { DEFAULT_GAME_URL, applicableKeys, highlightMessage, viewerImageUrl, viewerSrc } from './artViewer';
import type { ArtSlot } from './artReview';

const slots = (JSON.parse(readFileSync(fileURLToPath(new URL('../../../../docs/art/battle-slots.json', import.meta.url)), 'utf-8')) as { slots: ArtSlot[] }).slots;

describe('에셋 검수 Viewer 도우미', () => {
  it('슬롯을 고르면 그 영역과 이름을 보내고, 슬롯이 없으면 표시를 지운다', () => {
    const a1 = slots.find((s) => s.id === 'A1');
    expect(highlightMessage(a1)).toEqual({ type: 'art-viewer:highlight', rects: [{ x: 0, y: 0, w: 1280, h: 70 }], label: 'A1 헤더 배경 띠' });
    expect(highlightMessage(undefined)).toEqual({ type: 'art-viewer:highlight', rects: [], label: '' });
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
});
