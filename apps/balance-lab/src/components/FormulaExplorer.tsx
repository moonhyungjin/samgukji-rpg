import type { ReactNode } from 'react';
import { DEFAULT_ADDITIVE, DEFAULT_GAP } from '@samgukji/battle-engine';
import { useLab } from '../lab/LabContext';
import { groupByPromotion } from '../editor/lib/unitTypes';
import { num } from '../lib/format';
import { computeFormula } from '../lib/formulaLab';
import type { FormulaInput } from '../lib/formulaLab';
import { NumberField } from './Fields';
import { TroopGauge } from './TroopGauge';

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

/** 실험값 칸: 값과 슬라이더. 바꿔도 데이터에는 저장되지 않는다 */
function Var({ label, value, min, max, step, onChange, from }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; from?: string }) {
  return (
    <div className="chip var" title={from ? `처음 값: ${from}. 슬라이더로 바꿔 보는 값은 저장되지 않습니다` : '슬라이더로 바꿔 보는 값은 저장되지 않습니다'}>
      <span className="chip-label">{label}</span>
      <input type="number" aria-label={`실험 ${label}`} value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value) || 0)} />
      <input type="range" aria-label={`실험 ${label} 슬라이더`} value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} />
      {from && <small>{from}</small>}
    </div>
  );
}

/** 공식 계수 칸: 실제 밸런스 값이라 고치면 "파일에 저장" 대상이 된다 */
function Coef({ label, path, step = 1 }: { label: string; path: string; step?: number }) {
  return (
    <div className="chip coef" title="밸런스 값입니다. 고치면 저장 대상이 됩니다">
      <span className="chip-label">{label}</span>
      <NumberField path={path} step={step} min={0} />
    </div>
  );
}

function Out({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className={big ? 'chip out big' : 'chip out'}>
      <span className="chip-label">{label}</span>
      <b className="num">{value}</b>
    </div>
  );
}

const Op = ({ children }: { children: ReactNode }) => <span className="op">{children}</span>;

interface Props {
  input: FormulaInput;
  setInput: (input: FormulaInput) => void;
  /** 병종을 다시 고르거나 "병종 값으로"를 누르면 병종 값으로 채운다 */
  pick: (attacker: string, defender: string) => void;
  stat: number;
  setStat: (stat: number) => void;
  level: number;
  setLevel: (level: number) => void;
}

/**
 * 공식 실험대. 피해 공식을 항 하나하나의 블록으로 보여 주고, 병종을 고르면 그 병종의 값으로 채운다.
 * 노란 칸(공식 계수)은 실제 밸런스 값, 슬라이더 칸은 실험값이다. 결과는 엔진의 DamageCalculator로 계산한다.
 */
