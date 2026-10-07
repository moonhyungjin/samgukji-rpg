// Balance 시뮬레이션 CLI.
//   npm run sim -- --iterations 1000 --seed 1 --roles alternate --out out/report.json
//   npm run sim -- --balance my-balance.json     (defaultBalance에 부분 덮어쓰기)
//   npm run sim -- --target-policy lowest-troops (highest-damage(기본) | lowest-troops | random)
//   npm run sim -- --lineups random              (fixed | random: 전투마다 무작위 편성, 병종/캐릭터별 승률 확인용)
//   npm run sim -- --guard-policy never          (protect(기본) | never: 가드를 쓸 수 있는 군단의 AI)
//   npm run sim -- --team-a shu --team-b wei     (src/presets.ts의 편성 이름)

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { BattleSimulator, createDefaultPolicy } from '@samgukji/battle-engine';
import type { BalanceConfig, GuardMode, LineupMode, RoleMode, TargetPolicy } from '@samgukji/battle-engine';
import { defaultBalance, gameData, presets } from '@samgukji/game-data';

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

function deepMerge(base: unknown, patch: unknown): unknown {
  if (patch && typeof patch === 'object' && !Array.isArray(patch)) {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [k, v] of Object.entries(patch)) out[k] = deepMerge(out[k], v);
    return out;
  }
  return patch === undefined ? base : patch;
}

const iterations = Number(opt('iterations') ?? 1000);
const seed = Number(opt('seed') ?? 1);
const roles = (opt('roles') ?? 'alternate') as RoleMode;
const teamAName = opt('team-a') ?? 'shu';
const teamBName = opt('team-b') ?? 'wei';
// npm workspace 스크립트는 tools/sim에서 실행되므로, 상대 경로는 명령을 실행한 위치(INIT_CWD) 기준으로 푼다.
const baseDir = process.env.INIT_CWD ?? process.cwd();
const resolvePath = (p: string | undefined) => (p ? resolve(baseDir, p) : undefined);
const balancePath = resolvePath(opt('balance'));
const outPath = resolvePath(opt('out'));

const teamA = presets[teamAName];
const teamB = presets[teamBName];
if (!teamA || !teamB) {
  console.error(`Unknown team. Available: ${Object.keys(presets).join(', ')}`);
  process.exit(1);
}
if (!['alternate', 'A-attacks', 'B-attacks'].includes(roles)) {
  console.error(`Unknown --roles value: ${roles}`);
  process.exit(1);
}

const balance = balancePath
  ? (deepMerge(defaultBalance, JSON.parse(readFileSync(balancePath, 'utf8'))) as BalanceConfig)
  : defaultBalance;

const targetPolicy = (opt('target-policy') ?? 'highest-damage') as TargetPolicy;
if (!['lowest-troops', 'highest-damage', 'random'].includes(targetPolicy)) {
  console.error(`Unknown --target-policy value: ${targetPolicy}`);
  process.exit(1);
}
const guardMode = (opt('guard-policy') ?? 'protect') as GuardMode;
if (!['protect', 'never'].includes(guardMode)) {
  console.error(`Unknown --guard-policy value: ${guardMode}`);
  process.exit(1);
}
const policy = createDefaultPolicy({ targetPolicy, guardMode });

const started = performance.now();
const lineups = (opt('lineups') ?? 'fixed') as LineupMode;
if (!['fixed', 'random'].includes(lineups)) {
  console.error(`Unknown --lineups value: ${lineups}`);
  process.exit(1);
}
const report = BattleSimulator.run({ data: gameData, balance, teamA, teamB, iterations, seed, roles, lineups, policy });
const elapsed = performance.now() - started;

const json = JSON.stringify(report, null, 2);
if (outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, json);
} else {
  console.log(json);
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
console.error(
  [
    `${teamAName} (A) vs ${teamBName} (B), ${iterations} battles, seed ${seed}, roles ${roles} — ${elapsed.toFixed(0)} ms`,
    `A win ${pct(report.teamAWinRate)} / B win ${pct(report.teamBWinRate)}  (attacker ${pct(report.attackerWinRate)} / defender ${pct(report.defenderWinRate)})`,
    `avg rounds ${report.averageRounds}, end causes ${JSON.stringify(report.endCauses)}`,
    outPath ? `report written to ${outPath}` : '',
  ]
    .filter(Boolean)
    .join('\n'),
);
