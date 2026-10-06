import { FAMILIES } from '@samgukji/battle-engine';
import type { GameData, SimulationReport } from '@samgukji/battle-engine';
import type { Finding } from '../lib/metrics';
import { DECIDED_BY_LABEL, END_CAUSE_LABEL, FAMILY_LABEL, num, pct, signed } from '../lib/format';

interface DeltaProps {
  now: number;
  base: number | undefined;
  /** 표시 배율 (비율 → %p 는 100) */
  scale?: number;
  digits?: number;
  suffix?: string;
}

function Delta({ now, base, scale = 1, digits = 1, suffix = '' }: DeltaProps) {
  if (base === undefined) return null;
  const diff = (now - base) * scale;
  if (Math.abs(diff) < Math.pow(10, -digits) / 2) return <small className="delta">±0</small>;
  return (
    <small className="delta">
      {signed(diff, digits)}
      {suffix}
    </small>
  );
}

interface Props {
  report: SimulationReport;
  /** 변화량을 비교할 기준 결과 (고정한 기준 또는 직전 실행) */
  baseline: SimulationReport | null;
  baselineLabel: string;
  findings: Finding[];
  elapsedMs: number;
  data: GameData;
}

export function ReportView({ report, baseline, baselineLabel, findings, elapsedMs, data }: Props) {
  const random = report.lineups === 'random';
  const aLabel = random ? '무작위 A' : '팀 A';
  const bLabel = random ? '무작위 B' : '팀 B';

  const cards: { label: string; value: string; delta: ReturnType<typeof Delta> }[] = [
    { label: `${aLabel} 승률`, value: pct(report.teamAWinRate), delta: <Delta now={report.teamAWinRate} base={baseline?.teamAWinRate} scale={100} suffix="%p" /> },
    { label: `${bLabel} 승률`, value: pct(report.teamBWinRate), delta: <Delta now={report.teamBWinRate} base={baseline?.teamBWinRate} scale={100} suffix="%p" /> },
    { label: '공격측 승률', value: pct(report.attackerWinRate), delta: <Delta now={report.attackerWinRate} base={baseline?.attackerWinRate} scale={100} suffix="%p" /> },
    { label: '방어측 승률', value: pct(report.defenderWinRate), delta: <Delta now={report.defenderWinRate} base={baseline?.defenderWinRate} scale={100} suffix="%p" /> },
    { label: '평균 라운드', value: num(report.averageRounds, 2), delta: <Delta now={report.averageRounds} base={baseline?.averageRounds} digits={2} /> },
    { label: '평균 전멸 군단', value: `${num(report.averageDestroyed.A, 2)} / ${num(report.averageDestroyed.B, 2)}`, delta: null },
    { label: '평균 잔여 병력', value: `${num(report.averageRemainingTroops.A)} / ${num(report.averageRemainingTroops.B)}`, delta: null },
    { label: '실행', value: `${num(report.iterations)}회 · ${num(elapsedMs)}ms`, delta: null },
  ];

  const characters = Object.entries(report.characterStats).sort(([, a], [, b]) =>
    random ? b.teamWinRate - a.teamWinRate : (a.team ?? '').localeCompare(b.team ?? '') || a.name.localeCompare(b.name),
  );
  const skills = Object.entries(report.skillStats).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="report">
      <div className="cards">
        {cards.map((c) => (
          <div className="card" key={c.label}>
            <span className="card-label">{c.label}</span>
            <strong>{c.value}</strong>
            {c.delta}
          </div>
        ))}
      </div>
      {baseline && <p className="note">변화량(작은 숫자)은 {baselineLabel} 대비입니다.</p>}

      <section className="panel">
        <h3>목표 지표 점검</h3>
        <ul className="findings">
          {findings.map((f, i) => (
            <li key={i} className={f.level}>
              <span className="mark">{f.level === 'ok' ? '✓' : f.level === 'warn' ? '!' : 'i'}</span>
              {f.message}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h3>병종 계열별</h3>
        <table>
          <thead>
            <tr>
              <th>계열</th>
              <th>출전</th>
              <th>승률{random ? '' : ' (편성 편향 포함)'}</th>
              <th>생존율</th>
              <th>평균 피해</th>
              <th>평균 받은 피해</th>
            </tr>
          </thead>
          <tbody>
            {FAMILIES.map((f) => {
              const s = report.familyStats[f];
              const b = baseline?.familyStats[f];
              if (!s) return null;
              return (
                <tr key={f}>
                  <td>{FAMILY_LABEL[f]}</td>
                  <td>{num(s.fielded)}</td>
                  <td>
                    {pct(s.teamWinRate)} <Delta now={s.teamWinRate} base={b?.teamWinRate} scale={100} suffix="%p" />
                  </td>
                  <td>
                    {pct(s.survivalRate)} <Delta now={s.survivalRate} base={b?.survivalRate} scale={100} suffix="%p" />
                  </td>
                  <td>{num(s.averageDamageDealt)}</td>
                  <td>{num(s.averageDamageTaken)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h3>캐릭터별</h3>
        <table>
          <thead>
            <tr>
              <th>이름</th>
              {!random && <th>팀</th>}
              <th>병종</th>
              <th>출전</th>
              {random && <th>출전률</th>}
              <th>팀 승률</th>
              <th>생존율</th>
              <th>피해</th>
              <th>받은 피해</th>
              <th>킬</th>
              <th>회복</th>
              <th>행동</th>
            </tr>
          </thead>
          <tbody>
            {characters.map(([key, c]) => (
              <tr key={key}>
                <td>{c.name}</td>
                {!random && <td>{c.team}</td>}
                <td>{FAMILY_LABEL[c.family]}</td>
                <td>{num(c.fielded)}</td>
                {random && <td>{pct(c.pickRate ?? 0, 0)}</td>}
                <td>
                  {pct(c.teamWinRate)} <Delta now={c.teamWinRate} base={baseline?.characterStats[key]?.teamWinRate} scale={100} suffix="%p" />
                </td>
                <td>{pct(c.survivalRate)}</td>
                <td>{num(c.averageDamageDealt)}</td>
                <td>{num(c.averageDamageTaken)}</td>
                <td>{num(c.averageKills, 2)}</td>
                <td>{num(c.averageHealing)}</td>
                <td>{num(c.averageActions, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="two-col">
        <section className="panel">
          <h3>스킬별</h3>
          <table>
            <thead>
              <tr>
                <th>스킬</th>
                <th>사용</th>
                <th>회당 피해</th>
                <th>회당 회복</th>
              </tr>
            </thead>
            <tbody>
              {skills.map(([id, s]) => (
                <tr key={id}>
                  <td>{data.skills[id]?.name ?? id}</td>
                  <td>{num(s.uses)}</td>
                  <td>{num(s.averageDamagePerUse)}</td>
                  <td>{num(s.averageHealingPerUse)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel">
          <h3>종료 원인 · 판정</h3>
          <table>
            <tbody>
              {Object.entries(report.endCauses).map(([k, v]) => (
                <tr key={k}>
                  <td>{END_CAUSE_LABEL[k as keyof typeof END_CAUSE_LABEL] ?? k}</td>
                  <td>{pct(v / report.iterations)}</td>
                </tr>
              ))}
              {Object.entries(report.decidedBy).map(([k, v]) => (
                <tr key={k}>
                  <td>판정: {DECIDED_BY_LABEL[k as keyof typeof DECIDED_BY_LABEL] ?? k}</td>
                  <td>{pct(v / report.iterations)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
