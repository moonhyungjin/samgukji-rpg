import { presets } from '@samgukji/game-data';
import { filesSignature, filesSnapshot } from '../lib/fileSync';
import { slotsFromLineup } from '../lib/slots';
import type { LabState } from './types';

export function createDefaultState(): LabState {
  const files = filesSnapshot();
  return {
    filesSignature: filesSignature(files),
    data: files.data,
    balance: files.balance,
    presets: files.presets,
    campaign: files.campaign,
    map: files.map,
    teamA: slotsFromLineup(presets.shu),
    teamB: slotsFromLineup(presets.wei),
    sim: {
      iterations: 1000,
      seed: 1,
      roles: 'alternate',
      lineups: 'random',
      targetPolicy: 'highest-damage',
      guardMode: 'protect',
      buffMode: 'opening',
      pool: 'elite',
      autoRun: true,
      autoRunIterations: 1000,
    },
    // 경고 기준 (안전선, [임시]): 균형 목표가 아니라 "깨졌는지"를 보는 넓은 범위다
    warnings: {
      attackerWinRate: [0.35, 0.65],
      averageRounds: [2, 12],
      familyWinRate: [0.3, 0.7],
      characterWinRate: [0.25, 0.75],
      skillDamageRatio: [0.25, 3],
      minWipeRate: 0.2,
      maxStallRate: 0.3,
    },
  };
}
