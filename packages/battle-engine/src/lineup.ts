import { maxTroops, totalAp } from './stats';
import type { Rng } from './rng';
import type { BalanceConfig, CharacterState, GameData, LineupEntry, Row, Side, Stats, UnitTypeData } from './types';

export const ROW_CAPACITY = 3;
export const MAX_UNITS_PER_SIDE = 6;

/**
 * 무작위 편성. 캐릭터를 섞은 뒤 허용된 열에 하나씩 배치한다 (열당 최대 3군단).
 * 병종별/캐릭터별 승률을 편성 편향 없이 보기 위한 용도다.
 */
export function generateRandomLineup(data: GameData, rng: Rng, size = MAX_UNITS_PER_SIDE): LineupEntry[] {
  const ids = Object.keys(data.characters);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const count: Record<Row, number> = { front: 0, back: 0 };
  const lineup: LineupEntry[] = [];
  for (const id of ids) {
    if (lineup.length >= size) break;
    const unitType = data.unitTypes[data.characters[id].unitType];
    const rows = unitType.allowedRows.filter((r) => count[r] < ROW_CAPACITY);
    if (rows.length === 0) continue;
    const row = rows[Math.floor(rng() * rows.length)];
    count[row]++;
    lineup.push({ characterId: id, row });
  }
  return lineup;
}

/** 캐릭터 스탯에 병종 보정을 더한다 (0 아래로는 내려가지 않는다) */
export function applyStatMods(base: Stats, mods: UnitTypeData['statMods']): Stats {
  const stats = { ...base };
  if (!mods) return stats;
  for (const key of Object.keys(mods) as (keyof typeof mods)[]) stats[key] = Math.max(0, stats[key] + (mods[key] ?? 0));
  return stats;
}

/** 편성 → 전투 상태. 진영당 1~6군단, 열당 최대 3군단. */
export function buildUnits(side: Side, lineup: LineupEntry[], data: GameData, balance: BalanceConfig): CharacterState[] {
  if (lineup.length === 0) throw new Error(`${side} lineup is empty`);
  if (lineup.length > MAX_UNITS_PER_SIDE) throw new Error(`${side} lineup exceeds ${MAX_UNITS_PER_SIDE} units`);

  const rowCount: Record<Row, number> = { front: 0, back: 0 };
  return lineup.map((entry, index) => {
    const character = data.characters[entry.characterId];
    if (!character) throw new Error(`Unknown character: ${entry.characterId}`);
    const unitType = data.unitTypes[character.unitType];
    if (!unitType) throw new Error(`Unknown unit type: ${character.unitType}`);
    if (!unitType.allowedRows.includes(entry.row)) {
      throw new Error(`${character.name} (${unitType.id}) cannot be placed in the ${entry.row} row`);
    }
    const slot = rowCount[entry.row]++;
    if (slot >= ROW_CAPACITY) throw new Error(`${side} ${entry.row} row exceeds ${ROW_CAPACITY} units`);

    const level = entry.level ?? character.level;
    const max = Math.max(1, Math.round(maxTroops(balance, level) * (unitType.troopScale ?? 1)));
    const stats = applyStatMods(character.stats, unitType.statMods);
    const maxAp = totalAp(balance, unitType.baseAp, stats.action);
    return {
      uid: `${side}:${index}`,
      characterId: character.id,
      name: character.name,
      side,
      row: entry.row,
      slot,
      unitType: unitType.id,
      family: unitType.family,
      traitIds: [...unitType.traitIds],
      stats,
      level,
      maxTroops: max,
      troops: max,
      ap: maxAp,
      maxAp,
      guardRate: unitType.guard?.start ?? 0,
      buffs: { attack: 0, defense: 0, intellect: 0, speed: 0 },
      buffUses: {},
      barrier: 0,
      isDead: false,
    };
  });
}
