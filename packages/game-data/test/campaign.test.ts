import { describe, expect, it } from 'vitest';
import { lineupIssue, runCampaign, startCampaign } from '@samgukji/battle-engine';
import { campaign, campaignFile as savedCampaignFile, defaultBalance, gameData, resolveCampaign } from '../src';

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
    startPreset: savedCampaignFile.startPreset,
    battles: [],
    exp: campaign.exp,
    promotionLevels: campaign.promotionLevels,
    captureRate: campaign.captureRate,
  };
}

// 황건적 토벌 1장의 7단계 구성 (사용자 확정 흐름, 설계 문서 05의 "1장 슬라이스"). 수치와 레벨은 Lab에서 바뀌지만 누가 언제 나오는지는 이 구조를 지킨다.
describe('황건적 토벌 1장: 7단계 구성', () => {
  const familyOf = (characterId: string, unitType?: string) => gameData.unitTypes[unitType ?? gameData.characters[characterId].unitType].family;
  /** 전투 전(앞 전투들의 합류와 보직 변경을 반영한) 우리 군단: 장수 id → 병종 id */
  const partyBefore = (index: number) => {
    const party = new Map(campaign.start.map((e) => [e.characterId, e.unitType ?? gameData.characters[e.characterId].unitType]));
    campaign.battles.slice(0, index).forEach((b) => b.joins.forEach((j) => party.set(j.characterId, j.unitType ?? party.get(j.characterId) ?? gameData.characters[j.characterId].unitType)));
    return party;
  };
  const enemyFamilies = (index: number) => new Set(campaign.battles[index].enemy.map((e) => familyOf(e.characterId, e.unitType)));

  it('전투는 7개이고 군단은 처음 조조와 하후돈 둘이다', () => {
    expect(campaign.battles).toHaveLength(7);
    expect([...partyBefore(0).keys()]).toEqual(['caoCao', 'xiahouDun']);
    expect(familyOf('xiahouDun')).toBe('infantry');
  });

  it('아군이 단계마다 늘어난다: 조인(방패병) → 하후연(궁병) → 하후돈 기병 변경과 순욱(책사) → 손건(풍수사)', () => {
    expect([...partyBefore(1).keys()]).toEqual(['caoCao', 'xiahouDun', 'caoRen']);
    expect([...partyBefore(2).keys()]).toEqual(['caoCao', 'xiahouDun', 'caoRen', 'xiahouYuan']);
    expect([...partyBefore(3).keys()]).toEqual(['caoCao', 'xiahouDun', 'caoRen', 'xiahouYuan']); // 기병은 아직 없다
    expect(partyBefore(3).get('xiahouDun')).toBe('infantry');
    expect(partyBefore(4).get('xiahouDun')).toBe('cavalry'); // 4전을 이기면 하후돈이 기병이 된다
    expect(partyBefore(4).has('xunYu')).toBe(true);
    expect(partyBefore(5).has('char1')).toBe(true);
    const last = partyBefore(6);
    expect([...last.values()].map((t) => gameData.unitTypes[t].family).sort()).toEqual(['archer', 'cavalry', 'geomancer', 'lord', 'shield', 'strategist']);
  });

  it('적 구성: 초반엔 보병, 방패병, 궁병만 있고 기병은 4전에 처음 나온다', () => {
    for (let i = 0; i < 3; i++) expect([...enemyFamilies(i)].every((f) => ['infantry', 'shield', 'archer'].includes(f)), `${i + 1}전`).toBe(true);
    expect(enemyFamilies(1).has('archer')).toBe(true); // 2전부터 후열 궁수
    expect(campaign.battles[2].enemy.filter((e) => familyOf(e.characterId, e.unitType) === 'archer')).toHaveLength(2); // 3전: 궁수 둘
    expect(enemyFamilies(3).has('cavalry')).toBe(true);
    expect(enemyFamilies(4).has('cavalry')).toBe(true); // 5전도 기병 (책사로 맞선다)
  });

  it('6전에는 풍수사가, 7전에는 도사(장각)가 나오고 구성은 방패병, 보병, 기병, 궁수, 도사, 풍수사다', () => {
    expect(enemyFamilies(5).has('geomancer')).toBe(true);
    const finalBattle = campaign.battles[6];
    expect(finalBattle.enemy.map((e) => e.characterId)).toContain('zhangJiao');
    expect(familyOf('zhangJiao')).toBe('taoist');
    expect([...enemyFamilies(6)].sort()).toEqual(['archer', 'cavalry', 'geomancer', 'infantry', 'shield', 'taoist']);
  });

  it('모든 단계에서 편성이 규칙에 맞고(열, 군단 수), 합류와 보직 변경이 있는 병종이다', () => {
    campaign.battles.forEach((b, i) => {
      expect(b.enemy.length, `${i + 1}전 적 수`).toBeLessThanOrEqual(6);
      expect(partyBefore(i).size, `${i + 1}전 아군 수`).toBeLessThanOrEqual(6);
      for (const e of b.enemy) expect(gameData.unitTypes[e.unitType ?? gameData.characters[e.characterId].unitType].allowedRows, `${i + 1}전 ${e.characterId}`).toContain(e.row);
    });
  });
});

// 군주 승급 트리 (사용자 결정 2026-10-12): 군주 → 패왕 / 영웅 (1차) → 마왕 / 성황 (2차). 갈래 연결, 값, 스킬은 [임시]
describe('군주 승급 트리', () => {
  it('군주는 패왕과 영웅으로, 패왕은 마왕으로, 영웅은 성황으로 승급한다', () => {
    const t = gameData.unitTypes;
    expect(t.lord.promotesTo).toEqual(['conqueror', 'hero']);
    expect(t.conqueror.promotesTo).toEqual(['demon-king']);
    expect(t.hero.promotesTo).toEqual(['saint-emperor']);
    expect([t.conqueror.name, t.hero.name, t['demon-king'].name, t['saint-emperor'].name]).toEqual(['패왕', '영웅', '마왕', '성황']);
    for (const id of ['conqueror', 'hero', 'demon-king', 'saint-emperor']) expect(t[id].family).toBe('lord');
    expect([t.conqueror.tier, t.hero.tier, t['demon-king'].tier, t['saint-emperor'].tier]).toEqual([2, 2, 3, 3]);
  });

  it('범위 버프는 2차 승급부터다 (군주 설계 [확정]): 1차까지는 없고 마왕/성황에 있다', () => {
    const areaSkills = (id: string) => [gameData.unitTypes[id].basicSkillId, ...gameData.unitTypes[id].extraSkillIds].filter((s) => gameData.skills[s]?.area);
    for (const id of ['lord', 'conqueror', 'hero']) expect(areaSkills(id), id).toEqual([]);
    for (const id of ['demon-king', 'saint-emperor']) expect(areaSkills(id).length, id).toBeGreaterThan(0);
  });
});
