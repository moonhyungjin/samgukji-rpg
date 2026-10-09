import type { CharacterData, UnitTypeData } from '@samgukji/battle-engine';
import { validate } from '../editor/lib/editor';
import type { Issue } from '../editor/lib/editor';
import { validatePresets } from '../editor/lib/presets';
import { validateUnitTypes } from '../editor/lib/unitTypes';
import { findNonFinite } from './fileSync';
import type { DataFiles } from './fileSync';

export interface DataIssues {
  unitTypes: Issue[];
  characters: Issue[];
  presets: Issue[];
  /** 스킬, 특성, 밸런스 수치의 숫자가 아닌 값 */
  numbers: Issue[];
  all: Issue[];
  errors: Issue[];
}

/** 캠페인 검사: 편성 이름, 합류 장수/병종, 숫자 */
export function campaignIssues(files: DataFiles): Issue[] {
  const { campaign, presets, data } = files;
  const out: Issue[] = [];
  const err = (message: string) => out.push({ level: 'error', message: `캠페인: ${message}` });
  const presetIds = new Set(presets.map((p) => p.id));
  if (!presetIds.has(campaign.startPreset)) err(`시작 편성 "${campaign.startPreset}"이(가) 기본 편성에 없습니다.`);
  if (campaign.battles.length === 0) err('전투가 하나도 없습니다.');
  const ids = new Set<string>();
  campaign.battles.forEach((b, i) => {
    const label = `${i + 1}번째 전투(${b.name})`;
    if (ids.has(b.id)) err(`${label}: 전투 id "${b.id}"가 겹칩니다.`);
    ids.add(b.id);
    if (!presetIds.has(b.enemyPreset)) err(`${label}: 적 편성 "${b.enemyPreset}"이(가) 기본 편성에 없습니다.`);
    if (!(b.enemyLevel >= 1)) err(`${label}: 적 레벨은 1 이상이어야 합니다.`);
    if (b.enemyTroops !== undefined && !(b.enemyTroops >= 1)) err(`${label}: 적 병력은 1 이상이어야 합니다 (비우면 레벨 상한 가득).`);
    for (const j of b.joins) {
      if (!data.characters[j.characterId]) err(`${label}: 합류 장수 "${j.characterId}"이(가) 없습니다.`);
      if (j.unitType && !data.unitTypes[j.unitType]) err(`${label}: 합류 병종 "${j.unitType}"이(가) 없습니다.`);
    }
  });
  if (!(campaign.startLevel >= 1)) err('시작 레벨은 1 이상이어야 합니다.');
  for (const [id, level] of Object.entries(campaign.startLevels ?? {})) {
    if (!(level >= 1)) err(`${data.characters[id]?.name ?? id}의 시작 레벨은 1 이상이어야 합니다.`);
  }
  if (!(campaign.exp.perLevel > 0)) err('레벨당 필요 경험치는 0보다 커야 합니다.');
  out.push(...findNonFinite(campaign).map((p) => ({ level: 'error' as const, message: `캠페인 ${p}이(가) 숫자가 아닙니다.` })));
  return out;
}

/** 지도 검사: 세력, 인접 관계(서로 적혀 있는지), 성 수, 수비 부대 편성, 목표 지역 */
export function mapIssues(files: DataFiles): Issue[] {
  const { map, presets } = files;
  const out: Issue[] = [];
  const err = (message: string) => out.push({ level: 'error', message: `지도: ${message}` });
  const factionIds = new Set(map.factions.map((f) => f.id));
  const regionIds = new Set(map.regions.map((r) => r.id));
  const presetIds = new Set(presets.map((p) => p.id));
  const player = map.factions.filter((f) => f.player);
  if (player.length !== 1) err(`플레이어 세력은 정확히 하나여야 합니다 (지금 ${player.length}개).`);
  if (factionIds.size !== map.factions.length) err('세력 id가 겹칩니다.');
  if (regionIds.size !== map.regions.length) err('지역 id가 겹칩니다.');
  if (!regionIds.has(map.goalRegion)) err(`목표 지역 "${map.goalRegion}"이(가) 없습니다.`);
  const castleIds = new Set<string>();
  for (const r of map.regions) {
    if (!factionIds.has(r.faction)) err(`${r.name}: 세력 "${r.faction}"이(가) 없습니다.`);
    if (r.castles.length < 1 || r.castles.length > 4) err(`${r.name}: 성은 1~4개여야 합니다 (지금 ${r.castles.length}개).`);
    for (const n of r.neighbors) {
      const other = map.regions.find((x) => x.id === n);
      if (!other) err(`${r.name}: 맞닿은 지역 "${n}"이(가) 없습니다.`);
      else if (!other.neighbors.includes(r.id)) err(`${r.name} → ${other.name}는 맞닿아 있는데 ${other.name} 쪽에는 ${r.name}가 없습니다.`);
    }
    if (r.neighbors.includes(r.id)) err(`${r.name}: 자기 자신과 맞닿을 수 없습니다.`);
    const isPlayer = map.factions.find((f) => f.id === r.faction)?.player === true;
    for (const c of r.castles) {
      if (castleIds.has(c.id)) err(`성 id "${c.id}"가 겹칩니다.`);
      castleIds.add(c.id);
      if (!isPlayer && !c.garrison) err(`${r.name} ${c.name}: 플레이어 세력이 아닌 성에는 수비 부대가 있어야 합니다.`);
      if (c.garrison && !presetIds.has(c.garrison.preset)) err(`${r.name} ${c.name}: 수비 부대 편성 "${c.garrison.preset}"이(가) 기본 편성에 없습니다.`);
      if (c.garrison && !(c.garrison.level >= 1)) err(`${r.name} ${c.name}: 수비 부대 레벨은 1 이상이어야 합니다.`);
    }
  }
  out.push(...findNonFinite(map).map((p) => ({ level: 'error' as const, message: `지도 ${p}이(가) 숫자가 아닙니다.` })));
  return out;
}

/** 저장 전에 모든 데이터를 검사한다. error가 하나라도 있으면 저장하지 않는다. */
export function dataIssues(files: DataFiles): DataIssues {
  const { data, balance, presets } = files;
  const unitTypes = validateUnitTypes(Object.values(data.unitTypes) as UnitTypeData[], data);
  const characters = validate(Object.values(data.characters) as CharacterData[], data, balance);
  const presetIssues = validatePresets(presets, data);
  const numbers: Issue[] = [
    ...findNonFinite(Object.values(data.skills)).map((p) => ({ level: 'error' as const, message: `스킬 ${p}이(가) 숫자가 아닙니다.` })),
    ...findNonFinite(Object.values(data.traits)).map((p) => ({ level: 'error' as const, message: `특성 ${p}이(가) 숫자가 아닙니다.` })),
    ...findNonFinite(balance).map((p) => ({ level: 'error' as const, message: `밸런스 수치 ${p}이(가) 숫자가 아닙니다.` })),
    // 스킬이 거는 디버프는 balance.debuffs에 있어야 한다
    ...Object.values(data.skills)
      .filter((s) => s.debuff && !balance.debuffs?.[s.debuff.id])
      .map((s) => ({ level: 'error' as const, message: `스킬 ${s.name}의 디버프 "${s.debuff!.id}"가 밸런스의 디버프 목록에 없습니다.` })),
  ];
  const campaign = [...campaignIssues(files), ...mapIssues(files)];
  const all = [...unitTypes, ...characters, ...presetIssues, ...numbers, ...campaign];
  return { unitTypes, characters, presets: presetIssues, numbers, all, errors: all.filter((i) => i.level === 'error') };
}
