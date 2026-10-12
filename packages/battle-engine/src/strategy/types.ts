import type { BattleOutcomeSummary, CampaignState } from '../campaign/types';

/**
 * 전략 부분의 상태 (설계 문서 04). 지도(StrategyMap)는 바뀌지 않는 데이터이고, 바뀌는 것은 여기에만 있다.
 * 군단·돈·편성은 캠페인 상태를 그대로 쓴다 (보충/증원/해고/승급/편성은 campaign/의 함수로, 행동을 쓰지 않는다).
 */
export interface StrategyState {
  mapId: string;
  /** 1부터 */
  turn: number;
  /** 이번 턴에 남은 행동 횟수 */
  actionsLeft: number;
  /** 성마다 지금 차지한 세력 id. 지역은 모든 성을 가진 세력의 것이다 */
  castleOwner: Record<string, string>;
  /** 플레이어 세력과 전쟁 중인 세력 id */
  wars: string[];
  /** 군단, 돈, 출전 편성 (캠페인 상태. battleIndex/attempt/finished는 쓰지 않는다) */
  army: CampaignState;
  /** 목표 지역을 차지했다 */
  cleared: boolean;
}

/** 전략 행동의 결과. 할 수 없으면 이유 */
export type StrategyResult = { ok: true; state: StrategyState } | { ok: false; reason: string };

/** 성 공격 전투 뒤에 바뀐 것 */
export interface CastleOutcome extends BattleOutcomeSummary {
  castleId: string;
  /** 이겨서 성을 차지했다 */
  castleTaken: boolean;
  /** 그 성으로 지역 전체를 차지했다 (지역 id) */
  regionTaken: string | null;
  /** 목표 지역을 차지해 클리어했다 */
  cleared: boolean;
}
