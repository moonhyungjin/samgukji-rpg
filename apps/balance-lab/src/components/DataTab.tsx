import { FAMILIES } from '@samgukji/battle-engine';
import { useLab } from '../lab/LabContext';
import { FAMILY_LABEL } from '../lib/format';
import { CheckField, CheckGroup, NumberField, SelectField, TextField } from './Fields';
import type { Option } from './Fields';

const ROW_OPTIONS: Option[] = [
  { value: 'front', label: '전열' },
  { value: 'back', label: '후열' },
];
const FAMILY_OPTIONS: Option[] = FAMILIES.map((f) => ({ value: f, label: FAMILY_LABEL[f] }));

/** 병종, 병종 특성, 스킬(커맨드)을 편집한다. 계열 간 상성표는 없고 병종 차이는 특성으로 표현한다. */
export function DataTab() {
  const { state, update } = useLab();
  const { data } = state;

  const traitOptions: Option[] = Object.values(data.traits).map((t) => ({ value: t.id, label: t.name }));
  const skillOptions: Option[] = Object.values(data.skills).map((s) => ({ value: s.id, label: s.name }));

  const addTrait = () =>
    update((s) => {
      let n = 1;
      while (s.data.traits[`trait-${n}`]) n++;
      const id = `trait-${n}`;
      return {
        ...s,
        data: { ...s.data, traits: { ...s.data.traits, [id]: { id, name: '새 특성', kind: 'damage-dealt' as const, multiplier: 1.2 } } },
      };
    });

  /** 병종의 가드를 켜고 끈다. 켜면 가드 스킬(kind: guard)도 병종의 스킬 목록에 넣는다. */
  const toggleGuard = (typeId: string, on: boolean) =>
    update((s) => {
      const guardSkill = Object.values(s.data.skills).find((k) => k.kind === 'guard');
      const type = s.data.unitTypes[typeId];
      const extra = type.extraSkillIds.filter((id) => s.data.skills[id]?.kind !== 'guard');
      let next;
      if (on) {
        next = { ...type, guard: type.guard ?? { start: 50, gain: 70, decay: 40 }, extraSkillIds: guardSkill ? [...extra, guardSkill.id] : extra };
      } else {
        const { guard: _removed, ...rest } = type;
        next = { ...rest, extraSkillIds: extra };
      }
      return { ...s, data: { ...s.data, unitTypes: { ...s.data.unitTypes, [typeId]: next } } };
    });

  const removeTrait = (id: string) =>
    update((s) => {
      const { [id]: _removed, ...traits } = s.data.traits;
      const unitTypes = Object.fromEntries(
        Object.entries(s.data.unitTypes).map(([key, u]) => [key, { ...u, traitIds: u.traitIds.filter((t) => t !== id) }]),
      );
      return { ...s, data: { ...s.data, traits, unitTypes } };
    });

  return (
    <div>
      <section className="panel">
        <h3>병종 특성</h3>
        <p className="note">
          상성표를 대신해 병종 차이를 만드는 장치입니다. "주는 피해"는 내가 공격할 때 상대 조건에 맞으면, "받는 피해"는 상대가 나를 공격할 때 상대 조건에 맞으면 배율이 곱해집니다.
          조건을 비워 두면 모든 상대에게 적용됩니다. 예: 창병 → 기병 ×1.25 (주는 피해), 궁병이 근접에게 맞을 때 ×1.3 (받는 피해).
        </p>
        <table>
          <thead>
            <tr>
              <th>이름</th>
              <th>종류</th>
              <th>상대 계열</th>
              <th>상대 열</th>
              <th>배율</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {Object.values(data.traits).map((t) => (
              <tr key={t.id}>
                <td>
                  <TextField path={`data.traits.${t.id}.name`} />
                </td>
                <td>
                  <SelectField
                    path={`data.traits.${t.id}.kind`}
                    options={[
                      { value: 'damage-dealt', label: '주는 피해' },
                      { value: 'damage-taken', label: '받는 피해' },
                    ]}
                  />
                </td>
                <td>
                  <CheckGroup path={`data.traits.${t.id}.versus.families`} options={FAMILY_OPTIONS} />
                </td>
                <td>
                  <CheckGroup path={`data.traits.${t.id}.versus.rows`} options={ROW_OPTIONS} />
                </td>
                <td>
                  <NumberField path={`data.traits.${t.id}.multiplier`} step={0.05} min={0} />
                </td>
                <td>
                  <button type="button" onClick={() => removeTrait(t.id)}>
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" onClick={addTrait}>
          특성 추가
        </button>
      </section>

      <section className="panel">
        <h3>병종</h3>
        <p className="note">
          병력 배율: 같은 징병 비용으로 모이는 병력의 비율입니다. 군단 레벨로 정해진 최대 병력에 곱해집니다. 예: 보병 1, 풍수사 0.5 → 같은 레벨에서 풍수사의 병력은 절반이고,
          병력이 적으면 공격도 약해지고(병력 보정) 더 빨리 쓰러집니다.
        </p>
        <table>
          <thead>
            <tr>
              <th>병종</th>
              <th>병력 배율</th>
              <th>시작 배치 가능 열</th>
              <th>대상 규칙</th>
              <th>반격</th>
              <th>일반공격</th>
              <th>특성</th>
              <th>가드 (시작 / 상승 / 감소, %p)</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(data.unitTypes).map((u) => (
              <tr key={u.id}>
                <td>
                  {u.name} <small>({FAMILY_LABEL[u.family]})</small>
                </td>
                <td>
                  <NumberField path={`data.unitTypes.${u.id}.troopScale`} step={0.05} min={0.05} />
                </td>
                <td>
                  <CheckGroup path={`data.unitTypes.${u.id}.allowedRows`} options={ROW_OPTIONS} />
                </td>
                <td>
                  <SelectField
                    path={`data.unitTypes.${u.id}.targetRule`}
                    options={[
                      { value: 'front-first', label: '전열 우선' },
                      { value: 'any', label: '전열/후열 모두' },
                    ]}
                  />
                </td>
                <td>
                  <CheckField label="반격함" path={`data.unitTypes.${u.id}.canCounter`} />
                </td>
                <td>
                  <SelectField path={`data.unitTypes.${u.id}.basicSkillId`} options={skillOptions} />
                </td>
                <td>
                  <CheckGroup path={`data.unitTypes.${u.id}.traitIds`} options={traitOptions} />
                </td>
                <td>
                  <label className="check">
                    <input type="checkbox" checked={u.guard !== undefined} onChange={(e) => toggleGuard(u.id, e.target.checked)} />
                    <span>사용</span>
                  </label>
                  {u.guard && (
                    <span className="check-group">
                      <NumberField path={`data.unitTypes.${u.id}.guard.start`} step={5} min={0} />
                      <NumberField path={`data.unitTypes.${u.id}.guard.gain`} step={5} min={0} />
                      <NumberField path={`data.unitTypes.${u.id}.guard.decay`} step={5} min={0} />
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

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
              <th>버프 (스탯 / 올리는 양 / 최대 중첩)</th>
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
                </td>
                <td>
                  <CheckField label="막을 수 있음" path={`data.skills.${s.id}.guardable`} />
                </td>
                <td>
                  {s.kind === 'buff' && s.buff ? (
                    <>
                      <SelectField
                        path={`data.skills.${s.id}.buff.stat`}
                        options={[
                          { value: 'attack', label: '공격' },
                          { value: 'defense', label: '방어' },
                        ]}
                      />
                      <NumberField path={`data.skills.${s.id}.buff.amount`} step={0.5} min={0} />
                      <NumberField path={`data.skills.${s.id}.buff.maxStacks`} min={1} />
                    </>
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
          버프는 아군 하나의 스탯을 전투가 끝날 때까지 올립니다 (병력과 무관). 한 아군에게 쌓을 수 있는 횟수가 "최대 중첩"입니다.
        </p>
      </section>
    </div>
  );
}
