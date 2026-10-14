import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mentions, resolveArtPath } from '../../../artApi';
import { globToRegExp, matchesFilter, slotSummary, slotsFor, splitDeletable, statusOf } from './artReview';
import type { ArtImage, ArtSlot } from './artReview';

const slotsFile = fileURLToPath(new URL('../../../../../docs/art/battle-slots.json', import.meta.url));
const manifest = JSON.parse(readFileSync(slotsFile, 'utf-8')) as { slots: ArtSlot[] };
const img = (path: string, usedByGame = false): ArtImage => ({ path, bytes: 1000, width: 10, height: 10, usedByGame, usedByDocs: false, hasAlpha: null });

describe('에셋 검수: 경로 패턴과 슬롯', () => {
  it('* 는 / 를 넘지 않는다', () => {
    const re = globToRegExp('docs/art/ui-sheets/slices/dark/card_*.png');
    expect(re.test('docs/art/ui-sheets/slices/dark/card_guan_yu.png')).toBe(true);
    expect(re.test('docs/art/ui-sheets/slices/dark/sub/card_x.png')).toBe(false);
    expect(re.test('docs/art/ui-sheets/slices/light/card_guan_yu.png')).toBe(false);
    expect(globToRegExp('a.b*.png').test('aXbc.png')).toBe(false); // 점은 글자 그대로
  });

  it('슬롯 파일: id가 겹치지 않고 모든 슬롯에 이름과 크기, 상태가 있다', () => {
    const ids = manifest.slots.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of manifest.slots) {
      expect(s.name, s.id).toBeTruthy();
      expect(s.size, s.id).toBeTruthy();
      expect(s.states.length, s.id).toBeGreaterThan(0);
      for (const p of s.match ?? []) expect(() => globToRegExp(p), `${s.id} ${p}`).not.toThrow();
    }
  });

  it('그림이 슬롯에 들어간다: 헤더 배경은 A1, 카드 틀 조각은 D1', () => {
    expect(slotsFor('apps/game/public/art/battle/ui/header/header_bg_bar.png', manifest.slots).map((s) => s.id)).toEqual(['A1']);
    expect(slotsFor('docs/art/ui-sheets/slices/dark/card_guan_yu_selected.png', manifest.slots).map((s) => s.id)).toEqual(['D1']);
    expect(slotsFor('docs/art/rance-mockup/whatever.png', manifest.slots)).toEqual([]);
  });

  it('상태 필터와 슬롯 요약', () => {
    const review = { 'a.png': 'ok', 'b.png': 'no' } as const;
    expect(statusOf('c.png', review)).toBe('pending');
    expect(matchesFilter('a.png', review, 'ok')).toBe(true);
    expect(matchesFilter('a.png', review, 'pending')).toBe(false);
    const slot: ArtSlot = { id: 'X', group: 'g', name: 'n', size: 's', states: ['기본'], match: ['*.png'] };
    expect(slotSummary(slot, [img('a.png'), img('b.png'), img('c.png')], review)).toEqual({ total: 3, ok: 1, no: 1, pending: 1 });
  });

  it('NO 정리: 게임이 쓰는 파일은 지울 수 없다', () => {
    const images = [img('x/a.png'), img('x/b.png', true), img('x/c.png')];
    const { deletable, blocked } = splitDeletable(images, { 'x/a.png': 'no', 'x/b.png': 'no', 'x/c.png': 'ok' });
    expect(deletable.map((i) => i.path)).toEqual(['x/a.png']);
    expect(blocked.map((i) => i.path)).toEqual(['x/b.png']);
  });
});

describe('에셋 검수 API의 안전장치', () => {
  it('아트 폴더 밖이거나 이미지가 아닌 경로, 상위 폴더로 나가는 경로는 거부한다', () => {
    expect(resolveArtPath('docs/art/reference/sample-3-ui-kit.png')).not.toBeNull();
    expect(resolveArtPath('apps/game/public/art/battle/plain-v1.png')).not.toBeNull();
    expect(resolveArtPath('../../etc/passwd.png')).toBeNull();
    expect(resolveArtPath('docs/art/../../package.json')).toBeNull();
    expect(resolveArtPath('docs/art/battle-slots.json')).toBeNull(); // 이미지가 아니다
    expect(resolveArtPath('packages/game-data/data/skills.json')).toBeNull();
    expect(resolveArtPath('')).toBeNull();
  });

  it('파일 이름이 다른 이름의 일부일 때는 쓴다고 보지 않는다', () => {
    expect(mentions('url(ui/header/gauge_morale_tug_bar.png)', 'morale_tug_bar.png')).toBe(false);
    expect(mentions('url(ui/header/gauge_morale_tug_bar.png)', 'gauge_morale_tug_bar.png')).toBe(true);
    expect(mentions('`${base}liu-bei-idle-v1.png`', 'liu-bei-idle-v1.png')).toBe(true);
  });
});
