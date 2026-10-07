import type { CharacterData, UnitTypeData } from '@samgukji/battle-engine';
import type { LabState } from '../lab/types';

/** id가 있는 목록 → { id: 항목 } (순서 유지) */
export function toRecord<T extends { id: string }>(list: readonly T[]): Record<string, T> {
  return Object.fromEntries(list.map((x) => [x.id, x]));
}

/** 편집 화면은 목록으로 다루고, Lab 상태는 { id: 항목 }으로 가진다. 이 둘을 오간다. */
export const withCharacters = (state: LabState, list: readonly CharacterData[]): LabState => ({
  ...state,
  data: { ...state.data, characters: toRecord(list) },
});

export const withUnitTypes = (state: LabState, list: readonly UnitTypeData[]): LabState => ({
  ...state,
  data: { ...state.data, unitTypes: toRecord(list) },
});
