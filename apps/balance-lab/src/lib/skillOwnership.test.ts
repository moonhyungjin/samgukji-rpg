import { describe, expect, it } from 'vitest';
import { gameData } from '@samgukji/game-data';
import type { GameData } from '@samgukji/battle-engine';
import { cloneSkillFor, ownSkillsFor, skillIdsOf, skillUsers } from './skillOwnership';
import { unitTypeTrees } from '../editor/lib/unitTypes';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const data = gameData as GameData;

/** 지금 데이터를 복사한다 (보병계 병종들이 보병의 "공격"을 같이 쓴다) */
function sharedData(): GameData {
  return clone(data);
}

describe('스킬 소유 (병종 전용 복제)', () => {
  it('지금 데이터: 스킬은 공용이라 여러 병종이 같이 쓰고, 쓰이지 않는 스킬은 없다', () => {
    const owners = new Map<string, string[]>();
    for (const u of Object.values(data.unitTypes)) for (const id of skillIdsOf(u)) owners.set(id, [...(owners.get(id) ?? []), u.id]);
    expect(owners.get('infantry-attack')!.length).toBeGreaterThan(1);
    for (const id of Object.keys(data.skills)) expect(owners.has(id), id).toBe(true);
    // 이름이 같은 스킬은 값이 달라도 같은 이름을 두 번 쓰지 않는다 (공격2가 두 개가 되지 않는다)
    const names = Object.values(data.skills).map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('같은 스킬을 쓰는 병종을 알려 준다', () => {
    const users = skillUsers(sharedData().unitTypes, 'infantry-attack').map((u) => u.id);
    expect(users).toEqual(expect.arrayContaining(['infantry', 'royal-guard', 'escort']));
    expect(skillIdsOf(data.unitTypes.infantry)).toContain('infantry-attack');
  });

  it('한 병종의 스킬을 전용 복사본으로 바꾸면 다른 병종은 그대로 쓴다', () => {
    const d = sharedData();
    const r = cloneSkillFor(d, 'royal-guard', 'infantry-attack');
    expect(r.newId).toBe('royal-guard-infantry-attack');
    expect(r.skills['royal-guard-infantry-attack']).toMatchObject({ id: 'royal-guard-infantry-attack', power: d.skills['infantry-attack'].power, kind: 'attack' });
    expect(r.unitTypes['royal-guard'].basicSkillId).toBe('royal-guard-infantry-attack');
    expect(r.unitTypes.infantry.basicSkillId).toBe('infantry-attack');
    expect(r.unitTypes['escort'].basicSkillId).toBe('infantry-attack');
    // 원본 데이터는 바뀌지 않는다
    expect(d.unitTypes['royal-guard'].basicSkillId).toBe('infantry-attack');
  });

  it('복사본의 값을 고쳐도 원래 스킬은 그대로다 (계수는 서로 독립)', () => {
    const d = sharedData();
    const r = cloneSkillFor(d, 'royal-guard', 'infantry-attack');
    r.skills['royal-guard-infantry-attack'].power = 99;
    expect(r.skills['infantry-attack'].power).toBe(d.skills['infantry-attack'].power);
  });

  it('이 병종 혼자 쓰는 스킬은 복제하지 않는다', () => {
    const only = cloneSkillFor(data, 'immortal', 'immortal-revive');
    expect(skillUsers(data.unitTypes, 'immortal-revive')).toHaveLength(1);
    expect(only.newId).toBeNull();
    expect(only.skills).toBe(data.skills);
  });

  it('이미 있는 id와 겹치면 번호를 붙인다', () => {
    const d = sharedData();
    d.skills['royal-guard-infantry-attack'] = { ...d.skills['infantry-attack'], id: 'royal-guard-infantry-attack' };
    expect(cloneSkillFor(d, 'royal-guard', 'infantry-attack').newId).toBe('royal-guard-infantry-attack-2');
  });

  it('ownSkillsFor: 한 계열의 병종들이 각자 스킬을 갖게 한다', () => {
    const d = sharedData();
    const tree = unitTypeTrees(Object.values(d.unitTypes)).find((t) => t.unit.id === 'infantry')!;
    const ids: string[] = [];
    const walk = (n: typeof tree) => { ids.push(n.unit.id); n.children.forEach(walk); };
    walk(tree);
    const r = ownSkillsFor(d, ids);
    expect(r.cloned).toBeGreaterThan(0);
    for (const id of ids) {
      for (const skillId of skillIdsOf(r.unitTypes[id])) {
        expect(skillUsers(r.unitTypes, skillId).map((u) => u.id), `${id}의 ${skillId}`).toEqual([id]);
      }
    }
    // 이미 각자 갖고 있으면 더 복제하지 않는다
    expect(ownSkillsFor({ ...d, skills: r.skills, unitTypes: r.unitTypes }, ids).cloned).toBe(0);
  });
});
