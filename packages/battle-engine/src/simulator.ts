import { runBattle } from './engine';
import { generateRandomLineup, MAX_UNITS_PER_SIDE } from './lineup';
import { createRng, deriveSeed } from './rng';
import type { CommandPolicy } from './policy';
import type { BalanceConfig, BattleResult, CharacterPool, Family, GameData, LineupEntry, Side } from './types';

export type RoleMode = 'A-attacks' | 'B-attacks' | 'alternate';
/** fixed: teamA/teamB를 그대로 사용 / random: 전투마다 양측을 무작위로 편성 (병종·캐릭터별 승률 확인용) */
export type LineupMode = 'fixed' | 'random';
type Team = 'A' | 'B';

export interface SimulationInput {
  data: GameData;
  balance: BalanceConfig;
  teamA?: LineupEntry[];
  teamB?: LineupEntry[];
  iterations: number;
  seed?: number;
  /** 공격측/방어측 배정. alternate는 반복마다 번갈아 배정해 공방 편향을 상쇄한다 */
  roles?: RoleMode;
  lineups?: LineupMode;
  /** random 모드의 진영당 군단 수 */
  lineupSize?: number;
  /** random 모드의 후보 풀 (기본 elite: 네임드 장수만) */
  pool?: CharacterPool;
  policy?: CommandPolicy;
}

export interface CharacterReport {
  /** fixed 모드에서만 존재. random 모드는 양 진영을 합산한다 */
  team?: Team;
  characterId: string;
  name: string;
  family: Family;
  fielded: number;
  /** random 모드에서만: 전체 출전 자리 중 이 캐릭터가 뽑힌 비율 */
  pickRate?: number;
  /** 이 캐릭터가 출전했을 때 소속 팀의 승률 */
  teamWinRate: number;
  survivalRate: number;
  averageDamageDealt: number;
  averageDamageTaken: number;
  averageKills: number;
  averageHealing: number;
  averageActions: number;
  /** 가드로 대신 맞은 평균 횟수 */
  averageBlocks: number;
}

export interface FamilyReport {
  fielded: number;
  teamWinRate: number;
  survivalRate: number;
  averageDamageDealt: number;
  averageDamageTaken: number;
}

export interface SkillReport {
  uses: number;
  averageDamagePerUse: number;
  averageHealingPerUse: number;
}

export interface SimulationReport {
  iterations: number;
  seed: number;
  roles: RoleMode;
  lineups: LineupMode;
  teamAWins: number;
  teamBWins: number;
  teamAWinRate: number;
  teamBWinRate: number;
  attackerWinRate: number;
  defenderWinRate: number;
  averageRounds: number;
  averageDestroyed: Record<Team, number>;
  averageRemainingTroops: Record<Team, number>;
  endCauses: Record<string, number>;
  decidedBy: Record<string, number>;
  characterStats: Record<string, CharacterReport>;
  familyStats: Partial<Record<Family, FamilyReport>>;
  skillStats: Record<string, SkillReport>;
}

