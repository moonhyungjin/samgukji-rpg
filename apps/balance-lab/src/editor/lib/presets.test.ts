import { describe, expect, it } from 'vitest';
import { defaultBalance, gameData, presetLabels, presetList, presets } from '@samgukji/game-data';
import type { PresetDef } from '@samgukji/game-data';
import {
  arePresetsDirty,
  changedPresetIds,
  duplicatePreset,
  lineupFromSlots,
  newPreset,
  parsePresets,
  presetMap,
  serializePresets,
  setSlot,
  slotsFromLineup,
  summarizeLineup,
  validatePresets,
} from './presets';

const list = presetList as PresetDef[];
const check = (l: PresetDef[]) => validatePresets(l, gameData);
const errors = (l: PresetDef[]) => check(l).filter((i) => i.level === 'error');

describe('기본 편성 데이터 (presets.json)', () => {
  it('기본 편성은 모두 검증을 통과한다 (오류 없음)', () => {
    expect(errors(list)).toEqual([]);
  });

  it('presets와 presetLabels는 같은 id를 가진다', () => {
    expect(Object.keys(presets)).toEqual(list.map((p) => p.id));
    expect(Object.keys(presetLabels)).toEqual(list.map((p) => p.id));
    expect(presetLabels.shuStart).toBe('촉 초반(유관장)');
  });

  it('직렬화 → 파싱하면 같은 목록이 된다', () => {
    const text = serializePresets(list);
    expect(serializePresets(parsePresets(text))).toBe(text);
    expect(parsePresets(text)).toEqual(JSON.parse(text));
  });

  it('잘못된 JSON은 읽을 수 있는 오류를 던진다', () => {
    expect(() => parsePresets('[')).toThrow(/JSON/);
    expect(() => parsePresets('{}')).toThrow(/배열/);
    expect(() => parsePresets('[{"id":"a"}]')).toThrow(/1번째/);
  });
});

describe('편성 칸 편집', () => {
  it('편성 ↔ 칸 변환은 열마다 앞에서부터 채운다', () => {
    const slots = slotsFromLineup(presets.yellowNormal); // 전열 방패병, 보병 / 후열 궁병
    expect(slots.map((s) => s?.characterId ?? null)).toEqual(['ytShieldA', 'ytInfantryA', null, 'ytArcherA', null, null]);
    expect(lineupFromSlots(slots)).toEqual(presets.yellowNormal);
  });

  it('칸을 고르면 그 열에 들어가고, 비우면 빠진다', () => {
    const base = newPreset([]);
    const one = setSlot(base, 0, 'zhangFei');
    expect(one.lineup).toEqual([{ characterId: 'zhangFei', row: 'front' }]);
    const two = setSlot(one, 4, 'huangZhong');
    expect(two.lineup).toEqual([
      { characterId: 'zhangFei', row: 'front' },
      { characterId: 'huangZhong', row: 'back' },
    ]);
    expect(setSlot(two, 0, '').lineup).toEqual([{ characterId: 'huangZhong', row: 'back' }]);
  });

  it('새 편성과 복제는 겹치지 않는 id를 받는다', () => {
    const a = newPreset(list);
    const b = newPreset([...list, a]);
    expect(new Set([...list.map((p) => p.id), a.id, b.id]).size).toBe(list.length + 2);
    const copy = duplicatePreset(list, list[0]);
    expect(copy.lineup).toEqual(list[0].lineup);
    expect(copy.label).toBe(`${list[0].label} 복사`);
    expect(list.some((p) => p.id === copy.id)).toBe(false);
  });
});

