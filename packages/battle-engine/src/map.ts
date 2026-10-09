import type { LineupEntry } from './types';

// 전략 지도 데이터의 모양 (설계 문서 04). 데이터 원본은 packages/game-data/data/map.json이고 Balance Lab의 "지도" 탭에서 고친다.
// 편성은 데이터 파일에서는 기본 편성 이름으로 적고, game-data의 resolveMap이 LineupEntry로 풀어 준다.
// 이 파일은 타입만 둔다. 규칙(턴, 행동, 전쟁)은 strategy/에 있다.

/** 지형. 지금은 표시용이다 (전투 규칙에 쓰지 않는다, 설계 문서 04) */
export type Terrain = 'plain' | 'mountain' | 'river' | 'forest';

export const TERRAINS: readonly Terrain[] = ['plain', 'mountain', 'river', 'forest'];

export interface MapFaction {
  id: string;
  name: string;
  /** 지도 표시 색 (#rrggbb) */
  color: string;
  /** 플레이어 세력 (정확히 하나) */
  player?: boolean;
  /** 중립: 선전포고 전에는 공격할 수 없다 */
  neutral?: boolean;
}

export interface MapCastle {
  id: string;
  name: string;
  terrain: Terrain;
  /** 수비 부대. 플레이어 세력의 성은 비어 있다 */
  garrison: CastleGarrison | null;
}

export interface CastleGarrison {
  /** 수비 부대 편성 (적은 이 레벨, 이 병력으로 나온다) */
  lineup: LineupEntry[];
  level: number;
  /** 수비 군단의 병력 (명). 생략하면 레벨 상한 가득 */
  troops?: number;
}

export interface MapRegion {
  id: string;
  name: string;
  /** 처음 지배 세력 */
  faction: string;
  terrain: Terrain;
  /** 턴이 끝날 때 들어오는 금 */
  income: number;
  /** 국력 (가진 지역의 국력 합이 세력의 국력) */
  power: number;
  /** 맞닿은 지역 id (서로 적혀 있어야 한다) */
  neighbors: string[];
  /** 지도 위 위치 (0~100, 왼쪽 위가 0,0). 표시용 */
  x: number;
  y: number;
  /** 성 1~4개. 모두 차지해야 지역을 얻는다 */
  castles: MapCastle[];
}

export interface StrategyMap {
  id: string;
  name: string;
  factions: MapFaction[];
  regions: MapRegion[];
  /** 이 지역을 차지하면 클리어 (첫 단계) */
  goalRegion: string;
}
