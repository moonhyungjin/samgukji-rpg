import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CharacterData, CharacterRank, GameData } from '@samgukji/battle-engine';
import { defaultBalance, gameData, presetList } from '@samgukji/game-data';
import type { PresetDef } from '@samgukji/game-data';
import { CharacterTable } from './components/CharacterTable';
import { PresetEditor } from './components/PresetEditor';
import { RANK_LABEL, changedIds, duplicateCharacter, isDirty, newCharacter, parseCharacters, serialize, validate } from './lib/editor';
import {
  arePresetsDirty,
  changedPresetIds,
  duplicatePreset,
  newPreset,
  parsePresets,
  presetMap,
  serializePresets,
  setSlot,
  validatePresets,
} from './lib/presets';

const bundledCharacters = Object.values(gameData.characters);
const bundledPresets = presetList as PresetDef[];

type Tab = 'characters' | 'presets';

interface Notice {
  kind: 'ok' | 'error';
  text: string;
}

async function fetchText(url: string): Promise<string> {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(String(r.status));
  return r.text();
}

async function post(url: string, body: string): Promise<{ count?: number }> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  const result = (await response.json().catch(() => ({}))) as { error?: string; count?: number };
  if (!response.ok) throw new Error(result.error ?? `저장 실패 (${response.status})`);
  return result;
}

