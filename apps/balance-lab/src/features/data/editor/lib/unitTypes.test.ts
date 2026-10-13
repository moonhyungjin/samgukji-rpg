import { describe, expect, it } from 'vitest';
import { defaultBalance, gameData } from '@samgukji/game-data';
import type { UnitTypeData } from '@samgukji/battle-engine';
import {
  applyUnitTypePatch,
  areUnitTypesDirty,
  changedUnitTypeIds,
  charactersUsing,
  groupByPromotion,
  newUnitType,
  normalizeUnitType,
  parseUnitTypes,
  rootIdOf,
  promotionPathLabel,
  serializeUnitTypes,
  unitTypeTrees,
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

  it('줄 때 전열/후열 배수는 병종 데이터에 들어 있고(궁병: 전열 0.8), 특성은 쓰지 않는다', () => {
    expect(gameData.unitTypes.archer.damageDealtByRow).toEqual({ front: 0.8, back: 1 });
    for (const u of list) expect(u.traitIds, `${u.id} 특성`).toEqual([]);
    expect(errors([{ ...archer(), damageDealtByRow: { front: 0, back: 1 } }]).some((i) => /주는 피해 배수/.test(i.message))).toBe(true);
  });

  it('값이 빠져도 기본값으로 채워 일관된 모양이 된다', () => {
    const u = normalizeUnitType({ ...archer(), baseAp: undefined, troopScale: undefined, statMods: undefined, damageTakenByType: undefined });
    expect(u).toMatchObject({ baseAp: 0, troopScale: 1, damageTakenByType: { physical: 1, magic: 1 }, statMods: { attack: 0, defense: 0, intellect: 0, speed: 0, action: 0 } });
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
    // 장비는 승급 트리의 최종 병종(철벽대), 허저는 방패병(0차)이다
    expect(charactersUsing(gameData.characters.zhangFei.unitType, Object.values(gameData.characters))).toContain('장비');
    expect(charactersUsing('shield', Object.values(gameData.characters))).toContain('허저');
    // 아무도 쓰지 않는 병종이 있으면 빈 목록 (장수 구성은 Lab에서 바뀌므로 지금 데이터에서 찾는다)
    const chars = Object.values(gameData.characters);
    const unused = Object.keys(gameData.unitTypes).find((id) => !chars.some((c) => c.unitType === id));
    if (unused) expect(charactersUsing(unused, chars)).toEqual([]);
  });
});

describe('병종 요약과 변경 비교', () => {
  it('레벨 15 기준 최대 병력과 배치 가능한 열을 보여 준다', () => {
    const base = normalizeUnitType(gameData.unitTypes.cavalry);
    // 레벨 1 병력과 레벨당 증가는 Lab에서 바뀔 수 있으므로 현재 값에서 계산한다
    // 병력 배율은 레벨당 증가에만 곱한다
    const lv15 = (scale: number) => Math.round(defaultBalance.troops.base + defaultBalance.troops.perLevel * scale * 14);
    expect(unitTypeSummary({ ...base, troopScale: 0.8, allowedRows: ['front', 'back'] }, defaultBalance)).toEqual({ troops: lv15(0.8), rows: '전열/후열' });
    expect(unitTypeSummary({ ...base, troopScale: 1, allowedRows: ['back'] }, defaultBalance)).toEqual({ troops: lv15(1), rows: '후열' });
  });

  it('저장본과 비교해 수정/추가/삭제를 알려 준다', () => {
    expect(areUnitTypesDirty(list, list)).toBe(false);
    const edited = list.map((u) => (u.id === 'cavalry' ? { ...u, troopScale: (u.troopScale ?? 1) + 0.1 } : u)).filter((u) => u.id !== 'geomancer');
    const added = [...edited, newUnitType(edited)];
    const diff = changedUnitTypeIds(list, added);
    expect(diff.changed).toEqual(['cavalry']);
    expect(diff.removed).toEqual(['geomancer']);
    expect(diff.added).toHaveLength(1);
    expect(areUnitTypesDirty(list, added)).toBe(true);
  });
});

describe('승급 트리와 스탯 보정 (statMods)', () => {
  const infantry = normalizeUnitType(gameData.unitTypes.infantry);

  it('저장 형식에는 스탯 보정이 5개 스탯 모두 항상 들어가고 승급 보너스 칸은 없다', () => {
    const n = normalizeUnitType({ ...infantry, statMods: { attack: 1 } });
    expect(n.statMods).toEqual({ attack: 1, defense: 0, intellect: 0, speed: 0, action: 0 });
    expect(Object.keys(n)).not.toContain('promotionBonus');
  });

  it('카드에서 한 칸을 고쳐도 다른 칸은 그대로다', () => {
    const base = normalizeUnitType({ ...infantry, statMods: { attack: 2, speed: 1 } });
    const next = applyUnitTypePatch(base, { statMods: { attack: 3 } });
    expect(next.statMods).toMatchObject({ attack: 3, speed: 1 });
  });

  it('없는 승급 대상은 오류다', () => {
    const ghost = normalizeUnitType({ ...infantry, promotesTo: ['nope'] });
    expect(validateUnitTypes([ghost], gameData).some((i) => i.level === 'error' && i.message.includes('승급 대상'))).toBe(true);
  });

  it('승급 차수별로 묶는다: 뿌리는 0차, 승급 대상은 한 차수씩 늘어난다', () => {
    const mk = (id: string, promotesTo: string[]) => normalizeUnitType({ ...infantry, id, name: id, promotesTo });
    const list = [mk('base', ['a', 'b']), mk('a', ['a2']), mk('b', ['b2']), mk('a2', []), mk('b2', []), mk('solo', [])];
    const groups = groupByPromotion(list);
    expect(groups.map((g) => g.depth)).toEqual([0, 1, 2]);
    expect(groups[0].items.map((u) => u.id)).toEqual(['base', 'solo']);
    expect(groups[1].items.map((u) => u.id)).toEqual(['a', 'b']);
    expect(groups[2].items.map((u) => u.id)).toEqual(['a2', 'b2']);
    expect(groups[1].label).toBe('1차 승급');
    expect(promotionPathLabel(list, 'b2')).toBe('base → b → b2');
  });

  it('지금 데이터: 승급 대상은 모두 있는 병종이다', () => {
    for (const u of Object.values(gameData.unitTypes)) {
      for (const id of u.promotesTo) expect(gameData.unitTypes[id]).toBeDefined();
    }
  });
});

