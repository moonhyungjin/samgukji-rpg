import type { BattleInput } from '../engine';
import { MAX_UNITS_PER_SIDE, ROW_CAPACITY, promotionChain } from '../lineup';
import { maxTroops } from '../stats';
import type { BalanceConfig, BattleResult, GameData, LineupEntry, RecruitCost, Row } from '../types';
import type { BattleOutcomeSummary, CampaignData, CampaignResult, CampaignSlot, CampaignState, RosterUnit } from './types';

// 캠페인 규칙 (설계 문서 03). 모든 함수는 상태를 바꾸지 않고 새 상태를 돌려준다.

const ok = (state: CampaignState): CampaignResult => ({ ok: true, state });
const fail = (reason: string): CampaignResult => ({ ok: false, reason });

function unitOf(state: CampaignState, characterId: string): RosterUnit | undefined {
  return state.roster.find((u) => u.characterId === characterId);
}

function withUnit(state: CampaignState, unit: RosterUnit): CampaignState {
  return { ...state, roster: state.roster.map((u) => (u.characterId === unit.characterId ? unit : u)) };
}

/** 레벨로 정해지는 최대 병력 (상한). 전투 규칙의 최대 병력 공식과 같다 */
export function unitCap(unit: Pick<RosterUnit, 'unitType' | 'level'>, data: GameData, balance: BalanceConfig): number {
  return maxTroops(balance, unit.level, data.unitTypes[unit.unitType]?.troopScale ?? 1);
}

/** 병종의 징병 단가. 승급 병종에 값이 없으면(모두 0) 승급 트리의 뿌리 병종 값을 쓴다 */
export function recruitCost(unitType: string, data: GameData): RecruitCost {
  const own = data.unitTypes[unitType]?.recruit;
  if (own && (own.reinforce > 0 || own.replenish > 0 || own.dismiss > 0)) return own;
  const root = promotionChain(data.unitTypes, unitType)[0];
  return root?.recruit ?? { reinforce: 0, replenish: 0, dismiss: 0 };
}

/** 승급 트리의 깊이 (기본 병종 0, 1차 1, 2차 2) */
export function promotionDepthOf(unitType: string, data: GameData): number {
  return Math.max(0, promotionChain(data.unitTypes, unitType).length - 1);
}

/** 이 군단이 지금 고를 수 있는 승급 병종 (레벨 조건을 넘었을 때만) */
export function promotionOptions(state: CampaignState, characterId: string, campaign: CampaignData, data: GameData): string[] {
  const unit = unitOf(state, characterId);
  if (!unit) return [];
  const need = campaign.promotionLevels[promotionDepthOf(unit.unitType, data)];
  if (need === undefined || unit.level < need) return [];
  return (data.unitTypes[unit.unitType]?.promotesTo ?? []).filter((id) => data.unitTypes[id]);
}

// ---------- 시작 ----------

export function startCampaign(campaign: CampaignData, data: GameData, balance: BalanceConfig): CampaignState {
  const roster = campaign.start.map((entry): RosterUnit => {
    const unitType = entry.unitType ?? data.characters[entry.characterId].unitType;
    // 장수마다 시작 레벨을 정할 수 있다 (없으면 공통 시작 레벨)
    const level = Math.max(1, Math.round(entry.level ?? campaign.startLevel));
    const cap = unitCap({ unitType, level }, data, balance);
    return { characterId: entry.characterId, unitType, level, exp: 0, capacity: cap, troops: cap };
  });
  const lineup = campaign.start.map((entry, i): CampaignSlot => ({ characterId: entry.characterId, row: entry.row, slot: entry.slot ?? i % ROW_CAPACITY }));
  return { campaignId: campaign.id, battleIndex: 0, gold: campaign.startGold, roster, lineup, attempt: 1, finished: false };
}

// ---------- 정비: 보충, 증원, 해고 ----------

