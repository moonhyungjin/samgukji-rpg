import { FAMILIES, maxTroops } from '@samgukji/battle-engine';
import type { BalanceConfig, CharacterData, Family, GameData, GuardConfig, Row, UnitTypeData } from '@samgukji/battle-engine';
import type { Issue } from './editor';

export const FAMILY_LABEL: Record<Family, string> = {
  infantry: '보병',
  shield: '방패병',
  cavalry: '기병',
  archer: '궁병',
  strategist: '책사',
  taoist: '도사',
  geomancer: '풍수사',
};

/** 병종 스탯 보정에 쓸 수 있는 스탯 */
export const MOD_FIELDS: { key: 'attack' | 'defense' | 'intellect' | 'speed' | 'action'; label: string }[] = [
  { key: 'attack', label: '공격' },
  { key: 'defense', label: '방어' },
  { key: 'intellect', label: '지력' },
  { key: 'speed', label: '속도' },
  { key: 'action', label: '행동력' },
];

const DEFAULT_GUARD: GuardConfig = { start: 50, gain: 0, gainPerIntellect: 20, decay: 40, damageTaken: 0.5 };

/** 직렬화할 때 키 순서를 고정한다 (파일 비교가 쉽도록). 빠진 값은 기본값으로 채운다. */
export function normalizeUnitType(u: UnitTypeData): UnitTypeData {
  const mods = { attack: 0, defense: 0, intellect: 0, speed: 0, action: 0, ...u.statMods };
  return {
    id: u.id,
    name: u.name,
    family: u.family,
    tier: u.tier,
    allowedRows: [...u.allowedRows],
    range: Number(u.range),
    canCounter: u.canCounter,
    basicSkillId: u.basicSkillId,
    extraSkillIds: [...u.extraSkillIds],
    promotesTo: [...u.promotesTo],
    traitIds: [...u.traitIds],
    troopScale: Number(u.troopScale ?? 1),
    baseAp: Number(u.baseAp ?? 0),
    recruit: { reinforce: Number(u.recruit?.reinforce ?? 0), replenish: Number(u.recruit?.replenish ?? 0), dismiss: Number(u.recruit?.dismiss ?? 0) },
    damageTakenByType: { physical: Number(u.damageTakenByType?.physical ?? 1), magic: Number(u.damageTakenByType?.magic ?? 1) },
    damageDealtByRow: { front: Number(u.damageDealtByRow?.front ?? 1), back: Number(u.damageDealtByRow?.back ?? 1) },
    typeBonus: { physical: Number(u.typeBonus?.physical ?? 0), magic: Number(u.typeBonus?.magic ?? 0) },
    vulnerability: { physical: Number(u.vulnerability?.physical ?? 0), magic: Number(u.vulnerability?.magic ?? 0) },
    statMods: { attack: Number(mods.attack), defense: Number(mods.defense), intellect: Number(mods.intellect), speed: Number(mods.speed), action: Number(mods.action) },
    ...(u.guard
      ? { guard: { start: Number(u.guard.start), gain: Number(u.guard.gain), gainPerIntellect: Number(u.guard.gainPerIntellect ?? 0), decay: Number(u.guard.decay), damageTaken: Number(u.guard.damageTaken ?? 1) } }
      : {}),
  };
}

export function serializeUnitTypes(list: readonly UnitTypeData[]): string {
  return JSON.stringify(list.map(normalizeUnitType), null, 2) + '\n';
}

export function parseUnitTypes(text: string): UnitTypeData[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('JSON 형식이 올바르지 않습니다.');
  }
  if (!Array.isArray(raw)) throw new Error('병종 목록(배열)이어야 합니다.');
  return raw.map((item, index) => {
    const u = item as Partial<UnitTypeData> | null;
    if (!u || typeof u !== 'object' || typeof u.id !== 'string' || typeof u.name !== 'string' || typeof u.family !== 'string' || !Array.isArray(u.allowedRows) || typeof u.basicSkillId !== 'string') {
      throw new Error(`${index + 1}번째 병종에 id, name, family, allowedRows, basicSkillId가 필요합니다.`);
    }
    return normalizeUnitType({ tier: 1, canCounter: false, extraSkillIds: [], promotesTo: [], traitIds: [], range: 1, ...u } as UnitTypeData);
  });
}