interface UnitAcc {
  team: Team;
  characterId: string;
  name: string;
  family: Family;
  fielded: number;
  teamWins: number;
  survived: number;
  damageDealt: number;
  damageTaken: number;
  kills: number;
  healing: number;
  actions: number;
  blocks: number;
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * 같은 BattleEngine으로 전투를 반복 실행하고 통계를 모은다.
 * 게임 화면 없이 밸런스를 검증하는 진입점이다.
 */
export class BattleSimulator {
  static run(input: SimulationInput): SimulationReport {
    const { data, balance, iterations } = input;
    const seed = input.seed ?? 1;
    const roles = input.roles ?? 'alternate';
    const mode = input.lineups ?? 'fixed';
    const size = input.lineupSize ?? MAX_UNITS_PER_SIDE;
    if (mode === 'fixed' && (!input.teamA?.length || !input.teamB?.length)) {
      throw new Error('fixed lineup mode needs teamA and teamB');
    }

    let teamAWins = 0;
    let attackerWins = 0;
    let roundsSum = 0;
    const destroyedSum: Record<Team, number> = { A: 0, B: 0 };
    const troopsSum: Record<Team, number> = { A: 0, B: 0 };
    const endCauses: Record<string, number> = {};
    const decidedBy: Record<string, number> = {};
    const units = new Map<string, UnitAcc>();
    const skills: Record<string, { uses: number; damage: number; healing: number }> = {};

    for (let i = 0; i < iterations; i++) {
      let teamA = input.teamA ?? [];
      let teamB = input.teamB ?? [];
      if (mode === 'random') {
        const lineupRng = createRng(deriveSeed(seed ^ 0x9e3779b9, i));
        teamA = generateRandomLineup(data, lineupRng, size, input.pool);
        teamB = generateRandomLineup(data, lineupRng, size, input.pool);
      }

      const aAttacks = roles === 'A-attacks' || (roles === 'alternate' && i % 2 === 0);
      const result: BattleResult = runBattle({
        data,
        balance,
        attacker: aAttacks ? teamA : teamB,
        defender: aAttacks ? teamB : teamA,
        seed: deriveSeed(seed, i),
        policy: input.policy,
      });

      const teamOf = (side: Side): Team => ((side === 'attacker') === aAttacks ? 'A' : 'B');
      const winnerTeam = teamOf(result.winner);
      if (winnerTeam === 'A') teamAWins++;
      if (result.winner === 'attacker') attackerWins++;
      roundsSum += result.rounds;
      destroyedSum[teamOf('attacker')] += result.destroyed.attacker;
      destroyedSum[teamOf('defender')] += result.destroyed.defender;
      troopsSum[teamOf('attacker')] += result.remainingTroops.attacker;
      troopsSum[teamOf('defender')] += result.remainingTroops.defender;
      endCauses[result.endCause] = (endCauses[result.endCause] ?? 0) + 1;
      decidedBy[result.decidedBy] = (decidedBy[result.decidedBy] ?? 0) + 1;

      for (const u of result.units) {
        const team = teamOf(u.side);
        const key = mode === 'random' ? u.characterId : `${team}:${u.characterId}`;
        let acc = units.get(key);
        if (!acc) {
          acc = {
            team,
            characterId: u.characterId,
            name: u.name,
            family: u.family,
            fielded: 0,
            teamWins: 0,
            survived: 0,
            damageDealt: 0,
            damageTaken: 0,
            kills: 0,
            healing: 0,
            actions: 0,
            blocks: 0,
          };
          units.set(key, acc);
        }
        acc.fielded++;
        if (team === winnerTeam) acc.teamWins++;
        if (u.survived) acc.survived++;
        acc.damageDealt += u.damageDealt;
        acc.damageTaken += u.damageTaken;
        acc.kills += u.kills;
        acc.healing += u.healing;
        acc.actions += u.actions;
        acc.blocks += u.blocks;
      }

      for (const [id, s] of Object.entries(result.skillStats)) {
        const acc = (skills[id] ??= { uses: 0, damage: 0, healing: 0 });
        acc.uses += s.uses;
        acc.damage += s.damage;
        acc.healing += s.healing;
      }
    }

    const characterStats: Record<string, CharacterReport> = {};
    const familyAcc = new Map<Family, UnitAcc>();
    for (const [key, a] of units) {
      characterStats[key] = {
        ...(mode === 'fixed' ? { team: a.team } : { pickRate: round4(a.fielded / (iterations * 2)) }),
        characterId: a.characterId,
        name: a.name,
        family: a.family,
        fielded: a.fielded,
        teamWinRate: round4(a.teamWins / a.fielded),
        survivalRate: round4(a.survived / a.fielded),
        averageDamageDealt: round4(a.damageDealt / a.fielded),
        averageDamageTaken: round4(a.damageTaken / a.fielded),
        averageKills: round4(a.kills / a.fielded),
        averageHealing: round4(a.healing / a.fielded),
        averageActions: round4(a.actions / a.fielded),
        averageBlocks: round4(a.blocks / a.fielded),
      };
      const f = familyAcc.get(a.family) ?? { ...a, fielded: 0, teamWins: 0, survived: 0, damageDealt: 0, damageTaken: 0 };
      f.fielded += a.fielded;
      f.teamWins += a.teamWins;
      f.survived += a.survived;
      f.damageDealt += a.damageDealt;
      f.damageTaken += a.damageTaken;
      familyAcc.set(a.family, f);
    }

    const familyStats: Partial<Record<Family, FamilyReport>> = {};
    for (const [family, f] of familyAcc) {
      familyStats[family] = {
        fielded: f.fielded,
        teamWinRate: round4(f.teamWins / f.fielded),
        survivalRate: round4(f.survived / f.fielded),
        averageDamageDealt: round4(f.damageDealt / f.fielded),
        averageDamageTaken: round4(f.damageTaken / f.fielded),
      };
    }

    const skillStats: Record<string, SkillReport> = {};
    for (const [id, s] of Object.entries(skills)) {
      skillStats[id] = {
        uses: s.uses,
        averageDamagePerUse: s.uses ? round4(s.damage / s.uses) : 0,
        averageHealingPerUse: s.uses ? round4(s.healing / s.uses) : 0,
      };
    }

    return {
      iterations,
      seed,
      roles,
      lineups: mode,
      teamAWins,
      teamBWins: iterations - teamAWins,
      teamAWinRate: round4(teamAWins / iterations),
      teamBWinRate: round4((iterations - teamAWins) / iterations),
      attackerWinRate: round4(attackerWins / iterations),
      defenderWinRate: round4((iterations - attackerWins) / iterations),
      averageRounds: round4(roundsSum / iterations),
      averageDestroyed: { A: round4(destroyedSum.A / iterations), B: round4(destroyedSum.B / iterations) },
      averageRemainingTroops: { A: round4(troopsSum.A / iterations), B: round4(troopsSum.B / iterations) },
      endCauses,
      decidedBy,
      characterStats,
      familyStats,
      skillStats,
    };
  }
}
