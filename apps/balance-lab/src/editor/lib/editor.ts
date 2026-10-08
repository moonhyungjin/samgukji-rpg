import { DamageCalculator, applyStatMods, buildUnits, maxTroops, statModsTotal, totalAp } from '@samgukji/battle-engine';
import type { BalanceConfig, CharacterData, CharacterRank, GameData, LineupEntry, Stats } from '@samgukji/battle-engine';

/** 편집기가 다루는 스탯과 표시 이름. 순서는 characters.json의 순서와 같다. */
export const STAT_FIELDS: { key: keyof Stats; label: string; hint: string }[] = [
  { key: 'attack', label: '공격', hint: '일반공격/돌격/화살의 피해' },
  { key: 'defense', label: '방어', hint: '물리 피해 경감' },
  { key: 'intellect', label: '지력', hint: '책략/도술의 피해, 지력 저항' },
  { key: 'speed', label: '속도', hint: '라운드 안의 행동 순서' },
  { key: 'action', label: '행동력', hint: '2마다 AP +1 (병종 기본 AP에 더해짐)' },
  { key: 'diplomacy', label: '외교', hint: '아직 전투에서 쓰이지 않음' },
  { key: 'politics', label: '내정', hint: '아직 전투에서 쓰이지 않음' },
  { key: 'charm', label: '매력', hint: '아직 전투에서 쓰이지 않음' },
];

export const RANK_LABEL: Record<CharacterRank, string> = { elite: '네임드', normal: '평범' };

/** 직렬화할 때 키 순서를 고정한다 (파일 비교가 쉽도록). */
export function normalizeCharacter(c: CharacterData): CharacterData {
  const stats = Object.fromEntries(STAT_FIELDS.map((f) => [f.key, Number(c.stats[f.key] ?? 0)])) as Stats;
  return { id: c.id, name: c.name, rank: c.rank ?? 'elite', unitType: c.unitType, level: Number(c.level), stats } as CharacterData;
}

/** characters.json에 쓰는 문자열 */
export function serialize(list: readonly CharacterData[]): string {
  return JSON.stringify(list.map(normalizeCharacter), null, 2) + '\n';
}

/** JSON 문자열 → 장수 목록. 모양이 맞지 않으면 사람이 읽을 수 있는 오류를 던진다. */
export function parseCharacters(text: string): CharacterData[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('JSON 형식이 올바르지 않습니다.');
  }
  if (!Array.isArray(raw)) throw new Error('장수 목록(배열)이어야 합니다.');
  return raw.map((item, index) => {
    const c = item as Partial<CharacterData> | null;
    if (!c || typeof c !== 'object' || typeof c.id !== 'string' || typeof c.name !== 'string' || typeof c.unitType !== 'string' || !c.stats) {
      throw new Error(`${index + 1}번째 항목에 id, name, unitType, stats가 필요합니다.`);
    }
    return normalizeCharacter({ ...c, level: c.level ?? 15 } as CharacterData);
  });
}

export interface Issue {
  level: 'error' | 'warning';
  /** 어느 장수의 문제인가 (id) */
  id?: string;
  message: string;
}

/** 저장 전에 확인한다. error가 있으면 저장하지 않는다. */
export function validate(list: readonly CharacterData[], data: GameData, balance: BalanceConfig): Issue[] {
  const issues: Issue[] = [];
  const seen = new Set<string>();
  for (const c of list) {
    const who = c.name || c.id || '(이름 없음)';
    if (!c.id.trim()) issues.push({ level: 'error', id: c.id, message: `${who}: id가 비어 있습니다.` });
    else if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(c.id)) issues.push({ level: 'error', id: c.id, message: `${who}: id는 영문으로 시작하는 영문/숫자/_/- 이어야 합니다 (${c.id}).` });
    if (seen.has(c.id)) issues.push({ level: 'error', id: c.id, message: `${who}: id가 겹칩니다 (${c.id}).` });
    seen.add(c.id);
    if (!c.name.trim()) issues.push({ level: 'error', id: c.id, message: `${c.id}: 이름이 비어 있습니다.` });
    if (!data.unitTypes[c.unitType]) issues.push({ level: 'error', id: c.id, message: `${who}: 없는 병종입니다 (${c.unitType}).` });
    if (!Number.isFinite(c.level) || c.level < 1) issues.push({ level: 'error', id: c.id, message: `${who}: 레벨은 1 이상이어야 합니다.` });
    for (const f of STAT_FIELDS) {
      const v = c.stats[f.key];
      if (!Number.isFinite(v)) issues.push({ level: 'error', id: c.id, message: `${who}: ${f.label}이(가) 숫자가 아닙니다.` });
      else if (v < 0 || v > balance.statCap) issues.push({ level: 'error', id: c.id, message: `${who}: ${f.label} ${v}은(는) 0~${balance.statCap} 범위를 벗어났습니다.` });
      else if (v > 10 && f.key !== 'diplomacy' && f.key !== 'politics' && f.key !== 'charm') {
        issues.push({ level: 'warning', id: c.id, message: `${who}: ${f.label} ${v}은(는) 10을 넘습니다 (아이템 보정 수준).` });
      }
    }
  }
  return issues;
}