/** 새 병종: 보병을 바탕으로 한 복사본 (id와 이름만 새로) */
export function newUnitType(list: readonly UnitTypeData[], source?: UnitTypeData): UnitTypeData {
  let n = 1;
  const ids = new Set(list.map((u) => u.id));
  while (ids.has(`unit${n}`)) n++;
  const base = normalizeUnitType(source ?? list.find((u) => u.id === 'infantry') ?? list[0]);
  return { ...base, id: `unit${n}`, name: source ? `${source.name} 복사` : `새 병종 ${n}`, promotesTo: [] };
}

/** 이 병종을 쓰는 장수 이름들 (삭제하면 장수가 깨지므로 막는다) */
export function charactersUsing(id: string, characters: readonly CharacterData[]): string[] {
  return characters.filter((c) => c.unitType === id).map((c) => c.name);
}

/** 저장 전 검사. error가 있으면 저장하지 않는다. */
export function validateUnitTypes(list: readonly UnitTypeData[], data: GameData): Issue[] {
  const issues: Issue[] = [];
  const seen = new Set<string>();
  const skillKind = (id: string) => data.skills[id]?.kind;
  for (const u of list) {
    const who = u.name || u.id || '(이름 없음)';
    const err = (message: string) => issues.push({ level: 'error', id: u.id, message: `병종 ${who}: ${message}` });
    const warn = (message: string) => issues.push({ level: 'warning', id: u.id, message: `병종 ${who}: ${message}` });
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(u.id)) err(`id는 영문으로 시작하는 영문/숫자/_/- 이어야 합니다 (${u.id || '비어 있음'}).`);
    if (seen.has(u.id)) err(`id가 겹칩니다 (${u.id}).`);
    seen.add(u.id);
    if (!u.name.trim()) err('이름이 비어 있습니다.');
    if (!(FAMILIES as readonly string[]).includes(u.family)) err(`없는 계열입니다 (${u.family}).`);
    if (u.allowedRows.length === 0) err('배치할 수 있는 열이 하나도 없습니다.');
    if (!Number.isFinite(u.range) || u.range < 1) err('사거리는 1 이상이어야 합니다.');
    else if (u.allowedRows.includes('back') && !u.allowedRows.includes('front') && u.range < 2) warn('후열 전용인데 사거리가 1이라 공격할 수 없습니다.');
    if (!Number.isFinite(u.troopScale ?? 1) || (u.troopScale ?? 1) <= 0) err('병력 배율은 0보다 커야 합니다.');
    if (!Number.isFinite(u.baseAp ?? 0) || (u.baseAp ?? 0) < 0) err('기본 AP는 0 이상이어야 합니다.');
    for (const key of ['reinforce', 'replenish', 'dismiss'] as const) {
      const v = u.recruit?.[key] ?? 0;
      if (!Number.isFinite(v) || v < 0) err('징병 단가(증원/보충/해고)는 0 이상이어야 합니다.');
    }
    for (const key of ['physical', 'magic'] as const) {
      const v = u.damageTakenByType?.[key] ?? 1;
      if (!Number.isFinite(v) || v <= 0) err(`받는 피해 배수(${key === 'physical' ? '물리' : '책략'})는 0보다 커야 합니다.`);
    }
    for (const key of ['front', 'back'] as const) {
      const v = u.damageDealtByRow?.[key] ?? 1;
      if (!Number.isFinite(v) || v <= 0) err(`주는 피해 배수(대상이 ${key === 'front' ? '전열' : '후열'})는 0보다 커야 합니다.`);
    }
    if (!data.skills[u.basicSkillId]) err(`없는 일반공격 스킬입니다 (${u.basicSkillId}).`);
    for (const id of u.extraSkillIds) if (!data.skills[id]) err(`없는 추가 스킬입니다 (${id}).`);
    for (const id of u.traitIds) if (!data.traits[id]) err(`없는 특성입니다 (${id}).`);
    const hasGuardSkill = u.extraSkillIds.some((id) => skillKind(id) === 'guard');
    if (u.guard && !hasGuardSkill) err('가드를 켰다면 추가 스킬에 가드 스킬이 있어야 합니다.');
    if (!u.guard && hasGuardSkill) err('추가 스킬에 가드가 있다면 가드 설정(시작/상승/감소)을 켜야 합니다.');
    if (u.guard) {
      if (u.guard.start < 0 || u.guard.gain < 0 || (u.guard.gainPerIntellect ?? 0) < 0 || u.guard.decay < 0) err('가드의 시작/상승/지력당 상승/감소는 0 이상이어야 합니다.');
      if (!Number.isFinite(u.guard.damageTaken ?? 1) || (u.guard.damageTaken ?? 1) <= 0) err('가드 중 받는 피해 배수는 0보다 커야 합니다.');
    }
    if (u.canCounter && skillKind(u.basicSkillId) !== 'attack') warn('반격할 수 있는데 일반공격이 공격 스킬이 아니라 반격이 일어나지 않습니다.');
  }
  return issues;
}

