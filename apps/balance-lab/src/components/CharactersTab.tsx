import { totalAp } from '@samgukji/battle-engine';
import { useLab } from '../lab/LabContext';
import { NumberField, SelectField, TextField } from './Fields';

const STATS: { key: string; label: string }[] = [
  { key: 'attack', label: '공격' },
  { key: 'defense', label: '방어' },
  { key: 'intellect', label: '지력' },
  { key: 'speed', label: '속도' },
  { key: 'action', label: '행동력' },
  { key: 'diplomacy', label: '외교' },
  { key: 'politics', label: '내정' },
  { key: 'charm', label: '매력' },
];

/** 캐릭터 스탯(0~10, 아이템으로 초과 가능), 병종 기본 AP + 행동력(2마다 AP 1), 군단 레벨, 병종을 편집한다. 외교·내정·매력은 아직 전투에서 쓰이지 않는다. */
export function CharactersTab() {
  const { state } = useLab();
  const unitTypeOptions = Object.values(state.data.unitTypes).map((u) => ({ value: u.id, label: u.name }));

  return (
    <section className="panel">
      <h3>캐릭터</h3>
      <table className="characters">
        <thead>
          <tr>
            <th>이름</th>
            <th>병종</th>
            {STATS.map((s) => (
              <th key={s.key}>{s.label}</th>
            ))}
            <th>AP</th>
            <th>레벨</th>
          </tr>
        </thead>
        <tbody>
          {Object.values(state.data.characters).map((c) => (
            <tr key={c.id}>
              <td>
                <TextField path={`data.characters.${c.id}.name`} />
              </td>
              <td>
                <SelectField path={`data.characters.${c.id}.unitType`} options={unitTypeOptions} />
              </td>
              {STATS.map((s) => (
                <td key={s.key}>
                  <NumberField path={`data.characters.${c.id}.stats.${s.key}`} step={0.5} min={0} max={state.balance.statCap} />
                </td>
              ))}
              <td>{totalAp(state.balance, state.data.unitTypes[c.unitType]?.baseAp, c.stats.action + (state.data.unitTypes[c.unitType]?.statMods?.action ?? 0))}</td>
              <td>
                <NumberField path={`data.characters.${c.id}.level`} min={1} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">병종을 바꿨는데 편성에서 그 열에 둘 수 없게 되면 실행 시 오류가 표시됩니다. 편성 탭에서 위치를 바꿔 주세요.</p>
    </section>
  );
}