export interface Derived {
  unitTypeName: string;
  /** 병종 보정과 승급 보너스까지 반영한 실제 전투 스탯 */
  finalStats: Stats;
  totalAp: number;
  troops: number;
  basicSkillName: string;
  /** 기준 상대(방어/지력 5, 병력 1000)에게 주는 일반공격 1회 피해 */
  sampleDamage: number | null;
}

/** 병종 보정, AP, 병력, 기준 상대에게 주는 피해를 계산한다 (엔진과 같은 계산을 쓴다). */
export function derive(c: CharacterData, data: GameData, balance: BalanceConfig): Derived | null {
  const unitType = data.unitTypes[c.unitType];
  if (!unitType) return null;
  // 실제 스탯 = 초기 스탯 + 승급 길의 스탯 보정 누적 (엔진 buildUnits와 같다)
  const finalStats = applyStatMods(c.stats, statModsTotal(data.unitTypes, unitType.id));
  const troops = maxTroops(balance, c.level, unitType.troopScale ?? 1);
  const skill = data.skills[unitType.basicSkillId];
  let sampleDamage: number | null = null;
  try {
    const row = unitType.allowedRows[0];
    const [unit] = buildUnits('attacker', [{ characterId: c.id, row } as LineupEntry], { ...data, characters: { ...data.characters, [c.id]: c } }, balance);
    const dummy = {
      ...unit,
      uid: 'dummy',
      side: 'defender' as const,
      stats: { ...unit.stats, defense: 5, intellect: 5 },
      troops: 1000,
      guardRate: 0,
      barrier: 0,
      unitType: 'infantry',
      family: 'infantry' as const,
      traitIds: [] as string[],
    };
    if (skill && skill.kind === 'attack') sampleDamage = new DamageCalculator(balance, data).damage(unit, dummy, skill, 50);
  } catch {
    sampleDamage = null;
  }
  return {
    unitTypeName: unitType.name,
    finalStats,
    totalAp: totalAp(balance, unitType.baseAp, finalStats.action),
    troops,
    basicSkillName: skill?.name ?? unitType.basicSkillId,
    sampleDamage,
  };
}

/** 새 장수 (평범한 기본값). id는 겹치지 않게 만든다. */
export function newCharacter(list: readonly CharacterData[], unitType: string): CharacterData {
  let n = 1;
  const ids = new Set(list.map((c) => c.id));
  while (ids.has(`char${n}`)) n++;
  return {
    id: `char${n}`,
    name: `새 장수 ${n}`,
    rank: 'elite',
    unitType,
    level: 15,
    stats: { attack: 5, defense: 5, intellect: 5, speed: 5, action: 3, diplomacy: 5, politics: 5, charm: 5 },
  };
}

/** 복제: 이름 뒤에 "복사"를 붙이고 새 id를 준다. */
export function duplicateCharacter(list: readonly CharacterData[], source: CharacterData): CharacterData {
  const base = newCharacter(list, source.unitType);
  return { ...normalizeCharacter(source), id: base.id, name: `${source.name} 복사` };
}

/** 이 장수를 쓰는 기본 편성 이름들 (삭제하면 편성이 깨지므로 막는다) */
export function presetsUsing(id: string, presets: Record<string, LineupEntry[]>): string[] {
  return Object.entries(presets)
    .filter(([, lineup]) => lineup.some((e) => e.characterId === id))
    .map(([name]) => name);
}

/** 저장본과 달라진 장수의 id 목록 (추가/수정/삭제) */
export function changedIds(saved: readonly CharacterData[], current: readonly CharacterData[]): { changed: string[]; added: string[]; removed: string[] } {
  const savedMap = new Map(saved.map((c) => [c.id, JSON.stringify(normalizeCharacter(c))]));
  const currentMap = new Map(current.map((c) => [c.id, JSON.stringify(normalizeCharacter(c))]));
  return {
    changed: current.filter((c) => savedMap.has(c.id) && savedMap.get(c.id) !== currentMap.get(c.id)).map((c) => c.id),
    added: current.filter((c) => !savedMap.has(c.id)).map((c) => c.id),
    removed: saved.filter((c) => !currentMap.has(c.id)).map((c) => c.id),
  };
}

export function isDirty(saved: readonly CharacterData[], current: readonly CharacterData[]): boolean {
  return serialize(saved) !== serialize(current);
}
