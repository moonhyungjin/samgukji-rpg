import type { LineupEntry } from '@samgukji/battle-engine';

/** 시뮬레이션/테스트용 기본 편성. 전열 3 + 후열 3 */
export const presets: Record<string, LineupEntry[]> = {
  shu: [
    { characterId: 'zhangFei', row: 'front' },
    { characterId: 'guanYu', row: 'front' },
    { characterId: 'zhaoYun', row: 'front' },
    { characterId: 'huangZhong', row: 'back' },
    { characterId: 'zhugeLiang', row: 'back' },
    { characterId: 'pangTong', row: 'back' },
  ],
  // 초반 시나리오: 촉은 유관장(유비 보병, 관우 기병, 장비 방패병) 셋으로 시작해 황건적과 싸운다.
  shuStart: [
    { characterId: 'zhangFei', row: 'front' },
    { characterId: 'liuBei', row: 'front' },
    { characterId: 'guanYu', row: 'front' },
  ],
  // 황건적 쉬움: 보, 보, 방
  yellowEasy: [
    { characterId: 'ytShieldA', row: 'front' },
    { characterId: 'ytInfantryA', row: 'front' },
    { characterId: 'ytInfantryB', row: 'front' },
  ],
  // 황건적 보통: 보, 방, 궁
  yellowNormal: [
    { characterId: 'ytShieldA', row: 'front' },
    { characterId: 'ytInfantryA', row: 'front' },
    { characterId: 'ytArcherA', row: 'back' },
  ],
  // 황건적 어려움: 보, 보, 방 + 궁
  yellowHard: [
    { characterId: 'ytShieldA', row: 'front' },
    { characterId: 'ytInfantryA', row: 'front' },
    { characterId: 'ytInfantryB', row: 'front' },
    { characterId: 'ytArcherA', row: 'back' },
  ],
  // 평범한 장수들 (황건적)
  yellow: [
    { characterId: 'ytShieldA', row: 'front' },
    { characterId: 'ytInfantryA', row: 'front' },
    { characterId: 'ytCavalryA', row: 'front' },
    { characterId: 'ytArcherA', row: 'back' },
    { characterId: 'ytStrategistA', row: 'back' },
    { characterId: 'ytTaoistA', row: 'back' },
  ],
  wei: [
    { characterId: 'xuChu', row: 'front' },
    { characterId: 'xiahouDun', row: 'front' },
    { characterId: 'zhangLiao', row: 'front' },
    { characterId: 'xiahouYuan', row: 'back' },
    { characterId: 'xunYu', row: 'back' },
    { characterId: 'guoJia', row: 'back' },
  ],
};
