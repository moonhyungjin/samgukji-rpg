import type { GameData, SkillData, UnitTypeData } from '@samgukji/battle-engine';

/** 병종이 쓰는 스킬 id들: 일반공격 + 추가 스킬 */
export function skillIdsOf(unitType: UnitTypeData): string[] {
  return [unitType.basicSkillId, ...unitType.extraSkillIds];
}

/** 이 스킬을 쓰는 병종들 */
export function skillUsers(unitTypes: Record<string, UnitTypeData>, skillId: string): UnitTypeData[] {
  return Object.values(unitTypes).filter((u) => skillIdsOf(u).includes(skillId));
}

function freshSkillId(skills: Record<string, SkillData>, typeId: string, skillId: string): string {
  const base = `${typeId}-${skillId}`;
  let id = base;
  for (let n = 2; skills[id]; n++) id = `${base}-${n}`;
  return id;
}

/**
 * 병종이 쓰는 스킬 하나를 그 병종 전용 복사본으로 바꾼다. 같이 쓰던 다른 병종은 원래 스킬을 그대로 쓴다.
 * 새 스킬 id는 "<병종 id>-<원래 스킬 id>"이다. 원래 스킬이 이 병종 혼자 쓰던 것이면 아무것도 바꾸지 않는다.
 */
export function cloneSkillFor(data: GameData, typeId: string, skillId: string): { skills: Record<string, SkillData>; unitTypes: Record<string, UnitTypeData>; newId: string | null } {
  const unit = data.unitTypes[typeId];
  const skill = data.skills[skillId];
  if (!unit || !skill || !skillIdsOf(unit).includes(skillId) || skillUsers(data.unitTypes, skillId).length < 2) {
    return { skills: data.skills, unitTypes: data.unitTypes, newId: null };
  }
  const newId = freshSkillId(data.skills, typeId, skillId);
  const swap = (id: string) => (id === skillId ? newId : id);
  const nextUnit: UnitTypeData = { ...unit, basicSkillId: swap(unit.basicSkillId), extraSkillIds: unit.extraSkillIds.map(swap) };
  return {
    skills: { ...data.skills, [newId]: { ...skill, id: newId } },
    unitTypes: { ...data.unitTypes, [typeId]: nextUnit },
    newId,
  };
}

/** 주어진 병종들이 각자 자기 스킬을 갖게 한다 (여럿이 같이 쓰는 스킬만 복제한다). */
export function ownSkillsFor(data: GameData, typeIds: readonly string[]): { skills: Record<string, SkillData>; unitTypes: Record<string, UnitTypeData>; cloned: number } {
  let current = data;
  let cloned = 0;
  for (const typeId of typeIds) {
    const unit = current.unitTypes[typeId];
    if (!unit) continue;
    for (const skillId of skillIdsOf(unit)) {
      const r = cloneSkillFor(current, typeId, skillId);
      if (r.newId) {
        current = { ...current, skills: r.skills, unitTypes: r.unitTypes };
        cloned++;
      }
    }
  }
  return { skills: current.skills, unitTypes: current.unitTypes, cloned };
}
