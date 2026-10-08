import { describe, expect, it } from 'vitest';
import { gameData } from '@samgukji/game-data';
import type { GameData } from '@samgukji/battle-engine';
import { cloneSkillFor, ownSkillsFor, skillIdsOf, skillUsers } from './skillOwnership';
import { unitTypeTrees } from '../editor/lib/unitTypes';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const data = gameData as GameData;

describe('스킬 소유 (병종 전용 복제)', () => {
  it('같은 스킬을 쓰는 병종을 알려 준다', () => {
    const users = skillUsers(data.unitTypes, 'infantry-attack').map((u) => u.id);
    expect(users).toContain('infantry');
    expect(users).toContain('royal-guard'); // 승급 병종은 부모의 스킬을 같이 쓴다
    expect(skillIdsOf(data.unitTypes.infantry)).toContain('infantry-attack');
  });

  it('한 병종의 스킬을 전용 복사본으로 바꾸면 다른 병종은 그대로 쓴다', () => {
    const r = cloneSkillFor(data, 'royal-guard', 'infantry-attack');
    expect(r.newId).toBe('royal-guard-infantry-attack');
    expect(r.skills['royal-guard-infantry-attack']).toMatchObject({ id: 'royal-guard-infantry-attack', power: data.skills['infantry-attack'].power, kind: 'attack' });
    expect(r.unitTypes['royal-guard'].basicSkillId).toBe('royal-guard-infantry-attack');
    expect(r.unitTypes.infantry.basicSkillId).toBe('infantry-attack');
    // 원본 데이터는 바뀌지 않는다
    expect(data.unitTypes['royal-guard'].basicSkillId).toBe('infantry-attack');
  });

  it('복사본의 값을 고쳐도 원래 스킬은 그대로다 (계수는 서로 독립)', () => {
    const r = cloneSkillFor(data, 'royal-guard', 'infantry-attack');
    r.skills['royal-guard-infantry-attack'].power = 99;
    expect(r.skills['infantry-attack'].power).toBe(data.skills['infantry-attack'].power);
  });

  it('이 병종 혼자 쓰는 스킬은 복제하지 않는다', () => {
    const d = clone(data);
    d.unitTypes.strategist.extraSkillIds = ['inspire'];
    const only = cloneSkillFor(d, 'strategist', 'inspire');
    expect(skillUsers(d.unitTypes, 'inspire')).toHaveLength(1);
    expect(only.newId).toBeNull();
    expect(only.skills).toBe(d.skills);
  });

  it('이미 있는 id와 겹치면 번호를 붙인다', () => {
    const d = clone(data);
    d.skills['royal-guard-infantry-attack'] = { ...d.skills['infantry-attack'], id: 'royal-guard-infantry-attack' };
    expect(cloneSkillFor(d, 'royal-guard', 'infantry-attack').newId).toBe('royal-guard-infantry-attack-2');
  });

  it('ownSkillsFor: 한 계열의 병종들이 각자 스킬을 갖게 한다', () => {
    const tree = unitTypeTrees(Object.values(data.unitTypes)).find((t) => t.unit.id === 'infantry')!;
    const ids: string[] = [];
    const walk = (n: typeof tree) => { ids.push(n.unit.id); n.children.forEach(walk); };
    walk(tree);
    const r = ownSkillsFor(data, ids);
    expect(r.cloned).toBeGreaterThan(0);
    for (const id of ids) {
      for (const skillId of skillIdsOf(r.unitTypes[id])) {
        expect(skillUsers(r.unitTypes, skillId).map((u) => u.id), `${id}의 ${skillId}`).toEqual([id]);
      }
    }
    // 이미 각자 갖고 있으면 더 복제하지 않는다
    expect(ownSkillsFor({ ...data, skills: r.skills, unitTypes: r.unitTypes }, ids).cloned).toBe(0);
  });
});
