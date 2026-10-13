import { useState } from 'react';
import { useLab } from '../../lab/LabContext';
import { groupByPromotion } from '../data/editor/lib/unitTypes';
import { defaultFormulaInput } from './formulaLab';
import type { FormulaInput } from './formulaLab';
import { FormulaExplorer } from './FormulaExplorer';
import { FormulaPanel } from './FormulaPanel';
import { DamagePanel } from './DamagePanel';
import { TroopsPanel } from './TroopsPanel';
import { CounterPanel } from './CounterPanel';
import { DebuffPanel } from './DebuffPanel';
import { MoralePanel } from './MoralePanel';
import { ApPanel } from './ApPanel';
import { StatCurvePanel } from './StatCurvePanel';

/**
 * 전투 공식과 규칙 수치. 패널을 한 줄에 하나씩 놓고, 피해 공식과 병력 보정은 지금 고른 방식의 칸만 보여 준다.
 * 고치면 즉시 위의 공식/계산과 시뮬레이션(자동 실행이 켜져 있을 때)에 반영된다.
 */
export function BalanceTab() {
  const { state } = useLab();

  // 공식 실험대의 상태. 병력 패널의 게이지와 같이 쓴다 (실험값이라 저장하지 않는다)
  const [stat, setStat] = useState(6);
  const [level, setLevel] = useState(() => {
    const levels = Object.values(state.data.characters).map((c) => c.level);
    return levels.length ? Math.round(levels.reduce((a, b) => a + b, 0) / levels.length) : 1;
  });
  const [input, setInput] = useState<FormulaInput | null>(() => {
    const roots = groupByPromotion(Object.values(state.data.unitTypes))[0]?.items.map((u) => u.id) ?? [];
    return defaultFormulaInput(state.data, state.balance, roots[0] ?? '', roots[1] ?? roots[0] ?? '', 6, level);
  });
  const pick = (attacker: string, defender: string, nextStat = stat, nextLevel = level) =>
    setInput((cur) => defaultFormulaInput(state.data, state.balance, attacker, defender, nextStat, nextLevel, cur ?? undefined) ?? cur);

  return (
    <div className="balance-page">
      {input && (
        <FormulaExplorer
          input={input}
          setInput={setInput}
          pick={(a, d) => pick(a, d)}
          stat={stat}
          setStat={(s) => {
            setStat(s);
            pick(input.attacker, input.defender, s, level);
          }}
          level={level}
          setLevel={(l) => {
            setLevel(l);
            pick(input.attacker, input.defender, stat, l);
          }}
        />
      )}
      <FormulaPanel />

      <DamagePanel />
      <TroopsPanel input={input} setInput={setInput} level={level} />
      <CounterPanel />
      <DebuffPanel />
      <MoralePanel />
      <ApPanel />
      <StatCurvePanel />
    </div>
  );
}
