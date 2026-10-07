import { FAMILIES } from '@samgukji/battle-engine';
import { useLab } from '../lab/LabContext';
import { FAMILY_LABEL } from '../lib/format';
import { CheckField, CheckGroup, NumberField, SelectField, TextField } from './Fields';
import type { Option } from './Fields';
import { UnitTypesSection } from './UnitTypesSection';

const ROW_OPTIONS: Option[] = [
  { value: 'front', label: '전열' },
  { value: 'back', label: '후열' },
];
const FAMILY_OPTIONS: Option[] = FAMILIES.map((f) => ({ value: f, label: FAMILY_LABEL[f] }));

/** 병종, 병종 특성, 스킬(커맨드)을 편집한다. 계열 간 상성표는 없고 병종 차이는 특성으로 표현한다. */
export function DataTab() {
  const { state, update } = useLab();
  const { data } = state;

  const skillOptions: Option[] = Object.values(data.skills).map((s) => ({ value: s.id, label: s.name }));

  return (
    <div>

      <UnitTypesSection />

      <section className="panel">
        <h3>스킬 (커맨드)</h3>
        <table>
          <thead>
            <tr>
              <th>스킬</th>
              <th>종류</th>
              <th>기준 스탯</th>
              <th>계수</th>
              <th>AP 소모</th>
              <th>반격 받음</th>
              <th>가드로 막힘</th>
              <th>방어 무시</th>
              <th>버프</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(data.skills).map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>
                  <SelectField
                    path={`data.skills.${s.id}.kind`}
                    options={[
                      { value: 'attack', label: '공격' },
                      { value: 'heal', label: '회복' },
                      { value: 'guard', label: '가드' },
                      { value: 'buff', label: '버프' },
                    ]}
                  />
                </td>
                <td>
                  <SelectField
                    path={`data.skills.${s.id}.scalesWith`}
                    options={[
                      { value: 'attack', label: '공격 (방어로 경감)' },
                      { value: 'intellect', label: '지력 (지력으로 저항)' },
                    ]}
                  />
                </td>
                <td>
                  <NumberField path={`data.skills.${s.id}.power`} step={0.05} min={0} />
                </td>
                <td>
                  <NumberField path={`data.skills.${s.id}.apCost`} min={1} />
                </td>
                <td>
                  <CheckField label="반격 발생" path={`data.skills.${s.id}.counterable`} />
                  {s.counterable ? <NumberField label="반격 비율" path={`data.skills.${s.id}.counterRate`} step={0.05} min={0} hint="맞은 쪽이 공격자를 계수 1로 친 피해 × 이 값 (맞기 전 병력)" /> : null}
                </td>
                <td>
                  <CheckField label="막을 수 있음" path={`data.skills.${s.id}.guardable`} />
                </td>
                <td>
                  {s.kind === 'attack' && s.scalesWith === 'attack' ? <NumberField path={`data.skills.${s.id}.ignoreDefense`} step={0.5} min={0} /> : null}
                </td>
                <td>
                  {s.kind === 'buff' && s.buff ? (
                    s.buff.type === 'stats' ? (
                      <span className="check-group">
                        <small>무작위 가짓수</small>
                        <NumberField path={`data.skills.${s.id}.buff.minCount`} min={1} />
                        <NumberField path={`data.skills.${s.id}.buff.maxCount`} min={1} />
                        <small>올리는 양</small>
                        <NumberField path={`data.skills.${s.id}.buff.amount`} step={0.5} min={0} />
                        <small>최대 중첩</small>
                        <NumberField path={`data.skills.${s.id}.buff.maxStacks`} min={1} />
                      </span>
                    ) : (
                      <span className="check-group">
                        <small>피해 무시 횟수</small>
                        <NumberField path={`data.skills.${s.id}.buff.charges`} min={1} />
                        <small>최대 중첩</small>
                        <NumberField path={`data.skills.${s.id}.buff.maxStacks`} min={1} />
                      </span>
                    )
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="note">
          "반격 받음"이 켜진 공격(근접)은 대상이 살아 있고 반격할 수 있는 병종이면 공격자도 일부 피해를 입습니다. 원거리 공격은 끕니다.
          "가드로 막힘"이 켜진 공격은 대상과 같은 열의 가드 유닛이 확률로 대신 맞습니다. 책략처럼 막을 수 없는 공격은 끕니다.
          가드는 공격하면 풀리고, 막을 때마다 확률이 줄어듭니다.
          버프는 병력과 무관하게 아군 하나를 돕습니다. 스탯형(책사)은 공/방/지/속 중 무작위 몇 가지를 전투가 끝날 때까지 올리고, 피해 무시형(도사)은 다음 피해를 횟수만큼 0으로 만듭니다. "최대 중첩"은 한 아군에게 그 스킬을 쓸 수 있는 횟수입니다.
        </p>
      </section>
    </div>
  );
}
