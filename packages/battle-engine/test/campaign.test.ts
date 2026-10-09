import { describe, expect, it } from 'vitest';
import {
  BattleEngine,
  applyBattleResult,
  autoPrepare,
  campaignBattleInput,
  dismiss,
  lineupIssue,
  maxTroops,
  promote,
  promotionOptions,
  reinforce,
  replenish,
  runBattle,
  runCampaign,
  setLineup,
  startCampaign,
  unitCap,
} from '../src';
import type { BattleResult, CampaignData, CampaignState, GameData } from '../src';
import { testBalance, testData } from './fixtures';

// 캠페인 규칙 (설계 문서 03). 계산하기 쉬운 값: 보병 증원 10/보충 2/해고 1, 승급 병종(정예)은 병력 배율 0.5에 단가 없음(뿌리 값을 쓴다)
const data: GameData = {
  ...testData,
  unitTypes: {
    ...testData.unitTypes,
    inf: { ...testData.unitTypes.inf, promotesTo: ['elite', 'backline'], recruit: { reinforce: 10, replenish: 2, dismiss: 1 } },
    elite: { ...testData.unitTypes.inf, id: 'elite', name: '정예', troopScale: 0.5, promotesTo: [], recruit: { reinforce: 0, replenish: 0, dismiss: 0 } },
    backline: { ...testData.unitTypes.inf, id: 'backline', name: '후열병', allowedRows: ['back'], promotesTo: [] },
    arc: { ...testData.unitTypes.arc, recruit: { reinforce: 20, replenish: 4, dismiss: 2 } },
  },
};
const campaign: CampaignData = {
  id: 'test',
  name: '시험',
  startGold: 1000,
  startLevel: 1,
  start: [
    { characterId: 'inf', row: 'front', slot: 0 },
    { characterId: 'infFast', row: 'front', slot: 1 },
  ],
  battles: [
    { id: 'b1', name: '1전', enemy: [{ characterId: 'infWeak', row: 'front', level: 1 }], reward: 500, joins: [{ characterId: 'arc' }] },
    { id: 'b2', name: '2전', enemy: [{ characterId: 'infWeak', row: 'front', level: 1 }], reward: 700, joins: [] },
  ],
  exp: { win: 120, lose: 40, perKill: 20, perLevel: 100 },
  promotionLevels: [5, 10],
  captureRate: 0,
};
const balance = testBalance; // base 300, perLevel 50
const start = () => startCampaign(campaign, data, balance);
const unit = (s: CampaignState, id: string) => s.roster.find((u) => u.characterId === id)!;
const must = (r: ReturnType<typeof replenish>): CampaignState => {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};

describe('캠페인: 시작', () => {
  it('시작 군단은 시작 레벨이고 정원과 병력이 레벨 상한으로 가득 차 있다', () => {
    const s = start();
    expect(s.gold).toBe(1000);
    expect(s.roster.map((u) => [u.characterId, u.level, u.capacity, u.troops])).toEqual([
      ['inf', 1, 300, 300],
      ['infFast', 1, 300, 300],
    ]);
    expect(s.lineup).toEqual([
      { characterId: 'inf', row: 'front', slot: 0 },
      { characterId: 'infFast', row: 'front', slot: 1 },
    ]);
  });
});

describe('캠페인: 장수별 시작 레벨', () => {
  it('시작 편성에 레벨이 있으면 그 장수의 시작 레벨이고, 병력은 그 레벨의 상한으로 가득 찬다', () => {
    const c = { ...campaign, start: [{ ...campaign.start[0], level: 4 }, campaign.start[1]] };
    const s = startCampaign(c, data, balance);
    expect([unit(s, 'inf').level, unit(s, 'inf').capacity]).toEqual([4, maxTroops(balance, 4, 1)]);
    expect(unit(s, 'infFast').level).toBe(1);
  });
});

describe('캠페인: 보충 · 증원 · 해고', () => {
  it('보충은 정원까지, 1명당 보충 단가', () => {
    const s0 = start();
    const hurt = { ...s0, roster: s0.roster.map((u) => (u.characterId === 'inf' ? { ...u, troops: 200 } : u)) };
    const s1 = must(replenish(hurt, 'inf', 100, data));
    expect(unit(s1, 'inf').troops).toBe(300);
    expect(s1.gold).toBe(1000 - 200);
    expect(replenish(s1, 'inf', 1, data).ok).toBe(false); // 정원을 넘음
  });

  it('증원은 레벨 상한까지 정원과 병력을 함께 늘리고, 돈이 모자라면 안 된다', () => {
    const s0 = start();
    const leveled = { ...s0, roster: s0.roster.map((u) => (u.characterId === 'inf' ? { ...u, level: 3 } : u)) };
    expect(unitCap(unit(leveled, 'inf'), data, balance)).toBe(400);
    const s1 = must(reinforce(leveled, 'inf', 50, data, balance));
    expect([unit(s1, 'inf').capacity, unit(s1, 'inf').troops, s1.gold]).toEqual([350, 350, 1000 - 500]);
    expect(reinforce(s1, 'inf', 51, data, balance).ok).toBe(false); // 상한 400을 넘음
    expect(reinforce(s1, 'inf', 50, data, balance).ok).toBe(true);
    expect(reinforce({ ...s1, gold: 10 }, 'inf', 50, data, balance).ok).toBe(false); // 돈이 모자람
  });

  it('해고는 빈 정원부터 줄이고, 줄어든 병사 1명당 해고 단가를 돌려준다', () => {
    const s0 = start();
    const hurt = { ...s0, roster: s0.roster.map((u) => (u.characterId === 'inf' ? { ...u, troops: 250 } : u)) };
    const s1 = must(dismiss(hurt, 'inf', 100, data));
    expect([unit(s1, 'inf').capacity, unit(s1, 'inf').troops, s1.gold]).toEqual([200, 200, 1000 + 50]);
    expect(dismiss(s1, 'inf', 200, data).ok).toBe(false); // 정원 0은 안 된다
  });
});

