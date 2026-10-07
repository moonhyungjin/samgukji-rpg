import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createDefaultState } from '../lab/defaults';
import { normalizeState } from '../lab/LabContext';
import { dataIssues } from './dataIssues';
import { FILE_NAMES, changedFileNames, filesSignature, filesSnapshot, findNonFinite, pruneSlots, serializeAll, serializeFile, syncWithFiles } from './fileSync';
import type { DataFiles } from './fileSync';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const dataFile = (name: string) => readFileSync(new URL(`../../../../packages/game-data/data/${name}.json`, import.meta.url), 'utf-8').replace(/\r\n/g, '\n');

describe('데이터 파일과 Lab', () => {
  it('프로젝트 데이터 파일은 Lab이 저장하는 모양(정규 형식) 그대로다', () => {
    const files = filesSnapshot();
    for (const name of FILE_NAMES) expect(serializeFile(name, files), `${name}.json`).toBe(dataFile(name));
  });

  it('처음 상태는 파일과 같아서 바뀐 파일이 없다', () => {
    const state = createDefaultState();
    const files = filesSnapshot();
    expect(changedFileNames(files, { data: state.data, balance: state.balance, presets: state.presets })).toEqual([]);
  });

  it('브라우저에 저장했다가 다시 읽어도(보정 포함) 파일과 같아 보인다 — 저장하지 않았는데 "저장 안 됨"이 뜨지 않는다', () => {
    const state = createDefaultState();
    const reloaded = normalizeState(JSON.parse(JSON.stringify(state)));
    const files = filesSnapshot();
    expect(changedFileNames(files, { data: reloaded.data, balance: reloaded.balance, presets: reloaded.presets })).toEqual([]);
  });

  it('값을 고친 파일만 "바뀐 파일"로 나온다', () => {
    const base = filesSnapshot();
    const edit = (fn: (f: DataFiles) => void) => {
      const f = clone(base);
      fn(f);
      return changedFileNames(base, f);
    };
    expect(edit((f) => (f.data.characters.guanYu.stats.attack += 1))).toEqual(['characters']);
    expect(edit((f) => (f.data.unitTypes.cavalry.troopScale = 0.9))).toEqual(['unitTypes']);
    expect(edit((f) => (f.data.skills['cavalry-charge'].power = 1.5))).toEqual(['skills']);
    expect(edit((f) => (f.data.traits['cavalry-tough'].multiplier = 0.8))).toEqual(['traits']);
    expect(edit((f) => (f.balance.damage.attackScale += 1))).toEqual(['balance']);
    expect(edit((f) => (f.presets[0].label = '새 이름'))).toEqual(['presets']);
    expect(edit((f) => {
      f.data.characters.guanYu.stats.attack += 1;
      f.balance.counter.rate = 0.4;
    })).toEqual(['characters', 'balance']);
  });

  it('serializeAll은 모든 파일을 문자열로 만든다', () => {
    const all = serializeAll(filesSnapshot());
    expect(Object.keys(all)).toEqual([...FILE_NAMES]);
    for (const text of Object.values(all)) expect(text.endsWith('\n')).toBe(true);
    expect(JSON.parse(all.balance).statCurve).toHaveLength(11);
  });

  it('지문은 어느 파일이든 값이 바뀌면 달라지고, 같은 내용이면 같다', () => {
    const base = filesSnapshot();
    const sig = filesSignature(base);
    expect(filesSignature(clone(base))).toBe(sig);
    const a = clone(base);
    a.data.characters.guanYu.stats.attack += 1;
    const b = clone(base);
    b.balance.damage.attackScale += 1;
    const c = clone(base);
    c.presets[0].lineup.pop();
    for (const changed of [a, b, c]) expect(filesSignature(changed)).not.toBe(sig);
  });
});

