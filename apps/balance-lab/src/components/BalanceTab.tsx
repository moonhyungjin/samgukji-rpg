import { useState } from 'react';
import { useLab } from '../lab/LabContext';
import { groupByPromotion } from '../editor/lib/unitTypes';
import { CheckField, NumberField, SelectField } from './Fields';
import { defaultFormulaInput } from '../lib/formulaLab';
import type { FormulaInput } from '../lib/formulaLab';
import { FormulaExplorer } from './FormulaExplorer';
import { FormulaPanel } from './FormulaPanel';
import { TroopGauge } from './TroopGauge';

/**
 * 전투 공식과 규칙 수치. 패널을 한 줄에 하나씩 놓고, 피해 공식과 병력 보정은 지금 고른 방식의 칸만 보여 준다.
 * 고치면 즉시 위의 공식/계산과 시뮬레이션(자동 실행이 켜져 있을 때)에 반영된다.
 */
export function BalanceTab() {
  const { state } = useLab();
  const { formula = 'divide', gap } = state.balance.damage;
  const mode = state.balance.troopFactor.mode ?? 'absolute';

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

      <section className="panel">
        <h3>피해 공식</h3>
        <p className="note">공식을 고르면 그 공식에 쓰는 칸만 나옵니다. 식은 위의 "지금 피해 공식"에 나옵니다.</p>
        <SelectField
          label="피해 공식"
          path="balance.damage.formula"
          options={[
            { value: 'additive', label: '원작식: (병종 보정 + 대상 취약 + 공격×10 − 방어×8) × 10 × 병력 보정' },
            { value: 'divide', label: '기존: 공격 × 공격 계수 ÷ (1 + 방어 × 방어 계수)' },
            { value: 'gap', label: '격차식: 기본 피해 × (1 + (공격 − 방어) × 격차 1점당 비율)' },
          ]}
        />
        {formula === 'gap' && (
          <>
            <p className="note">공격 − 방어 스탯 격차 1점마다 피해가 일정 비율씩 늘거나 줍니다. 기본 피해는 "기준 스탯 × 공격 계수" 또는 고정값입니다.</p>
            <div className="fields-grid">
              <SelectField
                label="기본 피해"
                path="balance.damage.gap.baseMode"
                options={[
                  { value: 'stat', label: '기준 스탯 × 공격 계수' },
                  { value: 'flat', label: '고정값' },
                ]}
              />
              {gap?.baseMode === 'flat' ? (
                <NumberField label="고정 기본 피해" path="balance.damage.gap.flat" step={10} min={0} />
              ) : (
                <NumberField label="공격 계수 (attackScale)" path="balance.damage.attackScale" step={1} min={0} />
              )}
              <NumberField label="격차 1점당 비율" path="balance.damage.gap.perPoint" step={0.01} min={0} />
              <NumberField label="배율 하한" path="balance.damage.gap.min" step={0.05} min={0} />
              <NumberField label="병종 보정 나누기 (0이면 안 씀)" path="balance.damage.gap.bonusDiv" step={1} min={0} hint="0보다 크면 (병종 보정 + 대상 취약) ÷ 이 값을 격차에 더한다" />
            </div>
          </>
        )}
        {formula === 'additive' && (
          <>
            <p className="note">병종 차이를 더하기로 줍니다. 병종 보정과 대상 취약은 병종 카드에서 고칩니다. 기본값 × 배율 × 스킬 계수 × 병력 보정입니다.</p>
            <div className="fields-grid">
              <NumberField label="공격 1당" path="balance.damage.additive.attackMul" step={1} min={0} />
              <NumberField label="방어 1당 빼기" path="balance.damage.additive.defenseMul" step={1} min={0} />
              <NumberField label="지력 1당 (책략)" path="balance.damage.additive.intellectMul" step={1} min={0} />
              <NumberField label="대상 지력 1당 빼기 (책략)" path="balance.damage.additive.resistMul" step={1} min={0} />
              <NumberField label="기본값 하한" path="balance.damage.additive.min" step={1} min={0} />
              <NumberField label="배율" path="balance.damage.additive.scale" step={0.5} min={0} />
            </div>
          </>
        )}
        {formula === 'divide' && (
          <div className="fields-grid">
            <NumberField label="공격 계수 (attackScale)" path="balance.damage.attackScale" step={1} min={0} />
            <NumberField label="방어 계수 (defenseScale)" path="balance.damage.defenseScale" step={0.01} min={0} />
            <NumberField label="지력 저항 계수 (resistScale)" path="balance.damage.resistScale" step={0.01} min={0} />
          </div>
        )}
        <h4 className="sub">모든 공식에 공통</h4>
        <div className="fields-grid">
          <NumberField label="최소 피해" path="balance.damage.minDamage" min={0} />
          <NumberField label="치명타 확률 % (0이면 꺼짐)" path="balance.critical.chance" step={1} min={0} max={100} />
          <NumberField label="치명타 피해 배율" path="balance.critical.multiplier" step={0.1} min={1} hint="일반공격과 책략에만. 반격과 치유에는 적용되지 않는다" />
        </div>
      </section>

      <section className="panel">
        <h3>병력</h3>
        <div className="fields-grid">
          <NumberField label="Lv1 최대 병력 (모든 병종)" path="balance.troops.base" step={10} min={1} />
          <NumberField label="레벨당 병력 상한 증가" path="balance.troops.perLevel" step={5} min={0} hint="× 병종의 병력 배율 (방패병 1.5면 레벨당 1.5배)" />
        </div>
        <p className="note">
          최대 병력 = Lv1 최대 병력 + 레벨당 병력 상한 증가 × 병종 병력 배율 × (레벨 − 1). 지금 값으로 Lv15: 병력 배율 1이면 {state.balance.troops.base + state.balance.troops.perLevel * 14}, 1.5면 {Math.round(state.balance.troops.base + state.balance.troops.perLevel * 1.5 * 14)}, 0.8이면 {Math.round(state.balance.troops.base + state.balance.troops.perLevel * 0.8 * 14)}.
        </p>
        <SelectField
          label="병력 보정 방식"
          path="balance.troopFactor.mode"
          options={[
            { value: 'ratio', label: '비율 구간식: 내 최대 병력 대비 비율, 구간마다 효율이 다름' },
            { value: 'tiered', label: '구간식(원작 방식): 병력 수로 꺾이는 지점까지 1명당 1, 이후 효율 감소' },
            { value: 'absolute', label: '기존: 모든 병종 같은 기준 병력' },
            { value: 'relative', label: '상대 비교: 공격력 기반은 상대 병력과 비교, 지력 기반은 내 최대 병력 대비' },
          ]}
        />
        {mode !== 'ratio' && (
          <>
            <CheckField label="병종 병력 배율은 피해에 영향을 주지 않는다 (환산 병력)" path="balance.troopFactor.normalizeByScale" />
            <p className="note">끄면(원작 방식) 실제 병력 수로 피해를 계산해서 병력이 많은 병종이 더 세게 때립니다. 켜면 병력을 병력 배율로 나눈 값(환산 병력)으로 세어서, 최대 병력이 적은 병종도 가득 차면 같은 세기로 때립니다.</p>
          </>
        )}
        {mode === 'ratio' && (
          <>
            <p className="note">
              내 최대 병력 대비 현재 병력 비율로 셉니다 (가득 차면 1). 100% → 첫 지점까지는 1%당 1%씩, 첫 지점 → 둘째 지점은 1%당 (구간 2 효율)씩, 둘째 → 셋째 지점은 1%당 (구간 3 효율)씩 보정이 줄고, 셋째 지점 아래는 그대로입니다. 병력이 "하한 병력"보다 적으면 비율과 상관없이 하한 보정입니다. 병력 배율은 최대 병력만 정하고 보정에는 영향이 없습니다.
            </p>
            <div className="fields-grid">
              <NumberField label="첫 지점 (비율)" path="balance.troopFactor.ratio.knee" step={0.05} min={0} max={1} hint="여기까지는 효율 1 (0.8 = 80%)" />
              <NumberField label="둘째 지점 (비율)" path="balance.troopFactor.ratio.knee2" step={0.05} min={0} max={1} />
              <NumberField label="셋째 지점 (비율)" path="balance.troopFactor.ratio.knee3" step={0.05} min={0} max={1} hint="이 아래는 보정이 더 줄지 않는다 (하한)" />
              <NumberField label="구간 2 효율 (첫 → 둘째)" path="balance.troopFactor.ratio.rate2" step={0.05} min={0} />
              <NumberField label="구간 3 효율 (둘째 → 셋째)" path="balance.troopFactor.ratio.rate3" step={0.05} min={0} />
              <NumberField label="하한 병력 (명)" path="balance.troopFactor.ratio.floorTroops" step={10} min={0} hint="병력이 이보다 적으면 하한 보정. 0이면 쓰지 않는다" />
            </div>
          </>
        )}
        {mode === 'tiered' && (
          <>
            <p className="note">유효 병력 = 꺾이는 지점까지 1명당 1 + 두 번째 지점까지 1명당 (구간 2 효율) + 그 이상 1명당 (구간 3 효율), 최소 하한. 보정 = 유효 병력 ÷ 기준 병력.</p>
            <div className="fields-grid">
              <NumberField label="꺾이는 지점" path="balance.troopFactor.tiered.knee" step={50} min={1} />
              <NumberField label="두 번째 지점" path="balance.troopFactor.tiered.knee2" step={100} min={1} />
              <NumberField label="구간 2 효율" path="balance.troopFactor.tiered.rate2" step={0.05} min={0} />
              <NumberField label="구간 3 효율" path="balance.troopFactor.tiered.rate3" step={0.05} min={0} />
              <NumberField label="유효 병력 하한" path="balance.troopFactor.tiered.floor" step={10} min={0} />
              <NumberField label="기준 병력" path="balance.troopFactor.reference" step={50} min={1} hint="유효 병력 ÷ 이 값이 보정이 된다" />
            </div>
            <CheckField label="피해가 공격자의 현재 병력을 넘지 않는다" path="balance.troopFactor.tiered.capAtTroops" />
          </>
        )}
        {mode === 'absolute' && (
          <>
            <p className="note">보정 = 현재 병력 ÷ 기준 병력 (하한~상한). 병종마다 최대 병력이 달라도 같은 기준을 씁니다.</p>
            <div className="fields-grid">
              <NumberField label="기준 병력" path="balance.troopFactor.reference" step={50} min={1} hint="병력 ÷ 이 값이 보정이 된다" />
              <NumberField label="보정 하한" path="balance.troopFactor.min" step={0.05} min={0} />
              <NumberField label="보정 상한" path="balance.troopFactor.max" step={0.05} min={0} />
            </div>
          </>
        )}
        {mode === 'relative' && (
          <>
            <p className="note">공격력 기반(일반공격/돌격/화살/풍수사 활)은 (내 병력 ÷ 상대 병력)의 거듭제곱, 지력 기반(책략/도술/치유)은 상대와 무관하게 내 최대 병력 대비 현재 병력입니다.</p>
            <div className="fields-grid">
              <NumberField label="[상대 비교] 하한" path="balance.troopFactor.relative.min" step={0.05} min={0} hint="약한 쪽이 얼마까지 약해지는가" />
              <NumberField label="[상대 비교] 상한" path="balance.troopFactor.relative.max" step={0.05} min={0} hint="큰 쪽의 이점이 어디서 멈추는가" />
              <NumberField label="[상대 비교] 지수" path="balance.troopFactor.relative.exponent" step={0.05} min={0} hint="0.5면 완만(제곱근), 1이면 병력 비율 그대로" />
              <NumberField label="[지력 기반] 하한" path="balance.troopFactor.self.min" step={0.05} min={0} hint="내 병력이 거의 없을 때의 최소 보정" />
              <NumberField label="[지력 기반] 상한" path="balance.troopFactor.self.max" step={0.05} min={0} hint="1이면 병력이 가득 찼을 때가 최대" />
            </div>
          </>
        )}
        {input && (
          <div className="troop-preview">
            <h4 className="sub">병력 보정 게이지</h4>
            <p className="note">맨 위 실험대와 같은 병종·값입니다. 위 칸을 고치면 곡선과 피해가 바로 바뀌고, 게이지를 드래그해 병력에 따른 변화를 봅니다.</p>
            <TroopGauge input={input} onChange={setInput} level={level} />
          </div>
        )}
      </section>

      <section className="panel">
        <h3>반격 · 전투 길이 · 치유</h3>
        <div className="fields-grid">
          <NumberField label="기본 반격 비율" path="balance.counter.rate" step={0.05} min={0} hint="기술에 반격 비율이 없을 때 쓴다. 반격 비율은 스킬 표에서 기술마다 정한다" />
          <NumberField label="총 전투 턴 한도" path="balance.maxTurns" min={1} />
          <NumberField label="회복 계수 (heal.scale)" path="balance.heal.scale" step={1} min={0} />
        </div>
        <CheckField label="치유량에도 시전자의 병력 보정 적용" path="balance.heal.useTroopFactor" />
      </section>

      <section className="panel" data-panel="debuffs">
        <h3>디버프 (상태이상)</h3>
        <p className="note">
          공격이 맞으면 스킬에 정한 확률로 걸리고(스킬 표의 "디버프" 칸), 라운드가 끝날 때마다 <b>고정값 + 걸린 타격 피해 × 비율</b>만큼 병력이 줄어듭니다. 가드와 결계로 막을 수 없고 반격도 없으며, 틱으로 전멸할 수 있습니다. 다시 걸면 갱신되고(쌓이지 않음), 서로 다른 디버프는 함께 걸립니다. 치유로 지우는 병종은 병종 카드의 "치유 시 디버프 해제"입니다.
        </p>
        {Object.entries(state.balance.debuffs ?? {}).map(([id, d]) => (
          <div key={id} className="debuff-row">
            <h4 className="sub">
              {d.name} <small className="muted">({id})</small>
            </h4>
            <div className="fields-grid">
              <NumberField label="고정값" path={`balance.debuffs.${id}.flat`} step={5} min={0} />
              <NumberField label="걸린 타격 피해 × 비율" path={`balance.debuffs.${id}.ratio`} step={0.05} min={0} />
              <NumberField label="지속 (라운드)" path={`balance.debuffs.${id}.rounds`} step={1} min={0} />
            </div>
            <p className="note">
              예: 타격 피해 300으로 걸리면 라운드마다 {Math.round(d.flat + 300 * d.ratio)}, {d.rounds}라운드 동안 모두 {Math.round(d.flat + 300 * d.ratio) * d.rounds}. 이 디버프를 거는 스킬:{' '}
              {Object.values(state.data.skills)
                .filter((s) => s.debuff?.id === id)
                .map((s) => `${s.name} (${s.debuff!.chance}%)`)
                .join(', ') || '없음'}
            </p>
          </div>
        ))}
      </section>

      <section className="panel">
        <h3>사기 (제로섬)</h3>
        <p className="note">기본은 피해에 영향을 주지 않고 최종 판정에서만 쓰입니다.</p>
        <div className="fields-grid">
          <NumberField label="방어측 시작 비율" path="balance.morale.defenderStart" step={1} min={0} max={100} hint="50이면 동등. 공격측 = 100 − 값" />
          <NumberField label="피해 보정 폭" path="balance.morale.maxEffect" step={0.01} min={0} hint="0이면 사기는 피해에 영향을 주지 않는다 (기본). 사기가 100:0일 때 ± 몇 %" />
          <NumberField label="군단 전멸 시 변동" path="balance.morale.onUnitDestroyed" step={1} min={0} />
          <NumberField label="피격 시 변동" path="balance.morale.onHit" step={0.5} min={0} />
          <SelectField
            label="최종 판정에서 사기 순서"
            path="balance.morale.judgement"
            options={[
              { value: 'tiebreak', label: '전멸 수 → 병력 → 사기 → 방어측 (기본)' },
              { value: 'before-troops', label: '전멸 수 → 사기 → 병력 → 방어측' },
            ]}
          />
        </div>
      </section>

      <section className="panel">
        <h3>행동력 → AP</h3>
        <div className="fields-grid">
          <NumberField label="행동력 몇 마다 AP 1" path="balance.action.perAp" step={1} min={1} hint="추가 AP = 올림(행동력 ÷ 이 값). 전투 총 AP = 병종 기본 AP + 추가 AP" />
          <NumberField label="행동력 상한" path="balance.action.cap" step={1} min={1} hint="이보다 큰 행동력은 세지 않는다 (아이템으로 올리는 한계)" />
        </div>
      </section>

      <section className="panel">
        <h3>스탯 변환</h3>
        <NumberField label="스탯 입력 상한" path="balance.statCap" min={10} hint="아이템 보정 하드캡" />
        <p className="note">스탯(0~10) → 유효 스탯 곡선. 10을 넘으면 마지막 기울기로 이어진다.</p>
        <div className="curve">
          {Array.from({ length: 11 }, (_, i) => (
            <label className="field" key={i}>
              <span>{i}</span>
              <NumberField path={`balance.statCurve.${i}`} step={0.1} />
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
