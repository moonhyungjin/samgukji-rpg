import { maxTroops, totalAp } from './stats';
import type { Rng } from './rng';
import { canAttackFromRow } from './targeting';
import type { BalanceConfig, CharacterPool, CharacterState, GameData, LineupEntry, Row, Side, Stats, UnitTypeData } from './types';

export const ROW_CAPACITY = 3;
export const MAX_UNITS_PER_SIDE = 6;

/**
 * 무작위 편성. 캐릭터를 섞은 뒤 허용된 열에 하나씩 배치한다 (열당 최대 3군단).
 * 병종별/캐릭터별 승률을 편성 편향 없이 보기 위한 용도다.
 */
export function generateRandomLineup(data: GameData, rng: Rng, size = MAX_UNITS_PER_SIDE, pool: CharacterPool = 'elite'): LineupEntry[] {
  const ids = Object.keys(data.characters).filter((id) => pool === 'all' || (data.characters[id].rank ?? 'elite') === pool);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const count: Record<Row, number> = { front: 0, back: 0 };
  const lineup: LineupEntry[] = [];
  for (const id of ids) {
    if (lineup.length >= size) break;
    const unitType = data.unitTypes[data.characters[id].unitType];
    // 사거리 1 병종은 후열에서 아무도 못 치므로 공격할 수 있는 열에만, 사거리 3 병종(궁병 등)은 후열에 둔다 (보통의 운용)
    const rangedBack = unitType.range >= 3 && unitType.allowedRows.includes('back');
    const rows = rangedBack
      ? (['back'] as Row[]).filter((r) => count[r] < ROW_CAPACITY)
      : unitType.allowedRows.filter((r) => count[r] < ROW_CAPACITY && canAttackFromRow(unitType.range, r));
    if (rows.length === 0) continue;
    const row = rows[Math.floor(rng() * rows.length)];
    count[row]++;
    lineup.push({ characterId: id, row });
  }
  return lineup;
}

// 병종 표(객체)마다 "승급 부모" 지도를 한 번만 만든다. 편성을 만들 때마다 부르므로 매번 찾으면 시뮬레이션이 느려진다.
// 병종 표는 바꿀 때마다 새 객체가 되므로(Lab) 객체가 같으면 내용도 같다고 본다.
const parentMaps = new WeakMap<Record<string, UnitTypeData>, Map<string, UnitTypeData>>();

/** 승급 트리에서 이 병종의 부모(승급 전 병종). promotesTo에 이 병종이 들어 있는 병종. 없으면 undefined (여럿이면 id 순으로 첫 번째) */
function promotionParent(unitTypes: Record<string, UnitTypeData>, id: string): UnitTypeData | undefined {
  let map = parentMaps.get(unitTypes);
  if (!map) {
    map = new Map();
    for (const u of Object.values(unitTypes).sort((x, y) => y.id.localeCompare(x.id))) {
      // id 역순으로 넣어서 같은 자식이면 id가 앞선 부모가 남는다
      for (const child of u.promotesTo) if (child !== u.id) map.set(child, u);
    }
    parentMaps.set(unitTypes, map);
  }
  return map.get(id);
}

/** 이 병종까지 오는 승급 길: [뿌리(0차), ..., 이 병종]. 승급 트리가 아니면 [이 병종] */
export function promotionChain(unitTypes: Record<string, UnitTypeData>, id: string): UnitTypeData[] {
  const chain: UnitTypeData[] = [];
  const seen = new Set<string>();
  for (let cur: UnitTypeData | undefined = unitTypes[id]; cur && !seen.has(cur.id); cur = promotionParent(unitTypes, cur.id)) {
    seen.add(cur.id);
    chain.unshift(cur);
  }
  return chain;
}

/** 이 병종이 되기까지 받은 승급 보너스의 합 (뿌리 병종은 승급이 아니라 0) */
export function promotionBonusTotal(unitTypes: Record<string, UnitTypeData>, id: string): Record<'attack' | 'defense' | 'intellect' | 'speed' | 'action', number> {
  const total = { attack: 0, defense: 0, intellect: 0, speed: 0, action: 0 };
  for (const u of promotionChain(unitTypes, id).slice(1)) {
    for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += u.promotionBonus?.[k] ?? 0;
  }
  return total;
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
    const unitTypeId = entry.unitType ?? character.unitType;
    const unitType = data.unitTypes[unitTypeId];
    if (!unitType) throw new Error(`Unknown unit type: ${unitTypeId}`);
    if (!unitType.allowedRows.includes(entry.row)) {
      throw new Error(`${character.name} (${unitType.id}) cannot be placed in the ${entry.row} row`);
    }
    const slot = rowCount[entry.row]++;
    if (slot >= ROW_CAPACITY) throw new Error(`${side} ${entry.row} row exceeds ${ROW_CAPACITY} units`);

    const level = entry.level ?? character.level;
    const max = Math.max(1, Math.round(maxTroops(balance, level) * (unitType.troopScale ?? 1)));
    // 스탯 = 캐릭터 스탯(초기) + 병종 보정 + 지금 병종까지 오는 길의 승급 보너스 누적
    const bonus = promotionBonusTotal(data.unitTypes, unitType.id);
    const mods = unitType.statMods ?? {};
    const stats = applyStatMods(character.stats, {
      attack: (mods.attack ?? 0) + bonus.attack,
      defense: (mods.defense ?? 0) + bonus.defense,
      intellect: (mods.intellect ?? 0) + bonus.intellect,
      speed: (mods.speed ?? 0) + bonus.speed,
      action: (mods.action ?? 0) + bonus.action,
    });
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
