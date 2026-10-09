import { describe, expect, it } from 'vitest';
import { createDefaultState } from '../lab/defaults';
import { campaignIssues } from './dataIssues';
import { changeLines } from './dataLog';
import type { DataFiles } from './fileSync';

const state = createDefaultState();
const files = (): DataFiles => JSON.parse(JSON.stringify({ data: state.data, balance: state.balance, presets: state.presets, campaign: state.campaign })) as DataFiles;

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
