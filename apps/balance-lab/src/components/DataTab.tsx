import { FAMILIES } from '@samgukji/battle-engine';
import { useLab } from '../lab/LabContext';
import { FAMILY_LABEL } from '../lib/format';
import { CheckField, CheckGroup, NumberField, SelectField, TextField } from './Fields';
import type { Option } from './Fields';
import { SkillTable } from './SkillTable';
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

      <section className="panel all-skills">
        <h3>전체 스킬 표</h3>
        <p className="note">스킬은 각 병종 카드 안에서도 고칠 수 있고, 여기서는 모든 스킬을 한꺼번에 봅니다.</p>
        <SkillTable ids={Object.keys(data.skills)} />
        <p className="note">
          "반격 유발"이 켜진 공격(근접)은 대상이 살아 있고 반격할 수 있는 병종이면 공격자도 일부 피해를 입습니다. 원거리 공격은 끕니다.
          "가드로 막힘"이 켜진 공격은 대상과 같은 열의 가드 유닛이 확률로 대신 맞습니다. 책략처럼 막을 수 없는 공격은 끕니다.
          가드는 공격하면 풀리고, 막을 때마다 확률이 줄어듭니다.
          버프는 병력과 무관하게 아군 하나를 돕습니다. 스탯형(책사)은 공/방/지/속 중 무작위 몇 가지를 전투가 끝날 때까지 올리고, 피해 무시형(도사)은 다음 피해를 횟수만큼 0으로 만듭니다. "최대 중첩"은 한 아군에게 그 스킬을 쓸 수 있는 횟수입니다.
        </p>
      </section>
    </div>
  );
}
