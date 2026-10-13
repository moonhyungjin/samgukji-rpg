import { NumberField, SelectField } from '../../shared/Fields';

/** 사기 변화 */
export function MoralePanel() {
  return (
  <section className="panel">
    <h3>사기 (제로섬)</h3>
    <p className="note">기본은 피해에 영향을 주지 않고 최종 판정에서만 쓰입니다.</p>
    <div className="fields-grid">
      <NumberField label="방어측 시작 비율" path="balance.morale.defenderStart" step={1} min={0} max={100} hint="50이면 동등. 공격측 = 100 − 값" />
      <NumberField label="피해 보정 폭" path="balance.morale.maxEffect" step={0.01} min={0} hint="0이면 사기는 피해에 영향을 주지 않는다 (기본). 사기가 100:0일 때 ± 몇 %" />
      <NumberField label="군단 전멸 시 변동" path="balance.morale.onUnitDestroyed" step={1} min={0} hint="군단이 전멸할 때 사기가 상대 쪽으로 옮겨가는 양" />
      <NumberField label="피격 시 변동" path="balance.morale.onHit" step={0.5} min={0} hint="공격에 맞을 때마다 사기가 상대 쪽으로 옮겨가는 양 (디버프 피해는 제외)" />
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
  );
}
