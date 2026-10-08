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
  const all = [...unitTypes, ...characters, ...presetIssues, ...numbers];
  return { unitTypes, characters, presets: presetIssues, numbers, all, errors: all.filter((i) => i.level === 'error') };
}
