import { useMemo } from 'react';
import type { PresetDef } from '@samgukji/game-data';
import { useLab } from '../lab/LabContext';
import { PresetEditor } from '../editor/components/PresetEditor';
import { changedPresetIds, duplicatePreset, newPreset, setSlot, validatePresets } from '../editor/lib/presets';

/** 기본 편성: 카드마다 전열 3칸 + 후열 3칸을 장수 목록에서 골라 짠다. */
export function PresetsTab() {
  const { state, update, baseline } = useLab();
  const presets = state.presets;
  const issues = useMemo(() => validatePresets(presets, state.data), [presets, state.data]);
  const diff = useMemo(() => changedPresetIds(baseline.presets, presets), [baseline.presets, presets]);
  const savedIds = useMemo(() => new Set(baseline.presets.map((p) => p.id)), [baseline.presets]);
  const changed = useMemo(() => new Set(diff.changed), [diff]);

  const setPresets = (fn: (prev: PresetDef[]) => PresetDef[]) => update((s) => ({ ...s, presets: fn(s.presets) }));

  return (
    <section className="panel ed">
      <h3>기본 편성</h3>
      <div className="filters">
        <span className="badge">{presets.length}개</span>
        <span className="spacer" />
        <button type="button" onClick={() => setPresets((prev) => [...prev, newPreset(prev)])}>
          + 새 편성
        </button>
      </div>

      <PresetEditor
        presets={presets}
        savedIds={savedIds}
        changed={changed}
        issues={issues}
        characters={Object.values(state.data.characters)}
        data={state.data}
        balance={state.balance}
        onEdit={(id, patch) => setPresets((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))}
        onSetSlot={(id, index, characterId) => setPresets((prev) => prev.map((p) => (p.id === id ? setSlot(p, index, characterId) : p)))}
        onDuplicate={(id) => {
          const source = presets.find((p) => p.id === id);
          if (source) setPresets((prev) => [...prev, duplicatePreset(prev, source)]);
        }}
        onRevert={(id) => {
          const original = baseline.presets.find((p) => p.id === id);
          if (original) setPresets((prev) => prev.map((p) => (p.id === id ? original : p)));
        }}
        onRemove={(id) => setPresets((prev) => prev.filter((p) => p.id !== id))}
      />

      <p className="note">
        기본 편성은 "시뮬레이션" 탭의 편성 버튼, 게임 설정 화면, 시뮬레이터(<code>npm run sim -- --team-a shu --team-b wei</code>)에서 쓰입니다. 칸 순서: 전열 3칸, 후열 3칸. 사거리 1 병종을 후열에 두면 경고가 뜹니다.
        위의 "파일에 저장"을 누르면 <code>packages/game-data/data/presets.json</code>이 바뀝니다. <code>shu</code>와 <code>wei</code>는 기본 대결에 쓰여 지울 수 없습니다.
      </p>
    </section>
  );
}
