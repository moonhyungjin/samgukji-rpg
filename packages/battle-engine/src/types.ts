// 전투 엔진의 공용 타입. React/PixiJS/DOM에 의존하지 않는다.

export const FAMILIES = ['infantry', 'shield', 'cavalry', 'archer', 'strategist', 'taoist', 'geomancer', 'lord'] as const;
export type Family = (typeof FAMILIES)[number];

export type Row = 'front' | 'back';
export type Side = 'attacker' | 'defender';

export type StatKey = 'attack' | 'defense' | 'intellect' | 'speed' | 'action' | 'diplomacy' | 'politics' | 'charm';
export type Stats = Record<StatKey, number>;

export type SkillKind = 'attack' | 'heal' | 'guard' | 'buff' | 'revive';

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
  /** 이 기술로 공격받은 대상의 반격 비율 (원작처럼 기술마다 다르다. 예: 일반공격 0.25, 전력 공격 0.5). 생략하면 balance.counter.rate */
  counterRate?: number;
  /**
   * 동시 타격: 전열 대상을 칠 때 같은 칸 번호(전열 1번 ↔ 후열 1번)의 후열 군단도 함께 친다. 값은 후열 피해의 비율
   * (후열 군단 기준으로 계산한 피해 × 이 값). 생략하거나 0이면 없다. 후열을 직접 칠 때는 적용하지 않고, 반격은 전열 대상만 한다.
   */
  behindHit?: number;
  /**
   * 열 공격: 조준한 대상이 있는 열 전체를 친다 (일제사격, 대화계). 값은 각 군단 피해의 비율
   * (그 군단 기준으로 계산한 피해 × 이 값). 생략하거나 0이면 단일 대상이다. 가드로 대신 맞기는 없고 크리티컬은 한 번만 굴려 모두에 적용한다.
   */
  rowAttack?: number;
  /**
   * 버프/치유의 대상 범위. 생략하면 대상 하나. row: 고른 아군이 있는 열의 아군 전체, all: 아군 전체 (자신 포함).
   * 한 번의 사용(AP 한 번)으로 범위 안의 아군 각각에게 효과가 적용된다 (버프는 받을 수 있는 아군에게만, 스탯 버프의 무작위는 아군마다 따로 굴린다).
   */
  area?: 'row' | 'all';
  /** 부활(kind가 revive): 되살아난 군단의 병력 = 최대 병력 × 이 값. 생략하면 0.2 */
  reviveRatio?: number;
  /** 한 전투에서 시전자 한 군단이 이 스킬을 쓸 수 있는 횟수. 부활은 생략하면 1, 다른 스킬은 생략하면 제한 없음 */
  maxUses?: number;
  /**
   * true이면 대상과 같은 열의 가드 유닛이 대신 맞을 수 있다 (단일 대상 물리 공격).
   * 책략처럼 막을 수 없는 공격은 false. 생략하면 false.
   */
  guardable?: boolean;
  /** 물리 공격이 대상의 방어 스탯을 이만큼 무시한다 (0 미만으로는 내려가지 않는다). 생략하면 0 */
  ignoreDefense?: number;
  /** kind가 buff일 때: 아군 하나의 스탯을 전투가 끝날 때까지 올린다 */
  buff?: BuffEffect;
  /** 공격이 맞으면 chance(%) 확률로 디버프를 건다 (100이면 확정). id는 balance.debuffs의 키 */
  debuff?: SkillDebuff;
}

export interface SkillDebuff {
  id: string;
  /** 걸릴 확률 (%) */
  chance: number;
}

/**
 * 디버프(상태이상) 한 종류의 값 (balance.debuffs). 라운드가 끝날 때마다 tick = flat + 걸린 타격 피해 × ratio 만큼 병력이 준다.
 * 가드/결계로 막을 수 없고 반격도 없다. 같은 디버프를 다시 걸면 갱신된다 (설계 문서 01 6장).
 */
export interface DebuffConfig {
  name: string;
  flat: number;
  ratio: number;
  /** 지속 라운드 */
  rounds: number;
}

