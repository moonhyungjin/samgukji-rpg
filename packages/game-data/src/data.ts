import type { CharacterData, GameData, SkillData, TraitData, UnitTypeData } from '@samgukji/battle-engine';
import charactersJson from '../data/characters.json';

// ---------- 병종 특성 ----------
// 계열 간 상성표 대신 병종이 가진 효과로 피해를 보정한다. 아래는 예시이며 아직 어떤 병종에도 붙어 있지 않다.
// (창병 승급 병종이 생기면 anti-cavalry를 붙인다. Balance Lab에서 병종에 붙여 실험할 수 있다.)

const traitList: TraitData[] = [
  { id: 'anti-cavalry', name: '대기병', kind: 'damage-dealt', versus: { families: ['cavalry'] }, multiplier: 1.25 },
  { id: 'archer-vs-front', name: '전열 상대', kind: 'damage-dealt', versus: { rows: ['front'] }, multiplier: 0.8 },
  { id: 'cavalry-tough', name: '기병의 기세', kind: 'damage-taken', multiplier: 0.9 },
  { id: 'fragile-vs-melee', name: '근접에 취약', kind: 'damage-taken', versus: { families: ['infantry', 'cavalry'] }, multiplier: 1.3 },
];

// ---------- 스킬 (커맨드) ----------
// 상태이상(화상/독/젖음), 필살기는 아직 구현하지 않았다. 책략/독연은 피해만 준다.

const skillList: SkillData[] = [
  // guardable: 같은 열의 가드 유닛이 대신 맞을 수 있는 공격 (단일 대상 물리 공격). 책략/독연은 막지 못한다.
  { id: 'infantry-attack', name: '공격', kind: 'attack', scalesWith: 'attack', power: 1.0, apCost: 1, counterable: true, guardable: true, ignoreDefense: 0 },
  { id: 'cavalry-charge', name: '돌격', kind: 'attack', scalesWith: 'attack', power: 1.2, apCost: 1, counterable: true, guardable: true, ignoreDefense: 1 },
  { id: 'archer-shot', name: '화살 공격', kind: 'attack', scalesWith: 'attack', power: 0.95, apCost: 1, counterable: false, guardable: true, ignoreDefense: 0 },
  { id: 'stratagem', name: '책략', kind: 'attack', scalesWith: 'intellect', power: 0.8, apCost: 1, counterable: false },
  { id: 'poison-smoke', name: '독연', kind: 'attack', scalesWith: 'intellect', power: 0.8, apCost: 1, counterable: false },
  { id: 'heal', name: '치유', kind: 'heal', scalesWith: 'intellect', power: 0.8, apCost: 1, counterable: false },
  // 버프 (병력과 무관하게 아군을 돕는 수단). 책사 독려: 공/방/지/속 중 무작위 1~3가지를 +1 (전투 끝까지). 도사 결계: 다음 피해 1회 무시 (전국란스의 음양사 느낌).
  { id: 'inspire', name: '독려', kind: 'buff', scalesWith: 'intellect', power: 0, apCost: 1, counterable: false, buff: { type: 'stats', pool: ['attack', 'defense', 'intellect', 'speed'], minCount: 1, maxCount: 3, amount: 1, maxStacks: 1 } },
  { id: 'ward', name: '결계', kind: 'buff', scalesWith: 'intellect', power: 0, apCost: 1, counterable: false, buff: { type: 'barrier', charges: 1, maxStacks: 1 } },
  // 가드: 같은 열 아군을 대신 맞아줄 확률을 올린다. 막기만 하거나 공격만 해야 한다 (공격하면 해제).
  { id: 'guard', name: '가드', kind: 'guard', scalesWith: 'attack', power: 0, apCost: 1, counterable: false },
];

// ---------- 1차 병종 6계열 ----------
// troopScale: 같은 징병 비용으로 모이는 병력의 비율. 기병·책사는 병력이 비싸서 0.8, 풍수사는 0.6.
// counterRate: 반격 피해 = 반격자 일반공격 피해 × 이 값 (방패병 0.5, 보병 0.5, 기병 0.6, 궁병 0.25; 기병의 반격에는 방어 무시가 붙지 않는다).
// damageTakenByType: 공격 종류별 받는 피해 배수. 방패병/보병/기병/궁병은 물리 ×1, 책략 ×1.1, 책사/도사/풍수사는 물리 ×1.1, 책략 ×0.8.
// statMods: 병종 스탯 보정 (캐릭터 기본 스탯에 더해진다). 방패병 공-1 속-1, 기병 공/방/속 +1, 궁병 방-1 속-1, 책사 지+1, 도사 속+1, 보병/풍수사 없음.
// 보병과 방패병이 가장 표준적인 병종이다. 가드는 방패병만 쓴다 (시작 50%p, 가드 +70%p, 막을 때마다 -40%p, 가드 중 받는 피해 ×0.75 (25%만 줄인다)).
// 사거리(range): 방패병/보병/기병 1, 궁병/책사/도사/풍수사 3. 사거리 1은 전열에서만 적의 전열을 칠 수 있다. 방/보/기/궁은 전열과 후열 어디에든 배치할 수 있고, 책사/도사/풍수사는 후열 전용.
// (후열 저격은 나중에 승급 병종이나 스킬로 다시 정한다)

