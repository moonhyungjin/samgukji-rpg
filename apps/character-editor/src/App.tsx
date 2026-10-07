import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CharacterData, CharacterRank } from '@samgukji/battle-engine';
import { defaultBalance, gameData, presets } from '@samgukji/game-data';
import { CharacterTable } from './components/CharacterTable';
import { RANK_LABEL, changedIds, duplicateCharacter, isDirty, newCharacter, parseCharacters, serialize, validate } from './lib/editor';

const bundled = Object.values(gameData.characters);

interface Notice {
  kind: 'ok' | 'error';
  text: string;
}

/** 장수 편집기: 표에서 스탯을 고치고 저장하면 characters.json이 바뀌고 전투 테스트기에 반영된다. */
export default function App() {
  const [saved, setSaved] = useState<CharacterData[]>(bundled);
  const [list, setList] = useState<CharacterData[]>(bundled);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [rank, setRank] = useState<CharacterRank | 'all'>('all');
  const [unitType, setUnitType] = useState('all');
  const fileInput = useRef<HTMLInputElement>(null);

  // 시작할 때 디스크의 최신 값을 읽는다 (개발 서버가 아니면 번들된 값을 쓴다).
  useEffect(() => {
    let cancelled = false;
    fetch('/api/characters', { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => {
        if (cancelled) return;
        const fresh = parseCharacters(text);
        setSaved(fresh);
        setList(fresh);
      })
      .catch(() => {
        /* 번들된 값으로 계속한다. 저장은 개발 서버(npm run chars)에서만 된다. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const issues = useMemo(() => validate(list, gameData, defaultBalance), [list]);
  const errors = issues.filter((i) => i.level === 'error');
  const diff = useMemo(() => changedIds(saved, list), [saved, list]);
  const dirty = useMemo(() => isDirty(saved, list), [saved, list]);
  const savedIds = useMemo(() => new Set(saved.map((c) => c.id)), [saved]);
  const changed = useMemo(() => new Set(diff.changed), [diff]);

  const visibleIds = useMemo(() => {
    const q = search.trim().toLowerCase();
    return new Set(
      list
        .filter((c) => (rank === 'all' || (c.rank ?? 'elite') === rank) && (unitType === 'all' || c.unitType === unitType))
        .filter((c) => !q || c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
        .map((c) => c.id),
    );
  }, [list, search, rank, unitType]);

  const edit = useCallback((id: string, patch: Partial<Omit<CharacterData, 'stats'>> & { stats?: Partial<CharacterData['stats']> }) => {
    setNotice(null);
    setList((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch, stats: { ...c.stats, ...patch.stats } } : c)));
  }, []);

  const add = () => {
    setNotice(null);
    setList((prev) => [...prev, newCharacter(prev, 'infantry')]);
  };

  const save = async () => {
    if (errors.length > 0) {
      setNotice({ kind: 'error', text: `오류 ${errors.length}건을 고쳐야 저장할 수 있습니다.` });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/characters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: serialize(list) });
      const result = (await response.json().catch(() => ({}))) as { error?: string; count?: number };
      if (!response.ok) throw new Error(result.error ?? `저장 실패 (${response.status})`);
      setSaved(list);
      setNotice({ kind: 'ok', text: `${result.count ?? list.length}명을 저장했습니다. 시뮬레이터/게임은 바로, Balance Lab은 새로고침하면 반영됩니다.` });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      setNotice({ kind: 'error', text: `저장하지 못했습니다 (${reason}). 개발 서버(npm run chars)에서 열었는지 확인하거나 "내보내기"로 파일을 받아 packages/game-data/data/characters.json에 덮어쓰세요.` });
    } finally {
      setSaving(false);
    }
  };

  const exportFile = () => {
    const url = URL.createObjectURL(new Blob([serialize(list)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'characters.json';
    a.click();
    URL.revokeObjectURL(url);
    setNotice({ kind: 'ok', text: 'characters.json을 내보냈습니다.' });
  };

  const importFile = async (file: File) => {
    try {
      const next = parseCharacters(await file.text());
      setList(next);
      setNotice({ kind: 'ok', text: `${file.name}에서 ${next.length}명을 불러왔습니다. 저장하기를 눌러야 반영됩니다.` });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : String(error) });
    }
  };

  const unitTypeOptions = Object.values(gameData.unitTypes);
  const summary = [
    diff.changed.length ? `수정 ${diff.changed.length}` : '',
    diff.added.length ? `추가 ${diff.added.length}` : '',
    diff.removed.length ? `삭제 ${diff.removed.length}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="app">
      <header className="top">
        <h1>
          장수 편집기 <small>스탯을 고치고 저장하면 전투 테스트기(Balance Lab, 게임, 시뮬레이터)에 반영됩니다</small>
        </h1>
        <div className="bar">
          <button type="button" className="primary" disabled={!dirty || saving} onClick={save}>
            {saving ? '저장 중…' : '저장하기'}
          </button>
          <span className={dirty ? 'badge dirty' : 'badge clean'}>{dirty ? `저장 안 됨 (${summary})` : '저장된 상태'}</span>
          <button type="button" disabled={!dirty} onClick={() => setList(saved)}>
            전부 되돌리기
          </button>
          <button type="button" onClick={add}>
            + 새 장수
          </button>
          <span className="spacer" />
          <button type="button" onClick={exportFile}>
            내보내기
          </button>
          <button type="button" onClick={() => fileInput.current?.click()}>
            가져오기
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importFile(file);
              e.target.value = '';
            }}
          />
        </div>
        {notice && <div className={`message ${notice.kind}`}>{notice.text}</div>}
        {issues.length > 0 && (
          <ul className="issues">
            {issues.slice(0, 8).map((i, index) => (
              <li key={index} className={i.level}>
                {i.message}
              </li>
            ))}
            {issues.length > 8 && <li>… 외 {issues.length - 8}건</li>}
          </ul>
        )}
      </header>

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
          {unitTypeOptions.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <span className="badge">
          {visibleIds.size} / {list.length}명
        </span>
      </div>

      <CharacterTable
        list={list}
        visibleIds={visibleIds}
        savedIds={savedIds}
        changed={changed}
        issues={issues}
        data={gameData}
        balance={defaultBalance}
        presets={presets}
        onEdit={edit}
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
        노란 줄은 수정, 초록 줄은 새 장수, 빨간 줄은 오류입니다. 오른쪽의 회색 칸(실제 공/방/지/속, 총 AP, 병력, 1회 피해)은 병종 보정과 밸런스 수치까지 반영한 계산값이며
        직접 고치는 값이 아닙니다. 저장 위치는 <code>packages/game-data/data/characters.json</code>입니다. 병종·스킬·밸런스 수치는 Balance Lab에서 고칩니다.
      </p>
    </div>
  );
}
