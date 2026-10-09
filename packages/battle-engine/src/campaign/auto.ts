import { runBattle } from '../engine';
import { createDefaultPolicy } from '../policy';
import type { CommandPolicy } from '../policy';
import type { BalanceConfig, GameData } from '../types';
import { applyBattleResult, campaignBattleInput, lineupIssue, placeInLineup, promote, promotionOptions, recruitCost, reinforce, replenish, unitCap } from './rules';
import type { BattleOutcomeSummary, CampaignData, CampaignState } from './types';

/**
 * 캠페인을 자동으로 정비하는 단순한 AI (CLI 시뮬레이션용, 사람의 선택을 흉내 내지 않는다):
 * 1) 승급할 수 있으면 첫 번째 승급 병종을 고른다 2) 모든 군단을 정원까지 보충한다 (돈이 되는 만큼)
 * 3) 남은 돈으로 정원이 상한보다 작은 군단을 10명씩 돌아가며 증원한다
 * 4) 병력이 없는 군단은 출전에서 빼고, 병력이 있는데 빠져 있는 군단은 빈자리에 넣는다
 */
export function autoPrepare(state: CampaignState, campaign: CampaignData, data: GameData, balance: BalanceConfig): CampaignState {
  let s = state;
  for (const unit of s.roster) {
    const options = promotionOptions(s, unit.characterId, campaign, data);
    if (options.length > 0) {
      const r = promote(s, unit.characterId, options[0], campaign, data, balance);
      if (r.ok) s = r.state;
    }
  }
  for (const unit of s.roster) {
    // 돈이 되는 만큼 보충한다 (모자라면 살 수 있는 만큼만)
    const price = recruitCost(unit.unitType, data).replenish;
    const affordable = price > 0 ? Math.floor(s.gold / price) : unit.capacity;
    const n = Math.min(unit.capacity - unit.troops, affordable);
    if (n > 0) {
      const r = replenish(s, unit.characterId, n, data);
      if (r.ok) s = r.state;
    }
  }
  for (let progress = true; progress; ) {
    progress = false;
    for (const unit of s.roster) {
      const room = unitCap(unit, data, balance) - unit.capacity;
      if (room <= 0) continue;
      const r = reinforce(s, unit.characterId, Math.min(10, room), data, balance);
      if (r.ok) {
        s = r.state;
        progress = true;
      }
    }
  }
  // 출전: 병력이 없는 군단은 빼고, 병력이 있는데 빠진 군단은 설 수 있는 빈자리에 넣는다
  let lineup = s.lineup.filter((slot) => (s.roster.find((u) => u.characterId === slot.characterId)?.troops ?? 0) > 0);
  for (const unit of s.roster) {
    if (unit.troops > 0 && !lineup.some((slot) => slot.characterId === unit.characterId)) lineup = placeInLineup(lineup, unit.characterId, data.unitTypes[unit.unitType].allowedRows);
  }
  return { ...s, lineup };
}

export interface CampaignRunLog {
  battleIndex: number;
  attempt: number;
  goldBefore: number;
  summary: BattleOutcomeSummary;
}

export interface CampaignRun {
  state: CampaignState;
  /** 끝까지 이겼는가 (한 전투에서 maxAttempts번 지거나, 출전할 수 있는 군단이 없으면 멈춘다) */
  cleared: boolean;
  /** 출전할 수 없어서 멈췄으면 그 이유 (돈이 없어 아무도 보충하지 못한 경우 등) */
  stuck?: string;
  log: CampaignRunLog[];
}

/** 정비(autoPrepare) → 전투 → 결과 반영을 캠페인이 끝날 때까지 되풀이한다 */
export function runCampaign(campaign: CampaignData, data: GameData, balance: BalanceConfig, start: CampaignState, seed: number, maxAttempts = 5, policy: CommandPolicy = createDefaultPolicy()): CampaignRun {
  let state = start;
  const log: CampaignRunLog[] = [];
  let battleSeed = seed;
  while (!state.finished && state.attempt <= maxAttempts) {
    state = autoPrepare(state, campaign, data, balance);
    const issue = lineupIssue(state, state.lineup, data);
    if (issue) return { state, cleared: false, stuck: issue, log };
    const goldBefore = state.gold;
    const result = runBattle({ ...campaignBattleInput(state, campaign, data, balance, battleSeed++), policy });
    const applied = applyBattleResult(state, campaign, result, data, balance);
    log.push({ battleIndex: state.battleIndex, attempt: state.attempt, goldBefore, summary: applied.summary });
    state = applied.state;
  }
  return { state, cleared: state.finished, log };
}

/** 여러 번 돌린 캠페인의 요약 (CLI와 Lab이 같이 쓴다) */
export interface CampaignRunsSummary {
  runs: number;
  clearRate: number;
  battles: {
    name: string;
    /** 이 전투까지 온 비율 */
    reachRate: number;
    /** 온 경우 중 한 번에 이긴 비율 */
    firstTryRate: number;
    /** 온 경우의 평균 도전 횟수 */
    averageAttempts: number;
    /** 처음 도전할 때 정비 뒤 남은 돈 평균 */
    averageGoldBefore: number;
  }[];
  averageEndLevel: number;
  maxEndLevel: number;
  averageEndGold: number;
  /** 승급한 군단이 하나라도 있는 비율 */
  promotedRate: number;
  /** 출전할 군단이 없어 멈춘 비율 (돈이 바닥나 아무도 보충하지 못함) */
  stuckRate: number;
}

export function summarizeCampaignRuns(runs: CampaignRun[], campaign: CampaignData, data: GameData): CampaignRunsSummary {
  const n = Math.max(1, runs.length);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const isPromoted = (unitType: string) => Object.values(data.unitTypes).some((t) => t.promotesTo.includes(unitType));
  const levels = runs.flatMap((r) => r.state.roster.map((u) => u.level));
  return {
    runs: runs.length,
    clearRate: runs.filter((r) => r.cleared).length / n,
    battles: campaign.battles.map((b, i) => {
      const tries = runs.map((r) => r.log.filter((l) => l.battleIndex === i)).filter((t) => t.length > 0);
      return {
        name: b.name,
        reachRate: tries.length / n,
        firstTryRate: tries.length ? tries.filter((t) => t[0].summary.won).length / tries.length : 0,
        averageAttempts: avg(tries.map((t) => t.length)),
        averageGoldBefore: avg(tries.map((t) => t[0].goldBefore)),
      };
    }),
    averageEndLevel: avg(levels),
    maxEndLevel: levels.length ? Math.max(...levels) : 0,
    averageEndGold: avg(runs.map((r) => r.state.gold)),
    promotedRate: runs.filter((r) => r.state.roster.some((u) => isPromoted(u.unitType))).length / n,
    stuckRate: runs.filter((r) => r.stuck).length / n,
  };
}