/** 병종 카드에 보여 줄 계산값: 레벨 15 기준 최대 병력과 총 AP(행동력 0 기준 = 기본 AP) */
export function unitTypeSummary(u: UnitTypeData, balance: BalanceConfig): { troops: number; rows: string } {
  const rows = (['front', 'back'] as Row[]).filter((r) => u.allowedRows.includes(r)).map((r) => (r === 'front' ? '전열' : '후열'));
  return { troops: Math.max(1, Math.round(maxTroops(balance, 15) * (u.troopScale ?? 1))), rows: rows.join('/') || '-' };
}

export function changedUnitTypeIds(saved: readonly UnitTypeData[], current: readonly UnitTypeData[]): { changed: string[]; added: string[]; removed: string[] } {
  const savedMap = new Map(saved.map((u) => [u.id, JSON.stringify(normalizeUnitType(u))]));
  const currentMap = new Map(current.map((u) => [u.id, JSON.stringify(normalizeUnitType(u))]));
  return {
    changed: current.filter((u) => savedMap.has(u.id) && savedMap.get(u.id) !== currentMap.get(u.id)).map((u) => u.id),
    added: current.filter((u) => !savedMap.has(u.id)).map((u) => u.id),
    removed: saved.filter((u) => !currentMap.has(u.id)).map((u) => u.id),
  };
}

export function areUnitTypesDirty(saved: readonly UnitTypeData[], current: readonly UnitTypeData[]): boolean {
  return serializeUnitTypes(saved) !== serializeUnitTypes(current);
}

export function unitTypeRecord(list: readonly UnitTypeData[]): Record<string, UnitTypeData> {
  return Object.fromEntries(list.map((u) => [u.id, u]));
}

export { DEFAULT_GUARD };

/** 병종 카드에서 고친 값(patch)을 병종에 적용한다. statMods/damageTakenByType/guard는 안쪽 값만 합치고, guard가 null이면 가드를 끈다. */
export function applyUnitTypePatch(u: UnitTypeData, patch: Record<string, unknown>): UnitTypeData {
  const next: Record<string, unknown> = { ...u };
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'guard') {
      if (value === null) delete next.guard;
      else next.guard = { ...(u.guard ?? {}), ...(value as object) };
    } else if (['statMods', 'damageTakenByType', 'damageDealtByRow', 'recruit', 'typeBonus', 'vulnerability'].includes(key)) {
      next[key] = { ...((u as unknown as Record<string, object>)[key] ?? {}), ...(value as object) };
    } else {
      next[key] = value;
    }
  }
  return next as unknown as UnitTypeData;
}
