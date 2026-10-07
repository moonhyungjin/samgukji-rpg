import { useMemo, useState } from 'react';
import type { CharacterData, CharacterRank } from '@samgukji/battle-engine';
import { useLab } from '../lab/LabContext';
import { CharacterTable } from '../editor/components/CharacterTable';
import { RANK_LABEL, changedIds, duplicateCharacter, newCharacter, validate } from '../editor/lib/editor';
import { presetMap } from '../editor/lib/presets';
import { withCharacters } from '../lib/editorState';

/** 장수 표: 이름, 병종, 등급, 레벨, 스탯 8종을 칸에서 바로 고치고, 병종 보정을 반영한 계산값을 본다. */
export function CharactersTab() {
  const { state, update, baseline } = useLab();
  const [search, setSearch] = useState('');
  const [rank, setRank] = useState<CharacterRank | 'all'>('all');
  const [unitType, setUnitType] = useState('all');

  const list = useMemo(() => Object.values(state.data.characters) as CharacterData[], [state.data.characters]);
  const saved = useMemo(() => Object.values(baseline.data.characters) as CharacterData[], [baseline.data.characters]);
  const issues = useMemo(() => validate(list, state.data, state.balance), [list, state.data, state.balance]);
  const diff = useMemo(() => changedIds(saved, list), [saved, list]);
  const savedIds = useMemo(() => new Set(saved.map((c) => c.id)), [saved]);
  const changed = useMemo(() => new Set(diff.changed), [diff]);
  const draftPresets = useMemo(() => presetMap(state.presets), [state.presets]);

  const visibleIds = useMemo(() => {
    const q = search.trim().toLowerCase();
    return new Set(
      list
        .filter((c) => (rank === 'all' || (c.rank ?? 'elite') === rank) && (unitType === 'all' || c.unitType === unitType))
        .filter((c) => !q || c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
        .map((c) => c.id),
    );
  }, [list, search, rank, unitType]);

  const setList = (fn: (prev: CharacterData[]) => CharacterData[]) => update((s) => withCharacters(s, fn(Object.values(s.data.characters) as CharacterData[])));

  return (
    <section className="panel ed">
      <h3>장수</h3>
      <div className="filters">
        <input type="search" placeholder="이름/id 검색" aria-label="검색" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label="등급 필터" value={rank} onChange={(e) => setRank(e.target.value as CharacterRank | 'all')}>
          <option value="all">등급 전체</option>
          {(Object.keys(RANK_LABEL) as CharacterRank[]).map((r) => (
            <option key={r} value={r}>
              {RANK_LABEL[r]}
            </option>
          ))}
        </select>
        <select aria-label="병종 필터" value={unitType} onChange={(e) => setUnitType(e.target.value)}>
          <option value="all">병종 전체</option>
          {Object.values(state.data.unitTypes).map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <span className="badge">
          {visibleIds.size} / {list.length}명
        </span>
        <span className="spacer" />
        <button type="button" onClick={() => setList((prev) => [...prev, newCharacter(prev, Object.keys(state.data.unitTypes)[0] ?? 'infantry')])}>
          + 새 장수
        </button>
      </div>

      <CharacterTable
        list={list}
        visibleIds={visibleIds}
        savedIds={savedIds}
        changed={changed}
        issues={issues}
        data={state.data}
        balance={state.balance}
        presets={draftPresets}
        onEdit={(id, patch) => setList((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch, stats: { ...c.stats, ...patch.stats } } : c)))}
        onDuplicate={(id) => {
          const source = list.find((c) => c.id === id);
          if (source) setList((prev) => [...prev, duplicateCharacter(prev, source)]);
        }}
        onRevert={(id) => {
          const original = saved.find((c) => c.id === id);
          if (original) setList((prev) => prev.map((c) => (c.id === id ? original : c)));
        }}
        onRemove={(id) => setList((prev) => prev.filter((c) => c.id !== id))}
      />

      <p className="note">
        노란 줄은 파일 값에서 수정한 장수, 초록 줄은 새 장수, 빨간 줄은 오류입니다. 오른쪽 회색 칸(실제 공/방/지/속, 총 AP, 병력, 1회 피해)은 병종 보정과 밸런스 수치까지 반영한 계산값이며 직접 고치는 값이
        아닙니다. 위의 "파일에 저장"을 누르면 <code>packages/game-data/data/characters.json</code>이 바뀌어 게임과 시뮬레이터에 반영됩니다. 기본 편성에서 쓰는 장수는 삭제할 수 없습니다.
      </p>
    </section>
  );
}
