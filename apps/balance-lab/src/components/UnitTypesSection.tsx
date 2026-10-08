import { useEffect, useMemo, useState } from 'react';
import type { CharacterData, UnitTypeData } from '@samgukji/battle-engine';
import { useLab } from '../lab/LabContext';
import { useNav } from '../lab/NavContext';
import { UnitTypeEditor } from '../editor/components/UnitTypeEditor';
import { applyUnitTypePatch, changedUnitTypeIds, newUnitType, normalizeUnitType, rootIdOf, unitTypeTrees, validateUnitTypes } from '../editor/lib/unitTypes';
import { withUnitTypes } from '../lib/editorState';
import { cloneSkillFor, ownSkillsFor, skillIdsOf, skillUsers } from '../lib/skillOwnership';
import { SkillTable } from './SkillTable';
import { UnitTypeTree } from './UnitTypeTree';

// 탭을 옮겼다 돌아와도 보던 병종을 유지한다 (페이지를 새로 고치면 처음으로 돌아간다)
let rememberedUnitType = '';

/**
 * 병종: 계열(승급 트리)별 탭 + 트리 그림에서 병종을 골라 카드를 고친다.
 * 카드 안에 그 병종의 스킬이 들어 있고, 여러 병종이 같이 쓰는 스킬은 병종 전용으로 복제할 수 있다.
 */
