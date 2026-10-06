// 전투 엔진의 공용 타입. React/PixiJS/DOM에 의존하지 않는다.

export const FAMILIES = ['infantry', 'cavalry', 'archer', 'strategist', 'taoist', 'geomancer'] as const;
export type Family = (typeof FAMILIES)[number];

export type Row = 'front' | 'back';
export type Side = 'attacker' | 'defender';

export type StatKey = 'attack' | 'defense' | 'intellect' | 'speed' | 'diplomacy' | 'politics' | 'charm';
export type Stats = Record<StatKey, number>;

/** 적 대상 선택 규칙. front-first: 전열이 남아 있으면 전열만, any: 전열/후열 모두 */
export type TargetRule = 'front-first' | 'any';
export type SkillKind = 'attack' | 'heal';

// ---------- 정적 데이터 ----------

export interface SkillData {
  id: string;
  name: string;
  kind: SkillKind;
  /** 피해/회복량의 기준이 되는 스탯. intellect 스킬은 대상의 지력으로 저항한다. */
  scalesWith: 'attack' | 'intellect';
  power: number;
  apCost: number;
  /** true이면 이 공격에 대해 대상이 반격 피해를 줄 수 있다 (근접 일반공격 등) */
  counterable: boolean;
}

/**
 * 병종 특성. 계열 간 상성표를 대신해 "병종이 가진 효과"로 피해를 보정한다.
 * 예: 창병은 기병에게 주는 피해가 늘어난다 (damage-dealt, versus 기병), 궁병은 근접에게 맞으면 피해가 커진다 (damage-taken).
 */
export interface TraitData {
  id: string;
  name: string;
  /** damage-dealt: 이 유닛이 줄 때 / damage-taken: 이 유닛이 받을 때 */
  kind: 'damage-dealt' | 'damage-taken';
  /** 상대(주는 쪽이면 대상, 받는 쪽이면 공격자)의 조건. 생략하면 모든 상대 */
  versus?: { families?: Family[]; rows?: Row[] };
  multiplier: number;
}

export interface UnitTypeData {
  id: string;
  name: string;
  family: Family;
  tier: number;
  allowedRows: Row[];
  targetRule: TargetRule;
  /** 공격받았을 때 반격할 수 있는가 */
  canCounter: boolean;
  basicSkillId: string;
  extraSkillIds: string[];
  /** 승급 병종 id 목록 (프로토타입에서는 비어 있음) */
  promotesTo: string[];
  /** 병종 특성 id 목록 (GameData.traits 참조) */
  traitIds: string[];
  /**
   * 같은 징병 비용으로 모이는 병력의 비율. 군단 레벨로 정해진 최대 병력에 곱한다 (기본 1).
   * 예: 보병 1, 풍수사 0.5 → 같은 레벨에서 풍수사의 최대 병력이 절반이다.
   */
  troopScale?: number;
}

export interface CharacterData {
  id: string;
  name: string;
  unitType: string;
  /** 기본 스탯 0~10 (아이템 등으로 초과 가능) */
  stats: Stats;
  /** 전투 총 행동력 */
  ap: number;
  /** 기본 군단 레벨 */
  level: number;
}

export interface GameData {
  skills: Record<string, SkillData>;
  traits: Record<string, TraitData>;
  unitTypes: Record<string, UnitTypeData>;
  characters: Record<string, CharacterData>;
}

