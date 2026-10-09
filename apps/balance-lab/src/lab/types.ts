import type { CampaignFile, MapFile, PresetDef } from '@samgukji/game-data';
import type { BalanceConfig, BuffMode, CharacterPool, Family, GameData, GuardMode, LineupMode, RoleMode, TargetPolicy } from '@samgukji/battle-engine';

export interface SlotEntry {
  characterId: string;
  /** 비어 있으면 캐릭터의 기본 군단 레벨 */
  level?: number;
  /** 이 편성에서 지금 맡은 병종(승급 단계). 비어 있으면 장수의 병종 */
  unitType?: string;
}

/** 편성 슬롯 6칸. 0~2는 전열, 3~5는 후열. 빈 칸은 null */
export type Slots = (SlotEntry | null)[];

export interface SimSettings {
  iterations: number;
  seed: number;
  roles: RoleMode;
  lineups: LineupMode;
  targetPolicy: TargetPolicy;
  /** 가드를 쓸 수 있는 군단의 AI. protect: 지킬 아군이 있으면 가드를 유지하며 공격하지 않음 / never: 항상 공격 */
  guardMode: GuardMode;
  buffMode: BuffMode;
  pool: CharacterPool;
  /** 수치를 고치면 잠시 뒤 자동으로 다시 돌린다 */
  autoRun: boolean;
  autoRunIterations: number;
}

/**
 * 경고 기준 (안전선). 균형을 맞추는 목표가 아니라 값이 "깨졌는지"만 본다: 시뮬레이션 결과가 이 범위를 벗어나면 경고한다.
 * 값은 [임시]이며 사용자가 Lab에서 정한다.
 */
export interface WarningSettings {
  attackerWinRate: [number, number];
  averageRounds: [number, number];
  /** 무작위 편성에서만 평가 */
  familyWinRate: [number, number];
  characterWinRate: [number, number];
  /** 공격 스킬 평균 피해 ÷ 공격 스킬 전체 평균 */
  skillDamageRatio: [number, number];
  /** 한쪽 전멸로 끝난 전투가 이 비율보다 적으면 경고 (전멸이 거의 안 난다) */
  minWipeRate: number;
  /** 교착으로 끝난 전투가 이 비율보다 많으면 경고 */
  maxStallRate: number;
}

export interface LabState {
  data: GameData;
  balance: BalanceConfig;
  teamA: Slots;
  teamB: Slots;
  sim: SimSettings;
  warnings: WarningSettings;
  /** 기본 편성 (작업 중인 초안). 저장하면 data/presets.json이 된다 */
  presets: PresetDef[];
  /** 캠페인 (작업 중인 초안). 저장하면 data/campaign.json이 된다 */
  campaign: CampaignFile;
  /** 전략 지도 (작업 중인 초안). 저장하면 data/map.json이 된다 */
  map: MapFile;
  /** 이 초안이 어느 데이터 파일 내용에서 시작했는지 나타내는 지문. 파일이 바뀌면 초안을 버리고 파일 값으로 시작한다 */
  filesSignature?: string;
}
