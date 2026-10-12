import { applyBattleResult, campaignBattleInput, lineupIssue, startCampaign } from '../campaign/rules';
import type { CampaignBattle, CampaignData, CampaignState } from '../campaign/types';
import type { MapCastle, MapFaction, MapRegion, StrategyMap } from '../map';
import type { BattleInput } from '../engine';
import type { BalanceConfig, BattleResult, GameData } from '../types';
import type { CastleOutcome, StrategyResult, StrategyState } from './types';

// 전략 규칙 (설계 문서 04): 턴과 행동 횟수, 선전포고, 성 공격, 턴 종료와 수입.
// 순수 함수다. 상태를 고치지 않고 새 상태를 돌려준다. 화면은 할 수 있는지(…Issue)와 결과만 보여 준다.

/** 선전포고와 출진이 쓰는 행동 수 [기본값] */
export const DECLARE_WAR_COST = 1;
export const ATTACK_COST = 1;

const fail = (reason: string): StrategyResult => ({ ok: false, reason });

export function playerFaction(map: StrategyMap): MapFaction {
  const f = map.factions.find((x) => x.player);
  if (!f) throw new Error(`지도 ${map.id}: 플레이어 세력이 없습니다`);
  return f;
}

function findCastle(map: StrategyMap, castleId: string): { region: MapRegion; castle: MapCastle } | null {
  for (const region of map.regions) {
    const castle = region.castles.find((c) => c.id === castleId);
    if (castle) return { region, castle };
  }
  return null;
}

/** 시작 상태: 성은 지역의 처음 세력이 갖고, 전쟁은 없고, 군단과 돈은 캠페인 시작과 같다 */
export function startStrategy(map: StrategyMap, campaign: CampaignData, data: GameData, balance: BalanceConfig): StrategyState {
  const castleOwner: Record<string, string> = {};
  for (const r of map.regions) for (const c of r.castles) castleOwner[c.id] = r.faction;
  return {
    mapId: map.id,
    turn: 1,
    actionsLeft: map.actionsPerTurn,
    castleOwner,
    wars: [],
    army: startCampaign(campaign, data, balance),
    cleared: false,
  };
}

/** 지역의 지금 주인: 모든 성을 가진 세력. 성이 나뉘어 있으면 아직 처음 세력이다 (빼앗기는 중) */
export function regionOwner(state: StrategyState, region: MapRegion): string {
  const owners = new Set(region.castles.map((c) => state.castleOwner[c.id] ?? region.faction));
  return owners.size === 1 ? [...owners][0] : region.faction;
}

/** 플레이어가 가진 지역들 */
export function playerRegions(state: StrategyState, map: StrategyMap): MapRegion[] {
  const me = playerFaction(map).id;
  return map.regions.filter((r) => regionOwner(state, r) === me);
}

/** 플레이어 지역과 맞닿은 지역 (자기 지역은 빼고) */
function borderRegions(state: StrategyState, map: StrategyMap): MapRegion[] {
  const mine = new Set(playerRegions(state, map).map((r) => r.id));
  const near = new Set(map.regions.filter((r) => mine.has(r.id)).flatMap((r) => r.neighbors));
  return map.regions.filter((r) => !mine.has(r.id) && near.has(r.id));
}

/** 이 지역에 플레이어의 성이 하나라도 있는가 (빼앗는 중인 지역) */
function hasPlayerCastle(state: StrategyState, map: StrategyMap, region: MapRegion): boolean {
  const me = playerFaction(map).id;
  return region.castles.some((c) => state.castleOwner[c.id] === me);
}

/** 선전포고할 수 없는 이유 (할 수 있으면 null). 플레이어 지역과 맞닿은 지역을 가진 세력에만 할 수 있다 */
export function declareWarIssue(state: StrategyState, map: StrategyMap, factionId: string): string | null {
  const faction = map.factions.find((f) => f.id === factionId);
  if (!faction) return '없는 세력입니다.';
  if (faction.player) return '자기 세력에게는 선전포고할 수 없습니다.';
  if (state.cleared) return '이미 클리어했습니다.';
  if (state.wars.includes(factionId)) return `이미 ${faction.name}과(와) 전쟁 중입니다.`;
  if (!borderRegions(state, map).some((r) => regionOwner(state, r) === factionId)) return `${faction.name}의 지역이 자국과 맞닿아 있지 않습니다.`;
  if (state.actionsLeft < DECLARE_WAR_COST) return '이번 턴에 남은 행동이 없습니다.';
  return null;
}

/** 선전포고: 그 세력의 모든 지역과 전쟁 상태가 된다. 행동 1 [기본값] */
export function declareWar(state: StrategyState, map: StrategyMap, factionId: string): StrategyResult {
  const issue = declareWarIssue(state, map, factionId);
  if (issue) return fail(issue);
  return { ok: true, state: { ...state, wars: [...state.wars, factionId], actionsLeft: state.actionsLeft - DECLARE_WAR_COST } };
}

/**
 * 성을 공격할 수 없는 이유 (할 수 있으면 null). 전쟁 중인 세력의 성이고, 그 지역이 자국과 맞닿았거나 이미 성 하나 이상을 빼앗은 지역이어야 한다.
 * 출전 편성도 검사한다 (병력이 없는 군단 등, 캠페인의 lineupIssue).
 */
