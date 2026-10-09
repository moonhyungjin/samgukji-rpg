import { describe, expect, it } from 'vitest';
import { lineupIssue, runCampaign, startCampaign } from '@samgukji/battle-engine';
import { campaign, defaultBalance, gameData, resolveCampaign } from '../src';

// 캠페인 데이터(data/campaign.json)가 지켜야 하는 구조 규칙. 숫자는 계속 바뀌므로 값은 고정하지 않는다.
describe('캠페인 데이터', () => {
  it('편성 이름이 풀리고, 나오는 장수와 병종이 모두 데이터에 있다', () => {
    expect(campaign.start.length).toBeGreaterThan(0);
    expect(campaign.battles.length).toBeGreaterThan(0);
    const entries = [...campaign.start, ...campaign.battles.flatMap((b) => b.enemy)];
    for (const e of entries) {
      expect(gameData.characters[e.characterId], e.characterId).toBeDefined();
      expect(gameData.unitTypes[e.unitType ?? gameData.characters[e.characterId].unitType], e.characterId).toBeDefined();
    }
    for (const j of campaign.battles.flatMap((b) => b.joins)) {
      expect(gameData.characters[j.characterId], j.characterId).toBeDefined();
      if (j.unitType) expect(gameData.unitTypes[j.unitType], j.unitType).toBeDefined();
    }
  });

  it('적은 전투마다 정한 레벨로 나온다', () => {
    for (const b of campaign.battles) expect(new Set(b.enemy.map((e) => e.level)).size).toBe(1);
  });

  it('시작 편성으로 바로 출전할 수 있다', () => {
    const state = startCampaign(campaign, gameData, defaultBalance);
    expect(lineupIssue(state, state.lineup, gameData)).toBeNull();
  });

  it('장수별 시작 레벨이 있으면 그 장수에만 쓰고, 나머지는 공통 시작 레벨이다', () => {
    const first = campaign.start[0].characterId;
    const c = resolveCampaign({ ...campaignFile(), startLevels: { [first]: 7 } });
    expect(c.start.map((e) => [e.characterId, e.level])).toEqual(campaign.start.map((e) => [e.characterId, e.characterId === first ? 7 : campaign.startLevel]));
  });

  it('없는 편성 이름이면 알려 준다', () => {
    expect(() => resolveCampaign({ ...campaignFile(), startPreset: 'nothing' })).toThrow('nothing');
  });

  it('자동 정비로 끝까지 돌릴 수 있다 (오류 없이 끝나거나, 한 전투에서 여러 번 져서 멈춘다)', () => {
    const run = runCampaign(campaign, gameData, defaultBalance, startCampaign(campaign, gameData, defaultBalance), 1);
    expect(run.log.length).toBeGreaterThan(0);
    expect(run.state.gold).toBeGreaterThanOrEqual(0);
  });
});

function campaignFile() {
  return {
    id: campaign.id,
    name: campaign.name,
    startGold: campaign.startGold,
    startLevel: campaign.startLevel,
    startPreset: 'shuStart',
    battles: [],
    exp: campaign.exp,
    promotionLevels: campaign.promotionLevels,
    captureRate: campaign.captureRate,
  };
}