describe('캠페인: 승급', () => {
  it('레벨 조건을 넘어야 승급 병종을 고를 수 있다', () => {
    const s0 = start();
    expect(promotionOptions(s0, 'inf', campaign, data)).toEqual([]);
    const lv5 = { ...s0, roster: s0.roster.map((u) => (u.characterId === 'inf' ? { ...u, level: 5 } : u)) };
    expect(promotionOptions(lv5, 'inf', campaign, data)).toEqual(['elite', 'backline']);
    expect(promote(s0, 'inf', 'elite', campaign, data, balance).ok).toBe(false);
  });

  it('승급으로 상한이 줄면 정원을 줄이고 그만큼 해고 단가를 돌려준다 (단가가 없는 승급 병종은 뿌리 병종 값)', () => {
    const s0 = start();
    const lv5 = { ...s0, roster: s0.roster.map((u) => (u.characterId === 'inf' ? { ...u, level: 5, capacity: 500, troops: 500 } : u)) };
    const s1 = must(promote(lv5, 'inf', 'elite', campaign, data, balance));
    const cap = maxTroops(balance, 5, 0.5); // 300 + 25 × 4 = 400
    expect([unit(s1, 'inf').unitType, unit(s1, 'inf').capacity, unit(s1, 'inf').troops]).toEqual(['elite', cap, cap]);
    expect(s1.gold).toBe(1000 + (500 - cap) * 1);
  });

  it('승급 병종이 지금 열에 설 수 없으면 출전 자리에서 빠진다', () => {
    const s0 = start();
    const lv5 = { ...s0, roster: s0.roster.map((u) => (u.characterId === 'inf' ? { ...u, level: 5 } : u)) };
    const s1 = must(promote(lv5, 'inf', 'backline', campaign, data, balance));
    expect(s1.lineup.map((x) => x.characterId)).toEqual(['infFast']);
  });
});