describe('승급 트리 목록 (unitTypeTrees)', () => {
  const mk = (id: string, promotesTo: string[]) => normalizeUnitType({ ...normalizeUnitType(gameData.unitTypes.infantry), id, name: id, promotesTo });

  it('승급 대상이 아닌 병종이 뿌리이고 승급 대상이 자식으로 이어진다', () => {
    const list = [mk('base', ['a', 'b']), mk('a', ['a2']), mk('b', []), mk('a2', []), mk('solo', [])];
    const trees = unitTypeTrees(list);
    expect(trees.map((t) => t.unit.id)).toEqual(['base', 'solo']);
    expect(trees[0].children.map((c) => c.unit.id)).toEqual(['a', 'b']);
    expect(trees[0].children[0].children.map((c) => c.unit.id)).toEqual(['a2']);
    expect(rootIdOf(list, 'a2')).toBe('base');
    expect(rootIdOf(list, 'solo')).toBe('solo');
  });

  it('순환이 있어도 모든 병종이 어느 트리엔가 들어가고 멈춘다', () => {
    const list = [mk('x', ['y']), mk('y', ['x'])];
    const trees = unitTypeTrees(list);
    const ids = new Set<string>();
    const walk = (n: (typeof trees)[number]) => { ids.add(n.unit.id); n.children.forEach(walk); };
    trees.forEach(walk);
    expect([...ids].sort()).toEqual(['x', 'y']);
  });

  it('지금 데이터: 일곱 계열은 승급 트리(뿌리 1 + 1차 2 + 2차 2)이고, 군주 계열이 따로 있다', () => {
    const trees = unitTypeTrees(Object.values(gameData.unitTypes));
    const size = (n: (typeof trees)[number]): number => 1 + n.children.reduce((s, c) => s + size(c), 0);
    expect(trees.map((t) => t.unit.id).sort()).toEqual(['archer', 'cavalry', 'geomancer', 'infantry', 'lord', 'shield', 'strategist', 'taoist']);
    // 군주 계열의 승급 갈래는 아직 정하지 않았다 (설계 문서 01)
    for (const t of trees) if (t.unit.id !== 'lord') expect(size(t), t.unit.id).toBe(5);
  });
});

describe('반격 배율 (counterPower)', () => {
  const infantry = normalizeUnitType(gameData.unitTypes.infantry);

  it('저장 형식에는 반격 배율이 항상 들어간다 (반격함 바로 다음, 없으면 1)', () => {
    const n = normalizeUnitType({ ...infantry, counterPower: undefined });
    expect(n.counterPower).toBe(1);
    const keys = Object.keys(n);
    expect(keys.indexOf('counterPower')).toBe(keys.indexOf('canCounter') + 1);
  });

  it('음수는 오류다', () => {
    const bad = normalizeUnitType({ ...infantry, counterPower: -1 });
    expect(validateUnitTypes([bad], gameData).some((i) => i.level === 'error' && i.message.includes('반격 배율'))).toBe(true);
  });

  it('지금 데이터: 근위대는 반격이 센 병종이다 (반격 배율 > 1)', () => {
    expect(gameData.unitTypes['royal-guard'].counterPower).toBeGreaterThan(1);
  });
});

describe('가드 규칙 값 (scope, interceptsMagic, keepOnAttack)', () => {
  const shield = normalizeUnitType(gameData.unitTypes.shield);

  it('저장 형식에는 가드 규칙 값이 항상 들어간다 (생략하면 같은 열, 도술 못 막음, 공격하면 풀림)', () => {
    const n = normalizeUnitType({ ...shield, guard: { start: 50, gain: 0, decay: 40 } });
    expect(n.guard).toMatchObject({ scope: 'row', interceptsMagic: false, keepOnAttack: false });
  });

  it('값을 정하면 그대로 저장된다', () => {
    const n = normalizeUnitType({ ...shield, guard: { ...shield.guard!, scope: 'all', interceptsMagic: true, keepOnAttack: true } });
    expect(n.guard).toMatchObject({ scope: 'all', interceptsMagic: true, keepOnAttack: true });
  });

  it('지금 데이터: 호위병은 전체 가드, 귀갑병은 전체 가드 + 도술 방어, 철벽대는 가드 유지 공격', () => {
    const U = gameData.unitTypes;
    expect(U.escort.guard?.scope).toBe('all');
    expect(U['armored-guard'].guard).toMatchObject({ scope: 'all', interceptsMagic: true });
    expect(U['iron-wall'].guard?.keepOnAttack).toBe(true);
    // 방패병과 중방패병은 보통 가드다
    expect(U.shield.guard?.scope ?? 'row').toBe('row');
    expect(U['heavy-shield'].guard?.keepOnAttack ?? false).toBe(false);
  });
});
