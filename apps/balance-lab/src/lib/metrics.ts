import type { GameData, SimulationReport } from '@samgukji/battle-engine';
import type { TargetSettings } from '../lab/types';
import { FAMILY_LABEL, pct } from './format';

export interface Finding {
  level: 'ok' | 'warn' | 'info';
  message: string;
}

const inRange = (value: number, [lo, hi]: [number, number]) => value >= lo && value <= hi;
const range = ([lo, hi]: [number, number], format: (n: number) => string) => `${format(lo)}~${format(hi)}`;

/** 시뮬레이션 결과를 목표 지표와 비교해 이상 징후를 찾는다. */
export function evaluateReport(report: SimulationReport, targets: TargetSettings, data: GameData): Finding[] {
  const out: Finding[] = [];
  const check = (ok: boolean, okMessage: string, warnMessage: string) =>
    out.push({ level: ok ? 'ok' : 'warn', message: ok ? okMessage : warnMessage });

  const rounds = (n: number) => `${n.toFixed(1)}라운드`;
  check(
    inRange(report.averageRounds, targets.averageRounds),
    `평균 전투 길이 ${rounds(report.averageRounds)} (목표 ${range(targets.averageRounds, rounds)})`,
    `평균 전투 길이 ${rounds(report.averageRounds)} — 목표 ${range(targets.averageRounds, rounds)} 밖`,
  );

  if (report.roles === 'alternate' || report.lineups === 'random') {
    check(
      inRange(report.attackerWinRate, targets.attackerWinRate),
      `공격측 승률 ${pct(report.attackerWinRate)} (목표 ${range(targets.attackerWinRate, pct)})`,
      `공격측 승률 ${pct(report.attackerWinRate)} — 목표 ${range(targets.attackerWinRate, pct)} 밖 (${report.attackerWinRate < targets.attackerWinRate[0] ? '방어측이 유리' : '공격측이 유리'})`,
    );
  } else {
    out.push({ level: 'info', message: '공격측 승률은 "공방 번갈아 배정" 또는 "무작위 편성"에서만 편향을 볼 수 있습니다.' });
  }

  for (const [family, spec] of Object.entries(targets.familySurvival)) {
    if (!spec.enabled) continue;
    const stat = report.familyStats[family as keyof typeof FAMILY_LABEL];
    if (!stat) continue;
    const label = FAMILY_LABEL[family as keyof typeof FAMILY_LABEL];
    check(
      Math.abs(stat.survivalRate - spec.target) <= spec.tolerance,
      `${label} 생존율 ${pct(stat.survivalRate)} (목표 ${pct(spec.target, 0)} ±${pct(spec.tolerance, 0)})`,
      `${label} 생존율 ${pct(stat.survivalRate)} — 목표 ${pct(spec.target, 0)} ±${pct(spec.tolerance, 0)} 밖`,
    );
  }

  if (report.lineups === 'random') {
    for (const [family, stat] of Object.entries(report.familyStats)) {
      if (!stat || stat.fielded < 100) continue;
      const label = FAMILY_LABEL[family as keyof typeof FAMILY_LABEL];
      if (!inRange(stat.teamWinRate, targets.familyWinRate)) {
        out.push({
          level: 'warn',
          message: `${label} 승률 ${pct(stat.teamWinRate)} — 목표 ${range(targets.familyWinRate, pct)} 밖 (${stat.teamWinRate > targets.familyWinRate[1] ? '과도하게 강함' : '구조적으로 약함'})`,
        });
      }
    }
    for (const stat of Object.values(report.characterStats)) {
      if (stat.fielded < 100 || inRange(stat.teamWinRate, targets.characterWinRate)) continue;
      out.push({
        level: 'warn',
        message: `${stat.name} 승률 ${pct(stat.teamWinRate)} — 목표 ${range(targets.characterWinRate, pct)} 밖 (${stat.teamWinRate > targets.characterWinRate[1] ? '과도하게 강함' : '약함'})`,
      });
    }
  } else {
    out.push({ level: 'info', message: '병종/캐릭터별 승률 경고는 "무작위 편성" 모드에서만 평가합니다 (고정 편성은 편성 편향이 섞입니다).' });
  }

  const attackSkills = Object.entries(report.skillStats).filter(([id, s]) => data.skills[id]?.kind === 'attack' && s.uses > 0);
  if (attackSkills.length > 1) {
    const mean = attackSkills.reduce((sum, [, s]) => sum + s.averageDamagePerUse, 0) / attackSkills.length;
    for (const [id, s] of attackSkills) {
      const ratio = s.averageDamagePerUse / mean;
      if (!inRange(ratio, targets.skillDamageRatio)) {
        out.push({
          level: 'warn',
          message: `${data.skills[id].name}의 평균 피해가 공격 스킬 평균의 ${ratio.toFixed(2)}배 — 목표 ${range(targets.skillDamageRatio, (n) => `${n}배`)} 밖`,
        });
      }
    }
  }

  const stallShare = (report.endCauses.stall ?? 0) / report.iterations;
  if (stallShare > 0.3) {
    out.push({ level: 'info', message: `전투의 ${pct(stallShare, 0)}가 교착(AP가 남은 유닛이 행동할 수 없는 상태)으로 끝났습니다. 풍수사처럼 AP가 큰 지원 유닛의 영향일 수 있습니다.` });
  }

  return out;
}