/** 군단에 걸려 있는 디버프 */
export interface ActiveDebuff {
  id: string;
  /** 라운드가 끝날 때 들어가는 피해 (걸릴 때 정해진다) */
  tick: number;
  roundsLeft: number;
  /** 건 군단 (피해와 처치를 이 군단의 기록으로 센다) */
  source: string;
  /** 건 스킬 (스킬별 피해 통계에 더한다) */
  skillId: string;
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
 * 가드 상태(확률 > 0)에서 공격에 맞을 때마다(대신 맞든 직접 맞든) decay만큼 줄고, 그 유닛이 공격하면 0이 된다 (원작 규칙).
 */
export interface GuardConfig {
  /** 전투 시작 시 가드 확률 */
  start: number;
  /** 가드 커맨드 한 번에 오르는 확률 = gain + 지력 × gainPerIntellect */
  gain: number;
  /** 가드 커맨드 한 번에 지력 1당 더 오르는 확률 (원작: 같은 열 가드 지력 × 20). 생략하면 0 */
  gainPerIntellect?: number;
  /** 가드 상태에서 한 번 맞을 때 줄어드는 확률 (결계로 피해를 무시하면 줄지 않는다) */
  decay: number;
  /** 가드 확률이 0보다 큰 동안(가드 상태) 받는 피해에 곱하는 값. 생략하면 1 (피해 감소 없음) */
  damageTaken?: number;
  /** 대신 맞아 줄 수 있는 아군의 범위. row(기본): 같은 열 아군만, all: 모든 아군(양 열, 자기 제외) */
  scope?: 'row' | 'all';
  /** true이면 지력 기반 공격(책략/도술)도 대신 맞는다. 생략하면 false (지력 공격은 가드로 막을 수 없다) */
  interceptsMagic?: boolean;
  /** true이면 공격해도 가드가 풀리지 않는다. 생략하면 false (공격하면 가드 확률이 모두 사라진다) */
  keepOnAttack?: boolean;
}

/**
 * 징병 단가 (병사 1명당). 원작(전국란스)의 증원/보충/해고를 우리 병력 단위에 맞춰 옮긴 것.
 * reinforce: 부대 정원을 늘릴 때(증원), replenish: 잃은 병사를 정원까지 채울 때(보충), dismiss: 줄일 때 돌려받는 돈(해고)
 */
export interface RecruitCost {
  reinforce: number;
  replenish: number;
  dismiss: number;
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

/** 승급으로 오르는 스탯 (양수) */

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
  /** 공격받았을 때 반격할 수 있는가. 반격 비율은 공격한 쪽 기술의 counterRate다 */
  canCounter: boolean;
  /**
   * 반격 배율: 이 병종이 반격할 때 반격 피해에 곱하는 값 (기본 1). 반격 비율은 공격한 쪽 스킬의 값이라
   * 반격하는 쪽의 세기는 이 값으로 정한다 (예: 근위대는 반격이 매우 강하다)
   */
  counterPower?: number;
  basicSkillId: string;
  extraSkillIds: string[];
  /** 승급 병종 id 목록 (프로토타입에서는 비어 있음) */
  promotesTo: string[];
  /** 병종 특성 id 목록 (GameData.traits 참조) */
  traitIds: string[];
  /**
   * 병종의 병력 상한 배율 (기본 1). 레벨당 병력 상한 증가에 곱한다: 최대 병력 = base + perLevel × 이 값 × (레벨 − 1).
   * Lv1은 모든 병종이 같다 (2026-10-08 사용자 결정).
   */
  troopScale?: number;
  /** true이면 이 병종의 치유가 대상의 디버프를 모두 지운다 (가인, 신선). 생략하면 false */
  cleanseOnHeal?: boolean;
  /**
   * 자동 개인 버프: 1라운드가 시작될 때 이 버프 스킬(kind buff)이 AP를 쓰지 않고 자기 자신에게 한 번 걸린다 (군주).
   * 범위(area)는 무시하고 자신만 받는다. 1라운드의 행동 순서는 버프 전에 정해진다. 생략하면 없음
   */
  autoBuffSkillId?: string;
  /** 병종 기본 AP. 전투 총 AP = 병종 기본 AP + 캐릭터 행동력으로 얻는 추가 AP (생략하면 0) */
  baseAp?: number;
  /** 징병 단가(병사 1명당 돈). 아직 전투에서는 쓰지 않는다 (돈 체계가 생기면 쓴다) */
  recruit?: RecruitCost;
  /**
   * 공격 종류에 따라 이 병종이 받는 피해에 곱하는 값. physical: 공격 스탯 기반 공격(일반공격/돌격/화살), magic: 지력 기반 공격(책략/도술).
   * 예: 지력 계열은 책략에 ×0.8, 물리에 ×1.2 — 궁병 같은 물리 공격수가 책사/도사를 잡는 전문가가 된다. 생략하면 둘 다 1
   */
  damageTakenByType?: { physical: number; magic: number };
  /**
   * 대상이 있는 열에 따라 이 병종이 주는 피해에 곱하는 값. front: 대상이 전열, back: 대상이 후열.
   * 예: 궁병은 전열을 쏘면 ×0.8, 후열을 쏘면 ×1. 생략하면 둘 다 1
   */
  damageDealtByRow?: { front: number; back: number };
  /** additive 공식: 이 병종이 때릴 때 기본값에 더하는 값 (원작: 기마 50, 무사 30, 아시가루 15, 궁병 10). physical은 공격력 기반, magic은 지력 기반 공격. 생략하면 0 */
  typeBonus?: { physical: number; magic: number };
  /** additive 공식: 이 병종이 맞을 때 기본값에 더하는 값 (원작: 무사/기마 0, 아시가루 10, 궁병 15, 지력 계열 20). 생략하면 0 */
  vulnerability?: { physical: number; magic: number };
  /** 병종 스탯 보정. 캐릭터의 기본 스탯에 더해진다 (0 아래로는 내려가지 않는다). 승급 트리(promotesTo)의 앞 병종 보정과 누적된다: 최종 = 캐릭터 + 뿌리 병종부터 이 병종까지의 보정 합 */
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

export type TroopFactorMode = 'absolute' | 'relative' | 'tiered' | 'ratio';

export type DamageFormula = 'divide' | 'additive' | 'gap';

/**
 * 원작(전국란스) 방식의 피해 공식.
 * 물리 기본값 = 공격자 병종 보정 + 대상 병종 취약 보정 + 공격 × attackMul − (방어 − 방어 무시) × defenseMul (최소 min)
 * 책략 기본값 = 병종 책략 보정 + 대상 책략 취약 보정 + 지력 × intellectMul − 대상 지력 × resistMul (최소 min)
 * 피해 = 기본값 × scale × 병력 보정 × 스킬 계수 × 나머지 배수. scale 10과 구간식 병력 보정(÷1000)이면 "기본값 × 병력 ÷ 100"(원작과 같은 꼴)이다.
 */
export interface AdditiveDamage {
  attackMul: number;
  defenseMul: number;
  intellectMul: number;
  resistMul: number;
  min: number;
  scale: number;
}

/**
 * gap 방식: 공격 − 방어 스탯 격차 1점당 피해가 perPoint(0.1 = 10%)씩 늘거나 준다.
 * 피해 = 기본 피해 × clamp(1 + (공격 − 방어 + 병종 보정 점수) × perPoint, min) × 병력 보정 × 나머지 배수
 * 기본 피해: baseMode 'stat'이면 기준 스탯 × attackScale, 'flat'이면 flat 고정값 (둘 다 × 스킬 계수).
 * 병종 보정 점수 = (공격 병종 typeBonus + 대상 vulnerability) ÷ bonusDiv. bonusDiv가 0이면 병종 보정을 쓰지 않는다.
 */
export interface GapDamage {
  perPoint: number;
  min: number;
  baseMode: 'stat' | 'flat';
  flat: number;
  bonusDiv: number;
}

/**
 * tiered 방식(원작 전국란스의 인원 계산을 우리 병력 단위로 옮긴 것): 병력을 구간별 효율로 센다.
 * 유효 병력 = knee까지 1명당 1 + knee~knee2는 1명당 rate2 + knee2 초과는 1명당 rate3 (최소 floor)
 * 보정 = 유효 병력 ÷ reference. capAtTroops이면 공격 피해가 공격자의 현재 병력을 넘지 않는다.
 */
export interface TieredTroopFactor {
  knee: number;
  knee2: number;
  rate2: number;
  rate3: number;
  floor: number;
  capAtTroops: boolean;
}

/**
 * ratio 방식 (2026-10-08 사용자 확정): 내 최대 병력 대비 현재 병력 비율을 구간마다 다른 효율로 센다.
 * 100% → knee까지는 1%당 1%씩, knee → knee2는 1%당 rate2씩, knee2 → knee3는 1%당 rate3씩 보정이 줄고, knee3 아래는 그대로(하한).
 * 병력이 floorTroops 명보다 적으면 비율과 상관없이 하한 보정이다.
 */
export interface RatioTroopFactor {
  /** 비율 (0~1) */
  knee: number;
  knee2: number;
  knee3: number;
  rate2: number;
  rate3: number;
  /** 이 병력보다 적으면 하한 보정 (정수, 0이면 쓰지 않음) */
  floorTroops: number;
  /** true이면 공격 피해가 공격자의 현재 병력을 넘지 않는다 (원작 규칙, 구간식의 capAtTroops와 같다). 생략하면 false */
  capAtTroops?: boolean;
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
    /** divide(생략 시): 기준 스탯 × attackScale ÷ (1 + 방어 × scale). additive: 원작(전국란스) 방식의 더하기/빼기 공식 (AdditiveDamage) */
    formula?: DamageFormula;
    additive?: AdditiveDamage;
    gap?: GapDamage;
  };
  heal: {
    scale: number;
    /** true이면 치유량에도 시전자의 병력 보정을 곱한다 (기본 false) */
    useTroopFactor?: boolean;
  };
  /** 최대 병력 = base + perLevel × 병종 병력 배율(troopScale) × (레벨 − 1). Lv1은 모든 병종이 base (2026-10-08 사용자 확정) */
  troops: { base: number; perLevel: number };
  /**
   * 병력 → 피해 보정.
   * absolute(생략 시): clamp(현재 병력 / reference, min, max) — 모든 병종에 같은 기준(reference)을 쓴다.
   * relative: 공격 스탯 기반 공격은 내 병력과 상대 병력을 비교하고(relative), 지력 기반 공격은 상대와 무관하게
   *   내 최대 병력 대비 현재 병력만 본다(self). 병종마다 최대 병력이 달라도 가득 찬 상태가 1.0이다.
   * tiered: 구간별 효율로 센 유효 병력 ÷ reference (TieredTroopFactor).
   * ratio: 내 최대 병력 대비 비율을 구간별 효율로 센다 (RatioTroopFactor). 모든 공격과 치유에 같다.
   */
  troopFactor: {
    reference: number;
    min: number;
    max: number;
    mode?: TroopFactorMode;
    /**
     * true(기본)이면 병력 보정에 쓰는 병력을 병종 병력 배율(troopScale)로 나눈 "환산 병력"으로 센다.
     * 병력 배율은 징병 비용 때문에 모이는 병력이 적다는 뜻일 뿐이라서, 최대 병력이 800인 병종도 가득 차 있으면 1000인 병종과 같은 세기로 때린다.
     * 레벨 차이로 생기는 병력 차이는 그대로 반영된다. false이면 실제 병력 수만 본다.
     */
    normalizeByScale?: boolean;
    /** relative 방식, 공격 스탯 기반 공격: clamp((내 병력 / 상대 병력) ^ exponent, min, max) */
    relative?: { min: number; max: number; exponent: number };
    /** relative 방식, 지력 기반 공격과 치유: clamp(현재 병력 / 최대 병력, min, max) */
    self?: { min: number; max: number };
    tiered?: TieredTroopFactor;
    ratio?: RatioTroopFactor;
  };
  /** 기술에 counterRate가 없을 때의 반격 비율 */
  /**
   * rate: 기술에 counterRate가 없을 때의 반격 비율.
   * onDestroy: true이면 맞아서 전멸해도 반격한다 (주고받기를 동시에: 반격은 맞기 전 병력으로 계산하므로 막타에도 반격이 들어온다). 생략하면 false
   */
  counter: { rate: number; onDestroy?: boolean };
  /** 크리티컬(치명타): 일반공격/책략 공격이 chance(%)의 확률로 피해 × multiplier. 반격과 치유는 제외. 생략하거나 chance가 0이면 꺼진다 */
  critical?: { chance: number; multiplier: number };
  /** 디버프 종류별 값 (키가 skill.debuff.id). 생략하면 디버프가 없다 */
  debuffs?: Record<string, DebuffConfig>;
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
  /** 열 안의 고정 위치 0~2 (전열 1~3번, 후열 4~6번). 생략한 기존 편성은 빈칸 순서로 배치. */
  slot?: number;
  /** Balance Lab에서 레벨을 덮어쓸 때 사용 */
  level?: number;
  /**
   * 이 편성에서 장수가 지금 맡은 병종. 생략하면 장수의 병종(character.unitType).
   * 승급 단계를 나타낸다: 승급 트리에서 어느 병종인지에 따라 누적 승급 보너스가 달라진다.
   */
  unitType?: string;
  /** 캠페인: 이 군단의 정원 (전투에서의 최대 병력). 생략하면 레벨로 정해지는 상한 */
  maxTroops?: number;
  /** 캠페인: 전투를 시작할 때의 병력 (1 ~ 최대 병력). 생략하면 가득 찬 상태 */
  troops?: number;
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
  /** 스킬별로 이 군단이 쓴 횟수 (maxUses 판정용). 생략하면 아직 쓰지 않았다 */
  skillUses?: Record<string, number>;
  /** 남은 피해 무시 횟수. 피해를 입을 때마다 1 줄고 그 피해는 0이 된다 */
  barrier: number;
  /** 걸려 있는 디버프. 생략하면 없다 */
  debuffs?: ActiveDebuff[];
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
  /** order: 엔진이 이번 라운드에 정한 행동 순서 (uid, 속도 순이고 동률은 난수). 행동 차례가 오기 전에 전멸하거나 AP가 0이 된 군단은 건너뛴다 */
  | { type: 'roundStart'; round: number; order: string[] }
  | { type: 'action'; round: number; actor: string; skillId: string; target?: string; apAfter: number }
  | { type: 'damage'; round: number; kind: 'attack' | 'counter'; source: string; target: string; amount: number; troopsAfter: number; critical?: true; splash?: true }
  | { type: 'heal'; round: number; source: string; target: string; amount: number; troopsAfter: number }
  /** 부활: 전멸했던 target이 병력 troopsAfter로 row의 slot 자리에 되살아났다 */
  | { type: 'revive'; round: number; source: string; target: string; troopsAfter: number; row: Row; slot: number }
  | { type: 'unitDestroyed'; round: number; unit: string; by: string }
  | { type: 'rowAdvance'; round: number; side: Side; units: string[] }
  /** 가드 유닛이 원래 대상 대신 맞는다. 이 이벤트 다음의 damage는 guardian이 받는다 */
  | { type: 'intercept'; round: number; attacker: string; target: string; guardian: string }
  /** 가드 확률이 바뀌었다. raise: 가드 커맨드, block: 가드 중에 맞아서 감소(대신 맞은 경우 포함), reset: 공격해서 해제 */
  | { type: 'guardChange'; round: number; unit: string; rate: number; reason: 'raise' | 'block' | 'reset' }
  /** 버프로 target의 스탯이 올랐다. value는 올라간 뒤의 스탯 */
  | { type: 'buff'; round: number; source: string; target: string; changes: { stat: BuffStat; amount: number; value: number }[] }
  /** 피해 무시 횟수가 바뀌었다. gain: 도사의 결계, block: 피해를 무시했다 (이어지는 damage는 0) */
  | { type: 'barrier'; round: number; unit: string; charges: number; reason: 'gain' | 'block' }
  /** 디버프 이벤트의 name은 표시용 이름(balance.debuffs[id].name)이다 */
  /** 디버프가 걸렸다 (refresh: 이미 걸려 있던 것을 새 값으로 갱신). tick은 라운드가 끝날 때마다 들어갈 피해 */
  | { type: 'debuffApply'; round: number; unit: string; source: string; debuffId: string; name: string; tick: number; rounds: number; refresh: boolean }
  /** 라운드가 끝나 디버프 피해가 들어갔다. 병력이 0이 되면 이어서 unitDestroyed가 온다 */
  | { type: 'debuffTick'; round: number; unit: string; source: string; debuffId: string; name: string; amount: number; troopsAfter: number }
  /** 디버프가 끝났다. expire: 지속이 다 됨, cleanse: 치유로 해제 */
  | { type: 'debuffEnd'; round: number; unit: string; debuffId: string; name: string; reason: 'expire' | 'cleanse' }
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
