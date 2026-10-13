import { useLab } from '../../lab/LabContext';
import { CheckField, NumberField, SelectField } from '../../shared/Fields';
import { TroopGauge } from './TroopGauge';
import type { FormulaInput } from './formulaLab';

/** 최대 병력과 병력 보정 방식(구간식/비율/상대 비교 …)과 게이지 */
export function TroopsPanel({ input, setInput, level }: { input: FormulaInput | null; setInput: (v: FormulaInput | null) => void; level: number }) {
  const { state } = useLab();
  const mode = state.balance.troopFactor.mode ?? 'absolute';
  return (
  <section className="panel">
    <h3>병력</h3>
    <div className="fields-grid">
      <NumberField label="Lv1 최대 병력 (모든 병종)" path="balance.troops.base" step={10} min={1} hint="레벨 1 군단의 최대 병력. 모든 병종이 같다" />
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
          <NumberField label="둘째 지점 (비율)" path="balance.troopFactor.ratio.knee2" step={0.05} min={0} max={1} hint="첫 지점과 이 지점 사이는 '구간 2 효율'로 줄어든다" />
          <NumberField label="셋째 지점 (비율)" path="balance.troopFactor.ratio.knee3" step={0.05} min={0} max={1} hint="이 아래는 보정이 더 줄지 않는다 (하한)" />
          <NumberField label="구간 2 효율 (첫 → 둘째)" path="balance.troopFactor.ratio.rate2" step={0.05} min={0} hint="이 구간에서 병력 1%가 줄 때 보정이 몇 % 주는가 (0.3이면 병력 10% 감소 → 보정 3% 감소)" />
          <NumberField label="구간 3 효율 (둘째 → 셋째)" path="balance.troopFactor.ratio.rate3" step={0.05} min={0} hint="이 구간에서 병력 1%가 줄 때 보정이 몇 % 주는가" />
          <NumberField label="하한 병력 (명)" path="balance.troopFactor.ratio.floorTroops" step={10} min={0} hint="병력이 이보다 적으면 하한 보정. 0이면 쓰지 않는다" />
        </div>
        <CheckField label="피해가 공격자의 현재 병력을 넘지 않는다 (원작 규칙)" path="balance.troopFactor.ratio.capAtTroops" />
      </>
    )}
    {mode === 'tiered' && (
      <>
        <p className="note">유효 병력 = 꺾이는 지점까지 1명당 1 + 두 번째 지점까지 1명당 (구간 2 효율) + 그 이상 1명당 (구간 3 효율), 최소 하한. 보정 = 유효 병력 ÷ 기준 병력.</p>
        <div className="fields-grid">
          <NumberField label="꺾이는 지점" path="balance.troopFactor.tiered.knee" step={50} min={1} hint="이 병력까지는 1명이 그대로 1로 센다" />
          <NumberField label="두 번째 지점" path="balance.troopFactor.tiered.knee2" step={100} min={1} hint="꺾이는 지점부터 여기까지는 1명을 '구간 2 효율'로 센다" />
          <NumberField label="구간 2 효율" path="balance.troopFactor.tiered.rate2" step={0.05} min={0} hint="두 구간 사이에서 병사 1명을 몇 명으로 세는가" />
          <NumberField label="구간 3 효율" path="balance.troopFactor.tiered.rate3" step={0.05} min={0} hint="두 번째 지점 이상에서 병사 1명을 몇 명으로 세는가" />
          <NumberField label="유효 병력 하한" path="balance.troopFactor.tiered.floor" step={10} min={0} hint="병력이 아무리 줄어도 유효 병력은 이 아래로 안 내려간다" />
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
          <NumberField label="보정 하한" path="balance.troopFactor.min" step={0.05} min={0} hint="병력이 아무리 적어도 보정은 이 아래로 안 내려간다" />
          <NumberField label="보정 상한" path="balance.troopFactor.max" step={0.05} min={0} hint="병력이 아무리 많아도 보정은 이 위로 안 올라간다" />
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
  );
}
