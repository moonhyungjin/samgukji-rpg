import { useMemo, useState } from 'react';
import type { Row } from '@samgukji/battle-engine';
import { useLab } from '../lab/LabContext';
import { groupByPromotion } from '../editor/lib/unitTypes';
import { MAX_HITS, matchupTable } from '../lib/matchup';
import type { MatchupCell } from '../lib/matchup';

/** 몇 번에 전멸하는지에 따라 칸 색을 정한다 (적을수록 공격 쪽이 강하다) */
function hitsClass(cell: MatchupCell): string {
  if (!cell.skillId) return 'mu-none';
  if (cell.hits === null) return 'mu-h5';
  if (cell.hits <= 2) return 'mu-h1';
  if (cell.hits <= 3) return 'mu-h2';
  if (cell.hits <= 5) return 'mu-h3';
  if (cell.hits <= 8) return 'mu-h4';
  return 'mu-h5';
}

/**
 * 병종 상성표. 같은 스탯의 기준 장수가 병종만 바꿔 서로 일반공격할 때
 * 한 번 피해, 전멸까지 걸리는 횟수, 반격 피해를 병종 × 병종 표로 보여 준다.
 */
export function MatchupTab() {
  const { state } = useLab();
  const { data, balance } = state;
  const groups = useMemo(() => groupByPromotion(Object.values(data.unitTypes)), [data.unitTypes]);
  const defaultLevel = useMemo(() => {
    const levels = Object.values(data.characters).map((c) => c.level);
    return levels.length ? Math.round(levels.reduce((a, b) => a + b, 0) / levels.length) : 1;
  }, [data.characters]);

  const [attackDepth, setAttackDepth] = useState(0);
  const [defendDepth, setDefendDepth] = useState(0);
  const [stat, setStat] = useState(6);
  const [level, setLevel] = useState(defaultLevel);
  const [defenderRow, setDefenderRow] = useState<Row>('front');
  const [guarding, setGuarding] = useState(false);

  const attackers = groups.find((g) => g.depth === attackDepth)?.items ?? groups[0]?.items ?? [];
  const defenders = groups.find((g) => g.depth === defendDepth)?.items ?? groups[0]?.items ?? [];
  const table = useMemo(
    () =>
      matchupTable(
        data,
        balance,
        attackers.map((u) => u.id),
        defenders.map((u) => u.id),
        { stat, level, defenderRow, guarding },
      ),
    [data, balance, attackers, defenders, stat, level, defenderRow, guarding],
  );

  const depthSelect = (label: string, value: number, onChange: (v: number) => void) => (
    <label className="field">
      <span>{label}</span>
      <select aria-label={`상성표 ${label}`} value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {groups.map((g) => (
          <option key={g.depth} value={g.depth}>
            {g.label} ({g.items.length})
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <section className="panel matchup-panel">
      <h3>병종 상성표</h3>
      <p className="note">
        모든 스탯이 같은 "기준 장수"가 병종만 바꿔 서로 일반공격할 때의 결과입니다. 장수 차이를 빼고 병종 차이만 봅니다. 승급 병종의 스탯 보정은 들어갑니다.
        줄이 공격 쪽, 칸이 방어 쪽입니다. 값을 고치면 바로 바뀝니다.
      </p>
      <div className="row">
        {depthSelect('공격 병종 (줄)', attackDepth, setAttackDepth)}
        {depthSelect('방어 병종 (칸)', defendDepth, setDefendDepth)}
        <label className="field">
          <span>기준 스탯 (공/방/지/속/행)</span>
          <input type="number" aria-label="상성표 기준 스탯" min={0} max={15} value={stat} onChange={(e) => setStat(Number(e.target.value) || 0)} />
        </label>
        <label className="field">
          <span>군단 레벨</span>
          <input type="number" aria-label="상성표 군단 레벨" min={1} value={level} onChange={(e) => setLevel(Math.max(1, Number(e.target.value) || 1))} />
        </label>
        <label className="field">
          <span>방어 쪽 열</span>
          <select aria-label="상성표 방어 쪽 열" value={defenderRow} onChange={(e) => setDefenderRow(e.target.value as Row)}>
            <option value="front">전열</option>
            <option value="back">후열</option>
          </select>
        </label>
        <label className="check">
          <input type="checkbox" aria-label="상성표 가드 중" checked={guarding} onChange={(e) => setGuarding(e.target.checked)} />
          <span>가드 병종은 가드 중</span>
        </label>
      </div>

      <div className="table-scroll">
        <table className="matchup-table" aria-label="병종 상성표">
          <thead>
            <tr>
              <th className="mu-corner">공격 ＼ 방어</th>
              {defenders.map((d, j) => (
                <th key={d.id}>
                  {d.name}
                  <small>병력 {table[0]?.[j]?.defenderMaxTroops ?? '-'}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {attackers.map((a, i) => (
              <tr key={a.id}>
                <th>
                  {a.name}
                  <small>{table[i]?.[0]?.skillId ? data.skills[table[i][0].skillId!]?.name : '공격 없음'}</small>
                </th>
                {defenders.map((d, j) => {
                  const cell = table[i][j];
                  return (
                    <td key={d.id} className={hitsClass(cell)} title={cell.skillId ? `${a.name} → ${d.name}: 한 번 ${cell.damage} (최대 병력의 ${Math.round(cell.ratio * 100)}%), 반격 ${cell.counter}` : undefined}>
                      {cell.skillId ? (
                        <>
                          <b className="num">{cell.damage}</b>
                          <span className="mu-hits">{cell.hits === null ? `${MAX_HITS}회+` : `${cell.hits}회`}</span>
                          {cell.counter > 0 && <span className="mu-counter">반격 {cell.counter}</span>}
                        </>
                      ) : (
                        '-'
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mu-legend">
        <span className="mu-h1">1~2회</span>
        <span className="mu-h2">3회</span>
        <span className="mu-h3">4~5회</span>
        <span className="mu-h4">6~8회</span>
        <span className="mu-h5">9회 이상</span>
      </div>
      <p className="note">
        칸의 큰 숫자: 둘 다 병력이 가득일 때 한 번 맞는 피해. "N회": 공격 쪽이 병력 가득인 채로 계속 때릴 때 전멸까지 걸리는 횟수 (반격과 크리티컬은 빼고, 방어 쪽 병력과 가드가 줄어드는 것은 반영).
        "반격": 첫 공격에 대한 반격 피해. 사기는 50%로 둡니다. 가드 중이면 가드 커맨드를 한 번 쓴 상태로 시작합니다.
        한 칸을 자세히 보려면 피해 계산기 탭에서 같은 병종을 고르세요 (계산기는 실제 장수의 스탯을 씁니다).
      </p>
    </section>
  );
}
