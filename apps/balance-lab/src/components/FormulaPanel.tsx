import type { ReactNode } from 'react';
import { DEFAULT_ADDITIVE, DEFAULT_GAP, DEFAULT_RATIO, DEFAULT_TIERED } from '@samgukji/battle-engine';
import { useLab } from '../lab/LabContext';

/** 숫자는 굵게 보여 준다 (지금 Lab에 들어 있는 값) */
const N = ({ children }: { children: ReactNode }) => <b className="num">{children}</b>;

function Line({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="formula-line">
      {label && <span className="formula-label">{label}</span>}
      <span>{children}</span>
    </div>
  );
}

/** 지금 Lab에 들어 있는 값으로 피해 공식을 식의 모양으로 보여 준다. 값을 고치면 같이 바뀐다. */
export function FormulaPanel() {
  const { state } = useLab();
  const b = state.balance;
  const formula = b.damage.formula ?? 'divide';
  const mode = b.troopFactor.mode ?? 'absolute';
  const a = b.damage.additive ?? DEFAULT_ADDITIVE;
  const g = b.damage.gap ?? DEFAULT_GAP;
  const t = b.troopFactor.tiered ?? DEFAULT_TIERED;
  const rel = b.troopFactor.relative ?? { min: 0.5, max: 1.5, exponent: 0.5 };
  const self = b.troopFactor.self ?? { min: 0.3, max: 1 };
  const crit = b.critical;

  const baseDamage =
    formula === 'gap' ? (
      <>
        <Line label="기본 피해">
          {g.baseMode === 'flat' ? (
            <>
              <N>{g.flat}</N> × 스킬 계수
            </>
          ) : (
            <>
              기준 스탯 × <N>{b.damage.attackScale}</N> × 스킬 계수
            </>
          )}
        </Line>
        <Line label="격차 배율">
          1 + (공격 − 방어{g.bonusDiv > 0 ? <> + (병종 보정 + 대상 취약) ÷ <N>{g.bonusDiv}</N></> : null}) × <N>{g.perPoint}</N>　(최소 <N>{g.min}</N>)
        </Line>
        <Line>기준 스탯 = 공격(책략은 지력), 방어 = 대상 방어(책략은 대상 지력). 격차 1점마다 피해가 {Math.round(g.perPoint * 100)}%씩 늘거나 줄어듭니다.</Line>
      </>
    ) : formula === 'additive' ? (
      <>
        <Line label="기본값">
          병종 보정 + 대상 취약 + 공격 × <N>{a.attackMul}</N> − 방어 × <N>{a.defenseMul}</N>　(최소 <N>{a.min}</N>)
        </Line>
        <Line label="기본 피해">
          기본값 × <N>{a.scale}</N> × 스킬 계수
        </Line>
        <Line>
          책략은 지력 × <N>{a.intellectMul}</N> − 대상 지력 × <N>{a.resistMul}</N>
        </Line>
      </>
    ) : (
      <Line label="기본 피해">
        기준 스탯 × <N>{b.damage.attackScale}</N> × 스킬 계수 ÷ (1 + 방어 × <N>{b.damage.defenseScale}</N>)　(책략은 방어 대신 지력 × <N>{b.damage.resistScale}</N>)
      </Line>
    );

  const ratio = b.troopFactor.ratio ?? DEFAULT_RATIO;
  const pctOf = (r: number) => `${Math.round(r * 100)}%`;
  const troopFactor =
    mode === 'ratio' ? (
      <>
        <Line label="병력 보정">
          내 병력 ÷ 내 최대 병력(가득 차면 1)을 구간별 효율로: 100% → <N>{pctOf(ratio.knee)}</N> 효율 1, → <N>{pctOf(ratio.knee2)}</N> 효율 <N>{ratio.rate2}</N>, → <N>{pctOf(ratio.knee3)}</N> 효율 <N>{ratio.rate3}</N>, 그 아래는 하한
        </Line>
        <Line>
          병력이 <N>{ratio.floorTroops}</N>명보다 적으면 비율과 상관없이 하한입니다.
        </Line>
      </>
    ) : mode === 'tiered' ? (
      <>
        <Line label="병력 보정">
          유효 병력 ÷ <N>{b.troopFactor.reference}</N>
        </Line>
        <Line>
          유효 병력 = <N>{t.knee}</N>명까지 1명당 1 + <N>{t.knee2}</N>명까지 1명당 <N>{t.rate2}</N> + 그 이상 1명당 <N>{t.rate3}</N>　(최소 <N>{t.floor}</N>)
          {t.capAtTroops ? '. 피해는 공격자의 현재 병력을 넘지 않습니다' : null}
        </Line>
      </>
    ) : mode === 'relative' ? (
      <>
        <Line label="병력 보정">
          공격력 기반: (내 병력 ÷ 상대 병력)<sup>{rel.exponent}</sup>　(<N>{rel.min}</N> ~ <N>{rel.max}</N>)
        </Line>
        <Line>
          지력 기반(책략·치유): 내 병력 ÷ 내 최대 병력　(<N>{self.min}</N> ~ <N>{self.max}</N>)
        </Line>
      </>
    ) : (
      <Line label="병력 보정">
        병력 ÷ <N>{b.troopFactor.reference}</N>　(<N>{b.troopFactor.min}</N> ~ <N>{b.troopFactor.max}</N>)
      </Line>
    );

  return (
    <details className="panel formula-panel">
      <summary>
        <h3>공식 전체를 글로 보기</h3>
      </summary>
      <p className="note">굵은 숫자가 지금 Lab에 들어 있는 값입니다. 값을 고치면 이 식도 같이 바뀝니다. 반격, 치유, 가드의 설명도 여기 있습니다.</p>
      <Line label="최종 피해">
        기본 피해 × 병력 보정 × 대상 열 배수 × 가드 배수 × 받는 피해 배수{b.morale.maxEffect > 0 ? ' × 사기 보정' : null}
        {crit && crit.chance > 0 ? (
          <>
            {' '}× 크리티컬(<N>{crit.chance}</N>% 확률로 ×<N>{crit.multiplier}</N>)
          </>
        ) : null}
        　(최소 <N>{b.damage.minDamage}</N>)
      </Line>
      <div className="formula-group">{baseDamage}</div>
      <div className="formula-group">{troopFactor}</div>
      <div className="formula-group">
        <Line label="가드 배수">가드 중인 방패병이 맞을 때 병종 카드의 "가드 중 받는 피해"를 곱합니다. 책략은 가드가 막지 못합니다.</Line>
        <Line label="대상 열 배수">공격 병종의 "대상 열에 따른 주는 피해"를 곱합니다. 받는 피해 배수는 대상 병종의 "물리/책략 받는 피해"입니다. (병종 카드에서 고칩니다)</Line>
        <Line label="반격">반격자가 계수 1로 친 피해(맞기 전 병력) × 공격 기술의 반격 비율. 반격 비율이 없는 기술은 <N>{b.counter.rate}</N>입니다. 크리티컬은 반격에 적용되지 않습니다.</Line>
        <Line label="치유">
          지력 × <N>{b.heal.scale}</N> × 스킬 계수{b.heal.useTroopFactor ? ' × 병력 보정' : '　(병력 보정은 곱하지 않음)'}
        </Line>
      </div>
    </details>
  );
}
