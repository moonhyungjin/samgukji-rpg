import type { CharacterData, GameData, SkillData, Stats, TraitData, UnitTypeData } from '@samgukji/battle-engine';

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
// 기병은 일단 전열만 공격한다 (targetRule: front-first). 후열 저격은 나중에 승급 병종(경기병 등)이나 스킬로 다시 정한다.

const unitTypeList: UnitTypeData[] = [
  { id: 'infantry', name: '보병', family: 'infantry', tier: 1, allowedRows: ['front'], targetRule: 'front-first', canCounter: true, counterRate: 0.5, basicSkillId: 'infantry-attack', extraSkillIds: [], promotesTo: [], traitIds: [], troopScale: 1, baseAp: 2, damageTakenByType: { physical: 1, magic: 1.1 }, statMods: { attack: 0, defense: 0, intellect: 0, speed: 0 } },
  {
    id: 'shield', name: '방패병', family: 'shield', tier: 1, allowedRows: ['front'], targetRule: 'front-first', canCounter: true, counterRate: 0.5,
    basicSkillId: 'infantry-attack', extraSkillIds: ['guard'], promotesTo: [], traitIds: [], troopScale: 1, baseAp: 3, damageTakenByType: { physical: 1, magic: 1.1 }, statMods: { attack: -1, defense: 0, intellect: 0, speed: -1 },
    guard: { start: 50, gain: 70, decay: 40, damageTaken: 0.75 },
  },
  { id: 'cavalry', name: '기병', family: 'cavalry', tier: 1, allowedRows: ['front'], targetRule: 'front-first', canCounter: true, counterRate: 0.6, basicSkillId: 'cavalry-charge', extraSkillIds: [], promotesTo: [], traitIds: ['cavalry-tough'], troopScale: 0.8, baseAp: 2, damageTakenByType: { physical: 1, magic: 1.1 }, statMods: { attack: 1, defense: 1, intellect: 0, speed: 1 } },
  { id: 'archer', name: '궁병', family: 'archer', tier: 1, allowedRows: ['back'], targetRule: 'any', canCounter: true, counterRate: 0.25, basicSkillId: 'archer-shot', extraSkillIds: [], promotesTo: [], traitIds: ['archer-vs-front'], troopScale: 0.85, baseAp: 2, damageTakenByType: { physical: 1, magic: 1.1 }, statMods: { attack: 0, defense: -1, intellect: 0, speed: -1 } },
  { id: 'strategist', name: '책사', family: 'strategist', tier: 1, allowedRows: ['back'], targetRule: 'any', canCounter: false, counterRate: 0.5, basicSkillId: 'stratagem', extraSkillIds: ['inspire'], promotesTo: [], traitIds: [], troopScale: 0.8, baseAp: 2, damageTakenByType: { physical: 1.1, magic: 0.8 }, statMods: { attack: 0, defense: 0, intellect: 1, speed: 0 } },
  { id: 'taoist', name: '도사', family: 'taoist', tier: 1, allowedRows: ['back'], targetRule: 'any', canCounter: false, counterRate: 0.5, basicSkillId: 'poison-smoke', extraSkillIds: ['ward'], promotesTo: [], traitIds: [], troopScale: 0.8, baseAp: 2, damageTakenByType: { physical: 1.1, magic: 0.8 }, statMods: { attack: 0, defense: 0, intellect: 0, speed: 1 } },
  { id: 'geomancer', name: '풍수사', family: 'geomancer', tier: 1, allowedRows: ['back'], targetRule: 'any', canCounter: false, counterRate: 0.5, basicSkillId: 'heal', extraSkillIds: [], promotesTo: [], traitIds: [], troopScale: 0.6, baseAp: 2, damageTakenByType: { physical: 1.1, magic: 0.8 }, statMods: { attack: 0, defense: 0, intellect: 0, speed: 0 } },
];

// ---------- 캐릭터 (이름만 삼국지, 수치는 모두 임시) ----------
// 행동력(5번째 값, 1~10): 2마다 추가 AP 1. 전투 총 AP = 병종 기본 AP(baseAp) + 행동력 추가 AP.
// 지금은 방패병 기본 3 + 행동력 3(+2) = 5, 보병/기병/궁병 기본 2 + 행동력 3(+2) = 4, 책사/도사 기본 2 + 행동력 1(+1) = 3.
// 초반엔 행동력 대체로 5 이하, 10(+5)까지는 아이템 등으로 올리는 방향

const s = (attack: number, defense: number, intellect: number, speed: number, action: number, diplomacy = 5, politics = 5, charm = 5): Stats => ({
  attack,
  defense,
  intellect,
  speed,
  action,
  diplomacy,
  politics,
  charm,
});

const characterList: CharacterData[] = [
  // 촉
  { id: 'zhangFei', name: '장비', unitType: 'shield', stats: s(8, 9, 4, 5, 3), level: 15 },
  { id: 'guanYu', name: '관우', unitType: 'cavalry', stats: s(9, 7, 6, 6, 3), level: 15 },
  { id: 'zhaoYun', name: '조운', unitType: 'cavalry', stats: s(8, 7, 6, 8, 3), level: 15 },
  { id: 'huangZhong', name: '황충', unitType: 'archer', stats: s(9, 4, 5, 5, 3), level: 15 },
  { id: 'zhugeLiang', name: '제갈량', unitType: 'strategist', stats: s(3, 3, 10, 6, 1), level: 15 },
  { id: 'pangTong', name: '방통', unitType: 'taoist', stats: s(2, 3, 9, 5, 1), level: 15 },
  { id: 'weiYan', name: '위연', unitType: 'infantry', stats: s(8, 7, 4, 6, 3), level: 15 },
  // 위
  { id: 'xuChu', name: '허저', unitType: 'shield', stats: s(8, 9, 3, 5, 3), level: 15 },
  { id: 'xiahouDun', name: '하후돈', unitType: 'cavalry', stats: s(9, 6, 4, 7, 3), level: 15 },
  { id: 'zhangLiao', name: '장료', unitType: 'cavalry', stats: s(8, 6, 5, 8, 3), level: 15 },
  { id: 'xiahouYuan', name: '하후연', unitType: 'archer', stats: s(8, 5, 5, 8, 3), level: 15 },
  { id: 'xunYu', name: '순욱', unitType: 'strategist', stats: s(2, 3, 9, 5, 1), level: 15 },
  { id: 'dianWei', name: '전위', unitType: 'infantry', stats: s(9, 7, 3, 5, 3), level: 15 },
  { id: 'guoJia', name: '곽가', unitType: 'taoist', stats: s(1, 3, 10, 6, 1), level: 15 },
];

const toRecord = <T extends { id: string }>(list: T[]): Record<string, T> => Object.fromEntries(list.map((x) => [x.id, x]));

export const gameData: GameData = {
  skills: toRecord(skillList),
  traits: toRecord(traitList),
  unitTypes: toRecord(unitTypeList),
  characters: toRecord(characterList),
};
