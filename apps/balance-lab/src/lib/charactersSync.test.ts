import { describe, expect, it } from 'vitest';
import { gameData } from '@samgukji/game-data';
import { createDefaultState } from '../lab/defaults';
import { charactersSignature, pruneSlots, syncCharacters } from './charactersSync';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('장수 파일 동기화', () => {
  it('지문은 스탯, 병종, 이름이 바뀌면 달라지고 같으면 같다', () => {
    const base = charactersSignature(gameData.characters);
    expect(charactersSignature(clone(gameData.characters))).toBe(base);
    const edited = clone(gameData.characters);
    edited.guanYu.stats.attack += 1;
    expect(charactersSignature(edited)).not.toBe(base);
    const renamed = clone(gameData.characters);
    renamed.guanYu.name = '관운장';
    expect(charactersSignature(renamed)).not.toBe(base);
    const removed = clone(gameData.characters);
    delete removed.guanYu;
    expect(charactersSignature(removed)).not.toBe(base);
  });

  it('기본 상태는 현재 장수 파일의 지문을 가진다', () => {
    expect(createDefaultState().charactersSignature).toBe(charactersSignature(gameData.characters));
  });

  it('지문이 같으면 Lab에서 고친 장수를 그대로 둔다', () => {
    const state = createDefaultState();
    state.data.characters.guanYu.stats.attack = 3;
    const synced = syncCharacters(state, gameData);
    expect(synced.data.characters.guanYu.stats.attack).toBe(3);
  });

  it('지문이 다르면 장수를 파일 값으로 바꾸고 지문을 갱신한다 (병종/레벨 같은 다른 Lab 수치는 그대로)', () => {
    const state = createDefaultState();
    state.charactersSignature = 'old';
    state.data.characters.guanYu.stats.attack = 3;
    state.balance.damage.attackScale = 99;
    const synced = syncCharacters(state, gameData);
    expect(synced.data.characters.guanYu.stats.attack).toBe(gameData.characters.guanYu.stats.attack);
    expect(synced.charactersSignature).toBe(charactersSignature(gameData.characters));
    expect(synced.balance.damage.attackScale).toBe(99);
  });

  it('없어진 장수가 편성에 있으면 그 칸을 비운다', () => {
    const slots = [{ characterId: 'guanYu' }, { characterId: 'gone' }, null, null, null, null];
    expect(pruneSlots(slots, gameData.characters)).toEqual([{ characterId: 'guanYu' }, null, null, null, null, null]);
  });
});
