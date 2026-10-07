import { useLab } from '../lab/LabContext';
import type { SlotEntry } from '../lab/types';
import { FRONT_SLOTS, SLOT_COUNT, slotRow, slotsFromLineup } from '../lib/slots';

interface Props {
  teamKey: 'teamA' | 'teamB';
  title: string;
}

/** 전열 3칸 + 후열 3칸 편성. 열마다 배치할 수 있는 병종만 고를 수 있다. */
export function LineupEditor({ teamKey, title }: Props) {
  const { state, set } = useLab();
  const slots = state[teamKey];

  const renderSlot = (index: number) => {
    const row = slotRow(index);
    const slot = slots[index];
    const options = Object.values(state.data.characters).filter((c) => state.data.unitTypes[c.unitType]?.allowedRows.includes(row));
    const defaultLevel = slot ? state.data.characters[slot.characterId]?.level : undefined;
    return (
      <div className="slot" key={index}>
        <select
          value={slot?.characterId ?? ''}
          onChange={(e) => set(`${teamKey}.${index}`, e.target.value ? ({ characterId: e.target.value } satisfies SlotEntry) : null)}
        >
          <option value="">(비어 있음)</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {state.data.unitTypes[c.unitType].name}
            </option>
          ))}
          {slot && !options.some((c) => c.id === slot.characterId) && <option value={slot.characterId}>⚠ {slot.characterId} (이 열에 배치 불가)</option>}
        </select>
        {slot && (
          <label className="level">
            Lv
            <input
              type="number"
              min={1}
              placeholder={String(defaultLevel ?? '')}
              value={slot.level ?? ''}
              onChange={(e) => {
                const level = e.target.value === '' ? undefined : Math.max(1, parseInt(e.target.value, 10) || 1);
                set(`${teamKey}.${index}`, level === undefined ? { characterId: slot.characterId } : { ...slot, level });
              }}
            />
          </label>
        )}
      </div>
    );
  };

  return (
    <section className="panel lineup">
      <header className="lineup-head">
        <h3>{title}</h3>
        <span className="presets">
          {state.presets.map((p) => (
            <button key={p.id} type="button" title={p.id} onClick={() => set(teamKey, slotsFromLineup(p.lineup))}>
              {p.label}
            </button>
          ))}
          <button type="button" onClick={() => set(teamKey, Array.from({ length: SLOT_COUNT }, () => null))}>
            비우기
          </button>
        </span>
      </header>
      <div className="row-label">전열</div>
      <div className="slots">{Array.from({ length: FRONT_SLOTS }, (_, i) => renderSlot(i))}</div>
      <div className="row-label">후열</div>
      <div className="slots">{Array.from({ length: SLOT_COUNT - FRONT_SLOTS }, (_, i) => renderSlot(FRONT_SLOTS + i))}</div>
    </section>
  );
}
