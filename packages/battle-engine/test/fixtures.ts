import type { BalanceConfig, BattleState, CharacterState, GameData, Side } from '../src';

/** 손으로 계산하기 쉬운 단순 수치 */
export const testBalance: BalanceConfig = {
  maxTurns: 40,
  statCurve: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  statCap: 15,
  damage: { attackScale: 10, defenseScale: 0.1, resistScale: 0.1, minDamage: 1 },
  heal: { scale: 10 },
  troops: { base: 300, perLevel: 50 },
  troopFactor: { reference: 1000, min: 0.3, max: 1.75 },
  counter: { rate: 0.5 },
  morale: { defenderStart: 60, maxEffect: 0.1, onUnitDestroyed: 8, onHit: 1 },
};

const stats = (attack: number, defense: number, intellect: number, speed: number) => ({
  attack,
  defense,
  intellect,
  speed,
  diplomacy: 5,
  politics: 5,
  charm: 5,
});

export const testData: GameData = {
  skills: {
    hit: { id: 'hit', name: '공격', kind: 'attack', scalesWith: 'attack', power: 1, apCost: 1, counterable: true },
    shoot: { id: 'shoot', name: '사격', kind: 'attack', scalesWith: 'attack', power: 1, apCost: 1, counterable: false },
    mind: { id: 'mind', name: '책략', kind: 'attack', scalesWith: 'intellect', power: 1, apCost: 1, counterable: false },
    mend: { id: 'mend', name: '치유', kind: 'heal', scalesWith: 'intellect', power: 1, apCost: 1, counterable: false },
  },
  traits: {
    antiCav: { id: 'antiCav', name: '대기병', kind: 'damage-dealt', versus: { families: ['cavalry'] }, multiplier: 1.25 },
    fragile: { id: 'fragile', name: '근접에 취약', kind: 'damage-taken', versus: { families: ['infantry', 'cavalry'] }, multiplier: 1.5 },
    frontOnly: { id: 'frontOnly', name: '전열 상대', kind: 'damage-dealt', versus: { rows: ['front'] }, multiplier: 2 },
  },
  unitTypes: {
    inf: { id: 'inf', name: '보병', family: 'infantry', tier: 1, allowedRows: ['front'], targetRule: 'front-first', canCounter: true, basicSkillId: 'hit', extraSkillIds: [], promotesTo: [], traitIds: [] },
    cav: { id: 'cav', name: '기병', family: 'cavalry', tier: 1, allowedRows: ['front'], targetRule: 'any', canCounter: true, basicSkillId: 'hit', extraSkillIds: [], promotesTo: [], traitIds: [] },
    arc: { id: 'arc', name: '궁병', family: 'archer', tier: 1, allowedRows: ['back'], targetRule: 'any', canCounter: true, basicSkillId: 'shoot', extraSkillIds: [], promotesTo: [], traitIds: [] },
    str: { id: 'str', name: '책사', family: 'strategist', tier: 1, allowedRows: ['back'], targetRule: 'any', canCounter: false, basicSkillId: 'mind', extraSkillIds: [], promotesTo: [], traitIds: [] },
    geo: { id: 'geo', name: '풍수사', family: 'geomancer', tier: 1, allowedRows: ['back'], targetRule: 'any', canCounter: false, basicSkillId: 'mend', extraSkillIds: [], promotesTo: [], traitIds: [] },
  },
  characters: {
    inf: { id: 'inf', name: '보병A', unitType: 'inf', stats: stats(5, 5, 5, 5), ap: 4, level: 15 },
    infFast: { id: 'infFast', name: '보병빠름', unitType: 'inf', stats: stats(5, 5, 5, 9), ap: 4, level: 15 },
    infSlow: { id: 'infSlow', name: '보병느림', unitType: 'inf', stats: stats(5, 5, 5, 1), ap: 4, level: 15 },
    infOneAp: { id: 'infOneAp', name: '보병AP1', unitType: 'inf', stats: stats(5, 5, 5, 5), ap: 1, level: 15 },
    infWeak: { id: 'infWeak', name: '보병약함', unitType: 'inf', stats: stats(0, 5, 5, 5), ap: 4, level: 15 },
    cav: { id: 'cav', name: '기병A', unitType: 'cav', stats: stats(5, 5, 5, 5), ap: 4, level: 15 },
    arc: { id: 'arc', name: '궁병A', unitType: 'arc', stats: stats(5, 5, 5, 5), ap: 3, level: 15 },
    str: { id: 'str', name: '책사A', unitType: 'str', stats: stats(2, 3, 8, 5), ap: 4, level: 15 },
    geo: { id: 'geo', name: '풍수사A', unitType: 'geo', stats: stats(1, 3, 8, 5), ap: 4, level: 15 },
  },
};

export function makeUnit(overrides: Partial<CharacterState> = {}): CharacterState {
  return {
    uid: 'attacker:0',
    characterId: 'x',
    name: 'x',
    side: 'attacker',
    row: 'front',
    slot: 0,
    unitType: 'inf',
    family: 'infantry',
    traitIds: [],
    stats: stats(5, 5, 5, 5),
    level: 15,
    maxTroops: 1000,
    troops: 1000,
    ap: 4,
    maxAp: 4,
    isDead: false,
    ...overrides,
  };
}

export function makeState(units: CharacterState[], initialCount?: Record<Side, number>): BattleState {
  const count = (side: Side) => units.filter((u) => u.side === side).length;
  return {
    round: 1,
    units,
    defenderMorale: 60,
    initialCount: initialCount ?? { attacker: count('attacker'), defender: count('defender') },
  };
}