describe('파일이 바뀌었을 때 Lab 초안 처리 (syncWithFiles)', () => {
  it('파일이 그대로면 작업 중인 초안을 그대로 둔다', () => {
    const state = createDefaultState();
    state.data.characters.guanYu.stats.attack = 3;
    state.balance.damage.attackScale = 99;
    state.presets[0].label = '내 편성';
    const synced = syncWithFiles(state, filesSnapshot());
    expect(synced.data.characters.guanYu.stats.attack).toBe(3);
    expect(synced.balance.damage.attackScale).toBe(99);
    expect(synced.presets[0].label).toBe('내 편성');
  });

  it('파일이 바뀌었으면 초안을 버리고 파일 값으로 시작한다. 시뮬레이션 설정은 그대로 둔다', () => {
    const state = createDefaultState();
    state.filesSignature = 'old';
    state.data.characters.guanYu.stats.attack = 3;
    state.data.unitTypes.cavalry.troopScale = 0.1;
    state.balance.damage.attackScale = 99;
    state.sim.seed = 777;
    const files = filesSnapshot();
    const synced = syncWithFiles(state, files);
    expect(synced.data.characters.guanYu.stats.attack).toBe(files.data.characters.guanYu.stats.attack);
    expect(synced.data.unitTypes.cavalry.troopScale).toBe(files.data.unitTypes.cavalry.troopScale);
    expect(synced.balance.damage.attackScale).toBe(files.balance.damage.attackScale);
    expect(synced.filesSignature).toBe(filesSignature(files));
    expect(synced.sim.seed).toBe(777);
  });

  it('예전에 저장된 상태(기본 편성이 없는)는 파일 값으로 시작한다', () => {
    const state = createDefaultState() as Partial<ReturnType<typeof createDefaultState>>;
    delete state.presets;
    const synced = syncWithFiles(state as ReturnType<typeof createDefaultState>, filesSnapshot());
    expect(synced.presets.length).toBeGreaterThan(0);
  });

  it('없어진 장수가 편성에 있으면 그 칸을 비운다', () => {
    const files = filesSnapshot();
    const slots = [{ characterId: 'guanYu' }, { characterId: 'gone' }, null, null, null, null];
    expect(pruneSlots(slots, files.data.characters)).toEqual([{ characterId: 'guanYu' }, null, null, null, null, null]);
    const state = createDefaultState();
    state.filesSignature = 'old';
    state.teamA = slots;
    expect(syncWithFiles(state, files).teamA[1]).toBeNull();
  });
});

describe('저장 전 검사 (dataIssues)', () => {
  it('프로젝트 데이터는 오류가 없다', () => {
    expect(dataIssues(filesSnapshot()).errors).toEqual([]);
  });

  it('숫자가 아닌 값은 어느 항목인지 알려 주며 오류로 잡는다', () => {
    const files = filesSnapshot();
    files.balance.damage.attackScale = Number.NaN;
    files.data.skills['cavalry-charge'].power = Number.POSITIVE_INFINITY;
    const issues = dataIssues(files).numbers.map((i) => i.message);
    expect(issues.some((m) => m.includes('밸런스 수치') && m.includes('damage.attackScale'))).toBe(true);
    expect(issues.some((m) => m.includes('스킬') && m.includes('power'))).toBe(true);
  });

  it('장수, 병종, 편성의 오류가 합쳐져 나온다', () => {
    const files = filesSnapshot();
    files.data.characters.guanYu.stats.attack = 99;
    files.data.unitTypes.cavalry.range = 0;
    files.presets[0].lineup.push({ characterId: 'nobody', row: 'back' });
    const { errors } = dataIssues(files);
    expect(errors.some((i) => /범위/.test(i.message))).toBe(true);
    expect(errors.some((i) => /사거리/.test(i.message))).toBe(true);
    expect(errors.some((i) => /없는 장수/.test(i.message))).toBe(true);
  });

  it('findNonFinite는 중첩된 값에서도 위치를 찾는다', () => {
    expect(findNonFinite({ a: 1, b: [2, Number.NaN], c: { d: Number.POSITIVE_INFINITY } })).toEqual(['b[1]', 'c.d']);
    expect(findNonFinite({ a: 1 })).toEqual([]);
  });
});
