import { describe, expect, it } from 'vitest';
import { createDefaultState } from '../lab/defaults';
import { campaignIssues, mapIssues } from './dataIssues';
import { changeLines } from './dataLog';
import type { DataFiles } from './fileSync';

const state = createDefaultState();
const files = (): DataFiles => JSON.parse(JSON.stringify({ data: state.data, balance: state.balance, presets: state.presets, campaign: state.campaign, map: state.map })) as DataFiles;

describe('Lab의 캠페인 데이터', () => {
  it('지금 캠페인 파일에는 문제가 없다', () => {
    expect(campaignIssues(files())).toEqual([]);
  });

  it('없는 편성 이름, 없는 합류 장수, 겹치는 전투 id, 숫자가 아닌 값을 오류로 알린다', () => {
    const f = files();
    f.campaign.startPreset = 'nothing';
    f.campaign.battles[0].joins = [{ characterId: 'nobody' }];
    f.campaign.battles[1].id = f.campaign.battles[0].id;
    f.campaign.battles[0].reward = Number.NaN;
    const messages = campaignIssues(f).map((i) => i.message).join('\n');
    for (const part of ['시작 편성 "nothing"', '합류 장수 "nobody"', '전투 id', '숫자가 아닙니다']) expect(messages).toContain(part);
  });

  it('변경 기록은 전투를 id로 펼쳐 경로를 보여 준다', () => {
    const before = files();
    const after = files();
    after.campaign.battles[0].reward += 100;
    const id = before.campaign.battles[0].id;
    expect(changeLines(before, after)).toEqual([`campaign.battles.${id}.reward: ${before.campaign.battles[0].reward} → ${before.campaign.battles[0].reward + 100}`]);
  });
});

describe('Lab의 지도 데이터', () => {
  it('지금 지도 파일에는 문제가 없다', () => {
    expect(mapIssues(files())).toEqual([]);
  });

  it('한쪽만 적힌 맞닿음, 없는 편성, 성 5개, 플레이어 세력 둘을 오류로 알린다', () => {
    const f = files();
    const [a, b] = f.map.regions.filter((r) => r.neighbors.length > 0);
    a.neighbors = a.neighbors.slice(1);
    const withGarrison = f.map.regions.flatMap((r) => r.castles).find((c) => c.garrison)!;
    withGarrison.garrison!.preset = 'nothing';
    b.castles = Array.from({ length: 5 }, (_, i) => ({ ...b.castles[0], id: `${b.castles[0].id}-x${i}` }));
    f.map.factions = f.map.factions.map((x) => ({ ...x, player: true }));
    const messages = mapIssues(f).map((i) => i.message).join('\n');
    for (const part of ['쪽에는', '"nothing"', '1~4개', '정확히 하나']) expect(messages).toContain(part);
  });

  it('변경 기록은 지역과 성을 id로 펼쳐 경로를 보여 준다', () => {
    const before = files();
    const after = files();
    const r = after.map.regions[0];
    r.income += 50;
    expect(changeLines(before, after)).toEqual([`map.regions.${r.id}.income: ${r.income - 50} → ${r.income}`]);
  });
});
