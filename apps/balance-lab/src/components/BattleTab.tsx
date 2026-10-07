import { createDefaultPolicy, runBattle } from '@samgukji/battle-engine';
import type { BattleResult } from '@samgukji/battle-engine';
import { useMemo, useState } from 'react';
import { useLab } from '../lab/LabContext';
import { formatBattleLog } from '../lib/battleLog';
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

  const run = (nextSeed: number) => {
    try {
      const teamA = lineupFromSlots(state.teamA);
      const teamB = lineupFromSlots(state.teamB);
      const outcome = runBattle({
        data: state.data,
        balance: state.balance,
        attacker: attacker === 'A' ? teamA : teamB,
        defender: attacker === 'A' ? teamB : teamA,
        seed: nextSeed,
        recordEvents: true,
        policy: createDefaultPolicy({ targetPolicy: state.sim.targetPolicy, guardMode: state.sim.guardMode }),
      });
      setSeed(nextSeed);
      setResult(outcome);
      setError(null);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const lines = useMemo(() => (result ? formatBattleLog(result, state.data) : []), [result, state.data]);

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
            <pre className="log">{lines.join('\n')}</pre>
          </section>
        </>
      )}
    </div>
  );
}
