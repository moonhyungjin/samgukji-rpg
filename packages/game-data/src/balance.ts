import type { BalanceConfig } from '@samgukji/battle-engine';

/**
 * 밸런스 수치. 모두 임시값이며 Balance Lab(시뮬레이션)으로 조정한다.
 * 규칙 근거는 docs/design/01-character-and-unit.md, 02-battle-rules.md 참고.
 */
export const defaultBalance: BalanceConfig = {
  maxTurns: 40,

  // 계열 간 상성표는 없다. 병종 차이는 특성(data.ts의 traits)으로 표현한다.
  statCurve: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  statCap: 15,
  // 행동력 스탯 → 추가 AP: ceil(행동력 / perAp), 행동력은 cap까지만 센다. 전투 총 AP = 병종 기본 AP + 추가 AP
  action: { perAp: 2, cap: 10 },

  damage: {
    attackScale: 47,
    defenseScale: 0.1,
    resistScale: 0.1,
    minDamage: 1,
  },
  heal: { scale: 47, useTroopFactor: false },

  troops: { base: 300, perLevel: 50 },
  troopFactor: { reference: 1000, min: 0.3, max: 1.75 },

  counter: { rate: 0.5 },

  // 사기는 피해에 영향을 주지 않고(maxEffect 0) 최종 판정에서만 쓰인다. 시작은 5:5.
  morale: {
    defenderStart: 50,
    maxEffect: 0,
    onUnitDestroyed: 8,
    onHit: 1,
    judgement: 'tiebreak',
  },
};
