import type { GameData, SimulationReport } from '@samgukji/battle-engine';
import type { WarningSettings } from '../lab/types';
import { FAMILY_LABEL, pct } from './format';

export interface Finding {
  level: 'ok' | 'warn' | 'info';
  message: string;
}

const inRange = (value: number, [lo, hi]: [number, number]) => value >= lo && value <= hi;
const range = ([lo, hi]: [number, number], format: (n: number) => string) => `${format(lo)}~${format(hi)}`;

/**
 * 시뮬레이션 결과에서 "깨진 곳"을 찾는다. 경고 기준(안전선)을 벗어난 것만 warn으로 알리고,
 * 깨진 곳이 없으면 그렇다고 한 줄(ok)로 알린다. info는 평가하지 않은 이유 같은 참고다.
 */
export function evaluateReport(report: SimulationReport, warnings: WarningSettings, data: GameData): Finding[] {
  const out: Finding[] = [];
  const warn = (message: string) => out.push({ level: 'warn', message });
  const info = (message: string) => out.push({ level: 'info', message });
  const rounds = (n: number) => `${n.toFixed(1)}라운드`;

  if (!inRange(report.averageRounds, warnings.averageRounds)) {
    warn(`평균 전투 길이 ${rounds(report.averageRounds)} — 기준 ${range(warnings.averageRounds, rounds)} 밖 (${report.averageRounds < warnings.averageRounds[0] ? '너무 짧음' : '너무 김'})`);
  }

  const wipeShare = (report.endCauses.wipe ?? 0) / report.iterations;
  if (wipeShare < warnings.minWipeRate) warn(`한쪽 전멸로 끝난 전투가 ${pct(wipeShare, 0)} — 기준 ${pct(warnings.minWipeRate, 0)} 미만 (전멸이 거의 나지 않음)`);
  const stallShare = (report.endCauses.stall ?? 0) / report.iterations;
  if (stallShare > warnings.maxStallRate) warn(`교착으로 끝난 전투가 ${pct(stallShare, 0)} — 기준 ${pct(warnings.maxStallRate, 0)} 초과 (AP가 남았는데 칠 상대가 없는 상태)`);

  if (report.roles === 'alternate' || report.lineups === 'random') {
    if (!inRange(report.attackerWinRate, warnings.attackerWinRate)) {
      warn(`공격측 승률 ${pct(report.attackerWinRate)} — 기준 ${range(warnings.attackerWinRate, pct)} 밖 (${report.attackerWinRate < warnings.attackerWinRate[0] ? '방어측이 너무 유리' : '공격측이 너무 유리'})`);
    }
  } else {
    info('공격측 승률은 "공방 번갈아 배정" 또는 "무작위 편성"에서만 봅니다.');
  }

  if (report.lineups === 'random') {
    for (const [family, stat] of Object.entries(report.familyStats)) {
      if (!stat || stat.fielded < 100 || inRange(stat.teamWinRate, warnings.familyWinRate)) continue;
      const label = FAMILY_LABEL[family as keyof typeof FAMILY_LABEL];
      warn(`${label} 승률 ${pct(stat.teamWinRate)} — 기준 ${range(warnings.familyWinRate, pct)} 밖 (${stat.teamWinRate > warnings.familyWinRate[1] ? '거의 다 이김' : '거의 못 이김'})`);
    }
    for (const stat of Object.values(report.characterStats)) {
      if (stat.fielded < 100 || inRange(stat.teamWinRate, warnings.characterWinRate)) continue;
      warn(`${stat.name} 승률 ${pct(stat.teamWinRate)} — 기준 ${range(warnings.characterWinRate, pct)} 밖 (${stat.teamWinRate > warnings.characterWinRate[1] ? '너무 셈' : '너무 약함'})`);
    }
  } else {
    info('병종/장수별 승률은 "무작위 편성"에서만 봅니다 (고정 편성은 편성 편향이 섞입니다).');
  }

  const attackSkills = Object.entries(report.skillStats).filter(([id, s]) => data.skills[id]?.kind === 'attack' && s.uses > 0);
  if (attackSkills.length > 1) {
    const mean = attackSkills.reduce((sum, [, s]) => sum + s.averageDamagePerUse, 0) / attackSkills.length;
    for (const [id, s] of attackSkills) {
      const ratio = s.averageDamagePerUse / mean;
      if (!inRange(ratio, warnings.skillDamageRatio)) {
        warn(`${data.skills[id].name}의 1회 평균 피해가 공격 스킬 평균의 ${ratio.toFixed(2)}배 — 기준 ${range(warnings.skillDamageRatio, (n) => `${n}배`)} 밖`);
      }
    }
  }

  if (!out.some((f) => f.level === 'warn')) out.unshift({ level: 'ok', message: '깨진 곳이 없습니다 (모든 결과가 경고 기준 안).' });
  return out;
}
