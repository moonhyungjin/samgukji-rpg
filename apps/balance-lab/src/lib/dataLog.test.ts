import { describe, expect, it } from 'vitest';
import { CHANGELOG_HEADER, MAX_LOG_LINES, describeChanges, formatTime } from './dataLog';
import { filesSnapshot } from './fileSync';
import type { DataFiles } from './fileSync';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const NOW = new Date(2026, 9, 7, 17, 4); // 2026-10-07 17:04 (월은 0부터)

function change(fn: (f: DataFiles) => void, memo = ''): string | null {
  const base = filesSnapshot();
  const next = clone(base);
  fn(next);
  return describeChanges(base, next, memo, NOW);
}

describe('저장 기록 (describeChanges)', () => {
  it('바뀐 것이 없으면 기록하지 않는다', () => {
    expect(change(() => {})).toBeNull();
  });

  it('시각 표기: 2026-10-07 17:04', () => {
    expect(formatTime(NOW)).toBe('2026-10-07 17:04');
  });

  it('밸런스 수치: 경로와 이전 값 → 새 값을 적는다', () => {
    const before = filesSnapshot().balance.damage.attackScale; // 사용자가 Lab에서 값을 바꿔도 시험이 깨지지 않도록 현재 값에서 출발한다
    const log = change((f) => {
      f.balance.damage.attackScale = before + 7;
      f.balance.troopFactor.relative!.exponent = 0.7;
    })!;
    expect(log).toContain('## 2026-10-07 17:04 — 밸런스 수치');
    expect(log).toContain(`- balance.damage.attackScale: ${before} → ${before + 7}`);
    expect(log).toContain('- balance.troopFactor.relative.exponent: 0.5 → 0.7');
  });

  it('병종과 장수: 항목 id와 안쪽 값 경로까지 적는다', () => {
    // 현재 값에서 출발해 둘 다 바꾼다 (사용자가 Lab에서 값을 바꿔도 시험이 깨지지 않도록)
    const cur = filesSnapshot().data.unitTypes.cavalry.damageTakenByType ?? { physical: 1, magic: 1 };
    const next = { physical: Math.round((cur.physical + 0.3) * 100) / 100, magic: Math.round((cur.magic + 0.3) * 100) / 100 };
    const log = change((f) => {
      f.data.unitTypes.cavalry.damageTakenByType = next;
      f.data.characters.guanYu.stats.attack += 1;
    })!;
    expect(log).toContain('— 병종 · 장수');
    expect(log).toContain(`- unitTypes.cavalry.damageTakenByType.physical: ${cur.physical} → ${next.physical}`);
    expect(log).toContain(`- unitTypes.cavalry.damageTakenByType.magic: ${cur.magic} → ${next.magic}`);
    expect(log).toMatch(/- characters\.guanYu\.stats\.attack: \d+ → \d+/);
  });

  it('새로 생기거나 없어진 항목을 적는다', () => {
    const log = change((f) => {
      f.data.characters.newOne = { ...f.data.characters.guanYu, id: 'newOne', name: '새 장수' };
      delete f.data.characters.zhaoYun;
    })!;
    expect(log).toContain('- + characters.newOne (새로 생김: 새 장수)');
    expect(log).toContain('- - characters.zhaoYun (없어짐)');
  });

  it('편성: 군단 구성을 "장수(전/후)" 모양으로 읽기 쉽게 적는다', () => {
    const log = change((f) => {
      f.presets.find((p) => p.id === 'shuStart')!.lineup.push({ characterId: 'huangZhong', row: 'back' });
    })!;
    expect(log).toContain('— 기본 편성');
    expect(log).toMatch(/presets\.shuStart\.lineup: \[zhangFei\(전\), liuBei\(전\), guanYu\(전\)\] → \[zhangFei\(전\), liuBei\(전\), guanYu\(전\), huangZhong\(후\)\]/);
  });

  it('메모는 제목 아래 한 줄로 들어간다 (줄바꿈은 공백으로)', () => {
    const log = change((f) => (f.balance.counter.rate = 0.4), '반격이\n너무 약해서 올림')!;
    expect(log.split('\n')[1]).toBe('메모: 반격이 너무 약해서 올림');
  });

  it('메모가 없으면 메모 줄이 없다', () => {
    const log = change((f) => (f.balance.counter.rate = 0.4))!;
    expect(log).not.toContain('메모:');
  });

  it('줄이 너무 많으면 앞부분만 적고 "외 N건"을 붙인다', () => {
    const log = change((f) => {
      for (const c of Object.values(f.data.characters)) c.stats.attack += 1;
      for (const c of Object.values(f.data.characters)) c.stats.defense += 1;
      for (const c of Object.values(f.data.characters)) c.stats.speed += 1;
    })!;
    const bullets = log.split('\n').filter((l) => l.startsWith('- '));
    expect(bullets).toHaveLength(MAX_LOG_LINES + 1);
    expect(bullets.at(-1)).toMatch(/외 \d+건/);
  });

  it('여러 파일을 고치면 제목에 파일 이름이 모두 나온다', () => {
    const log = change((f) => {
      f.balance.counter.rate = 0.4;
      f.data.skills['cavalry-charge'].power = 1.5;
    })!;
    expect(log.split('\n')[0]).toBe('## 2026-10-07 17:04 — 스킬 · 밸런스 수치');
  });

  it('기록 파일 머리말은 사용 방법을 알려 준다', () => {
    expect(CHANGELOG_HEADER).toContain('# 데이터 변경 기록');
    expect(CHANGELOG_HEADER).toContain('가장 아래가 최신');
  });
});