export function FormulaExplorer({ input, setInput, pick, stat, setStat, level, setLevel }: Props) {
  const { state } = useLab();
  const { data, balance } = state;
  const groups = groupByPromotion(Object.values(data.unitTypes));
  const result = computeFormula(data, balance, input, level);
  const formula = balance.damage.formula ?? 'divide';
  const set = <K extends keyof FormulaInput>(key: K, value: FormulaInput[K]) => setInput({ ...input, [key]: value });
  const aType = data.unitTypes[input.attacker];
  const dType = data.unitTypes[input.defender];

  const typeSelect = (label: string, value: string, onChange: (v: string) => void) => (
    <label className="field">
      <span>{label}</span>
      <select aria-label={`실험대 ${label}`} value={value} onChange={(e) => onChange(e.target.value)}>
        {groups.map((g) => (
          <optgroup key={g.depth} label={g.label}>
            {g.items.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );

  const physical = result?.physical ?? true;
  const atkName = physical ? '공격' : '지력';
  const defName = physical ? '방어' : '대상 지력';
  const a = balance.damage.additive ?? DEFAULT_ADDITIVE;
  const g = balance.damage.gap ?? DEFAULT_GAP;
  const statVar = (which: 'attackStat' | 'defenseStat') => (
    <Var
      label={which === 'attackStat' ? `${atkName} (${aType?.name})` : `${defName} (${dType?.name})`}
      value={input[which]}
      min={0}
      max={15}
      step={1}
      onChange={(v) => set(which, v)}
      from={`기준 스탯 ${stat} + 병종 보정`}
    />
  );
  const curveNote = result && (result.effAttack !== input.attackStat || result.effDefense !== input.defenseStat) ? `스탯 곡선을 거친 값: ${atkName} ${fmt(result.effAttack)}, ${defName} ${fmt(result.effDefense)}` : null;

  return (
    <section className="panel formula-explorer">
      <h3>지금 피해 공식 (실험대)</h3>
      <p className="note">
        병종을 고르면 그 병종의 값이 칸에 들어갑니다. <span className="legend-var">흰 칸</span>은 슬라이더로 바꿔 보는 실험값(저장 안 됨), <span className="legend-coef">노란 칸</span>은 공식의 밸런스 값(고치면 저장 대상)입니다. 장수 차이를 빼려고 모든 스탯이 같은 기준 장수를 씁니다.
      </p>
      <div className="row">
        {typeSelect('공격 병종', input.attacker, (v) => pick(v, input.defender))}
        {typeSelect('방어 병종', input.defender, (v) => pick(input.attacker, v))}
        <label className="field">
          <span>기준 스탯</span>
          <input type="number" aria-label="실험대 기준 스탯" min={0} max={15} value={stat} onChange={(e) => setStat(Math.max(0, Math.min(15, Number(e.target.value) || 0)))} />
        </label>
        <label className="field">
          <span>군단 레벨</span>
          <input type="number" aria-label="실험대 군단 레벨" min={1} value={level} onChange={(e) => setLevel(Math.max(1, Number(e.target.value) || 1))} />
        </label>
        <label className="field">
          <span>방어 쪽 열</span>
          <select aria-label="실험대 방어 쪽 열" value={input.defenderRow} onChange={(e) => set('defenderRow', e.target.value === 'back' ? 'back' : 'front')}>
            <option value="front">전열</option>
            <option value="back">후열</option>
          </select>
        </label>
        {dType?.guard && (
          <label className="check">
            <input type="checkbox" aria-label="실험대 가드 중" checked={input.guarding} onChange={(e) => set('guarding', e.target.checked)} />
            <span>가드 중</span>
          </label>
        )}
        <button type="button" onClick={() => pick(input.attacker, input.defender)}>
          병종 값으로 되돌리기
        </button>
      </div>

      {!result ? (
        <p className="note">{aType?.name}의 일반 행동은 공격이 아니어서 피해 공식을 볼 수 없습니다. 다른 병종을 고르세요.</p>
      ) : (
        <>
          <div className="formula-step">
            <span className="step-name">① 기본값</span>
            {formula === 'additive' && (
              <div className="chips">
                <Var label={`병종 보정 (${aType?.name})`} value={input.typeBonus} min={-50} max={100} step={1} onChange={(v) => set('typeBonus', v)} from="병종 카드" />
                <Op>+</Op>
                <Var label={`대상 취약 (${dType?.name})`} value={input.vulnerability} min={-50} max={100} step={1} onChange={(v) => set('vulnerability', v)} from="병종 카드" />
                <Op>+</Op>
                {statVar('attackStat')}
                <Op>×</Op>
                <Coef label={`${atkName} 1당`} path={physical ? 'balance.damage.additive.attackMul' : 'balance.damage.additive.intellectMul'} />
                <Op>−</Op>
                {statVar('defenseStat')}
                <Op>×</Op>
                <Coef label={`${defName} 1당`} path={physical ? 'balance.damage.additive.defenseMul' : 'balance.damage.additive.resistMul'} />
                <Op>=</Op>
                <Out label={result.rawValue < a.min ? `기본값 (하한 ${a.min} 적용)` : '기본값'} value={fmt(Math.max(a.min, result.rawValue))} />
                <Coef label="하한" path="balance.damage.additive.min" />
              </div>
            )}
            {formula === 'gap' && (
              <div className="chips">
                <span className="op">1 + (</span>
                {statVar('attackStat')}
                <Op>−</Op>
                {statVar('defenseStat')}
                {g.bonusDiv > 0 && (
                  <>
                    <Op>+ (</Op>
                    <Var label="병종 보정" value={input.typeBonus} min={-50} max={100} step={1} onChange={(v) => set('typeBonus', v)} from="병종 카드" />
                    <Op>+</Op>
                    <Var label="대상 취약" value={input.vulnerability} min={-50} max={100} step={1} onChange={(v) => set('vulnerability', v)} from="병종 카드" />
                    <Op>) ÷</Op>
                    <Coef label="나누기" path="balance.damage.gap.bonusDiv" />
                  </>
                )}
                <Op>) ×</Op>
                <Coef label="격차 1점당" path="balance.damage.gap.perPoint" step={0.01} />
                <Op>=</Op>
                <Out label="격차 배율" value={`× ${fmt(result.mitigation)}`} />
                <Coef label="하한" path="balance.damage.gap.min" step={0.05} />
              </div>
            )}
            {formula === 'divide' && (
              <div className="chips">
                {statVar('attackStat')}
                <Op>× </Op>
                <Coef label="공격 계수" path="balance.damage.attackScale" />
                <Op>÷ (1 +</Op>
                {statVar('defenseStat')}
                <Op>×</Op>
                <Coef label={physical ? '방어 계수' : '저항 계수'} path={physical ? 'balance.damage.defenseScale' : 'balance.damage.resistScale'} step={0.01} />
                <Op>)</Op>
              </div>
            )}
            {curveNote && <p className="note">{curveNote}</p>}
          </div>

          <div className="formula-step">
            <span className="step-name">② 기본 피해</span>
            <div className="chips">
              {formula === 'additive' && (
                <>
                  <Out label="기본값" value={fmt(Math.max(a.min, result.rawValue))} />
                  <Op>×</Op>
                  <Coef label="배율" path="balance.damage.additive.scale" step={0.5} />
                </>
              )}
              {formula === 'gap' &&
                (g.baseMode === 'flat' ? (
                  <Coef label="고정 기본 피해" path="balance.damage.gap.flat" step={10} />
                ) : (
                  <>
                    <Out label={atkName} value={fmt(result.effAttack)} />
                    <Op>×</Op>
                    <Coef label="공격 계수" path="balance.damage.attackScale" />
                  </>
                ))}
              {formula === 'divide' && <Out label="스탯 부분" value={fmt(result.base / Math.max(0.0001, input.power))} />}
              <Op>×</Op>
              <Var label={`스킬 계수 (${result.skill.name})`} value={input.power} min={0} max={3} step={0.05} onChange={(v) => set('power', v)} from="스킬 표" />
              {formula === 'gap' && (
                <>
                  <Op>×</Op>
                  <Out label="격차 배율" value={`× ${fmt(result.mitigation)}`} />
                </>
              )}
              {formula === 'divide' && (
                <>
                  <Op>×</Op>
                  <Out label="방어 경감" value={`× ${fmt(result.mitigation)}`} />
                </>
              )}
              <Op>=</Op>
              <Out label="기본 피해" value={fmt(result.base * result.mitigation)} />
            </div>
          </div>

          <div className="formula-step">
            <span className="step-name">③ 최종 피해</span>
            <div className="chips">
              <Out label="기본 피해" value={fmt(result.base * result.mitigation)} />
              <Op>×</Op>
              <Out label="병력 보정 (아래 게이지)" value={`× ${fmt(result.troop)}`} />
              <Op>×</Op>
              <Out label={`대상 열 (${input.defenderRow === 'front' ? '전열' : '후열'})`} value={`× ${fmt(result.row)}`} />
              <Op>×</Op>
              <Out label={`받는 ${physical ? '물리' : '책략'} (${dType?.name})`} value={`× ${fmt(result.taken)}`} />
              <Op>×</Op>
              <Out label="가드" value={`× ${fmt(result.guard)}`} />
              {result.other !== 1 && (
                <>
                  <Op>×</Op>
                  <Out label="특성 · 사기" value={`× ${fmt(result.other)}`} />
                </>
              )}
              <Op>=</Op>
              <Out label="최종 피해" value={num(result.damage)} big />
            </div>
            <p className="note">열, 받는 피해, 가드 배수는 병종 카드의 값입니다 (병종 · 스킬 탭에서 고칩니다). 크리티컬이 나면 × {balance.critical?.multiplier ?? 1}.</p>
          </div>

          <div className="formula-step">
            <span className="step-name">병력 보정</span>
            <TroopGauge input={input} onChange={setInput} level={level} />
          </div>
        </>
      )}
    </section>
  );
}