export interface BalanceConfig {
  /** 총 전투 턴 한도 (교착 방지용 안전장치) */
  maxTurns: number;
  /** 스탯(0~10) → 유효 스탯 변환 테이블. 10 초과는 마지막 기울기로 연장 */
  statCurve: number[];
  /** 스탯 입력 상한 (아이템 보정 하드캡) */
  statCap: number;
  damage: {
    attackScale: number;
    /** 물리 피해 경감: 1 / (1 + 방어 × defenseScale) */
    defenseScale: number;
    /** 책략 피해 경감: 1 / (1 + 지력 × resistScale) */
    resistScale: number;
    minDamage: number;
  };
  heal: {
    scale: number;
    /** true이면 치유량에도 시전자의 병력 보정을 곱한다 (기본 false) */
    useTroopFactor?: boolean;
  };
  troops: { base: number; perLevel: number };
  /** 병력 → 피해 보정: clamp(현재 병력 / reference, min, max) */
  troopFactor: { reference: number; min: number; max: number };
  /** 반격 피해 = 반격자의 일반공격 피해 × rate */
  counter: { rate: number };
  morale: {
    /** 방어측 사기 시작값 (공격측 = 100 - 값). 제로섬 단일 막대 */
    defenderStart: number;
    /** 사기 비율에 따른 피해 보정 폭 (±). 0이면 사기는 피해에 영향을 주지 않고 최종 판정에만 쓰인다 */
    maxEffect: number;
    onUnitDestroyed: number;
    onHit: number;
    /** 최종 판정에서 사기를 보는 순서. 생략하면 tiebreak */
    judgement?: MoraleJudgement;
  };
}

// ---------- 전투 중 상태 ----------

export interface LineupEntry {
  characterId: string;
  row: Row;
  /** Balance Lab에서 레벨을 덮어쓸 때 사용 */
  level?: number;
}

export interface CharacterState {
  uid: string;
  characterId: string;
  name: string;
  side: Side;
  row: Row;
  slot: number;
  unitType: string;
  family: Family;
  traitIds: string[];
  stats: Stats;
  level: number;
  maxTroops: number;
  troops: number;
  ap: number;
  maxAp: number;
  isDead: boolean;
}

export interface BattleState {
  round: number;
  units: CharacterState[];
  /** 방어측 사기 비율 (0~100). 공격측 = 100 - 값 */
  defenderMorale: number;
  initialCount: Record<Side, number>;
}

// ---------- 이벤트 / 결과 ----------

export type EndCause = 'wipe' | 'no-ap' | 'stall' | 'max-turns';
export type DecidedBy = 'destroyed' | 'troops' | 'morale' | 'defender';

/**
 * 최종 판정에서 사기를 보는 순서.
 * tiebreak: 전멸 군단 수 → 잔여 병력 → 사기 → 방어측
 * before-troops: 전멸 군단 수 → 사기 → 잔여 병력 → 방어측
 */
export type MoraleJudgement = 'tiebreak' | 'before-troops';

export type BattleEvent =
  | { type: 'roundStart'; round: number }
  | { type: 'action'; round: number; actor: string; skillId: string; target?: string; apAfter: number }
  | { type: 'damage'; round: number; kind: 'attack' | 'counter'; source: string; target: string; amount: number; troopsAfter: number }
  | { type: 'heal'; round: number; source: string; target: string; amount: number; troopsAfter: number }
  | { type: 'unitDestroyed'; round: number; unit: string; by: string }
  | { type: 'rowAdvance'; round: number; side: Side; units: string[] }
  | { type: 'morale'; round: number; defenderMorale: number }
  | { type: 'battleEnd'; winner: Side; endCause: EndCause; decidedBy: DecidedBy; rounds: number };

export interface UnitReport {
  uid: string;
  characterId: string;
  name: string;
  side: Side;
  family: Family;
  unitType: string;
  level: number;
  maxTroops: number;
  finalTroops: number;
  survived: boolean;
  damageDealt: number;
  damageTaken: number;
  kills: number;
  healing: number;
  actions: number;
}

export interface SkillStat {
  uses: number;
  /** 행동으로 준 피해 (반격 피해는 제외) */
  damage: number;
  healing: number;
}

export interface BattleResult {
  winner: Side;
  endCause: EndCause;
  decidedBy: DecidedBy;
  rounds: number;
  destroyed: Record<Side, number>;
  remainingTroops: Record<Side, number>;
  defenderMorale: number;
  units: UnitReport[];
  skillStats: Record<string, SkillStat>;
  events?: BattleEvent[];
}
