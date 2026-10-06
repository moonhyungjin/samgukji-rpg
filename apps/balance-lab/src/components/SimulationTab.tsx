import { useMemo } from 'react';
import type { SimulationReport } from '@samgukji/battle-engine';
import { useLab } from '../lab/LabContext';
import type { SimulationHook } from '../lab/useSimulation';
import { evaluateReport } from '../lib/metrics';
import { CheckField, NumberField, SelectField } from './Fields';
import { LineupEditor } from './LineupEditor';
import { ReportView } from './ReportView';

interface Props {
  sim: SimulationHook;
  pinned: SimulationReport | null;
  setPinned: (report: SimulationReport | null) => void;
}

const RUN_COUNTS = [1, 100, 1000, 10000];

export function SimulationTab({ sim, pinned, setPinned }: Props) {
  const { state } = useLab();
  const { report } = sim;
  const findings = useMemo(() => (report ? evaluateReport(report, state.targets, state.data) : []), [report, state.targets, state.data]);

  const baseline = pinned ?? sim.previous;
  const baselineLabel = pinned ? '고정한 기준 결과' : '직전 실행';

  return (
    <div>
      <section className="panel">
        <div className="row">
          <SelectField
            label="편성 방식"
            path="sim.lineups"
            options={[
              { value: 'random', label: '무작위 편성 (병종·캐릭터 승률용)' },
              { value: 'fixed', label: '고정 편성 (팀 A vs 팀 B)' },
            ]}
          />
          <SelectField
            label="공방 배정"
            path="sim.roles"
            options={[
              { value: 'alternate', label: '번갈아 배정 (공방 편향 상쇄)' },
              { value: 'A-attacks', label: 'A가 항상 공격' },
              { value: 'B-attacks', label: 'B가 항상 공격' },
            ]}
          />
          <SelectField
            label="대상 선택 AI"
            path="sim.targetPolicy"
            options={[
              { value: 'highest-damage', label: '예상 피해가 큰 적 (기본)' },
              { value: 'lowest-troops', label: '병력이 적은 적 (집중 공격)' },
              { value: 'random', label: '무작위' },
            ]}
          />
          <NumberField label="시드" path="sim.seed" />
        </div>
        <div className="row">
          {RUN_COUNTS.map((n) => (
            <button key={n} type="button" className="primary" disabled={sim.running} onClick={() => sim.run(n)}>
              {`${n.toLocaleString('ko-KR')}회 실행`}
            </button>
          ))}
          <CheckField label="수치를 고치면 자동 실행" path="sim.autoRun" />
          <NumberField label="자동 실행 횟수" path="sim.autoRunIterations" step={100} min={1} />
          {sim.running && <span className="running">실행 중…</span>}
        </div>
      </section>

      {state.sim.lineups === 'fixed' ? (
        <div className="two-col">
          <LineupEditor teamKey="teamA" title="팀 A" />
          <LineupEditor teamKey="teamB" title="팀 B" />
        </div>
      ) : (
        <p className="note">무작위 편성: 전투마다 양측을 무작위로 구성합니다. 병종/캐릭터별 승률과 목표 지표는 이 모드에서 가장 의미가 있습니다.</p>
      )}

      {sim.error && <div className="error">{sim.error}</div>}

      {report ? (
        <>
          <div className="row">
            <button type="button" onClick={() => setPinned(report)}>
              현재 결과를 기준으로 고정
            </button>
            {pinned && (
              <button type="button" onClick={() => setPinned(null)}>
                기준 해제 (직전 실행과 비교)
              </button>
            )}
          </div>
          <ReportView report={report} baseline={baseline} baselineLabel={baselineLabel} findings={findings} elapsedMs={sim.elapsedMs} data={state.data} />
        </>
      ) : (
        <p className="note">아직 실행 결과가 없습니다.</p>
      )}
    </div>
  );
}
