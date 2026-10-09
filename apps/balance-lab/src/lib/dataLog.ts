import { FILE_LABEL, FILE_NAMES, changedFileNames } from './fileSync';
import type { DataFiles, FileName } from './fileSync';

/** 저장할 때 `packages/game-data/data/changelog.md`에 덧붙이는 기록. 누가 언제 어떤 값을 어떻게 바꿨는지 알 수 있게 한다. */
export const CHANGELOG_FILE = 'changelog.md';

/** 한 번의 저장에 적을 최대 줄 수 (넘으면 "외 N건"으로 줄인다) */
export const MAX_LOG_LINES = 80;

export const CHANGELOG_HEADER = `# 데이터 변경 기록

Balance Lab의 "파일에 저장"을 누를 때마다 자동으로 덧붙는다 (가장 아래가 최신). 값이 언제 어떻게 바뀌었는지, 왜 바뀌었는지(메모)를 확인하는 용도다.
손으로 지우거나 고치지 않는다. 형식: \`경로: 이전 값 → 새 값\`, \`+ 새로 생김\`, \`- 없어짐\`.
`;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const isObject = (v: unknown): v is { [key: string]: Json } => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 편성의 군단 목록을 "장수:열" 모양으로 줄여 읽기 쉽게 한다. */
function lineupText(value: Json[]): string {
  return value
    .map((e) => (isObject(e) && typeof e.characterId === 'string' ? `${e.characterId}${e.row === 'back' ? '(후)' : '(전)'}` : JSON.stringify(e)))
    .join(', ');
}

function show(value: Json | undefined, path: string): string {
  if (value === undefined) return '(없음)';
  if (Array.isArray(value)) return path.endsWith('.lineup') ? `[${lineupText(value)}]` : JSON.stringify(value);
  if (typeof value === 'string') return `"${value}"`;
  return JSON.stringify(value);
}

/** 객체를 { 경로: 값 }으로 펼친다. 배열은 하나의 값으로 본다. */
function flatten(value: Json, path: string, out: Map<string, Json>): void {
  if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) flatten(child, path ? `${path}.${key}` : key, out);
    return;
  }
  out.set(path, value);
}

/** 목록(id가 있는 항목)을 { id: 항목 }으로 바꾼다. */
function byId(list: Json[]): Map<string, Json> {
  return new Map(list.filter(isObject).map((item) => [String(item.id), item]));
}

/** 파일 하나의 변경을 줄 단위로 설명한다. */
function describeFile(name: FileName, before: Json, after: Json): string[] {
  const lines: string[] = [];
  if (name === 'balance' || name === 'campaign') {
    const a = new Map<string, Json>();
    const b = new Map<string, Json>();
    flatten(before, name, a);
    flatten(after, name, b);
    for (const key of new Set([...a.keys(), ...b.keys()])) {
      const x = a.get(key);
      const y = b.get(key);
      if (JSON.stringify(x) !== JSON.stringify(y)) lines.push(`${key}: ${show(x, key)} → ${show(y, key)}`);
    }
    return lines;
  }

  const prev = byId(before as Json[]);
  const next = byId(after as Json[]);
  for (const id of next.keys()) {
    if (!prev.has(id)) lines.push(`+ ${name}.${id} (새로 생김${isObject(next.get(id)!) ? `: ${String((next.get(id) as { name?: Json; label?: Json }).name ?? (next.get(id) as { label?: Json }).label ?? '')}` : ''})`);
  }
  for (const id of prev.keys()) {
    if (!next.has(id)) lines.push(`- ${name}.${id} (없어짐)`);
  }
  for (const [id, item] of next) {
    const old = prev.get(id);
    if (!old) continue;
    const a = new Map<string, Json>();
    const b = new Map<string, Json>();
    flatten(old, `${name}.${id}`, a);
    flatten(item, `${name}.${id}`, b);
    for (const key of new Set([...a.keys(), ...b.keys()])) {
      const x = a.get(key);
      const y = b.get(key);
      if (JSON.stringify(x) !== JSON.stringify(y)) lines.push(`${key}: ${show(x, key)} → ${show(y, key)}`);
    }
  }
  return lines;
}

function twoDigits(n: number): string {
  return String(n).padStart(2, '0');
}

/** 날짜를 "2026-10-07 17:14" 모양으로 만든다 (사용자의 컴퓨터 시각 기준). */
export function formatTime(date: Date): string {
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())} ${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}

/**
 * 저장 직전의 파일 값(baseline)과 저장할 값(current)을 비교해 기록 한 건을 만든다.
 * 바뀐 것이 없으면 null.
 */
export function describeChanges(baseline: DataFiles, current: DataFiles, memo: string, now: Date): string | null {
  const changed = changedFileNames(baseline, current);
  if (changed.length === 0) return null;

  const lines = changeLines(baseline, current);
  const shown = lines.slice(0, MAX_LOG_LINES);
  const rest = lines.length - shown.length;
  const title = `## ${formatTime(now)} — ${changed.map((n) => FILE_LABEL[n]).join(' · ')}`;
  const note = memo.trim() ? `메모: ${memo.trim().replace(/\s*\n\s*/g, ' ')}\n` : '';
  return `${title}\n${note}${shown.map((l) => `- ${l}`).join('\n')}${rest > 0 ? `\n- … 외 ${rest}건` : ''}\n`;
}

/** 두 벌의 차이를 "경로: 이전 값 → 새 값" 줄로 돌려준다 (변경 기록과 설정 비교가 같이 쓴다). */
export function changeLines(baseline: DataFiles, current: DataFiles): string[] {
  const changed = changedFileNames(baseline, current);
  const serialize = (files: DataFiles, name: FileName): Json => {
    switch (name) {
      case 'skills':
        return Object.values(files.data.skills) as unknown as Json;
      case 'traits':
        return Object.values(files.data.traits) as unknown as Json;
      case 'unitTypes':
        return Object.values(files.data.unitTypes) as unknown as Json;
      case 'characters':
        return Object.values(files.data.characters) as unknown as Json;
      case 'presets':
        return files.presets as unknown as Json;
      case 'balance':
        return files.balance as unknown as Json;
      case 'campaign':
        // 전투 목록은 id로 펼쳐서 "campaign.battles.yellow1.reward"처럼 경로가 보이게 한다
        return { ...files.campaign, battles: Object.fromEntries(files.campaign.battles.map((b) => [b.id, b])) } as unknown as Json;
    }
  };

  const lines: string[] = [];
  for (const name of FILE_NAMES) {
    if (!changed.includes(name)) continue;
    lines.push(...describeFile(name, serialize(baseline, name), serialize(current, name)));
  }
  return lines;
}