/** 보충: 병력을 정원까지 amount명 채운다 (보충 단가 × 명) */
export function replenish(state: CampaignState, characterId: string, amount: number, data: GameData): CampaignResult {
  const unit = unitOf(state, characterId);
  if (!unit) return fail('없는 장수입니다.');
  const n = Math.floor(amount);
  if (n <= 0) return fail('보충할 인원이 없습니다.');
  if (unit.troops + n > unit.capacity) return fail(`정원(${unit.capacity})을 넘게 보충할 수 없습니다.`);
  const cost = Math.ceil(n * recruitCost(unit.unitType, data).replenish);
  if (cost > state.gold) return fail(`돈이 모자랍니다 (필요 ${cost}, 보유 ${state.gold}).`);
  return ok({ ...withUnit(state, { ...unit, troops: unit.troops + n }), gold: state.gold - cost });
}

/** 증원: 정원을 amount명 늘린다 (레벨 상한까지). 늘린 만큼 병력도 는다 (증원 단가 × 명) */
export function reinforce(state: CampaignState, characterId: string, amount: number, data: GameData, balance: BalanceConfig): CampaignResult {
  const unit = unitOf(state, characterId);
  if (!unit) return fail('없는 장수입니다.');
  const n = Math.floor(amount);
  if (n <= 0) return fail('증원할 인원이 없습니다.');
  const cap = unitCap(unit, data, balance);
  if (unit.capacity + n > cap) return fail(`레벨 상한(${cap})을 넘게 증원할 수 없습니다.`);
  const cost = Math.ceil(n * recruitCost(unit.unitType, data).reinforce);
  if (cost > state.gold) return fail(`돈이 모자랍니다 (필요 ${cost}, 보유 ${state.gold}).`);
  return ok({ ...withUnit(state, { ...unit, capacity: unit.capacity + n, troops: unit.troops + n }), gold: state.gold - cost });
}

/** 해고: 정원과 병력을 amount명 줄이고 해고 단가 × 명을 돌려받는다. 병사가 없는 빈 정원부터 줄인다 */
export function dismiss(state: CampaignState, characterId: string, amount: number, data: GameData): CampaignResult {
  const unit = unitOf(state, characterId);
  if (!unit) return fail('없는 장수입니다.');
  const n = Math.floor(amount);
  if (n <= 0) return fail('해고할 인원이 없습니다.');
  if (n >= unit.capacity) return fail('정원을 0으로 만들 수 없습니다.');
  const capacity = unit.capacity - n;
  const troops = Math.min(unit.troops, capacity);
  const refund = Math.floor((unit.troops - troops) * recruitCost(unit.unitType, data).dismiss);
  return ok({ ...withUnit(state, { ...unit, capacity, troops }), gold: state.gold + refund });
}

/** 정원까지 채우는 데 드는 돈 / 상한까지 증원하는 데 드는 돈 (화면 표시용) */
export function replenishCostToFull(unit: RosterUnit, data: GameData): number {
  return Math.ceil((unit.capacity - unit.troops) * recruitCost(unit.unitType, data).replenish);
}
export function reinforceCostToCap(unit: RosterUnit, data: GameData, balance: BalanceConfig): number {
  return Math.ceil((unitCap(unit, data, balance) - unit.capacity) * recruitCost(unit.unitType, data).reinforce);
}

// ---------- 정비: 승급, 편성 ----------

/** 승급: 레벨 조건을 넘은 군단이 승급 병종 하나를 고른다. 새 상한보다 정원이 크면 줄이고 해고 단가로 돌려준다 */
export function promote(state: CampaignState, characterId: string, toUnitType: string, campaign: CampaignData, data: GameData, balance: BalanceConfig): CampaignResult {
  const unit = unitOf(state, characterId);
  if (!unit) return fail('없는 장수입니다.');
  if (!promotionOptions(state, characterId, campaign, data).includes(toUnitType)) return fail('지금 고를 수 있는 승급 병종이 아닙니다.');
  const promoted = { ...unit, unitType: toUnitType };
  const cap = unitCap(promoted, data, balance);
  const capacity = Math.min(unit.capacity, cap);
  const troops = Math.min(unit.troops, capacity);
  const refund = Math.floor((unit.troops - troops) * recruitCost(unit.unitType, data).dismiss);
  // 승급 병종이 지금 자리(열)에 설 수 없으면 출전 자리에서 뺀다
  const allowed = data.unitTypes[toUnitType].allowedRows;
  const lineup = state.lineup.filter((s) => s.characterId !== characterId || allowed.includes(s.row));
  return ok({ ...withUnit(state, { ...promoted, capacity, troops }), gold: state.gold + refund, lineup });
}

