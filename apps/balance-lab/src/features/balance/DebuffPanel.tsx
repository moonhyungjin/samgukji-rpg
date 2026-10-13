import { useLab } from '../../lab/LabContext';
import { NumberField } from '../../shared/Fields';

/** 화상, 역병 같은 디버프 수치 */
export function DebuffPanel() {
  const { state } = useLab();
  return (
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
          <NumberField label="고정값" path={`balance.debuffs.${id}.flat`} step={5} min={0} hint="라운드마다 들어가는 피해의 고정 부분" />
          <NumberField label="걸린 타격 피해 × 비율" path={`balance.debuffs.${id}.ratio`} step={0.05} min={0} hint="걸릴 때 준 타격 피해에 곱해 틱에 더한다 (0.2면 타격 300 → +60)" />
          <NumberField label="지속 (라운드)" path={`balance.debuffs.${id}.rounds`} step={1} min={0} hint="몇 라운드 동안 틱이 들어가는가. 0이면 이 디버프는 꺼진다" />
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
  );
}
