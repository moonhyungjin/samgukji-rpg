import { describe, expect, it } from 'vitest';
import { freshProgress, parseProgress } from './progress';

describe('캠페인 브라우저 저장', () => {
  it('정비 상태와 빈 슬롯을 왕복하며 원본을 바꾸지 않는다', () => {
    const p = freshProgress();
    p.state.lineup[0] = { ...p.state.lineup[0], row: 'back', slot: 2 };
    expect(parseProgress(JSON.stringify(p))).toEqual(p);
    expect(freshProgress().state.lineup).not.toEqual(p.state.lineup);
  });
  it('전투 재개용 시드를 보존한다', () => {
    const p = { ...freshProgress(), phase: 'battle', seed: 27 };
    expect(parseProgress(JSON.stringify(p))).toEqual(p);
  });
  it('깨진 데이터와 없는 장수, 음수 돈, 중복 슬롯을 거부한다', () => {
    expect(parseProgress('{')).toBeNull();
    expect(parseProgress('{}')).toBeNull();
    for (const change of [
      (p: ReturnType<typeof freshProgress>) => { p.state.gold = -1; },
      (p: ReturnType<typeof freshProgress>) => { p.state.roster[0].characterId = 'missing'; },
      (p: ReturnType<typeof freshProgress>) => { p.state.lineup.push(p.state.lineup[0]); },
      (p: ReturnType<typeof freshProgress>) => { p.state.roster[0].troops = p.state.roster[0].capacity + 1; },
    ]) { const p = freshProgress(); change(p); expect(parseProgress(JSON.stringify(p))).toBeNull(); }
  });
  it('결과 화면은 요약이 있어야만 복원한다', () => {
    const p = { ...freshProgress(), phase: 'result', summary: null };
    expect(parseProgress(JSON.stringify(p))).toBeNull();
  });
});
