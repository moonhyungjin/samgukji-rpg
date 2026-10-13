import { useState } from 'react';
import { useLab } from '../../lab/LabContext';
import { groupByPromotion } from '../data/editor/lib/unitTypes';
import { defaultFormulaInput } from './formulaLab';
import type { FormulaInput } from './formulaLab';

/**
 * 공식 실험대의 상태 (실험값이라 저장하지 않는다): 공격/방어 병종, 스탯, 레벨, 슬라이더 값.
 * 피해 분석 탭의 실험대와 밸런스 탭의 병력 게이지가 각자 하나씩 쓴다.
 */
export function useFormulaLab() {
  const { state } = useLab();
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

  return {
    input,
    setInput,
    stat,
    level,
    pick,
    /** 스탯을 바꾸고 병종 값으로 다시 채운다 */
    changeStat: (s: number) => {
      setStat(s);
      if (input) pick(input.attacker, input.defender, s, level);
    },
    changeLevel: (l: number) => {
      setLevel(l);
      if (input) pick(input.attacker, input.defender, stat, l);
    },
  };
}