/** 출전 편성을 검사한다. 문제가 없으면 null */
export function lineupIssue(state: CampaignState, lineup: CampaignSlot[], data: GameData): string | null {
  if (lineup.length === 0) return '출전할 군단이 없습니다.';
  if (lineup.length > MAX_UNITS_PER_SIDE) return `출전은 ${MAX_UNITS_PER_SIDE}군단까지입니다.`;
  const seen = new Set<string>();
  const taken = new Set<string>();
  for (const s of lineup) {
    const unit = unitOf(state, s.characterId);
    const name = data.characters[s.characterId]?.name ?? s.characterId;
    if (!unit) return `${name}은(는) 군단에 없습니다.`;
    if (seen.has(s.characterId)) return `${name}이(가) 두 번 들어 있습니다.`;
    seen.add(s.characterId);
    if (unit.troops <= 0) return `${name}은(는) 병력이 없어 출전할 수 없습니다 (보충하세요).`;
    if (!data.unitTypes[unit.unitType].allowedRows.includes(s.row)) return `${name}은(는) ${s.row === 'front' ? '전열' : '후열'}에 설 수 없습니다.`;
    if (!Number.isInteger(s.slot) || s.slot < 0 || s.slot >= ROW_CAPACITY) return '자리 번호가 잘못됐습니다.';
    const key = `${s.row}:${s.slot}`;
    if (taken.has(key)) return '같은 자리에 두 군단이 있습니다.';
    taken.add(key);
  }
  return null;
}

export function setLineup(state: CampaignState, lineup: CampaignSlot[], data: GameData): CampaignResult {
  const issue = lineupIssue(state, lineup, data);
  return issue ? fail(issue) : ok({ ...state, lineup: lineup.map((s) => ({ ...s })) });
}

// ---------- 전투 ----------

/** 지금 전투의 입력. 플레이어가 공격측이다 [기본값] */
export function campaignBattleInput(state: CampaignState, campaign: CampaignData, data: GameData, balance: BalanceConfig, seed: number): Omit<BattleInput, 'policy'> {
  if (state.finished) throw new Error('캠페인이 이미 끝났습니다.');
  const issue = lineupIssue(state, state.lineup, data);
  if (issue) throw new Error(issue);
  const battle = campaign.battles[state.battleIndex];
  const attacker: LineupEntry[] = state.lineup.map((s) => {
    const unit = unitOf(state, s.characterId)!;
    return { characterId: s.characterId, row: s.row, slot: s.slot, unitType: unit.unitType, level: unit.level, maxTroops: unit.capacity, troops: unit.troops };
  });
  // 적은 레벨 상한으로 가득 찬 병력이고, 전투에 적 병력(명)을 정하면 그 값이다 (레벨 상한까지)
  const defender: LineupEntry[] = battle.enemy.map((e) => {
    const unitType = e.unitType ?? data.characters[e.characterId]?.unitType;
    const cap = maxTroops(balance, e.level ?? data.characters[e.characterId]?.level ?? 1, data.unitTypes[unitType]?.troopScale ?? 1);
    const troops = battle.enemyTroops !== undefined ? Math.max(1, Math.min(cap, Math.round(battle.enemyTroops))) : cap;
    return { ...e, maxTroops: troops, troops };
  });
  return { data, balance, attacker, defender, seed };
}

