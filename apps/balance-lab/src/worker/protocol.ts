import type { BalanceConfig, BuffMode, CharacterPool, GameData, GuardMode, LineupEntry, LineupMode, RoleMode, SimulationReport, TargetPolicy } from '@samgukji/battle-engine';

export interface SimRequest {
  id: number;
  data: GameData;
  balance: BalanceConfig;
  teamA: LineupEntry[];
  teamB: LineupEntry[];
  iterations: number;
  seed: number;
  roles: RoleMode;
  lineups: LineupMode;
  targetPolicy: TargetPolicy;
  guardMode: GuardMode;
  buffMode: BuffMode;
  pool: CharacterPool;
}

export interface SimResponse {
  id: number;
  report?: SimulationReport;
  error?: string;
  elapsedMs: number;
}
