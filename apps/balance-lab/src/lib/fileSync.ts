import type { BalanceConfig, CharacterData, GameData } from '@samgukji/battle-engine';
import { campaignFile, defaultBalance, gameData, presetList } from '@samgukji/game-data';
import type { CampaignFile, PresetDef } from '@samgukji/game-data';
import { serialize as serializeCharacters } from '../editor/lib/editor';
import { serializePresets } from '../editor/lib/presets';
import { serializeUnitTypes } from '../editor/lib/unitTypes';
import type { LabState, Slots } from '../lab/types';

/** 프로젝트 데이터 파일 한 벌 (packages/game-data/data/*.json). Lab은 이것을 고치고 "파일에 저장"한다. */
export interface DataFiles {
  data: GameData;
  balance: BalanceConfig;
  presets: PresetDef[];
  /** 캠페인 (data/campaign.json, 편성은 이름으로) */
  campaign: CampaignFile;
}

/** 파일 이름. 저장 API(/api/data)와 같은 이름을 쓴다. */
export const FILE_NAMES = ['skills', 'traits', 'unitTypes', 'characters', 'presets', 'balance', 'campaign'] as const;
export type FileName = (typeof FILE_NAMES)[number];

export const FILE_LABEL: Record<FileName, string> = {
  skills: '스킬',
  traits: '특성',
  unitTypes: '병종',
  characters: '장수',
  presets: '기본 편성',
  balance: '밸런스 수치',
  campaign: '캠페인',
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** 지금 프로젝트 파일에 들어 있는 값 (게임 데이터 패키지가 읽은 것의 복사본) */
export function filesSnapshot(): DataFiles {
  return { data: clone(gameData), balance: clone(defaultBalance), presets: clone(presetList as PresetDef[]), campaign: clone(campaignFile) };
}

/** 데이터 파일 하나를 파일에 쓰는 문자열로 만든다 (파일 비교와 저장에 같은 문자열을 쓴다). */
export function serializeFile(name: FileName, files: DataFiles): string {
  switch (name) {
    case 'skills':
      return JSON.stringify(Object.values(files.data.skills), null, 2) + '\n';
    case 'traits':
      return JSON.stringify(Object.values(files.data.traits), null, 2) + '\n';
    case 'unitTypes':
      return serializeUnitTypes(Object.values(files.data.unitTypes));
    case 'characters':
      return serializeCharacters(Object.values(files.data.characters) as CharacterData[]);
    case 'presets':
      return serializePresets(files.presets);
    case 'balance':
      return JSON.stringify(files.balance, null, 2) + '\n';
    case 'campaign':
      return JSON.stringify(files.campaign, null, 2) + '\n';
  }
}

export function serializeAll(files: DataFiles): Record<FileName, string> {
  return Object.fromEntries(FILE_NAMES.map((name) => [name, serializeFile(name, files)])) as Record<FileName, string>;
}

/** 두 벌을 비교해 내용이 다른 파일 이름을 돌려준다. */
export function changedFileNames(baseline: DataFiles, current: DataFiles): FileName[] {
  return FILE_NAMES.filter((name) => serializeFile(name, baseline) !== serializeFile(name, current));
}

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

/**
 * 데이터 파일 전체의 지문. Lab은 작업 중인 값(초안)을 브라우저에 저장해 두는데,
 * 파일이 바뀌었으면(저장했거나 git으로 받았거나) 초안을 버리고 파일 값으로 시작해야 하므로 이 지문으로 구분한다.
 */
export function filesSignature(files: DataFiles): string {
  return hash(FILE_NAMES.map((name) => serializeFile(name, files)).join('\u0000'));
}

/** 없어진 장수가 편성에 남아 있으면 그 칸을 비운다. */
export function pruneSlots(slots: Slots, characters: Record<string, CharacterData>): Slots {
  return slots.map((slot) => (slot && characters[slot.characterId] ? slot : null));
}

/**
 * 저장된 Lab 상태를 데이터 파일에 맞춘다.
 * 파일이 그대로면(지문이 같으면) 작업 중이던 초안을 그대로 둔다. 파일이 바뀌었으면 초안을 버리고 파일 값을 쓴다.
 * 시뮬레이션 설정, 목표, 편성 슬롯은 건드리지 않는다 (없어진 장수는 편성에서 뺀다).
 */
export function syncWithFiles(state: LabState, files: DataFiles): LabState {
  const signature = filesSignature(files);
  const fresh = state.filesSignature !== signature || !state.presets;
  const data = fresh ? clone(files.data) : state.data;
  const balance = fresh ? clone(files.balance) : state.balance;
  const presets = fresh ? clone(files.presets) : state.presets;
  const campaign = fresh || !state.campaign ? clone(files.campaign) : state.campaign;
  return {
    ...state,
    filesSignature: signature,
    data,
    balance,
    presets,
    campaign,
    teamA: pruneSlots(state.teamA, data.characters),
    teamB: pruneSlots(state.teamB, data.characters),
  };
}

/** 저장 전에 숫자가 아닌 값(NaN, 무한대)이 섞였는지 본다. 문제 위치를 알려 준다. */
export function findNonFinite(value: unknown, path = ''): string[] {
  if (typeof value === 'number') return Number.isFinite(value) ? [] : [path || '(값)'];
  if (Array.isArray(value)) return value.flatMap((v, i) => findNonFinite(v, `${path}[${i}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => findNonFinite(v, path ? `${path}.${k}` : k));
  return [];
}
