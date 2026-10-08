import { useLab } from '../lab/LabContext';
import { CheckField, NumberField, SelectField } from './Fields';

/** 스킬 id 목록의 표. 병종 카드(그 병종의 스킬)와 "전체 스킬 표"가 같이 쓴다. 값을 고치면 같은 스킬을 쓰는 모든 병종에 적용된다. */
export function SkillTable({ ids }: { ids: readonly string[] }) {
  const { state } = useLab();
  const skills = ids.map((id) => state.data.skills[id]).filter(Boolean);

  return (
    <table className="skill-table">
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
        {skills.map((s) => (
          <tr key={s.id} data-skill={s.id}>
            <td title={s.id}>{s.name}</td>
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
              {s.counterable ? <NumberField label="반격 비율" path={`data.skills.${s.id}.counterRate`} step={0.05} min={0} hint="맞은 쪽이 공격자를 계수 1로 친 피해 × 이 값 (맞기 전 병력 기준). 비워 두면 밸런스 수치의 기본 반격 비율" /> : null}
            </td>
            <td>
              <CheckField label="막을 수 있음" path={`data.skills.${s.id}.guardable`} />
            </td>
            <td>{s.kind === 'attack' && s.scalesWith === 'attack' ? <NumberField path={`data.skills.${s.id}.ignoreDefense`} step={0.5} min={0} /> : null}</td>
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
  );
}
