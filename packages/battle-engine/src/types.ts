// 전투 엔진의 공용 타입. React/PixiJS/DOM에 의존하지 않는다.

export const FAMILIES = ['infantry', 'shield', 'cavalry', 'archer', 'strategist', 'taoist', 'geomancer'] as const;
export type Family = (typeof FAMILIES)[number];

export type Row = 'front' | 'back';
export type Side = 'attacker' | 'defender';

export type StatKey = 'attack' | 'defense' | 'intellect' | 'speed' | 'action' | 'diplomacy' | 'politics' | 'charm';
export type Stats = Record<StatKey, number>;

export type SkillKind = 'attack' | 'heal' | 'guard' | 'buff';

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
  /**
   * true이면 대상과 같은 열의 가드 유닛이 대신 맞을 수 있다 (단일 대상 물리 공격).
   * 책략처럼 막을 수 없는 공격은 false. 생략하면 false.
   */
  guardable?: boolean;
  /** 물리 공격이 대상의 방어 스탯을 이만큼 무시한다 (0 미만으로는 내려가지 않는다). 생략하면 0 */
  ignoreDefense?: number;
  /** kind가 buff일 때: 아군 하나의 스탯을 전투가 끝날 때까지 올린다 */
  buff?: BuffEffect;
}

/** 버프로 오를 수 있는 스탯 */
export type BuffStat = 'attack' | 'defense' | 'intellect' | 'speed';

/**
 * 버프 효과 (kind가 buff인 스킬).
 * stats: 아군 하나의 스탯 중 무작위 minCount~maxCount가지(pool에서 중복 없이)를 amount만큼 전투가 끝날 때까지 올린다. (책사)
 * barrier: 아군 하나가 다음 charges번의 피해를 무시한다. (도사, 전국란스의 음양사 같은 느낌)
 * maxStacks: 한 아군에게 이 스킬을 쓸 수 있는 횟수 (생략하면 1)
 */
export type BuffEffect =
  | { type: 'stats'; pool: BuffStat[]; minCount: number; maxCount: number; amount: number; maxStacks?: number }
  | { type: 'barrier'; charges: number; maxStacks?: number };

/**
 * 가드(방패) 설정. 가드 확률은 "같은 열 아군을 대신 맞아줄 확률"이며 %p 단위로 쌓고 100을 넘을 수 있다.
 * 막을 때마다 decay만큼 줄고, 그 유닛이 공격하면 0이 된다.
 */
export interface GuardConfig {
  /** 전투 시작 시 가드 확률 */
  start: number;
  /** 가드 커맨드 한 번에 오르는 확률 */
  gain: number;
  /** 한 번 막을 때 줄어드는 확률 */
  decay: number;
  /** 가드 확률이 0보다 큰 동안(가드 상태) 받는 피해에 곱하는 값. 생략하면 1 (피해 감소 없음) */
  damageTaken?: number;
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
  /**
   * 사거리. 공격자와 대상 사이의 거리(전열↔전열 1, 후열↔전열 또는 전열↔후열 2, 후열↔후열 3)가 사거리 이하여야 공격할 수 있다.
   * 사거리 1은 자기가 전열에 있을 때 적의 전열만 칠 수 있고 (후열에 있으면 아무도 못 친다), 사거리 3은 어느 열에서든 모든 열을 칠 수 있다.
   */
  range: number;
  /** 공격받았을 때 반격할 수 있는가 */
  canCounter: boolean;
  /** 반격 피해 = 반격자의 일반공격 피해 × 이 값. 생략하면 balance.counter.rate. 반격에는 방어 무시(ignoreDefense)가 붙지 않는다 */
  counterRate?: number;
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
  /** 병종 스탯 보정. 캐릭터의 기본 스탯에 더해진다 (0 아래로는 내려가지 않는다). 승급 병종은 자기 보정을 따로 가진다 */
  /** 병종 기본 AP. 전투 총 AP = 병종 기본 AP + 캐릭터 행동력으로 얻는 추가 AP (생략하면 0) */
  baseAp?: number;
  /**
   * 공격 종류에 따라 이 병종이 받는 피해에 곱하는 값. physical: 공격 스탯 기반 공격(일반공격/돌격/화살), magic: 지력 기반 공격(책략/독연).
   * 예: 지력 계열은 책략에 ×0.8, 물리에 ×1.2 — 궁병 같은 물리 공격수가 책사/도사를 잡는 전문가가 된다. 생략하면 둘 다 1
   */
  damageTakenByType?: { physical: number; magic: number };
  /**
   * 대상이 있는 열에 따라 이 병종이 주는 피해에 곱하는 값. front: 대상이 전열, back: 대상이 후열.
   * 예: 궁병은 전열을 쏘면 ×0.8, 후열을 쏘면 ×1. 생략하면 둘 다 1
   */
  damageDealtByRow?: { front: number; back: number };
  statMods?: Partial<Pick<Stats, 'attack' | 'defense' | 'intellect' | 'speed' | 'action'>>;
  /** 가드를 쓸 수 있는 병종 (스킬 목록에 kind: 'guard' 스킬도 있어야 한다) */
  guard?: GuardConfig;
}

export type CharacterRank = 'elite' | 'normal';
/** 무작위 편성의 후보 풀. elite: 네임드 장수만, normal: 평범한 장수만, all: 모두 */
export type CharacterPool = CharacterRank | 'all';

export interface CharacterData {
  id: string;
  name: string;
  /** elite: 네임드 장수(기본), normal: 평범한 장수(황건적 같은 일반 병력). 무작위 편성의 후보 풀을 고르는 데 쓴다 */
  rank?: CharacterRank;
  unitType: string;
  /** 기본 스탯 0~10 (아이템 등으로 초과 가능) */
  stats: Stats;
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
  /** 행동력 스탯 → 추가 AP: ceil(행동력 / perAp), 행동력은 cap(기본 10)까지만 센다. 생략하면 perAp 2, cap 10 */
  action?: { perAp: number; cap: number };
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
  /** 같은 열 아군을 대신 맞아줄 확률 (%p). 가드를 못 쓰는 병종은 항상 0 */
  guardRate: number;
  /** 버프로 올라간 스탯 (stats에 이미 반영돼 있다). 쌓인 양을 세는 용도 */
  buffs: Record<BuffStat, number>;
  /** 스킬별로 받은 버프 횟수 (maxStacks 판정용) */
  buffUses: Record<string, number>;
  /** 남은 피해 무시 횟수. 피해를 입을 때마다 1 줄고 그 피해는 0이 된다 */
  barrier: number;
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
  /** 가드 유닛이 원래 대상 대신 맞는다. 이 이벤트 다음의 damage는 guardian이 받는다 */
  | { type: 'intercept'; round: number; attacker: string; target: string; guardian: string }
  /** 가드 확률이 바뀌었다. raise: 가드 커맨드, block: 막은 뒤 감소, reset: 공격해서 해제 */
  | { type: 'guardChange'; round: number; unit: string; rate: number; reason: 'raise' | 'block' | 'reset' }
  /** 버프로 target의 스탯이 올랐다. value는 올라간 뒤의 스탯 */
  | { type: 'buff'; round: number; source: string; target: string; changes: { stat: BuffStat; amount: number; value: number }[] }
  /** 피해 무시 횟수가 바뀌었다. gain: 도사의 결계, block: 피해를 무시했다 (이어지는 damage는 0) */
  | { type: 'barrier'; round: number; unit: string; charges: number; reason: 'gain' | 'block' }
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
  /** 가드로 대신 맞은 횟수 */
  blocks: number;
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
