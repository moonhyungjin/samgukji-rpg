import { maxTroops, resolveLineupSlots } from '@samgukji/battle-engine';
import type { BalanceConfig, GameData, LineupEntry, Row } from '@samgukji/battle-engine';
import type { PresetDef } from '@samgukji/game-data';
import type { Issue } from './editor';

/** 삭제할 수 없는 편성: Lab과 게임의 기본 대결(촉 vs 위)이 이 이름을 쓴다. */
export const REQUIRED_PRESETS = ['shu', 'wei'];

export const ROW_CAPACITY = 3;
export const MAX_UNITS = 6;

/** 편성 칸: 0~2는 전열, 3~5는 후열. 빈 칸은 null */
export type PresetSlots = (LineupEntry | null)[];

export function slotsFromLineup(lineup: readonly LineupEntry[]): PresetSlots {
  const slots: PresetSlots = Array.from({ length: MAX_UNITS }, () => null);
  const positions = resolveLineupSlots(lineup);
  for (const [i, entry] of lineup.entries()) {
    const index = (entry.row === 'front' ? 0 : ROW_CAPACITY) + positions[i];
    slots[index] = entry;
  }
  return slots;
}

export function lineupFromSlots(slots: PresetSlots): LineupEntry[] {
  const count: Record<Row, number> = { front: 0, back: 0 };
  return slots.flatMap((entry, index) => {
    if (!entry) return [];
    const row: Row = index < ROW_CAPACITY ? 'front' : 'back';
    const next = { ...entry, row };
    delete next.slot;
    if (index % ROW_CAPACITY !== count[row]++) next.slot = index % ROW_CAPACITY;
    return [next];
  });
}

/** 칸 하나에 장수를 넣는다 (빈 문자열이면 비운다). 레벨 덮어쓰기는 유지하지 않는다. */
export function setSlot(preset: PresetDef, index: number, characterId: string): PresetDef {
  const slots = slotsFromLineup(preset.lineup);
  slots[index] = characterId ? { characterId, row: index < ROW_CAPACITY ? 'front' : 'back' } : null;
  return { ...preset, lineup: lineupFromSlots(slots) };
}

/** 칸의 병종(승급 단계)을 바꾼다. undefined이면 지워서 장수의 병종으로 돌아간다. */
export function setSlotUnitType(preset: PresetDef, index: number, unitType: string | undefined): PresetDef {
  const slots = slotsFromLineup(preset.lineup);
  const slot = slots[index];
  if (!slot) return preset;
  const next = { ...slot, unitType };
  if (next.unitType === undefined || next.unitType === '') delete next.unitType;
  slots[index] = next;
  return { ...preset, lineup: lineupFromSlots(slots) };
}

/** 직렬화할 때 키 순서를 고정한다. */
export function normalizePreset(p: PresetDef): PresetDef {
  return {
    id: p.id,
    label: p.label,
    lineup: p.lineup.map((e) => ({ characterId: e.characterId, row: e.row, ...(e.slot === undefined ? {} : { slot: e.slot }), ...(e.level === undefined ? {} : { level: e.level }), ...(e.unitType === undefined ? {} : { unitType: e.unitType }) })),
  };
}

export function serializePresets(list: readonly PresetDef[]): string {
  return JSON.stringify(list.map(normalizePreset), null, 2) + '\n';
}

export function parsePresets(text: string): PresetDef[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('JSON 형식이 올바르지 않습니다.');
  }
  if (!Array.isArray(raw)) throw new Error('편성 목록(배열)이어야 합니다.');
  return raw.map((item, index) => {
    const p = item as Partial<PresetDef> | null;
    if (!p || typeof p !== 'object' || typeof p.id !== 'string' || typeof p.label !== 'string' || !Array.isArray(p.lineup)) {
      throw new Error(`${index + 1}번째 편성에 id, label, lineup이 필요합니다.`);
    }
    return normalizePreset(p as PresetDef);
  });
}

export function newPreset(list: readonly PresetDef[]): PresetDef {
  let n = 1;
  const ids = new Set(list.map((p) => p.id));
  while (ids.has(`preset${n}`)) n++;
  return { id: `preset${n}`, label: `새 편성 ${n}`, lineup: [] };
}

export function duplicatePreset(list: readonly PresetDef[], source: PresetDef): PresetDef {
  const base = newPreset(list);
  return { ...normalizePreset(source), id: base.id, label: `${source.label} 복사` };
}

