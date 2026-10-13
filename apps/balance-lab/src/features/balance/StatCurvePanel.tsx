import { NumberField } from '../../shared/Fields';

/** 스탯을 전투 수치로 바꾸는 곡선 */
export function StatCurvePanel() {
  return (
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
  );
}
