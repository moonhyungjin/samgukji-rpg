import type { MapCastle, MapFaction, MapRegion, StrategyMap, Terrain } from '@samgukji/battle-engine';
import mapJson from '../data/map.json';
import { presets } from './presets';

// 전략 지도의 원본은 data/map.json이다 (설계 문서 04). 수비 부대는 presets.json의 편성 이름으로 적고 여기서 풀어 준다.
// Balance Lab의 "지도" 탭에서 고치고 "파일에 저장"한다. 숫자는 모두 [임시].

/** map.json의 성 (수비 부대는 편성 이름) */
export interface MapCastleFile {
  id: string;
  name: string;
  terrain: Terrain;
  /** 수비 부대: 기본 편성 이름, 레벨, 병력(명, 없으면 레벨 상한 가득). 플레이어 세력의 성은 null */
  garrison: { preset: string; level: number; troops?: number } | null;
}

export interface MapRegionFile extends Omit<MapRegion, 'castles'> {
  castles: MapCastleFile[];
}

/** map.json의 모양 (Lab이 이 모양 그대로 고치고 저장한다) */
export interface MapFile {
  id: string;
  name: string;
  factions: MapFaction[];
  regions: MapRegionFile[];
  goalRegion: string;
}

/** 지도 파일(편성 이름)을 엔진이 쓰는 StrategyMap(편성 목록)으로 푼다. 없는 편성 이름이면 오류 */
export function resolveMap(file: MapFile, presetMap: Record<string, (typeof presets)[string]> = presets): StrategyMap {
  const castle = (c: MapCastleFile, region: string): MapCastle => {
    if (!c.garrison) return { id: c.id, name: c.name, terrain: c.terrain, garrison: null };
    const lineup = presetMap[c.garrison.preset];
    if (!lineup) throw new Error(`지도 ${file.id}: ${region}의 ${c.name} 수비 부대 편성 "${c.garrison.preset}"이(가) 없습니다`);
    return {
      id: c.id,
      name: c.name,
      terrain: c.terrain,
      garrison: { lineup: lineup.map((e) => ({ ...e, level: c.garrison!.level })), level: c.garrison.level, ...(c.garrison.troops !== undefined ? { troops: c.garrison.troops } : {}) },
    };
  };
  return {
    id: file.id,
    name: file.name,
    factions: file.factions.map((f) => ({ ...f })),
    regions: file.regions.map((r) => ({ ...r, neighbors: [...r.neighbors], castles: r.castles.map((c) => castle(c, r.name)) })),
    goalRegion: file.goalRegion,
  };
}

/** map.json 그대로 (편성 이름 상태) */
export const mapFile: MapFile = mapJson as MapFile;

/** 첫 지도 (황건적 토벌, 하북) */
export const strategyMap: StrategyMap = resolveMap(mapFile);
