import { FAMILIES } from '@samgukji/battle-engine';
import type { Family } from '@samgukji/battle-engine';
import { presets } from '@samgukji/game-data';
import { filesSignature, filesSnapshot } from '../lib/fileSync';
import { slotsFromLineup } from '../lib/slots';
import type { FamilySurvivalTarget, LabState } from './types';

export function createDefaultState(): LabState {
  const files = filesSnapshot();
  const familySurvival = Object.fromEntries(
    // 궁병 생존율 40%가 첫 목표 지표다. 나머지 병종은 필요할 때 켠다.
    FAMILIES.map((f): [Family, FamilySurvivalTarget] => [f, { enabled: f === 'archer', target: 0.4, tolerance: 0.1 }]),
  ) as Record<Family, FamilySurvivalTarget>;

  return {
    filesSignature: filesSignature(files),
    data: files.data,
    balance: files.balance,
    presets: files.presets,
    teamA: slotsFromLineup(presets.shu),
    teamB: slotsFromLineup(presets.wei),
    sim: {
      iterations: 1000,
      seed: 1,
      roles: 'alternate',
      lineups: 'random',
      targetPolicy: 'highest-damage',
      guardMode: 'protect',
      buffMode: 'first',
      pool: 'elite',
      autoRun: true,
      autoRunIterations: 1000,
    },
    targets: {
      attackerWinRate: [0.45, 0.55],
      averageRounds: [3.5, 6.5],
      familyWinRate: [0.45, 0.55],
      characterWinRate: [0.4, 0.6],
      skillDamageRatio: [0.5, 1.5],
      familySurvival,
    },
  };
}