describe('캠페인: 편성과 전투', () => {
  it('병력이 없거나 설 수 없는 열이거나 자리가 겹치면 출전할 수 없다', () => {
    const s0 = start();
    const dead = { ...s0, roster: s0.roster.map((u) => (u.characterId === 'inf' ? { ...u, troops: 0 } : u)) };
    expect(lineupIssue(dead, dead.lineup, data)).toContain('병력이 없어');
    expect(setLineup(s0, [{ characterId: 'inf', row: 'front', slot: 0 }, { characterId: 'infFast', row: 'front', slot: 0 }], data).ok).toBe(false);
    expect(setLineup(s0, [{ characterId: 'inf', row: 'back', slot: 2 }], data).ok).toBe(true);
  });

  it('전투에는 정원이 최대 병력, 지금 병력이 시작 병력으로 들어간다', () => {
    const s0 = start();
    const hurt = { ...s0, roster: s0.roster.map((u) => (u.characterId === 'inf' ? { ...u, troops: 120 } : u)) };
    const engine = new BattleEngine({ ...campaignBattleInput(hurt, campaign, data, balance, 1) });
    const a = engine.state.units.find((u) => u.uid === 'attacker:0')!;
    expect([a.maxTroops, a.troops, a.level]).toEqual([300, 120, 1]);
  });

  it('이기면 보상, 경험치(승리 + 처치), 레벨업, 합류, 다음 전투', () => {
    const s0 = start();
    const result = runBattle(campaignBattleInput(s0, campaign, data, balance, 1));
    expect(result.winner).toBe('attacker');
    const { state: s1, summary } = applyBattleResult(s0, campaign, result, data, balance);
    expect(s1.gold).toBe(1000 + 500);
    expect(s1.battleIndex).toBe(1);
    expect(summary.joined).toEqual(['arc']);
    // 합류한 장수는 파티 평균 레벨, 가득 찬 병력이고 설 수 있는 빈자리에 들어간다
    const arc = unit(s1, 'arc');
    expect(arc.capacity).toBe(arc.troops);
    expect(s1.lineup.some((x) => x.characterId === 'arc')).toBe(true);
    // 경험치 = 120 + 처치 × 20 → 레벨당 100
    for (const u of summary.units) {
      const kills = result.units.find((r) => r.characterId === u.characterId)!.kills;
      expect(u.expGained).toBe(120 + kills * 20);
      expect(unit(s1, u.characterId).level).toBe(1 + Math.floor(u.expGained / 100));
      expect(unit(s1, u.characterId).troops).toBe(u.troopsAfter);
    }
  });

  it('지면 보상 없이 같은 전투를 다시 하고, 잃은 병력은 그대로다', () => {
    const s0 = start();
    const lost: BattleResult = { ...runBattle(campaignBattleInput(s0, campaign, data, balance, 1)), winner: 'defender' };
    const { state: s1, summary } = applyBattleResult(s0, campaign, lost, data, balance);
    expect([s1.gold, s1.battleIndex, s1.attempt, summary.won]).toEqual([1000, 0, 2, false]);
    expect(summary.units.every((u) => u.expGained >= 40)).toBe(true);
  });

  it('적 병력: 비우면 레벨 상한으로 가득, 전투에 적 병력을 정하면 그 값 (레벨 상한까지)', () => {
    const enemyOf = (c: CampaignData) => new BattleEngine(campaignBattleInput(startCampaign(c, data, balance), c, data, balance, 1)).state.units.find((u) => u.side === 'defender')!;
    const full = enemyOf(campaign);
    expect([full.maxTroops, full.troops]).toEqual([maxTroops(balance, 1, 1), maxTroops(balance, 1, 1)]);
    const fixed = enemyOf({ ...campaign, battles: campaign.battles.map((b) => ({ ...b, enemyTroops: 150 })) });
    expect([fixed.maxTroops, fixed.troops]).toEqual([150, 150]);
    const capped = enemyOf({ ...campaign, battles: campaign.battles.map((b) => ({ ...b, enemyTroops: 99999 })) });
    expect(capped.troops).toBe(maxTroops(balance, 1, 1));
  });

  it('포획: 이기면 살아남은 군단이 자기가 줄인 적 병력 × 비율만큼 정원과 병력이 는다 (레벨 상한까지)', () => {
    const capture = { ...campaign, captureRate: 0.1 };
    const s0 = startCampaign(capture, data, balance);
    const hurt = { ...s0, roster: s0.roster.map((u) => ({ ...u, capacity: 200, troops: 200 })) };
    const result = runBattle(campaignBattleInput(hurt, capture, data, balance, 1));
    const { state: s1, summary } = applyBattleResult(hurt, capture, result, data, balance);
    for (const u of summary.units) {
      const r = result.units.find((x) => x.characterId === u.characterId)!;
      const cap = unitCap(unit(s1, u.characterId), data, balance);
      const expected = r.finalTroops > 0 ? Math.min(cap - 200, Math.floor(r.damageDealt * 0.1)) : 0;
      expect(u.captured, u.characterId).toBe(expected);
      expect(unit(s1, u.characterId).capacity).toBe(200 + expected);
      expect(unit(s1, u.characterId).troops).toBe(r.finalTroops + expected);
    }
    expect(summary.units.some((u) => u.captured > 0)).toBe(true);
    // 지면 포획은 없다
    const lost = applyBattleResult(hurt, capture, { ...result, winner: 'defender' }, data, balance);
    expect(lost.summary.units.every((u) => u.captured === 0)).toBe(true);
  });

  it('자동 정비: 돈이 모자라면 살 수 있는 만큼 보충하고, 병력이 없는 군단은 출전에서 뺀다', () => {
    const s0 = start();
    const broke = { ...s0, gold: 30, roster: s0.roster.map((u) => (u.characterId === 'inf' ? { ...u, troops: 0 } : u)) };
    const s1 = autoPrepare(broke, campaign, data, balance);
    expect(unit(s1, 'inf').troops).toBe(15); // 30 ÷ 보충 단가 2
    expect(s1.gold).toBe(0);
    const none = autoPrepare({ ...broke, gold: 0 }, campaign, data, balance);
    expect(none.lineup.map((x) => x.characterId)).toEqual(['infFast']);
    expect(lineupIssue(none, none.lineup, data)).toBeNull();
  });

  it('출전할 군단이 하나도 없으면 오류 없이 멈추고 이유를 남긴다', () => {
    const s0 = start();
    const wiped = { ...s0, gold: 0, roster: s0.roster.map((u) => ({ ...u, troops: 0 })) };
    const run = runCampaign(campaign, data, balance, wiped, 1);
    expect(run.cleared).toBe(false);
    expect(run.stuck).toContain('출전');
    expect(run.log).toEqual([]);
  });

  it('자동 정비로 캠페인을 끝까지 돌린다 (같은 시드면 같은 결과)', () => {
    const a = runCampaign(campaign, data, balance, start(), 7);
    const b = runCampaign(campaign, data, balance, start(), 7);
    expect(a.cleared).toBe(true);
    expect(a.state.battleIndex).toBe(2);
    expect(a.log).toEqual(b.log);
  });
});
