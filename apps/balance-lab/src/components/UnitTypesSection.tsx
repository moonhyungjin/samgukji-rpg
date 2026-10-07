import { useMemo } from 'react';
import type { CharacterData, UnitTypeData } from '@samgukji/battle-engine';
import { useLab } from '../lab/LabContext';
import { UnitTypeEditor } from '../editor/components/UnitTypeEditor';
import { applyUnitTypePatch, changedUnitTypeIds, newUnitType, normalizeUnitType, validateUnitTypes } from '../editor/lib/unitTypes';
import { withUnitTypes } from '../lib/editorState';

/** 병종 카드: 사거리, 병력 배율, 기본 AP, 스탯 보정, 받는 피해, 반격, 스킬/특성, 가드를 고친다. */
export function UnitTypesSection() {
  const { state, update, baseline } = useLab();
  const list = useMemo(() => Object.values(state.data.unitTypes) as UnitTypeData[], [state.data.unitTypes]);
  const saved = useMemo(() => Object.values(baseline.data.unitTypes) as UnitTypeData[], [baseline.data.unitTypes]);
  const issues = useMemo(() => validateUnitTypes(list, state.data), [list, state.data]);
  const diff = useMemo(() => changedUnitTypeIds(saved, list), [saved, list]);
  const savedIds = useMemo(() => new Set(saved.map((u) => u.id)), [saved]);
  const changed = useMemo(() => new Set(diff.changed), [diff]);

  const setList = (fn: (prev: UnitTypeData[]) => UnitTypeData[]) => update((s) => withUnitTypes(s, fn(Object.values(s.data.unitTypes) as UnitTypeData[])));

  return (
    <section className="panel ed" data-section="unit-types">
      <h3>병종</h3>
      <div className="filters">
        <span className="badge">{list.length}개</span>
        <span className="spacer" />
        <button type="button" onClick={() => setList((prev) => [...prev, newUnitType(prev)])}>
          + 새 병종
        </button>
      </div>

      <UnitTypeEditor
        unitTypes={list}
        savedIds={savedIds}
        changed={changed}
        issues={issues}
        characters={state.data.characters as Record<string, CharacterData>}
        data={state.data}
        balance={state.balance}
        onEdit={(id, patch) => setList((prev) => prev.map((u) => (u.id === id ? applyUnitTypePatch(u, patch as Record<string, unknown>) : u)))}
        onDuplicate={(id) => {
          const source = list.find((u) => u.id === id);
          if (source) setList((prev) => [...prev, newUnitType(prev, source)]);
        }}
        onRevert={(id) => {
          const original = saved.find((u) => u.id === id);
          if (original) setList((prev) => prev.map((u) => (u.id === id ? normalizeUnitType(original) : u)));
        }}
        onRemove={(id) => setList((prev) => prev.filter((u) => u.id !== id))}
      />

      <p className="note">
        병종은 장수 스탯에 더해지는 보정, 병력 배율, AP, 사거리, 받는 피해, 반격, 스킬, 가드를 정합니다. 위의 "파일에 저장"을 누르면 <code>packages/game-data/data/unitTypes.json</code>이 바뀝니다.
        병종을 쓰는 장수가 있으면 삭제할 수 없습니다. 스킬 계수와 특성 배율은 아래 표에서 고칩니다.
      </p>
    </section>
  );
}
