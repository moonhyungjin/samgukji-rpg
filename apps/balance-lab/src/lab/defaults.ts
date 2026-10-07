import { FAMILIES } from '@samgukji/battle-engine';
import type { Family } from '@samgukji/battle-engine';
import { presets } from '@samgukji/game-data';
import { filesSignature, filesSnapshot } from '../lib/fileSync';
import { slotsFromLineup } from '../lib/slots';
import type { FamilySurvivalTarget, LabState } from './types';

export function createDefaultState(): LabState {
  const files = filesSnapshot();
  const familySurvival = Object.fromEntries(
    // 병종별 생존율 목표는 모두 꺼 둔다. 승급 병종과 새 커맨드가 들어오면 판도가 달라지므로 지금은 맞추지 않는다 (필요할 때 켠다).
    // 궁병 생존율 40%는 한때의 첫 목표였다. 켜면 그 값을 쓴다.
    FAMILIES.map((f): [Family, FamilySurvivalTarget] => [f, { enabled: false, target: 0.4, tolerance: 0.1 }]),
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