/** 레벨업: 경험치가 perLevel만큼 쌓일 때마다 레벨이 하나 오른다 (정원은 그대로, 상한만 는다) */
function gainExp(unit: RosterUnit, amount: number, perLevel: number): { unit: RosterUnit; levels: number } {
  let { exp, level } = unit;
  exp += amount;
  let levels = 0;
  while (perLevel > 0 && exp >= perLevel) {
    exp -= perLevel;
    level++;
    levels++;
  }
  return { unit: { ...unit, exp, level }, levels };
}

/**
 * 전투 결과를 캠페인에 반영한다: 병력, 경험치/레벨, (이기면) 보상·합류·다음 전투.
 * result는 campaignBattleInput으로 만든 전투의 결과여야 한다 (공격측 군단 순서 = 출전 편성 순서).
 */
export function applyBattleResult(state: CampaignState, campaign: CampaignData, result: BattleResult, data: GameData, balance: BalanceConfig): { state: CampaignState; summary: BattleOutcomeSummary } {
  const won = result.winner === 'attacker';
  const battle = campaign.battles[state.battleIndex];
  const units: BattleOutcomeSummary['units'] = [];
  let next: CampaignState = { ...state };

  state.lineup.forEach((slot, index) => {
    const report = result.units.find((u) => u.uid === `attacker:${index}`);
    const unit = unitOf(next, slot.characterId);
    if (!report || !unit) return;
    const expGained = (won ? campaign.exp.win : campaign.exp.lose) + report.kills * campaign.exp.perKill;
    const leveled = gainExp({ ...unit, troops: report.finalTroops }, expGained, campaign.exp.perLevel);
    // 포획: 이기면 살아남은 군단이 자기가 줄인 적 병력의 일정 비율을 데려온다. 정원과 병력이 함께 늘고, 레벨 상한을 넘는 만큼은 버린다
    let captured = 0;
    let after = leveled.unit;
    if (won && report.finalTroops > 0 && campaign.captureRate > 0) {
      const room = Math.max(0, unitCap(after, data, balance) - after.capacity);
      captured = Math.min(room, Math.floor(report.damageDealt * campaign.captureRate));
      after = { ...after, capacity: after.capacity + captured, troops: after.troops + captured };
    }
    next = withUnit(next, after);
    units.push({ characterId: slot.characterId, expGained, levelsGained: leveled.levels, captured, troopsAfter: after.troops });
  });

  const joined: string[] = [];
  if (won) {
    next.gold += battle.reward;
    const avgLevel = Math.max(1, Math.round(next.roster.reduce((s, u) => s + u.level, 0) / Math.max(1, next.roster.length)));
    for (const join of battle.joins) {
      if (unitOf(next, join.characterId) || !data.characters[join.characterId]) continue;
      const unitType = join.unitType ?? data.characters[join.characterId].unitType;
      const cap = unitCap({ unitType, level: avgLevel }, data, balance);
      next = { ...next, roster: [...next.roster, { characterId: join.characterId, unitType, level: avgLevel, exp: 0, capacity: cap, troops: cap }] };
      next = { ...next, lineup: placeInLineup(next.lineup, join.characterId, data.unitTypes[unitType].allowedRows) };
      joined.push(join.characterId);
    }
    next.battleIndex = state.battleIndex + 1;
    next.attempt = 1;
    next.finished = next.battleIndex >= campaign.battles.length;
  } else {
    next.attempt = state.attempt + 1;
  }
  return { state: next, summary: { won, goldGained: won ? battle.reward : 0, units, joined, finished: next.finished } };
}

/** 합류한 장수를 설 수 있는 열의 빈자리에 넣는다 (자리가 없으면 넣지 않는다) */
export function placeInLineup(lineup: CampaignSlot[], characterId: string, allowedRows: Row[]): CampaignSlot[] {
  if (lineup.length >= MAX_UNITS_PER_SIDE) return lineup;
  for (const row of allowedRows) {
    for (let slot = 0; slot < ROW_CAPACITY; slot++) {
      if (!lineup.some((s) => s.row === row && s.slot === slot)) return [...lineup, { characterId, row, slot }];
    }
  }
  return lineup;
}
