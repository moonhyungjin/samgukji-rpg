import type { CharacterData, GameData, SkillData, Stats, TraitData, UnitTypeData } from '@samgukji/battle-engine';

// ---------- 병종 특성 ----------
// 계열 간 상성표 대신 병종이 가진 효과로 피해를 보정한다. 아래는 예시이며 아직 어떤 병종에도 붙어 있지 않다.
// (창병 승급 병종이 생기면 anti-cavalry를 붙인다. Balance Lab에서 병종에 붙여 실험할 수 있다.)

const traitList: TraitData[] = [
  { id: 'anti-cavalry', name: '대기병', kind: 'damage-dealt', versus: { families: ['cavalry'] }, multiplier: 1.25 },
  { id: 'fragile-vs-melee', name: '근접에 취약', kind: 'damage-taken', versus: { families: ['infantry', 'cavalry'] }, multiplier: 1.3 },
];

// ---------- 스킬 (커맨드) ----------
// 상태이상(화상/독/젖음), 가드, 필살기는 아직 구현하지 않았다. 책략/독연은 피해만 준다.

const skillList: SkillData[] = [
  // guardable: 같은 열의 가드 유닛이 대신 맞을 수 있는 공격 (단일 대상 물리 공격). 책략/독연은 막지 못한다.
  { id: 'infantry-attack', name: '공격', kind: 'attack', scalesWith: 'attack', power: 1.0, apCost: 1, counterable: true, guardable: true },
  { id: 'cavalry-charge', name: '돌격', kind: 'attack', scalesWith: 'attack', power: 1.1, apCost: 1, counterable: true, guardable: true },
  { id: 'archer-shot', name: '화살 공격', kind: 'attack', scalesWith: 'attack', power: 1.0, apCost: 1, counterable: false, guardable: true },
  { id: 'stratagem', name: '책략', kind: 'attack', scalesWith: 'intellect', power: 0.8, apCost: 1, counterable: false },
  { id: 'poison-smoke', name: '독연', kind: 'attack', scalesWith: 'intellect', power: 0.8, apCost: 1, counterable: false },
  { id: 'heal', name: '치유', kind: 'heal', scalesWith: 'intellect', power: 0.8, apCost: 1, counterable: false },
  // 가드: 같은 열 아군을 대신 맞아줄 확률을 올린다. 막기만 하거나 공격만 해야 한다 (공격하면 해제).
  { id: 'guard', name: '가드', kind: 'guard', scalesWith: 'attack', power: 0, apCost: 1, counterable: false },
];

// ---------- 1차 병종 6계열 ----------
// troopScale: 같은 징병 비용으로 모이는 병력의 비율. 기병·책사는 병력이 비싸서 0.8, 풍수사는 0.6.
// 보병은 처음부터 가드를 쓴다 (시작 50%p, 가드 +70%p, 막을 때마다 -40%p).
// 기병은 일단 전열만 공격한다 (targetRule: front-first). 후열 저격은 나중에 승급 병종(경기병 등)이나 스킬로 다시 정한다.

const unitTypeList: UnitTypeData[] = [
  {
    id: 'infantry', name: '보병', family: 'infantry', tier: 1, allowedRows: ['front'], targetRule: 'front-first', canCounter: true,
    basicSkillId: 'infantry-attack', extraSkillIds: ['guard'], promotesTo: [], traitIds: [], troopScale: 1,
    guard: { start: 50, gain: 70, decay: 40 },
  },
  { id: 'cavalry', name: '기병', family: 'cavalry', tier: 1, allowedRows: ['front'], targetRule: 'front-first', canCounter: true, basicSkillId: 'cavalry-charge', extraSkillIds: [], promotesTo: [], traitIds: [], troopScale: 0.8 },
  { id: 'archer', name: '궁병', family: 'archer', tier: 1, allowedRows: ['back'], targetRule: 'any', canCounter: true, basicSkillId: 'archer-shot', extraSkillIds: [], promotesTo: [], traitIds: [], troopScale: 1 },
  { id: 'strategist', name: '책사', family: 'strategist', tier: 1, allowedRows: ['back'], targetRule: 'any', canCounter: false, basicSkillId: 'stratagem', extraSkillIds: [], promotesTo: [], traitIds: [], troopScale: 0.8 },
  { id: 'taoist', name: '도사', family: 'taoist', tier: 1, allowedRows: ['back'], targetRule: 'any', canCounter: false, basicSkillId: 'poison-smoke', extraSkillIds: [], promotesTo: [], traitIds: [], troopScale: 1 },
  { id: 'geomancer', name: '풍수사', family: 'geomancer', tier: 1, allowedRows: ['back'], targetRule: 'any', canCounter: false, basicSkillId: 'heal', extraSkillIds: [], promotesTo: [], traitIds: [], troopScale: 0.6 },
];

// ---------- 캐릭터 (이름만 삼국지, 수치는 모두 임시) ----------

const s = (attack: number, defense: number, intellect: number, speed: number, diplomacy = 5, politics = 5, charm = 5): Stats => ({
  attack,
  defense,
  intellect,
  speed,
  diplomacy,
  politics,
  charm,
});

const characterList: CharacterData[] = [
  // 촉
  { id: 'zhangFei', name: '장비', unitType: 'infantry', stats: s(8, 9, 4, 5), ap: 4, level: 15 },
  { id: 'guanYu', name: '관우', unitType: 'cavalry', stats: s(9, 7, 6, 6), ap: 4, level: 15 },
  { id: 'zhaoYun', name: '조운', unitType: 'cavalry', stats: s(8, 7, 6, 8), ap: 4, level: 15 },
  { id: 'huangZhong', name: '황충', unitType: 'archer', stats: s(9, 4, 5, 5), ap: 3, level: 15 },
  { id: 'zhugeLiang', name: '제갈량', unitType: 'strategist', stats: s(3, 3, 10, 6), ap: 4, level: 15 },
  { id: 'pangTong', name: '방통', unitType: 'taoist', stats: s(2, 3, 9, 5), ap: 4, level: 15 },
  // 위
  { id: 'xuChu', name: '허저', unitType: 'infantry', stats: s(8, 9, 3, 5), ap: 4, level: 15 },
  { id: 'xiahouDun', name: '하후돈', unitType: 'cavalry', stats: s(9, 6, 4, 7), ap: 4, level: 15 },
  { id: 'zhangLiao', name: '장료', unitType: 'cavalry', stats: s(8, 6, 5, 8), ap: 4, level: 15 },
  { id: 'xiahouYuan', name: '하후연', unitType: 'archer', stats: s(8, 5, 5, 8), ap: 3, level: 15 },
  { id: 'xunYu', name: '순욱', unitType: 'strategist', stats: s(2, 3, 9, 5), ap: 4, level: 15 },
  { id: 'guoJia', name: '곽가', unitType: 'taoist', stats: s(1, 3, 10, 6), ap: 5, level: 15 },
];

const toRecord = <T extends { id: string }>(list: T[]): Record<string, T> => Object.fromEntries(list.map((x) => [x.id, x]));

export const gameData: GameData = {
  skills: toRecord(skillList),
  traits: toRecord(traitList),
  unitTypes: toRecord(unitTypeList),
  characters: toRecord(characterList),
};