export function attackIssue(state: StrategyState, map: StrategyMap, castleId: string, data: GameData): string | null {
  const found = findCastle(map, castleId);
  if (!found) return '없는 성입니다.';
  const { region, castle } = found;
  const owner = state.castleOwner[castle.id] ?? region.faction;
  const me = playerFaction(map).id;
  if (state.cleared) return '이미 클리어했습니다.';
  if (owner === me) return '이미 자국의 성입니다.';
  const ownerName = map.factions.find((f) => f.id === owner)?.name ?? owner;
  if (!state.wars.includes(owner)) return `${ownerName}과(와) 전쟁 중이 아닙니다. 먼저 선전포고해야 합니다.`;
  const reachable = borderRegions(state, map).some((r) => r.id === region.id) || hasPlayerCastle(state, map, region);
  if (!reachable) return `${region.name}은(는) 자국과 맞닿아 있지 않습니다.`;
  if (!castle.garrison) return `${castle.name}에 수비 부대가 없습니다.`;
  if (state.actionsLeft < ATTACK_COST) return '이번 턴에 남은 행동이 없습니다.';
  return lineupIssue(state.army, state.army.lineup, data);
}

/** 성의 수비 부대를 캠페인 전투 하나로 바꾼다 (보상 금은 없다, 수입은 턴 종료 때 들어온다 [기본값]) */
function castleBattle(castle: MapCastle): CampaignBattle {
  const g = castle.garrison!;
  return { id: castle.id, name: castle.name, enemy: g.lineup.map((e) => ({ ...e })), ...(g.troops !== undefined ? { enemyTroops: g.troops } : {}), reward: 0, joins: [] };
}

/** 이 성 하나만 있는 캠페인 (전투 입력과 결과 반영을 캠페인 규칙으로 하기 위해) */
function castleCampaign(campaign: CampaignData, castle: MapCastle): CampaignData {
  return { ...campaign, battles: [castleBattle(castle)] };
}

function armyForBattle(army: CampaignState): CampaignState {
  return { ...army, battleIndex: 0, attempt: 1, finished: false };
}

/** 성 공격 전투의 입력. 플레이어가 공격측이다. 할 수 없으면 오류 (먼저 attackIssue로 확인한다) */
export function strategyBattleInput(state: StrategyState, map: StrategyMap, castleId: string, campaign: CampaignData, data: GameData, balance: BalanceConfig, seed: number): Omit<BattleInput, 'policy'> {
  const issue = attackIssue(state, map, castleId, data);
  if (issue) throw new Error(issue);
  const { castle } = findCastle(map, castleId)!;
  return campaignBattleInput(armyForBattle(state.army), castleCampaign(campaign, castle), data, balance, seed);
}

/**
 * 성 공격 결과를 반영한다: 행동 1을 쓰고, 군단의 병력·경험치·포획은 캠페인 규칙 그대로다.
 * 이기면 성을 차지하고(수비 부대는 다시 생기지 않는다), 지역의 성을 모두 가지면 지역을 얻고, 목표 지역이면 클리어.
 * 지면 성은 그대로이고 다시 출진할 수 있다. result는 strategyBattleInput으로 만든 전투의 결과여야 한다.
 */
export function applyCastleBattle(state: StrategyState, map: StrategyMap, castleId: string, result: BattleResult, campaign: CampaignData, data: GameData, balance: BalanceConfig): { state: StrategyState; outcome: CastleOutcome } {
  const found = findCastle(map, castleId);
  if (!found) throw new Error(`없는 성입니다: ${castleId}`);
  const { region, castle } = found;
  const applied = applyBattleResult(armyForBattle(state.army), castleCampaign(campaign, castle), result, data, balance);
  const army: CampaignState = { ...applied.state, battleIndex: state.army.battleIndex, attempt: state.army.attempt, finished: state.army.finished };
  const me = playerFaction(map).id;
  const won = applied.summary.won;
  let next: StrategyState = { ...state, army, actionsLeft: Math.max(0, state.actionsLeft - ATTACK_COST) };
  let regionTaken: string | null = null;
  if (won) {
    next = { ...next, castleOwner: { ...next.castleOwner, [castle.id]: me } };
    if (regionOwner(next, region) === me && regionOwner(state, region) !== me) regionTaken = region.id;
    const goal = map.regions.find((r) => r.id === map.goalRegion);
    if (goal && regionOwner(next, goal) === me) next = { ...next, cleared: true };
  }
  return { state: next, outcome: { ...applied.summary, finished: next.cleared, castleId, castleTaken: won, regionTaken, cleared: next.cleared && !state.cleared } };
}

/** 턴이 끝날 때 들어오는 금: 가진 지역의 수입 합 */
export function turnIncome(state: StrategyState, map: StrategyMap): number {
  return playerRegions(state, map).reduce((s, r) => s + r.income, 0);
}

/** 플레이어의 국력: 가진 지역의 국력 합 (개발은 아직 없다) */
export function playerPower(state: StrategyState, map: StrategyMap): number {
  return playerRegions(state, map).reduce((s, r) => s + r.power, 0);
}

/** 턴 종료: 수입이 들어오고 다음 턴, 행동 횟수가 다시 찬다. 행동이 남아 있어도 끝낼 수 있다 */
export function endTurn(state: StrategyState, map: StrategyMap): { state: StrategyState; income: number } {
  const income = turnIncome(state, map);
  return { state: { ...state, turn: state.turn + 1, actionsLeft: map.actionsPerTurn, army: { ...state.army, gold: state.army.gold + income } }, income };
}

/** 군단 정비(보충/증원/해고/승급/편성, campaign/의 함수) 결과를 전략 상태에 넣는다. 행동을 쓰지 않는다 */
export function withArmy(state: StrategyState, army: CampaignState): StrategyState {
  return { ...state, army };
}