/** 장수 편집기: 표에서 스탯을 고치고 기본 편성을 짜서 저장하면 전투 테스트기에 반영된다. */
export default function App() {
  const [tab, setTab] = useState<Tab>('characters');
  const [saved, setSaved] = useState<CharacterData[]>(bundledCharacters);
  const [list, setList] = useState<CharacterData[]>(bundledCharacters);
  const [savedPresets, setSavedPresets] = useState<PresetDef[]>(bundledPresets);
  const [presets, setPresets] = useState<PresetDef[]>(bundledPresets);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [rank, setRank] = useState<CharacterRank | 'all'>('all');
  const [unitType, setUnitType] = useState('all');
  const fileInput = useRef<HTMLInputElement>(null);

  // 시작할 때 디스크의 최신 값을 읽는다 (개발 서버가 아니면 번들된 값을 쓴다).
  useEffect(() => {
    let cancelled = false;
    fetchText('/api/characters')
      .then((text) => {
        if (cancelled) return;
        const fresh = parseCharacters(text);
        setSaved(fresh);
        setList(fresh);
      })
      .catch(() => {
        /* 번들된 값으로 계속한다. 저장은 개발 서버(npm run chars)에서만 된다. */
      });
    fetchText('/api/presets')
      .then((text) => {
        if (cancelled) return;
        const fresh = parsePresets(text);
        setSavedPresets(fresh);
        setPresets(fresh);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // 편성 검사와 계산은 편집 중인 장수 목록을 기준으로 한다.
  const draftData: GameData = useMemo(() => ({ ...gameData, characters: Object.fromEntries(list.map((c) => [c.id, c])) }), [list]);
  const characterIssues = useMemo(() => validate(list, gameData, defaultBalance), [list]);
  const presetIssues = useMemo(() => validatePresets(presets, draftData), [presets, draftData]);
  const errors = [...characterIssues, ...presetIssues].filter((i) => i.level === 'error');

  const charDiff = useMemo(() => changedIds(saved, list), [saved, list]);
  const presetDiff = useMemo(() => changedPresetIds(savedPresets, presets), [savedPresets, presets]);
  const charsDirty = useMemo(() => isDirty(saved, list), [saved, list]);
  const presetsDirty = useMemo(() => arePresetsDirty(savedPresets, presets), [savedPresets, presets]);
  const dirty = charsDirty || presetsDirty;
  const savedIds = useMemo(() => new Set(saved.map((c) => c.id)), [saved]);
  const changed = useMemo(() => new Set(charDiff.changed), [charDiff]);
  const savedPresetIds = useMemo(() => new Set(savedPresets.map((p) => p.id)), [savedPresets]);
  const changedPresets = useMemo(() => new Set(presetDiff.changed), [presetDiff]);
  const draftPresetMap = useMemo(() => presetMap(presets), [presets]);

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

  const editPreset = useCallback((id: string, patch: Partial<Pick<PresetDef, 'id' | 'label'>>) => {
    setNotice(null);
    setPresets((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const save = async () => {
    if (errors.length > 0) {
      setNotice({ kind: 'error', text: `오류 ${errors.length}건을 고쳐야 저장할 수 있습니다.` });
      return;
    }
    setSaving(true);
    try {
      const done: string[] = [];
      if (charsDirty) {
        const r = await post('/api/characters', serialize(list));
        setSaved(list);
        done.push(`장수 ${r.count ?? list.length}명`);
      }
      if (presetsDirty) {
        const r = await post('/api/presets', serializePresets(presets));
        setSavedPresets(presets);
        done.push(`편성 ${r.count ?? presets.length}개`);
      }
      setNotice({ kind: 'ok', text: `${done.join(', ')}을(를) 저장했습니다. 시뮬레이터/게임은 바로, Balance Lab은 새로고침하면 반영됩니다.` });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      setNotice({
        kind: 'error',
        text: `저장하지 못했습니다 (${reason}). 개발 서버(npm run chars)에서 열었는지 확인하거나 "내보내기"로 파일을 받아 packages/game-data/data/에 덮어쓰세요.`,
      });
    } finally {
      setSaving(false);
    }
  };

  const download = (name: string, text: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    setNotice({ kind: 'ok', text: `${name}을(를) 내보냈습니다.` });
  };

  const exportFile = () => (tab === 'characters' ? download('characters.json', serialize(list)) : download('presets.json', serializePresets(presets)));

  const importFile = async (file: File) => {
    try {
      const text = await file.text();
      if (tab === 'characters') {
        const next = parseCharacters(text);
        setList(next);
        setNotice({ kind: 'ok', text: `${file.name}에서 장수 ${next.length}명을 불러왔습니다. 저장하기를 눌러야 반영됩니다.` });
      } else {
        const next = parsePresets(text);
        setPresets(next);
        setNotice({ kind: 'ok', text: `${file.name}에서 편성 ${next.length}개를 불러왔습니다. 저장하기를 눌러야 반영됩니다.` });
      }
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : String(error) });
    }
  };

  const unitTypeOptions = Object.values(gameData.unitTypes);
  const summary = [
    charDiff.changed.length ? `장수 수정 ${charDiff.changed.length}` : '',
    charDiff.added.length ? `장수 추가 ${charDiff.added.length}` : '',
    charDiff.removed.length ? `장수 삭제 ${charDiff.removed.length}` : '',
    presetDiff.changed.length ? `편성 수정 ${presetDiff.changed.length}` : '',
    presetDiff.added.length ? `편성 추가 ${presetDiff.added.length}` : '',
    presetDiff.removed.length ? `편성 삭제 ${presetDiff.removed.length}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const issues = [...characterIssues, ...presetIssues];

  return (
    <div className="app">
      <header className="top">
        <h1>
          장수 편집기 <small>장수 스탯과 기본 편성을 고치고 저장하면 전투 테스트기(Balance Lab, 게임, 시뮬레이터)에 반영됩니다</small>
        </h1>
        <div className="bar">
          <button type="button" className="primary" disabled={!dirty || saving} onClick={save}>
            {saving ? '저장 중…' : '저장하기'}
          </button>
          <span className={dirty ? 'badge dirty' : 'badge clean'}>{dirty ? `저장 안 됨 (${summary})` : '저장된 상태'}</span>
          <button
            type="button"
            disabled={!dirty}
            onClick={() => {
              setList(saved);
              setPresets(savedPresets);
            }}
          >
            전부 되돌리기
          </button>
          {tab === 'characters' ? (
            <button type="button" onClick={() => setList((prev) => [...prev, newCharacter(prev, 'infantry')])}>
              + 새 장수
            </button>
          ) : (
            <button type="button" onClick={() => setPresets((prev) => [...prev, newPreset(prev)])}>
              + 새 편성
            </button>
          )}
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
        <nav className="tabs">
          <button type="button" className={tab === 'characters' ? 'tab active' : 'tab'} onClick={() => setTab('characters')}>
            장수 ({list.length})
          </button>
          <button type="button" className={tab === 'presets' ? 'tab active' : 'tab'} onClick={() => setTab('presets')}>
            기본 편성 ({presets.length})
          </button>
        </nav>
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

      {tab === 'characters' ? (
        <>
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
            issues={characterIssues}
            data={gameData}
            balance={defaultBalance}
            presets={draftPresetMap}
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
            노란 줄은 수정, 초록 줄은 새 장수, 빨간 줄은 오류입니다. 오른쪽의 회색 칸(실제 공/방/지/속, 총 AP, 병력, 1회 피해)은 병종 보정과 밸런스 수치까지 반영한 계산값이며 직접 고치는 값이
            아닙니다. 저장 위치는 <code>packages/game-data/data/characters.json</code>입니다. 병종·스킬·밸런스 수치는 Balance Lab에서 고칩니다.
          </p>
        </>
      ) : (
        <>
          <PresetEditor
            presets={presets}
            savedIds={savedPresetIds}
            changed={changedPresets}
            issues={presetIssues}
            characters={list}
            data={draftData}
            balance={defaultBalance}
            onEdit={editPreset}
            onSetSlot={(id, index, characterId) => {
              setNotice(null);
              setPresets((prev) => prev.map((p) => (p.id === id ? setSlot(p, index, characterId) : p)));
            }}
            onDuplicate={(id) => {
              const source = presets.find((p) => p.id === id);
              if (source) setPresets((prev) => [...prev, duplicatePreset(prev, source)]);
            }}
            onRevert={(id) => {
              const original = savedPresets.find((p) => p.id === id);
              if (original) setPresets((prev) => prev.map((p) => (p.id === id ? original : p)));
            }}
            onRemove={(id) => setPresets((prev) => prev.filter((p) => p.id !== id))}
          />
          <p className="note">
            기본 편성은 Balance Lab의 편성 버튼, 게임 설정 화면, 시뮬레이터(<code>npm run sim -- --team-a shu --team-b wei</code>)에서 쓰입니다. 칸 순서: 전열 3칸, 후열 3칸. 사거리 1 병종은 후열에서 공격할 수
            없어 경고가 뜹니다. 저장 위치는 <code>packages/game-data/data/presets.json</code>이고, <code>shu</code>와 <code>wei</code>는 기본 대결에 쓰여 지울 수 없습니다.
          </p>
        </>
      )}
    </div>
  );
}
