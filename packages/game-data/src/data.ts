import type { CharacterData, GameData, SkillData, TraitData, UnitTypeData } from '@samgukji/battle-engine';
import charactersJson from '../data/characters.json';
import skillsJson from '../data/skills.json';
import traitsJson from '../data/traits.json';
import unitTypesJson from '../data/unitTypes.json';

// 게임 데이터의 원본은 data/*.json이다. 모두 Balance Lab(`npm run lab`)에서 고치고 "파일에 저장"하면 이 파일들이 바뀐다.
//   skills.json     스킬(커맨드): 계수, AP, 반격/가드 여부, 방어 무시, 버프 효과
//   traits.json     병종 특성: 주는/받는 피해 배수와 조건 (상성표 대신 병종이 가진 효과로 피해를 보정한다)
//   unitTypes.json  병종: 사거리, 병력 배율, 기본 AP, 스탯 보정, 받는 피해 배수, 반격, 스킬, 가드
//   characters.json 장수: 스탯 8종(공격/방어/지력/속도/행동력/외교/내정/매력), 병종, 등급(rank), 레벨
//   presets.json    기본 편성 (presets.ts)
//   balance.json    밸런스 수치 (balance.ts)
// 규칙의 근거는 docs/design/01-character-and-unit.md, 02-battle-rules.md 참고. 수치는 모두 임시값이다.
//
// 총 AP = 병종 기본 AP + 장수 행동력 추가 AP (행동력 2마다 1). 사거리 1은 전열에서 적 전열만, 사거리 3은 어느 열에서든 모든 열을 칠 수 있다.
// 평범한 장수(황건적 등)는 rank: 'normal'이다. 무작위 편성은 기본으로 네임드 장수(elite)만 쓰고, pool: 'normal'로 평범한 장수를 쓴다.

const toRecord = <T extends { id: string }>(list: T[]): Record<string, T> => Object.fromEntries(list.map((x) => [x.id, x]));

export const gameData: GameData = {
  skills: toRecord(skillsJson as unknown as SkillData[]),
  traits: toRecord(traitsJson as unknown as TraitData[]),
  unitTypes: toRecord(unitTypesJson as unknown as UnitTypeData[]),
  characters: toRecord(charactersJson as unknown as CharacterData[]),
};
