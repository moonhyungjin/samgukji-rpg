import { useNav } from '../../lab/NavContext';
import { ApPanel } from './ApPanel';
import { CounterPanel } from './CounterPanel';
import { DamagePanel } from './DamagePanel';
import { DebuffPanel } from './DebuffPanel';
import { MoralePanel } from './MoralePanel';
import { StatCurvePanel } from './StatCurvePanel';
import { TroopsPanel } from './TroopsPanel';
import { useFormulaLab } from './useFormulaLab';

/**
 * 전투 공식과 규칙 수치. 패널을 한 줄에 하나씩 놓고, 피해 공식과 병력 보정은 지금 고른 방식의 칸만 보여 준다.
 * 고치면 즉시 피해 분석 탭의 공식/계산과 시뮬레이션(자동 실행이 켜져 있을 때)에 반영된다. 패널은 *Panel 파일에 있다.
 */
export function BalanceTab() {
  // 병력 패널의 게이지가 쓰는 실험 상태 (피해 분석 탭의 실험대와는 따로)
  const lab = useFormulaLab();
  const nav = useNav();

  return (
    <div className="balance-page">
      <section className="panel" data-panel="formula-pointer">
        <h3>공식 보기는 "결과 보기 → 피해 분석"에 있습니다</h3>
        <p className="note">
          지금 값이 들어간 피해 공식, 실험대(슬라이더), 값의 출처와 계산 과정은 한 곳에 모았습니다. 여기서는 수치를 고치고, 고친 결과는 그 탭에서 바로 확인합니다.{' '}
          <button type="button" className="goto" data-action="open-analysis" onClick={() => nav.go('calc')}>
            피해 분석 열기
          </button>
        </p>
      </section>

      <DamagePanel />
      <TroopsPanel input={lab.input} setInput={lab.setInput} level={lab.level} />
      <CounterPanel />
      <DebuffPanel />
      <MoralePanel />
      <ApPanel />
      <StatCurvePanel />
    </div>
  );
}
