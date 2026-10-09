import type { CampaignData, CampaignExp } from '@samgukji/battle-engine';
import campaignJson from '../data/campaign.json';
import { presets } from './presets';

// 캠페인 데이터의 원본은 data/campaign.json이다 (설계 문서 03). 편성은 presets.json의 이름으로 적고 여기서 풀어 준다.
// Balance Lab의 "캠페인" 탭에서 고치고 "파일에 저장"한다. 숫자는 모두 [임시].

/** campaign.json의 모양 (Lab이 이 모양 그대로 고치고 저장한다) */
export interface CampaignFile {
  id: string;
  name: string;
  startGold: number;
  startLevel: number;
  /** 시작 군단과 자리: 기본 편성 이름 */
  startPreset: string;
  /** 장수마다의 시작 레벨 (장수 id → 레벨). 없는 장수는 startLevel */
  startLevels?: Record<string, number>;
  /** enemyTroops: 적 군단의 병력(명). 없으면 레벨 상한으로 가득 */
  battles: { id: string; name: string; enemyPreset: string; enemyLevel: number; enemyTroops?: number; reward: number; joins: { characterId: string; unitType?: string }[] }[];
  exp: CampaignExp;
  promotionLevels: number[];
  /** 포획 비율 (군단이 줄인 적 병력 × 이 값) */
  captureRate: number;
}

/** 캠페인 파일(편성 이름)을 엔진이 쓰는 CampaignData(편성 목록)로 푼다. 없는 편성 이름이면 오류 */
export function resolveCampaign(file: CampaignFile, presetMap: Record<string, (typeof presets)[string]> = presets): CampaignData {
  const lineupOf = (id: string) => {
    const lineup = presetMap[id];
    if (!lineup) throw new Error(`캠페인 ${file.id}: 없는 편성 "${id}"`);
    return lineup;
  };
  return {
    id: file.id,
    name: file.name,
    startGold: file.startGold,
    startLevel: file.startLevel,
    // 편성의 레벨은 무시하고, 장수마다 정한 시작 레벨(없으면 공통 시작 레벨)을 쓴다
    start: lineupOf(file.startPreset).map((e) => ({ ...e, level: file.startLevels?.[e.characterId] ?? file.startLevel })),
    battles: file.battles.map((b) => ({
      id: b.id,
      name: b.name,
      // 적은 전투마다 정한 레벨로 나온다. 병력은 enemyTroops 또는 레벨 상한 가득 (엔진의 campaignBattleInput)
      enemy: lineupOf(b.enemyPreset).map((e) => ({ ...e, level: b.enemyLevel })),
      ...(b.enemyTroops !== undefined ? { enemyTroops: b.enemyTroops } : {}),
      reward: b.reward,
      joins: b.joins.map((j) => ({ ...j })),
    })),
    exp: { ...file.exp },
    promotionLevels: [...file.promotionLevels],
    captureRate: file.captureRate ?? 0,
  };
}

/** campaign.json 그대로 (편성 이름 상태) */
export const campaignFile: CampaignFile = campaignJson as CampaignFile;

/** 첫 캠페인 (황건적 토벌) */
export const campaign: CampaignData = resolveCampaign(campaignFile);
