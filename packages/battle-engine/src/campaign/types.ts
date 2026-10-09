import type { LineupEntry, Row } from '../types';

/**
 * 캠페인 데이터 (설계 문서 03). 편성은 이미 풀린 LineupEntry로 받는다 (데이터 파일의 편성 이름은 game-data가 푼다).
 * 숫자는 모두 [임시]이고 데이터에서 고친다.
 */
export interface CampaignData {
  id: string;
  name: string;
  startGold: number;
  /** 시작 군단의 레벨 (장수마다 따로 정하지 않았을 때) */
  startLevel: number;
  /** 시작 군단과 자리. unitType이 없으면 장수의 병종, level이 있으면 그 장수의 시작 레벨 */
  start: LineupEntry[];
  battles: CampaignBattle[];
  exp: CampaignExp;
  /** 승급에 필요한 레벨. [0]은 기본 → 1차, [1]은 1차 → 2차 */
  promotionLevels: number[];
  /** 포획: 이기면 군단마다 자기가 줄인 적 병력 × 이 값만큼 정원과 병력이 는다 (레벨 상한까지). 0이면 없음 */
  captureRate: number;
}

export interface CampaignBattle {
  id: string;
  name: string;
  /** 적 편성 */
  enemy: LineupEntry[];
  /** 적 군단의 병력 (명, 레벨 상한을 넘지 않음). 생략하면 레벨 상한으로 가득 */
  enemyTroops?: number;
  /** 이기면 받는 돈 */
  reward: number;
  /** 이기면 합류하는 장수 */
  joins: { characterId: string; unitType?: string }[];
}

export interface CampaignExp {
  /** 출전한 군단마다: 이기면 */
  win: number;
  /** 지면 */
  lose: number;
  /** 처치 1당 추가 */
  perKill: number;
  /** 레벨 하나에 필요한 경험치 */
  perLevel: number;
}

/** 캠페인에서 장수 한 명(군단)의 상태. 상한(레벨로 정해짐) ≥ 정원(capacity) ≥ 병력(troops) */
export interface RosterUnit {
  characterId: string;
  unitType: string;
  level: number;
  /** 다음 레벨까지 쌓인 경험치 */
  exp: number;
  /** 정원: 돈을 내고 확보한 인원. 전투에서의 최대 병력 */
  capacity: number;
  /** 지금 병사 수 */
  troops: number;
}

/** 출전 자리 */
export interface CampaignSlot {
  characterId: string;
  row: Row;
  /** 열 안의 자리 0~2 */
  slot: number;
}

export interface CampaignState {
  campaignId: string;
  /** 다음에 싸울 전투 (battles의 번호). 다 이기면 battles.length */
  battleIndex: number;
  gold: number;
  roster: RosterUnit[];
  lineup: CampaignSlot[];
  /** 지금 전투를 몇 번째 도전하는가 (1부터. 이기면 1로 돌아간다) */
  attempt: number;
  finished: boolean;
}

/** 정비 행동의 결과. 할 수 없으면 이유 */
export type CampaignResult = { ok: true; state: CampaignState } | { ok: false; reason: string };

/** 전투 뒤에 바뀐 것 (화면에 보여 줄 요약) */
export interface BattleOutcomeSummary {
  won: boolean;
  goldGained: number;
  /** 군단별: 얻은 경험치, 오른 레벨 수, 포획한 병사(실제로 들어간 수), 전투 뒤 병력 (포획 포함) */
  units: { characterId: string; expGained: number; levelsGained: number; captured: number; troopsAfter: number }[];
  joined: string[];
  finished: boolean;
}
