import type { BalanceConfig, GameData, SimulationReport } from '@samgukji/battle-engine';
import { FAMILIES } from '@samgukji/battle-engine';
import { END_CAUSE_LABEL, FAMILY_LABEL, num, pct } from './format';

/** 비교용으로 저장해 둔 설정 한 벌 (게임 데이터와 밸런스 수치). 편성과 시뮬레이션 설정은 비교할 때 지금 값을 쓴다 */
export interface Snapshot {
  id: string;
  name: string;
  /** 저장한 시각 (ISO 문자열) */
  savedAt: string;
  data: GameData;
  balance: BalanceConfig;
}

const STORAGE_KEY = 'samgukji-balance-lab-snapshots-v1';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function isSnapshot(x: unknown): x is Snapshot {
  if (typeof x !== 'object' || x === null) return false;
  const s = x as Partial<Snapshot>;
  return typeof s.id === 'string' && typeof s.name === 'string' && typeof s.data === 'object' && typeof s.balance === 'object';
}

/** 브라우저에 저장한 설정 목록. 저장소를 쓸 수 없으면 빈 목록 */
export function loadSnapshots(): Snapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isSnapshot) : [];
  } catch {
    return [];
  }
}

/** 저장에 실패하면(용량, 시크릿 모드) false */
export function saveSnapshots(list: Snapshot[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function makeSnapshot(name: string, data: GameData, balance: BalanceConfig, now = new Date()): Snapshot {
  return { id: `s${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, savedAt: now.toISOString(), data: clone(data), balance: clone(balance) };
}

/** 비교표의 한 줄. 값은 설정(열)마다 하나 */
export interface CompareRow {
  group: string;
  label: string;
  values: (number | null)[];
  /** 표시 형식 */
  kind: 'pct' | 'num1' | 'num0' | 'num2';
}

export function formatCompare(kind: CompareRow['kind'], value: number): string {
  if (kind === 'pct') return pct(value);
  if (kind === 'num2') return num(value, 2);
  if (kind === 'num1') return num(value, 1);
  return num(value);
}

/** 기준 열과의 차이 문자열. 비율은 %p로 */
export function formatDelta(kind: CompareRow['kind'], value: number, base: number): string | null {
  const diff = kind === 'pct' ? (value - base) * 100 : value - base;
  const digits = kind === 'pct' || kind === 'num1' ? 1 : kind === 'num2' ? 2 : 0;
  if (Math.abs(diff) < Math.pow(10, -digits) / 2) return null;
  const text = diff.toFixed(digits);
  return `${diff > 0 ? '+' : ''}${text}${kind === 'pct' ? '%p' : ''}`;
}

/** 여러 설정의 시뮬레이션 결과를 같은 줄끼리 맞춰 비교표를 만든다. 결과가 없는(실패한) 열은 null */
export function compareRows(reports: (SimulationReport | null)[]): CompareRow[] {
  const rows: CompareRow[] = [];
  const add = (group: string, label: string, kind: CompareRow['kind'], pick: (r: SimulationReport) => number | undefined) =>
    rows.push({ group, label, kind, values: reports.map((r) => (r ? (pick(r) ?? null) : null)) });

  const fixed = reports.some((r) => r?.lineups === 'fixed');
  if (fixed) {
    add('전체', '팀 A 승률', 'pct', (r) => r.teamAWinRate);
    add('전체', '팀 B 승률', 'pct', (r) => r.teamBWinRate);
  }
  add('전체', '공격측 승률', 'pct', (r) => r.attackerWinRate);
  add('전체', '평균 라운드', 'num2', (r) => r.averageRounds);
  add('전체', fixed ? '평균 전멸 군단 (팀 A)' : '평균 전멸 군단 (A)', 'num2', (r) => r.averageDestroyed.A);
  add('전체', fixed ? '평균 전멸 군단 (팀 B)' : '평균 전멸 군단 (B)', 'num2', (r) => r.averageDestroyed.B);
  add('전체', '평균 잔여 병력 (A)', 'num0', (r) => r.averageRemainingTroops.A);
  add('전체', '평균 잔여 병력 (B)', 'num0', (r) => r.averageRemainingTroops.B);
  for (const [cause, label] of Object.entries(END_CAUSE_LABEL)) add('끝난 이유', label, 'pct', (r) => (r.endCauses[cause] ?? 0) / r.iterations);

  for (const f of FAMILIES) {
    if (!reports.some((r) => r?.familyStats[f])) continue;
    add(`병종 계열: ${FAMILY_LABEL[f]}`, '승률', 'pct', (r) => r.familyStats[f]?.teamWinRate);
    add(`병종 계열: ${FAMILY_LABEL[f]}`, '생존율', 'pct', (r) => r.familyStats[f]?.survivalRate);
    add(`병종 계열: ${FAMILY_LABEL[f]}`, '평균 피해', 'num0', (r) => r.familyStats[f]?.averageDamageDealt);
  }

  if (fixed) {
    const keys = [...new Set(reports.flatMap((r) => (r ? Object.keys(r.characterStats) : [])))];
    for (const key of keys) {
      const sample = reports.find((r) => r?.characterStats[key])?.characterStats[key];
      if (!sample) continue;
      const group = `장수: ${sample.name}${sample.team ? ` (팀 ${sample.team})` : ''}`;
      add(group, '생존율', 'pct', (r) => r.characterStats[key]?.survivalRate);
      add(group, '평균 피해', 'num0', (r) => r.characterStats[key]?.averageDamageDealt);
    }
  }
  return rows;
}
