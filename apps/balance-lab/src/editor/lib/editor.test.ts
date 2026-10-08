import { describe, expect, it } from 'vitest';
import { defaultBalance, gameData, presets } from '@samgukji/game-data';
import { maxTroops, promotionBonusTotal } from '@samgukji/battle-engine';
import type { CharacterData } from '@samgukji/battle-engine';
import { changedIds, derive, duplicateCharacter, isDirty, newCharacter, parseCharacters, presetsUsing, serialize, validate } from './editor';

const characters = Object.values(gameData.characters);
const check = (list: CharacterData[]) => validate(list, gameData, defaultBalance);

describe('장수 편집기 로직', () => {
  it('기본 데이터는 검증을 통과한다 (오류 없음)', () => {
    expect(check(characters).filter((i) => i.level === 'error')).toEqual([]);
  });

  it('직렬화 → 파싱하면 같은 목록이 된다 (키 순서가 고정된다)', () => {
    const text = serialize(characters);
    expect(parseCharacters(text)).toEqual(JSON.parse(text));
    expect(serialize(parseCharacters(text))).toBe(text);
    expect(Object.keys(JSON.parse(text)[0].stats)).toEqual(['attack', 'defense', 'intellect', 'speed', 'action', 'diplomacy', 'politics', 'charm']);
  });

  it('잘못된 JSON은 읽을 수 있는 오류를 던진다', () => {
    expect(() => parseCharacters('{')).toThrow(/JSON/);
    expect(() => parseCharacters('{}')).toThrow(/배열/);
    expect(() => parseCharacters('[{"id":"a"}]')).toThrow(/1번째/);
  });

  it('id 중복, 없는 병종, 범위 밖 스탯, 이름 없음을 오류로 잡는다', () => {
    const a = newCharacter([], 'infantry');
    const dup = { ...a };
    expect(check([a, dup]).some((i) => i.level === 'error' && /겹칩니다/.test(i.message))).toBe(true);
    expect(check([{ ...a, unitType: 'nothing' }]).some((i) => /없는 병종/.test(i.message))).toBe(true);
    expect(check([{ ...a, stats: { ...a.stats, attack: 99 } }]).some((i) => /범위/.test(i.message))).toBe(true);
    expect(check([{ ...a, stats: { ...a.stats, attack: -1 } }]).some((i) => /범위/.test(i.message))).toBe(true);
    expect(check([{ ...a, name: ' ' }]).some((i) => /이름이 비어/.test(i.message))).toBe(true);
    expect(check([{ ...a, id: '1bad' }]).some((i) => /id는/.test(i.message))).toBe(true);
  });

  it('스탯이 10을 넘으면 경고만 하고 저장은 막지 않는다', () => {
    const a = newCharacter([], 'infantry');
    const issues = check([{ ...a, stats: { ...a.stats, attack: 12 } }]);
    expect(issues.some((i) => i.level === 'warning' && /10을 넘습니다/.test(i.message))).toBe(true);
    expect(issues.some((i) => i.level === 'error')).toBe(false);
  });

  it('병종 보정, 총 AP, 병력, 기준 상대 피해를 계산한다', () => {
    const zhangFei = gameData.characters.zhangFei;
    const d = derive(zhangFei, gameData, defaultBalance)!;
    // 장비는 승급 트리의 최종 병종이라 병종 이름과 보정은 현재 데이터에서 읽는다
    const type = gameData.unitTypes[zhangFei.unitType];
    const bonus = promotionBonusTotal(gameData.unitTypes, type.id);
    expect(d.unitTypeName).toBe(type.name);
    expect(d.finalStats.attack).toBe(Math.max(0, zhangFei.stats.attack + (type.statMods?.attack ?? 0) + bonus.attack)); // 병종 보정 + 승급 보너스
    expect(d.finalStats.speed).toBe(Math.max(0, zhangFei.stats.speed + (type.statMods?.speed ?? 0) + bonus.speed));
    expect(d.totalAp).toBe((type.baseAp ?? 0) + Math.ceil(d.finalStats.action / 2)); // 기본 AP + 행동력 2마다 1
    expect(d.troops).toBe(Math.round(maxTroops(defaultBalance, zhangFei.level) * (type.troopScale ?? 1)));
    expect(d.sampleDamage).toBeGreaterThan(0);
    expect(derive({ ...zhangFei, unitType: 'nothing' }, gameData, defaultBalance)).toBeNull();
  });

  it('공격 스탯을 올리면 기준 상대 피해가 늘고, 행동력을 올리면 총 AP가 는다', () => {
    const base = gameData.characters.weiYan;
    const before = derive(base, gameData, defaultBalance)!;
    const stronger = derive({ ...base, stats: { ...base.stats, attack: base.stats.attack + 2, action: base.stats.action + 2 } }, gameData, defaultBalance)!;
    expect(stronger.sampleDamage!).toBeGreaterThan(before.sampleDamage!);
    expect(stronger.totalAp).toBe(before.totalAp + 1);
  });

  it('새 장수와 복제는 겹치지 않는 id를 받는다', () => {
    const list = [newCharacter([], 'infantry')];
    const second = newCharacter(list, 'cavalry');
    expect(second.id).not.toBe(list[0].id);
    const copy = duplicateCharacter([...list, second], list[0]);
    expect(new Set([list[0].id, second.id, copy.id]).size).toBe(3);
    expect(copy.name).toBe(`${list[0].name} 복사`);
    expect(copy.stats).toEqual(list[0].stats);
  });

  it('기본 편성에서 쓰는 장수를 알려 준다 (삭제 방지)', () => {
    expect(presetsUsing('zhangFei', presets)).toEqual(expect.arrayContaining(['shu', 'shuStart']));
    expect(presetsUsing('nobody', presets)).toEqual([]);
  });

  it('저장본과 비교해 수정/추가/삭제를 알려 준다', () => {
    const saved = characters;
    expect(isDirty(saved, saved)).toBe(false);
    const edited = saved.map((c) => (c.id === 'guanYu' ? { ...c, stats: { ...c.stats, attack: 10 } } : c)).filter((c) => c.id !== 'xuChu');
    const added = [...edited, newCharacter(edited, 'infantry')];
    const diff = changedIds(saved, added);
    expect(diff.changed).toEqual(['guanYu']);
    expect(diff.removed).toEqual(['xuChu']);
    expect(diff.added).toHaveLength(1);
    expect(isDirty(saved, added)).toBe(true);
  });
});
