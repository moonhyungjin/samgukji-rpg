import { CheckField, NumberField } from '../../shared/Fields';

/** 반격, 전투 길이, 치유 */
export function CounterPanel() {
  return (
  <section className="panel">
    <h3>반격 · 전투 길이 · 치유</h3>
    <div className="fields-grid">
      <NumberField label="기본 반격 비율" path="balance.counter.rate" step={0.05} min={0} hint="기술에 반격 비율이 없을 때 쓴다. 반격 비율은 스킬 표에서 기술마다 정한다" />
      <NumberField label="총 전투 턴 한도" path="balance.maxTurns" min={1} hint="이 라운드 수가 지나면 남은 상태로 판정한다 (교착 방지 안전장치)" />
      <NumberField label="회복 계수 (heal.scale)" path="balance.heal.scale" step={1} min={0} hint="치유량 = 지력 × 이 값 × 스킬 계수" />
    </div>
    <CheckField label="맞아서 전멸해도 반격한다 (주고받기를 동시에, 반격은 맞기 전 병력으로)" path="balance.counter.onDestroy" />
    <CheckField label="치유량에도 시전자의 병력 보정 적용" path="balance.heal.useTroopFactor" />
  </section>
  );
}