const unitTypeList: UnitTypeData[] = [
  { id: 'infantry', name: '보병', family: 'infantry', tier: 1, allowedRows: ['front', 'back'], range: 1, canCounter: true, counterRate: 0.5, basicSkillId: 'infantry-attack', extraSkillIds: [], promotesTo: [], traitIds: [], troopScale: 1, baseAp: 2, damageTakenByType: { physical: 1, magic: 1.1 }, statMods: { attack: 0, defense: 0, intellect: 0, speed: 0 } },
  {
    id: 'shield', name: '방패병', family: 'shield', tier: 1, allowedRows: ['front', 'back'], range: 1, canCounter: true, counterRate: 0.5,
    basicSkillId: 'infantry-attack', extraSkillIds: ['guard'], promotesTo: [], traitIds: [], troopScale: 1, baseAp: 3, damageTakenByType: { physical: 1, magic: 1.1 }, statMods: { attack: -1, defense: 0, intellect: 0, speed: -1 },
    guard: { start: 50, gain: 70, decay: 40, damageTaken: 0.75 },
  },
  { id: 'cavalry', name: '기병', family: 'cavalry', tier: 1, allowedRows: ['front', 'back'], range: 1, canCounter: true, counterRate: 0.6, basicSkillId: 'cavalry-charge', extraSkillIds: [], promotesTo: [], traitIds: ['cavalry-tough'], troopScale: 0.8, baseAp: 2, damageTakenByType: { physical: 1, magic: 1.1 }, statMods: { attack: 1, defense: 1, intellect: 0, speed: 1 } },
  { id: 'archer', name: '궁병', family: 'archer', tier: 1, allowedRows: ['front', 'back'], range: 3, canCounter: true, counterRate: 0.25, basicSkillId: 'archer-shot', extraSkillIds: [], promotesTo: [], traitIds: ['archer-vs-front'], troopScale: 0.85, baseAp: 2, damageTakenByType: { physical: 1, magic: 1.1 }, statMods: { attack: 0, defense: -1, intellect: 0, speed: -1 } },
  { id: 'strategist', name: '책사', family: 'strategist', tier: 1, allowedRows: ['back'], range: 3, canCounter: false, counterRate: 0.5, basicSkillId: 'stratagem', extraSkillIds: ['inspire'], promotesTo: [], traitIds: [], troopScale: 0.8, baseAp: 2, damageTakenByType: { physical: 1.1, magic: 0.8 }, statMods: { attack: 0, defense: 0, intellect: 1, speed: 0 } },
  { id: 'taoist', name: '도사', family: 'taoist', tier: 1, allowedRows: ['back'], range: 3, canCounter: false, counterRate: 0.5, basicSkillId: 'poison-smoke', extraSkillIds: ['ward'], promotesTo: [], traitIds: [], troopScale: 0.8, baseAp: 2, damageTakenByType: { physical: 1.1, magic: 0.8 }, statMods: { attack: 0, defense: 0, intellect: 0, speed: 1 } },
  { id: 'geomancer', name: '풍수사', family: 'geomancer', tier: 1, allowedRows: ['back'], range: 3, canCounter: false, counterRate: 0.5, basicSkillId: 'heal', extraSkillIds: [], promotesTo: [], traitIds: [], troopScale: 0.6, baseAp: 2, damageTakenByType: { physical: 1.1, magic: 0.8 }, statMods: { attack: 0, defense: 0, intellect: 0, speed: 0 } },
];

// ---------- 캐릭터 (이름만 삼국지, 수치는 모두 임시) ----------
// 행동력(5번째 값, 1~10): 2마다 추가 AP 1. 전투 총 AP = 병종 기본 AP(baseAp) + 행동력 추가 AP.
// 지금은 방패병 기본 3 + 행동력 3(+2) = 5, 보병/기병/궁병 기본 2 + 행동력 3(+2) = 4, 책사/도사 기본 2 + 행동력 1(+1) = 3.
// 초반엔 행동력 대체로 5 이하, 10(+5)까지는 아이템 등으로 올리는 방향

// 캐릭터 데이터는 data/characters.json에 있다. 장수 편집기(apps/character-editor, `npm run chars`)에서 저장하면 이 파일이 바뀌고,
// 전투 테스트기(Lab/게임/시뮬레이터)가 그 값을 쓴다. 스탯 순서: 공격/방어/지력/속도/행동력/외교/내정/매력.
// 평범한 장수(황건적 등)는 rank: 'normal'이다. 무작위 편성은 기본으로 네임드 장수(elite)만 쓰고, pool: 'normal'로 평범한 장수를 쓴다.
const characterList = charactersJson as unknown as CharacterData[];

const toRecord = <T extends { id: string }>(list: T[]): Record<string, T> => Object.fromEntries(list.map((x) => [x.id, x]));

export const gameData: GameData = {
  skills: toRecord(skillList),
  traits: toRecord(traitList),
  unitTypes: toRecord(unitTypeList),
  characters: toRecord(characterList),
};