export function UnitTypesSection() {
  const { state, update, baseline } = useLab();
  const { anchor } = useNav();
  const list = useMemo(() => Object.values(state.data.unitTypes) as UnitTypeData[], [state.data.unitTypes]);
  const saved = useMemo(() => Object.values(baseline.data.unitTypes) as UnitTypeData[], [baseline.data.unitTypes]);
  const issues = useMemo(() => validateUnitTypes(list, state.data), [list, state.data]);
  const diff = useMemo(() => changedUnitTypeIds(saved, list), [saved, list]);
  const savedIds = useMemo(() => new Set(saved.map((u) => u.id)), [saved]);
  const changed = useMemo(() => new Set(diff.changed), [diff]);
  const added = useMemo(() => new Set(diff.added), [diff]);
  const invalid = useMemo(() => new Set(issues.filter((i) => i.level === 'error' && i.id !== undefined).map((i) => i.id as string)), [issues]);

  const [selected, setSelectedState] = useState(() => (list.some((u) => u.id === rememberedUnitType) ? rememberedUnitType : (list[0]?.id ?? '')));
  const setSelected = (id: string) => {
    rememberedUnitType = id;
    setSelectedState(id);
  };
  const current = list.find((u) => u.id === selected) ?? list[0];
  const currentId = current?.id ?? '';

  // 다른 탭에서 "수정하러 가기"로 오면 가리킨 병종(또는 그 스킬을 쓰는 병종)을 선택한다
  useEffect(() => {
    if (!anchor) return;
    const unit = /data-unittype="([^"]+)"/.exec(anchor)?.[1];
    const skill = /data-skill="([^"]+)"/.exec(anchor)?.[1];
    if (unit && list.some((u) => u.id === unit)) setSelected(unit);
    else if (skill) {
      const users = skillUsers(state.data.unitTypes, skill);
      const pick = users.find((u) => u.id === currentId) ?? users[0];
      if (pick) setSelected(pick.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);

  const setList = (fn: (prev: UnitTypeData[]) => UnitTypeData[]) => update((s) => withUnitTypes(s, fn(Object.values(s.data.unitTypes) as UnitTypeData[])));

  const addUnit = () => {
    const created = newUnitType(list);
    setList((prev) => [...prev, created]);
    setSelected(created.id);
  };

  /** 선택한 병종의 승급 병종을 하나 만든다 (복사본, 차수 +1, 승급 보너스는 0에서 시작) */
  const addPromotion = () => {
    if (!current) return;
    const created: UnitTypeData = { ...newUnitType(list, current), name: `${current.name} 승급`, tier: current.tier + 1, promotesTo: [], promotionBonus: {} };
    setList((prev) => [...prev.map((u) => (u.id === current.id ? { ...u, promotesTo: [...u.promotesTo, created.id] } : u)), created]);
    setSelected(created.id);
  };

  /** 이 계열의 모든 병종이 각자 자기 스킬을 갖게 한다 */
  const ownTreeSkills = () => {
    if (!current) return;
    const tree = unitTypeTrees(list).find((t) => t.unit.id === rootIdOf(list, current.id));
    const ids: string[] = [];
    const walk = (n: NonNullable<typeof tree>) => {
      ids.push(n.unit.id);
      n.children.forEach(walk);
    };
    if (tree) walk(tree);
    update((s) => {
      const r = ownSkillsFor(s.data, ids);
      return r.cloned === 0 ? s : { ...s, data: { ...s.data, skills: r.skills, unitTypes: r.unitTypes } };
    });
  };

  const cloneOne = (typeId: string, skillId: string) =>
    update((s) => {
      const r = cloneSkillFor(s.data, typeId, skillId);
      return r.newId ? { ...s, data: { ...s.data, skills: r.skills, unitTypes: r.unitTypes } } : s;
    });

  const renderSkills = (u: UnitTypeData) => {
    const ids = skillIdsOf(u).filter((id) => state.data.skills[id]);
    const shared = ids.map((id) => ({ id, users: skillUsers(state.data.unitTypes, id) })).filter((x) => x.users.length > 1);
    return (
      <div className="usection-block" data-skills-of={u.id}>
        <div className="usection">스킬 (이 병종이 쓰는 것)</div>
        <SkillTable ids={ids} />
        {shared.map(({ id, users }) => (
          <p className="note shared" key={id}>
            ⚠ <strong>{state.data.skills[id].name}</strong>은(는) {users.map((x) => x.name).join(', ')} 병종이 같이 씁니다. 여기서 고치면 모두 바뀝니다.{' '}
            <button type="button" className="goto" onClick={() => cloneOne(u.id, id)} title="이 병종만 쓰는 복사본을 만듭니다 (새 스킬 id: 병종id-스킬id)">
              이 병종 전용으로 복제
            </button>
          </p>
        ))}
        {shared.length === 0 && <p className="note">이 병종만 쓰는 스킬입니다. 고치면 이 병종에만 적용됩니다.</p>}
      </div>
    );
  };

  return (
    <section className="panel ed" data-section="unit-types">
      <h3>병종</h3>
      <div className="filters">
        <span className="badge">{list.length}종</span>
        <span className="spacer" />
        <button type="button" onClick={addPromotion} disabled={!current} title="선택한 병종의 승급 대상으로 복사본을 만듭니다">
          + 승급 병종 추가
        </button>
        <button type="button" onClick={ownTreeSkills} disabled={!current} title="이 계열에서 여러 병종이 같이 쓰는 스킬을 병종마다 따로 갖게 합니다">
          이 계열 스킬을 병종마다 따로 갖게
        </button>
        <button type="button" onClick={addUnit}>
          + 새 병종
        </button>
      </div>

      <UnitTypeTree list={list} selectedId={currentId} onSelect={setSelected} changed={changed} added={added} invalid={invalid} />

      {current && (
        <UnitTypeEditor
          unitTypes={[current]}
          all={list}
          renderSkills={renderSkills}
          savedIds={savedIds}
          changed={changed}
          issues={issues}
          characters={state.data.characters as Record<string, CharacterData>}
          data={state.data}
          balance={state.balance}
          onEdit={(id, patch) => setList((prev) => prev.map((u) => (u.id === id ? applyUnitTypePatch(u, patch as Record<string, unknown>) : u)))}
          onDuplicate={(id) => {
            const source = list.find((u) => u.id === id);
            if (!source) return;
            const created = newUnitType(list, source);
            setList((prev) => [...prev, created]);
            setSelected(created.id);
          }}
          onRevert={(id) => {
            const original = saved.find((u) => u.id === id);
            if (original) setList((prev) => prev.map((u) => (u.id === id ? normalizeUnitType(original) : u)));
          }}
          onRemove={(id) => {
            const parent = list.find((u) => u.promotesTo.includes(id));
            setList((prev) => prev.filter((u) => u.id !== id).map((u) => (u.promotesTo.includes(id) ? { ...u, promotesTo: u.promotesTo.filter((x) => x !== id) } : u)));
            setSelected(parent?.id ?? list.find((u) => u.id !== id)?.id ?? '');
          }}
        />
      )}

      <p className="note">
        병종은 장수 스탯에 더해지는 보정, 병력 배율, AP, 사거리, 받는 피해, 반격, 스킬, 가드를 정합니다. 위의 탭은 승급 트리(계열)이고, 트리의 병종을 누르면 그 카드를 고칠 수 있습니다. 위의 "파일에 저장"을 누르면 <code>packages/game-data/data/unitTypes.json</code>(스킬은 <code>skills.json</code>)이 바뀝니다.
        병종을 쓰는 장수가 있으면 삭제할 수 없습니다. 특성은 지금 쓰지 않습니다.
      </p>
    </section>
  );
}
