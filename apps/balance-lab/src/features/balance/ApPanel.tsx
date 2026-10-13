import { NumberField } from '../../shared/Fields';

/** 행동력을 AP로 바꾸는 규칙 */
export function ApPanel() {
  return (
  <section className="panel">
    <h3>행동력 → AP</h3>
    <div className="fields-grid">
      <NumberField label="행동력 몇 마다 AP 1" path="balance.action.perAp" step={1} min={1} hint="추가 AP = 올림(행동력 ÷ 이 값). 전투 총 AP = 병종 기본 AP + 추가 AP" />
      <NumberField label="행동력 상한" path="balance.action.cap" step={1} min={1} hint="이보다 큰 행동력은 세지 않는다 (아이템으로 올리는 한계)" />
    </div>
  </section>
  );
}
