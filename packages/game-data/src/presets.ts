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
