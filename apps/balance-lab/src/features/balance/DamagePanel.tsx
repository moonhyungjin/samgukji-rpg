import { useLab } from '../../lab/LabContext';
import { NumberField, SelectField } from '../../shared/Fields';

/** 피해 공식, 크리티컬, 최소 피해 */
export function DamagePanel() {
  const { state } = useLab();
  const { formula = 'divide', gap } = state.balance.damage;
  return (
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
            <NumberField label="고정 기본 피해" path="balance.damage.gap.flat" step={10} min={0} hint="기본 피해를 스탯과 상관없이 이 값으로. 올리면 모든 공격이 같은 비율로 세진다" />
          ) : (
            <NumberField label="공격 계수 (attackScale)" path="balance.damage.attackScale" step={1} min={0} hint="기본 피해 = 공격(책략은 지력) × 이 값. 올리면 모든 공격이 같은 비율로 세진다" />
          )}
          <NumberField label="격차 1점당 비율" path="balance.damage.gap.perPoint" step={0.01} min={0} hint="공격과 방어 차이 1점마다 피해가 늘거나 주는 비율 (0.1 = 10%). 올리면 스탯 차이가 더 크게 갈린다" />
          <NumberField label="배율 하한" path="balance.damage.gap.min" step={0.05} min={0} hint="방어가 아무리 높아도 피해가 이 배율 아래로는 안 줄어든다" />
          <NumberField label="병종 보정 나누기 (0이면 안 씀)" path="balance.damage.gap.bonusDiv" step={1} min={0} hint="0보다 크면 (병종 보정 + 대상 취약) ÷ 이 값을 격차에 더한다" />
        </div>
      </>
    )}
    {formula === 'additive' && (
      <>
        <p className="note">병종 차이를 더하기로 줍니다. 병종 보정과 대상 취약은 병종 카드에서 고칩니다. 기본값 × 배율 × 스킬 계수 × 병력 보정입니다.</p>
        <div className="fields-grid">
          <NumberField label="공격 1당" path="balance.damage.additive.attackMul" step={1} min={0} hint="공격 1점이 기본값에 더하는 양. 올리면 공격 스탯이 더 중요해진다" />
          <NumberField label="방어 1당 빼기" path="balance.damage.additive.defenseMul" step={1} min={0} hint="대상 방어 1점이 기본값에서 빼는 양. 올리면 방어가 높은 병종이 더 단단해진다" />
          <NumberField label="지력 1당 (책략)" path="balance.damage.additive.intellectMul" step={1} min={0} hint="책략/도술: 지력 1점이 기본값에 더하는 양" />
          <NumberField label="대상 지력 1당 빼기 (책략)" path="balance.damage.additive.resistMul" step={1} min={0} hint="책략/도술: 대상 지력 1점이 기본값에서 빼는 양. 올리면 지력 높은 대상이 책략에 강해진다" />
          <NumberField label="기본값 하한" path="balance.damage.additive.min" step={1} min={0} hint="방어가 아무리 높아도 기본값은 이 아래로 안 내려간다 (최소 피해 보장)" />
          <NumberField label="배율" path="balance.damage.additive.scale" step={0.5} min={0} hint="기본 피해 = 기본값 × 이 값 × 스킬 계수. 올리면 모든 공격이 같은 비율로 세진다" />
        </div>
      </>
    )}
    {formula === 'divide' && (
      <div className="fields-grid">
        <NumberField label="공격 계수 (attackScale)" path="balance.damage.attackScale" step={1} min={0} hint="기본 피해 = 공격(책략은 지력) × 이 값. 올리면 모든 공격이 같은 비율로 세진다" />
        <NumberField label="방어 계수 (defenseScale)" path="balance.damage.defenseScale" step={0.01} min={0} hint="피해 ÷ (1 + 방어 × 이 값). 올리면 방어가 더 많이 깎는다" />
        <NumberField label="지력 저항 계수 (resistScale)" path="balance.damage.resistScale" step={0.01} min={0} hint="책략/도술 피해 ÷ (1 + 대상 지력 × 이 값)" />
      </div>
    )}
    <h4 className="sub">모든 공식에 공통</h4>
    <div className="fields-grid">
      <NumberField label="최소 피해" path="balance.damage.minDamage" min={0} hint="맞으면 적어도 이만큼은 깎인다" />
      <NumberField label="치명타 확률 % (0이면 꺼짐)" path="balance.critical.chance" step={1} min={0} max={100} hint="일반공격과 책략이 이 확률로 크리티컬. 반격·치유·디버프 피해에는 없다" />
      <NumberField label="치명타 피해 배율" path="balance.critical.multiplier" step={0.1} min={1} hint="일반공격과 책략에만. 반격과 치유에는 적용되지 않는다" />
    </div>
  </section>
  );
}