/** 저장 전 검사. error가 있으면 저장하지 않는다. */
export function validatePresets(list: readonly PresetDef[], data: GameData): Issue[] {
  const issues: Issue[] = [];
  const seen = new Set<string>();
  for (const p of list) {
    const who = p.label || p.id || '(이름 없음)';
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(p.id)) issues.push({ level: 'error', id: p.id, message: `편성 ${who}: id는 영문으로 시작하는 영문/숫자/_/- 이어야 합니다 (${p.id || '비어 있음'}).` });
    if (seen.has(p.id)) issues.push({ level: 'error', id: p.id, message: `편성 ${who}: id가 겹칩니다 (${p.id}).` });
    seen.add(p.id);
    if (!p.label.trim()) issues.push({ level: 'error', id: p.id, message: `편성 ${p.id}: 이름이 비어 있습니다.` });
    if (p.lineup.length === 0) issues.push({ level: 'error', id: p.id, message: `편성 ${who}: 군단이 하나도 없습니다.` });
    if (p.lineup.length > MAX_UNITS) issues.push({ level: 'error', id: p.id, message: `편성 ${who}: 군단은 ${MAX_UNITS}개까지입니다.` });
    for (const row of ['front', 'back'] as const) {
      if (p.lineup.filter((e) => e.row === row).length > ROW_CAPACITY) issues.push({ level: 'error', id: p.id, message: `편성 ${who}: ${row === 'front' ? '전열' : '후열'}은 ${ROW_CAPACITY}군단까지입니다.` });
    }
    const used = new Set<string>();
    try { resolveLineupSlots(p.lineup); } catch (error) {
      issues.push({ level: 'error', id: p.id, message: `편성 ${who}: 슬롯 위치가 잘못되었습니다 (${error instanceof Error ? error.message : String(error)}).` });
    }
    for (const e of p.lineup) {
      const character = data.characters[e.characterId];
      if (!character) {
        issues.push({ level: 'error', id: p.id, message: `편성 ${who}: 없는 장수입니다 (${e.characterId}).` });
        continue;
      }
      if (e.unitType !== undefined && !data.unitTypes[e.unitType]) {
        issues.push({ level: 'error', id: p.id, message: `편성 ${who}: ${character.name}의 병종(승급 단계)이 없는 병종입니다 (${e.unitType}).` });
      }
      const unitType = data.unitTypes[e.unitType ?? character.unitType];
      if (unitType && !unitType.allowedRows.includes(e.row)) {
        issues.push({ level: 'error', id: p.id, message: `편성 ${who}: ${character.name}(${unitType.name})은 ${e.row === 'front' ? '전열' : '후열'}에 둘 수 없습니다.` });
      }
      if (unitType && e.row === 'back' && unitType.range < 2 && unitType.allowedRows.includes('back')) {
        issues.push({ level: 'warning', id: p.id, message: `편성 ${who}: ${character.name}(${unitType.name})은 사거리 ${unitType.range}이라 후열에서는 공격할 수 없습니다.` });
      }
      if (used.has(e.characterId)) issues.push({ level: 'warning', id: p.id, message: `편성 ${who}: ${character.name}이(가) 두 번 들어 있습니다.` });
      used.add(e.characterId);
    }
  }
  for (const id of REQUIRED_PRESETS) {
    if (!seen.has(id)) issues.push({ level: 'error', message: `기본 대결용 편성 "${id}"가 있어야 합니다 (Lab과 게임의 기본값).` });
  }
  return issues;
}

export interface LineupSummary {
  /** "방패병 · 보병 · 기병 / 궁병 · 책사" 같은 구성 */
  composition: string;
  units: number;
  troops: number;
}

/** 편성의 구성과 전체 병력 */
export function summarizeLineup(lineup: readonly LineupEntry[], data: GameData, balance: BalanceConfig): LineupSummary {
  const names = (row: Row) =>
    lineup
      .filter((e) => e.row === row)
      .map((e) => {
        const c = data.characters[e.characterId];
        return c ? (data.unitTypes[e.unitType ?? c.unitType]?.name ?? c.unitType) : '?';
      })
      .join(' · ');
  const troops = lineup.reduce((sum, e) => {
    const c = data.characters[e.characterId];
    const unitType = c ? data.unitTypes[e.unitType ?? c.unitType] : undefined;
    return c && unitType ? sum + maxTroops(balance, e.level ?? c.level, unitType.troopScale ?? 1) : sum;
  }, 0);
  return { composition: `${names('front') || '-'} / ${names('back') || '-'}`, units: lineup.length, troops };
}

export function changedPresetIds(saved: readonly PresetDef[], current: readonly PresetDef[]): { changed: string[]; added: string[]; removed: string[] } {
  const savedMap = new Map(saved.map((p) => [p.id, JSON.stringify(normalizePreset(p))]));
  const currentMap = new Map(current.map((p) => [p.id, JSON.stringify(normalizePreset(p))]));
  return {
    changed: current.filter((p) => savedMap.has(p.id) && savedMap.get(p.id) !== currentMap.get(p.id)).map((p) => p.id),
    added: current.filter((p) => !savedMap.has(p.id)).map((p) => p.id),
    removed: saved.filter((p) => !currentMap.has(p.id)).map((p) => p.id),
  };
}

export function arePresetsDirty(saved: readonly PresetDef[], current: readonly PresetDef[]): boolean {
  return serializePresets(saved) !== serializePresets(current);
}

/** 편성 목록 → 장수 삭제 보호에 쓰는 (id → 편성) 맵 */
export function presetMap(list: readonly PresetDef[]): Record<string, LineupEntry[]> {
  return Object.fromEntries(list.map((p) => [p.id, p.lineup]));
}
