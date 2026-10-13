import { useState } from 'react';
import { FormulaExplorer } from '../balance/FormulaExplorer';
import { FormulaPanel } from '../balance/FormulaPanel';
import { useFormulaLab } from '../balance/useFormulaLab';
import { DamageCalculatorPanel } from './DamageCalculatorPanel';

export type Mode = 'trace' | 'lab';

/**
 * 피해 분석: 피해 공식을 보는 곳을 한 탭으로 모았다.
 *  - 값의 출처 · 계산 과정: 실제 장수/병종/스킬로 한 번 때렸을 때 어떤 값이 어디서 와서 어떻게 곱해지는지 (고치러 가는 버튼 포함)
 *  - 실험대: 병종을 고르고 슬라이더로 값을 바꿔 보며 피해가 어떻게 변하는지 (노란 칸은 실제 밸런스 값이라 고치면 저장 대상)
 *  - 공식 전체를 글로 보기: 지금 값이 들어간 식. 반격, 치유, 가드 설명 포함
 */
export function DamageAnalysisTab({ initialMode = 'trace' }: { initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const lab = useFormulaLab();
  return (
    <div className="analysis-page">
      <nav className="mode-switch" aria-label="피해 분석 보기">
        <button type="button" data-calc-mode="trace" className={mode === 'trace' ? 'tab sub active' : 'tab sub'} onClick={() => setMode('trace')}>
          값의 출처 · 계산 과정
        </button>
        <button type="button" data-calc-mode="lab" className={mode === 'lab' ? 'tab sub active' : 'tab sub'} onClick={() => setMode('lab')}>
          실험대 (슬라이더)
        </button>
      </nav>
      {mode === 'trace' && <DamageCalculatorPanel />}
      {mode === 'lab' && lab.input && (
        <FormulaExplorer input={lab.input} setInput={lab.setInput} pick={(a, d) => lab.pick(a, d)} stat={lab.stat} setStat={lab.changeStat} level={lab.level} setLevel={lab.changeLevel} />
      )}
      <FormulaPanel />
    </div>
  );
}
