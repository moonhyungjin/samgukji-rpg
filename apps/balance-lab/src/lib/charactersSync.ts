import type { CharacterData, GameData } from '@samgukji/battle-engine';
import type { LabState, Slots } from '../lab/types';

/**
 * 장수 데이터(packages/game-data/data/characters.json)의 지문. 장수 편집기에서 저장하면 값이 바뀐다.
 * Lab은 브라우저에 상태를 저장해 두므로, 지문이 달라졌을 때만 저장된 장수를 파일 값으로 바꿔 준다.
 */
export function charactersSignature(characters: Record<string, CharacterData>): string {
  const text = JSON.stringify(Object.values(characters).map((c) => [c.id, c.name, c.rank ?? 'elite', c.unitType, c.level, ...Object.values(c.stats)]));
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return `${Object.keys(characters).length}:${(hash >>> 0).toString(16)}`;
}

/** 없어진 장수가 편성에 남아 있으면 그 칸을 비운다. */
export function pruneSlots(slots: Slots, characters: Record<string, CharacterData>): Slots {
  return slots.map((slot) => (slot && characters[slot.characterId] ? slot : null));
}

/**
 * 저장된 Lab 상태의 장수를 장수 파일의 최신 값으로 맞춘다.
 * 지문이 같으면 Lab에서 고친 값을 그대로 둔다 (아무것도 바꾸지 않는다).
 */
export function syncCharacters(state: LabState, fileData: GameData): LabState {
  const signature = charactersSignature(fileData.characters);
  const fresh = state.charactersSignature !== signature;
  const characters = fresh ? JSON.parse(JSON.stringify(fileData.characters)) : state.data.characters;
  return {
    ...state,
    charactersSignature: signature,
    data: { ...state.data, characters },
    teamA: pruneSlots(state.teamA, characters),
    teamB: pruneSlots(state.teamB, characters),
  };
}