describe('편성 검사', () => {
  const ok = (): PresetDef => ({ id: 'mine', label: '내 편성', lineup: [{ characterId: 'zhangFei', row: 'front' }] });

  it('id 중복, 형식 오류, 이름 없음, 빈 편성을 오류로 잡는다', () => {
    expect(errors([...list, { ...ok(), id: 'shu' }]).some((i) => /겹칩니다/.test(i.message))).toBe(true);
    expect(errors([...list, { ...ok(), id: '1bad' }]).some((i) => /id는/.test(i.message))).toBe(true);
    expect(errors([...list, { ...ok(), label: ' ' }]).some((i) => /이름이 비어/.test(i.message))).toBe(true);
    expect(errors([...list, { ...ok(), lineup: [] }]).some((i) => /하나도 없습니다/.test(i.message))).toBe(true);
  });

  it('없는 장수, 둘 수 없는 열, 열당 3군단 초과, 6군단 초과를 오류로 잡는다', () => {
    const base = list;
    expect(errors([...base, { ...ok(), lineup: [{ characterId: 'nobody', row: 'front' }] }]).some((i) => /없는 장수/.test(i.message))).toBe(true);
    // 후열 전용 병종은 전열에 둘 수 없다 (시험용 데이터: 책사를 후열 전용으로 둔다)
    const backOnly = { ...gameData, unitTypes: { ...gameData.unitTypes, strategist: { ...gameData.unitTypes.strategist, allowedRows: ['back' as const] } } };
    expect(validatePresets([...base, { ...ok(), lineup: [{ characterId: 'zhugeLiang', row: 'front' }] }], backOnly).some((i) => /전열에 둘 수 없습니다/.test(i.message))).toBe(true);
    const four = ['zhangFei', 'guanYu', 'zhaoYun', 'weiYan'].map((characterId) => ({ characterId, row: 'front' as const }));
    expect(errors([...base, { ...ok(), lineup: four }]).some((i) => /전열은 3군단까지/.test(i.message))).toBe(true);
    const seven = [...four.slice(0, 3), ...['huangZhong', 'xiahouYuan', 'zhugeLiang', 'pangTong'].map((characterId) => ({ characterId, row: 'back' as const }))];
    expect(errors([...base, { ...ok(), lineup: seven }]).some((i) => /6개까지|후열은 3군단까지/.test(i.message))).toBe(true);
  });

  it('사거리 1 병종이 후열에 있으면 경고만 한다', () => {
    const issues = check([...list, { ...ok(), lineup: [{ characterId: 'zhangFei', row: 'front' }, { characterId: 'weiYan', row: 'back' }] }]);
    expect(issues.some((i) => i.level === 'warning' && /후열에서는 공격할 수 없습니다/.test(i.message))).toBe(true);
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('shu와 wei가 없으면 오류다 (기본 대결용)', () => {
    expect(errors(list.filter((p) => p.id !== 'wei')).some((i) => /"wei"/.test(i.message))).toBe(true);
  });

  it('장수 목록이 바뀌면 그 기준으로 검사한다 (삭제한 장수는 오류)', () => {
    const withoutGuan = { ...gameData, characters: Object.fromEntries(Object.entries(gameData.characters).filter(([id]) => id !== 'guanYu')) };
    expect(validatePresets(list, withoutGuan).some((i) => i.level === 'error' && i.message.includes('없는 장수') && i.message.includes('guanYu'))).toBe(true);
  });
});

describe('편성 요약과 변경 비교', () => {
  it('구성과 전체 병력을 계산한다', () => {
    const s = summarizeLineup(presets.shuStart, gameData, defaultBalance);
    expect(s.composition).toBe('방패병 · 보병 · 기병 / -');
    expect(s.units).toBe(3);
    expect(s.troops).toBe(1000 + 1000 + 800);
    expect(summarizeLineup(presets.yellowHard, gameData, defaultBalance).composition).toBe('방패병 · 보병 · 보병 / 궁병');
  });

  it('저장본과 비교해 수정/추가/삭제를 알려 준다', () => {
    expect(arePresetsDirty(list, list)).toBe(false);
    const edited = list.map((p) => (p.id === 'shu' ? setSlot(p, 0, 'weiYan') : p)).filter((p) => p.id !== 'yellow');
    const added = [...edited, newPreset(edited)];
    const diff = changedPresetIds(list, added);
    expect(diff.changed).toEqual(['shu']);
    expect(diff.removed).toEqual(['yellow']);
    expect(diff.added).toHaveLength(1);
    expect(arePresetsDirty(list, added)).toBe(true);
  });

  it('presetMap은 id → 편성 맵이다 (장수 삭제 보호에 쓴다)', () => {
    expect(presetMap(list).shu).toEqual(presets.shu);
  });
});
