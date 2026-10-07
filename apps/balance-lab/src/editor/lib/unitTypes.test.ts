import { describe, expect, it } from 'vitest';
import { defaultBalance, gameData } from '@samgukji/game-data';
import type { UnitTypeData } from '@samgukji/battle-engine';
import {
  areUnitTypesDirty,
  changedUnitTypeIds,
  charactersUsing,
  newUnitType,
  normalizeUnitType,
  parseUnitTypes,
  serializeUnitTypes,
  unitTypeSummary,
  validateUnitTypes,
} from './unitTypes';

const list = Object.values(gameData.unitTypes);
const check = (l: UnitTypeData[]) => validateUnitTypes(l, gameData);
const errors = (l: UnitTypeData[]) => check(l).filter((i) => i.level === 'error');
const shield = () => normalizeUnitType(gameData.unitTypes.shield);
const archer = () => normalizeUnitType(gameData.unitTypes.archer);

describe('병종 데이터 (unitTypes.json)', () => {
  it('기본 병종은 검증을 통과한다 (오류 없음)', () => {
    expect(errors(list)).toEqual([]);
  });

  it('직렬화 → 파싱하면 같은 목록이 된다 (키 순서 고정)', () => {
    const text = serializeUnitTypes(list);
    expect(serializeUnitTypes(parseUnitTypes(text))).toBe(text);
    expect(Object.keys(JSON.parse(text)[0]).slice(0, 5)).toEqual(['id', 'name', 'family', 'tier', 'allowedRows']);
  });

  it('잘못된 JSON은 읽을 수 있는 오류를 던진다', () => {
    expect(() => parseUnitTypes('[')).toThrow(/JSON/);
    expect(() => parseUnitTypes('{}')).toThrow(/배열/);
    expect(() => parseUnitTypes('[{"id":"a"}]')).toThrow(/1번째/);
  });

  it('값이 빠져도 기본값으로 채워 일관된 모양이 된다', () => {
    const u = normalizeUnitType({ ...archer(), baseAp: undefined, troopScale: undefined, statMods: undefined, damageTakenByType: undefined, counterRate: undefined });
    expect(u).toMatchObject({ baseAp: 0, troopScale: 1, counterRate: 0.5, damageTakenByType: { physical: 1, magic: 1 }, statMods: { attack: 0, defense: 0, intellect: 0, speed: 0, action: 0 } });
  });
});

describe('병종 검사', () => {
  it('id 중복/형식, 이름, 계열, 열, 사거리, 병력 배율, 기본 AP를 오류로 잡는다', () => {
    const base = archer();
    expect(errors([...list, { ...base }]).some((i) => /겹칩니다/.test(i.message))).toBe(true);
    expect(errors([{ ...base, id: '1x' }]).some((i) => /id는/.test(i.message))).toBe(true);
    expect(errors([{ ...base, name: ' ' }]).some((i) => /이름이 비어/.test(i.message))).toBe(true);
    expect(errors([{ ...base, family: 'nothing' as never }]).some((i) => /없는 계열/.test(i.message))).toBe(true);
    expect(errors([{ ...base, allowedRows: [] }]).some((i) => /열이 하나도 없/.test(i.message))).toBe(true);
    expect(errors([{ ...base, range: 0 }]).some((i) => /사거리/.test(i.message))).toBe(true);
    expect(errors([{ ...base, troopScale: 0 }]).some((i) => /병력 배율/.test(i.message))).toBe(true);
    expect(errors([{ ...base, baseAp: -1 }]).some((i) => /기본 AP/.test(i.message))).toBe(true);
  });

  it('없는 스킬/특성은 오류다', () => {
    const base = archer();
    expect(errors([{ ...base, basicSkillId: 'zzz' }]).some((i) => /없는 일반공격/.test(i.message))).toBe(true);
    expect(errors([{ ...base, extraSkillIds: ['zzz'] }]).some((i) => /없는 추가 스킬/.test(i.message))).toBe(true);
    expect(errors([{ ...base, traitIds: ['zzz'] }]).some((i) => /없는 특성/.test(i.message))).toBe(true);
  });

  it('가드 설정과 가드 스킬은 짝이 맞아야 한다', () => {
    const noSkill = { ...shield(), extraSkillIds: [] as string[] };
    expect(errors([noSkill]).some((i) => /가드 스킬이 있어야/.test(i.message))).toBe(true);
    const { guard: _guard, ...withoutGuard } = shield();
    expect(errors([withoutGuard as UnitTypeData]).some((i) => /가드 설정/.test(i.message))).toBe(true);
    expect(errors([shield()])).toEqual([]);
  });

  it('후열 전용인데 사거리 1이면 경고만 한다', () => {
    const issues = check([{ ...archer(), allowedRows: ['back'], range: 1 }]);
    expect(issues.some((i) => i.level === 'warning' && /공격할 수 없습니다/.test(i.message))).toBe(true);
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('새 병종은 복사본이고 겹치지 않는 id를 받는다', () => {
    const a = newUnitType(list);
    const b = newUnitType([...list, a], gameData.unitTypes.archer);
    expect(new Set([...list.map((u) => u.id), a.id, b.id]).size).toBe(list.length + 2);
    expect(b.name).toBe('궁병 복사');
    expect(b.range).toBe(gameData.unitTypes.archer.range);
    expect(errors([...list, a, b])).toEqual([]);
  });

  it('병종을 쓰는 장수를 알려 준다 (삭제 방지)', () => {
    expect(charactersUsing('shield', Object.values(gameData.characters))).toEqual(expect.arrayContaining(['장비', '허저']));
    expect(charactersUsing('geomancer', Object.values(gameData.characters))).toEqual([]);
  });
});

describe('병종 요약과 변경 비교', () => {
  it('레벨 15 기준 최대 병력과 배치 가능한 열을 보여 준다', () => {
    const base = normalizeUnitType(gameData.unitTypes.cavalry);
    expect(unitTypeSummary({ ...base, troopScale: 0.8, allowedRows: ['front', 'back'] }, defaultBalance)).toEqual({ troops: 800, rows: '전열/후열' });
    expect(unitTypeSummary({ ...base, troopScale: 1, allowedRows: ['back'] }, defaultBalance)).toEqual({ troops: 1000, rows: '후열' });
  });

  it('저장본과 비교해 수정/추가/삭제를 알려 준다', () => {
    expect(areUnitTypesDirty(list, list)).toBe(false);
    const edited = list.map((u) => (u.id === 'cavalry' ? { ...u, troopScale: 0.9 } : u)).filter((u) => u.id !== 'geomancer');
    const added = [...edited, newUnitType(edited)];
    const diff = changedUnitTypeIds(list, added);
    expect(diff.changed).toEqual(['cavalry']);
    expect(diff.removed).toEqual(['geomancer']);
    expect(diff.added).toHaveLength(1);
    expect(areUnitTypesDirty(list, added)).toBe(true);
  });
});
