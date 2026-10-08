import { createDefaultPolicy, runBattle } from '@samgukji/battle-engine';
import type { BattleResult, LineupEntry } from '@samgukji/battle-engine';
import { useMemo, useState } from 'react';
import { useLab } from '../lab/LabContext';
import { formatBattleLogEntries } from '../lib/battleLog';
import { explainHit, hitContext } from '../lib/battleHits';
import { FAMILY_LABEL, num } from '../lib/format';
import { lineupFromSlots } from '../lib/slots';
import { LineupEditor } from './LineupEditor';

/** 고정 편성(팀 A vs 팀 B)으로 전투 1회를 돌리고 라운드별 로그를 보여 준다. */
export function BattleTab() {
  const { state } = useLab();
  const [attacker, setAttacker] = useState<'A' | 'B'>('A');
  const [seed, setSeed] = useState(1);
  const [result, setResult] = useState<BattleResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 실행한 편성 (군단 uid 번호 → 처음 열을 알기 위해) 과 계산 과정을 펼친 로그 줄
  const [ran, setRan] = useState<{ attacker: LineupEntry[]; defender: LineupEntry[] } | null>(null);
  const [openHit, setOpenHit] = useState<number | null>(null);

  const run = (nextSeed: number) => {
    try {
      const teamA = lineupFromSlots(state.teamA);
      const teamB = lineupFromSlots(state.teamB);
      const lineups = { attacker: attacker === 'A' ? teamA : teamB, defender: attacker === 'A' ? teamB : teamA };
      const outcome = runBattle({
        data: state.data,
        balance: state.balance,
        attacker: lineups.attacker,
        defender: lineups.defender,
        seed: nextSeed,
        recordEvents: true,
        policy: createDefaultPolicy({ targetPolicy: state.sim.targetPolicy, guardMode: state.sim.guardMode, buffMode: state.sim.buffMode }),
      });
      setSeed(nextSeed);
      setResult(outcome);
      setRan(lineups);
      setOpenHit(null);
      setError(null);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const entries = useMemo(() => (result ? formatBattleLogEntries(result, state.data) : []), [result, state.data]);

  return (
    <div>
      <div className="two-col">
        <LineupEditor teamKey="teamA" title="팀 A" />
        <LineupEditor teamKey="teamB" title="팀 B" />
      </div>

      <section className="panel">
        <div className="row">
          <label className="field">
            <span>공격측</span>
            <select value={attacker} onChange={(e) => setAttacker(e.target.value as 'A' | 'B')}>
              <option value="A">팀 A가 공격</option>
              <option value="B">팀 B가 공격</option>
            </select>
          </label>
          <label className="field">
            <span>시드</span>
            <input type="number" value={seed} onChange={(e) => setSeed(parseInt(e.target.value, 10) || 0)} />
          </label>
          <button type="button" className="primary" onClick={() => run(seed)}>
            전투 1회 실행
          </button>
          <button type="button" onClick={() => run(seed + 1)}>
            다음 시드로 실행
          </button>
        </div>
      </section>

      {error && <div className="error">{error}</div>}

      {result && (
        <>
          <section className="panel">
            <h3>최종 상태</h3>
            <table>
              <thead>
                <tr>
                  <th>진영</th>
                  <th>이름</th>
                  <th>병종</th>
                  <th>병력</th>
                  <th>피해</th>
                  <th>받은 피해</th>
                  <th>킬</th>
                  <th>회복</th>
                  <th>행동</th>
                </tr>
              </thead>
              <tbody>
                {result.units.map((u) => (
                  <tr key={u.uid} className={u.survived ? '' : 'dead'}>
                    <td>{u.side === 'attacker' ? '공격' : '방어'}</td>
                    <td>{u.name}</td>
                    <td>{FAMILY_LABEL[u.family]}</td>
                    <td>
                      {num(u.finalTroops)} / {num(u.maxTroops)}
                    </td>
                    <td>{num(u.damageDealt)}</td>
                    <td>{num(u.damageTaken)}</td>
                    <td>{u.kills}</td>
                    <td>{num(u.healing)}</td>
                    <td>{u.actions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel">
            <h3>전투 로그</h3>
            <p className="note">피해 줄의 "계산"을 누르면 그 순간의 병력·열·가드로 피해가 어떻게 나왔는지 한 단계씩 보여 줍니다 (피해 계산기와 같은 계산).</p>
            <div className="log">
              {entries.map((entry, i) => {
                const ctx = ran && result ? hitContext(result, ran, state.data, entry.eventIndex) : null;
                const open = openHit === entry.eventIndex;
                return (
                  <div key={i} className={open ? 'log-line open' : 'log-line'}>
                    <span>{entry.text}</span>
                    {ctx && (
                      <button type="button" className="log-calc" aria-label={`계산 과정 ${entry.eventIndex}`} onClick={() => setOpenHit(open ? null : entry.eventIndex)}>
                        {open ? '닫기' : '계산'}
                      </button>
                    )}
                    {open && ctx && result && <HitExplanation result={result} ctx={ctx} />}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/** 로그의 피해 한 줄을 그 순간의 상태로 다시 계산한 과정 */
function HitExplanation({ result, ctx }: { result: BattleResult; ctx: NonNullable<ReturnType<typeof hitContext>> }) {
  const { state } = useLab();
  const explained = explainHit(result, ctx, state.data, state.balance);
  if (!explained.ok) return <p className="note">{explained.reason}</p>;
  const { rows, damage } = explained.explanation;
  const capped = Math.min(damage, ctx.targetTroops);
  const notes: string[] = [];
  if (ctx.critical) notes.push(`크리티컬이 나서 × ${state.balance.critical?.multiplier ?? 1}`);
  if (ctx.barrierBlocked) notes.push('결계가 피해를 무시해서 0');
  if (ctx.splash) notes.push('함께 맞은 군단(동시 타격/열 공격)이라 비율을 곱한 값');
  if (capped !== damage) notes.push(`남은 병력 ${ctx.targetTroops}까지만 깎임`);
  if (!ctx.critical && !ctx.barrierBlocked && !ctx.splash && capped !== ctx.actual) notes.push('전투 중에 오른 스탯(독려 등 버프)은 이 계산에 들어가지 않아 다를 수 있습니다');
  return (
    <div className="hit-explain">
      <div className="calc-summary">
        <span>
          실제 피해 <b className="num">{ctx.actual}</b>
        </span>
        <span>
          다시 계산 <b className="num">{capped}</b>
        </span>
        <span className="note">
          공격 쪽 병력 {ctx.attackerTroops}, 맞은 쪽 병력 {ctx.targetTroops} ({ctx.targetRow === 'front' ? '전열' : '후열'}{ctx.guarding ? ', 가드 중' : ''})
        </span>
      </div>
      {notes.length > 0 && <p className="note">{notes.join(' · ')}</p>}
      <table className="calc-table">
        <tbody>
          {rows
            .filter((r) => r.group !== '입력' && r.group !== '크리티컬')
            .map((r, i) => (
              <tr key={i}>
                <td className="calc-label">{r.label}</td>
                <td className="calc-formula">{r.formula}</td>
                <td className="calc-value">{r.value}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
