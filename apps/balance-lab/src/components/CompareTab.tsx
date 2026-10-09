import { Fragment, useMemo, useState } from 'react';
import { normalizeState, useLab } from '../lab/LabContext';
import { useCompare } from '../lab/useCompare';
import type { CompareColumn } from '../lab/useCompare';
import { changeLines } from '../lib/dataLog';
import { num } from '../lib/format';
import { compareRows, formatCompare, formatDelta, loadSnapshots, makeSnapshot, saveSnapshots } from '../lib/snapshots';
import type { Snapshot } from '../lib/snapshots';

const MAX_COLUMNS = 5;
const RUN_COUNTS = [1000, 10000];
const MAX_DIFF_LINES = 60;

interface Column extends CompareColumn {
  key: string;
  name: string;
}

const LINEUP_LABEL = { random: '무작위 편성', fixed: '고정 편성 (팀 A vs 팀 B)' } as const;

/**
 * 설정 비교. 지금 작업 값을 이름 붙여 저장해 두고, 저장된 파일 값/지금 값/저장한 설정들을
 * 같은 편성, 같은 시드로 돌려 결과를 나란히 비교한다. 저장한 설정은 이 브라우저에만 남는다.
 */
export function CompareTab() {
  const { state, update, baseline } = useLab();
  const compare = useCompare(state);
  const [snapshots, setSnapshots] = useState<Snapshot[]>(loadSnapshots);
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>(['file', 'current']);
  const [ranColumns, setRanColumns] = useState<Column[]>([]);

  const persist = (next: Snapshot[]) => {
    setSnapshots(next);
    if (!saveSnapshots(next)) setMessage('브라우저 저장소에 저장하지 못했습니다 (용량이 가득 찼거나 저장소를 쓸 수 없는 환경). 새로고침하면 사라집니다.');
  };

  /** 예전 버전에서 저장한 설정도 지금 Lab 형식으로 맞춘다 (빠진 기본값 채우기) */
  const normalized = (data: Snapshot['data'], balance: Snapshot['balance']) => {
    const s = normalizeState({ ...state, data, balance });
    return { data: s.data, balance: s.balance };
  };

  const allColumns: Column[] = useMemo(
    () => [
      { key: 'file', name: '저장된 파일 값', data: baseline.data, balance: baseline.balance },
      { key: 'current', name: '지금 작업 값', data: state.data, balance: state.balance },
      ...snapshots.map((s) => ({ key: s.id, name: s.name, ...normalized(s.data, s.balance) })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseline, state.data, state.balance, snapshots],
  );
  const columns = picked.map((key) => allColumns.find((c) => c.key === key)).filter((c): c is Column => !!c);

  const diffFrom = (a: CompareColumn, b: CompareColumn) => changeLines({ ...a, presets: state.presets, campaign: state.campaign, map: state.map }, { ...b, presets: state.presets, campaign: state.campaign, map: state.map });

  const togglePick = (key: string) =>
    setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : p.length >= MAX_COLUMNS ? p : [...p, key]));

  const onSave = () => {
    const label = name.trim() || `설정 ${snapshots.length + 1}`;
    const snap = makeSnapshot(label, state.data, state.balance);
    persist([...snapshots, snap]);
    setPicked((p) => (p.length >= MAX_COLUMNS ? p : [...p, snap.id]));
    setName('');
    setMessage(`"${label}"을(를) 저장했습니다.`);
  };

  const onLoad = (snap: Snapshot) => {
    if (!window.confirm(`"${snap.name}"의 값으로 지금 작업 값을 바꿀까요? (편성과 목표는 그대로. 파일에는 "파일에 저장"을 눌러야 들어갑니다)`)) return;
    const next = normalized(snap.data, snap.balance);
    update((s) => ({ ...s, data: next.data, balance: next.balance }));
    setMessage(`"${snap.name}"을(를) 지금 작업 값으로 불러왔습니다.`);
  };

  const onDelete = (snap: Snapshot) => {
    if (!window.confirm(`"${snap.name}"을(를) 지울까요?`)) return;
    persist(snapshots.filter((s) => s.id !== snap.id));
    setPicked((p) => p.filter((k) => k !== snap.id));
  };

  const onRun = (iterations: number) => {
    setRanColumns(columns);
    compare.run(columns, iterations);
  };

  const results = compare.results;
  const rows = useMemo(() => (results && results.length === ranColumns.length && results.every(Boolean) ? compareRows(results.map((r) => r.report)) : []), [results, ranColumns.length]);
  const groups = [...new Set(rows.map((r) => r.group))];

  return (
    <div>
      <section className="panel">
        <h3>설정 저장</h3>
        <p className="note">
          지금 작업 값(병종, 스킬, 장수, 밸런스 수치)을 이름을 붙여 저장해 두고 나중에 비교하거나 다시 불러옵니다. 이 브라우저에만 저장되고, 프로젝트 파일과는 상관없습니다.
        </p>
        <div className="row">
          <label className="field">
            <span>이름</span>
            <input type="text" aria-label="설정 이름" placeholder={`설정 ${snapshots.length + 1}`} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="button" className="primary" onClick={onSave}>
            지금 작업 값을 설정으로 저장
          </button>
        </div>
        {message && <p className="note">{message}</p>}
      </section>

      <section className="panel">
        <h3>비교할 설정 고르기</h3>
        <p className="note">최대 {MAX_COLUMNS}개. 맨 왼쪽(처음 고른 것)이 기준이고, 다른 열에는 기준과의 차이가 작게 붙습니다. 고른 순서대로 열이 놓입니다.</p>
        <table className="compare-pick">
          <thead>
            <tr>
              <th>비교</th>
              <th>설정</th>
              <th>저장 시각</th>
              <th>지금 작업 값과 다른 곳</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {allColumns.map((c) => {
              const snap = snapshots.find((s) => s.id === c.key);
              const diff = c.key === 'current' ? [] : diffFrom(allColumns[1], c);
              return (
                <tr key={c.key}>
                  <td>
                    <input type="checkbox" aria-label={`비교: ${c.name}`} checked={picked.includes(c.key)} disabled={!picked.includes(c.key) && picked.length >= MAX_COLUMNS} onChange={() => togglePick(c.key)} />
                    {picked.includes(c.key) && <small className="pick-order">{picked.indexOf(c.key) + 1}</small>}
                  </td>
                  <td>{c.name}</td>
                  <td>{snap ? new Date(snap.savedAt).toLocaleString('ko-KR') : c.key === 'file' ? 'packages/game-data/data' : '편집 중'}</td>
                  <td>{c.key === 'current' ? '-' : diff.length === 0 ? '같음' : `${num(diff.length)}곳`}</td>
                  <td className="row-actions">
                    {snap && (
                      <>
                        <button type="button" onClick={() => onLoad(snap)}>
                          불러오기
                        </button>
                        <button type="button" onClick={() => onDelete(snap)}>
                          지우기
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h3>같은 조건으로 돌려서 비교</h3>
        <p className="note">
          편성, 시드, AI는 시뮬레이션 탭의 지금 설정을 씁니다: {LINEUP_LABEL[state.sim.lineups]}, 시드 {state.sim.seed}. 설정마다 같은 전투가 같은 순서로 나옵니다.
        </p>
        <div className="row">
          {RUN_COUNTS.map((n) => (
            <button key={n} type="button" className="primary" disabled={compare.running || columns.length < 2} onClick={() => onRun(n)}>
              {`설정 ${columns.length}개를 ${n.toLocaleString('ko-KR')}회씩 실행`}
            </button>
          ))}
          {columns.length < 2 && <span className="note">비교할 설정을 2개 이상 고르세요.</span>}
          {compare.running && <span className="running">실행 중… ({results?.filter(Boolean).length ?? 0}/{ranColumns.length})</span>}
        </div>

        {results && !compare.running && (
          <>
            <div className="table-scroll">
              <table className="compare-table" aria-label="설정 비교 결과">
                <thead>
                  <tr>
                    <th />
                    {ranColumns.map((c, i) => (
                      <th key={c.key}>
                        {c.name}
                        {i === 0 && <small>기준</small>}
                        {results[i]?.error && <small className="err">실패: {results[i].error}</small>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <Fragment key={g}>
                      <tr className="compare-group">
                        <th colSpan={ranColumns.length + 1}>{g}</th>
                      </tr>
                      {rows
                        .filter((r) => r.group === g)
                        .map((r) => (
                          <tr key={`${g}-${r.label}`}>
                            <td className="compare-label">{r.label}</td>
                            {r.values.map((v, i) => {
                              const base = r.values[0];
                              const delta = i > 0 && v !== null && base !== null ? formatDelta(r.kind, v, base) : null;
                              return (
                                <td key={i} className="num">
                                  {v === null ? '-' : formatCompare(r.kind, v)}
                                  {delta && <small className="delta">{delta}</small>}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="note">{`${num(compare.elapsedMs)}ms`}</p>

            <h4 className="sub">기준과 다른 값</h4>
            {ranColumns.slice(1).map((c) => {
              const lines = diffFrom(ranColumns[0], c);
              return (
                <details key={c.key} className="compare-diff">
                  <summary>
                    {c.name}: {lines.length === 0 ? '기준과 같음' : `${num(lines.length)}곳 다름`}
                  </summary>
                  <ul>
                    {lines.slice(0, MAX_DIFF_LINES).map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                    {lines.length > MAX_DIFF_LINES && <li>… 외 {num(lines.length - MAX_DIFF_LINES)}곳</li>}
                  </ul>
                </details>
              );
            })}
          </>
        )}
      </section>
    </div>
  );
}
