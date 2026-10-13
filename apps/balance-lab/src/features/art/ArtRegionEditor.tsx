import { useEffect, useMemo, useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { ALIGN_LABEL, SCREEN_H, SCREEN_W, alignRegion, editableIndexes, editModeOf, layerOrder, modeNote, regionLabel, regionWarnings } from './artRegions';
import type { AlignHow } from './artRegions';
import type { Region } from './artRegions';
import type { ArtSlot } from './artReview';
import type { SlotRegionsState } from './useSlotRegions';

const FIELDS: { key: keyof Region; label: string; max: number }[] = [
  { key: 'x', label: '가로 위치 x', max: SCREEN_W },
  { key: 'y', label: '세로 위치 y', max: SCREEN_H },
  { key: 'w', label: '너비', max: SCREEN_W },
  { key: 'h', label: '높이', max: SCREEN_H },
];

/** 숫자 칸: 지우고 새로 쓰는 동안은 글자를 그대로 두고, 올바른 숫자가 되면 바로 반영한다 */
function NumberCell({ value, onCommit, ...rest }: { value: number; onCommit: (n: number) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      {...rest}
      type="number"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== '' && Number.isFinite(n)) onCommit(n);
      }}
      onBlur={() => setText(String(value))}
    />
  );
}

/**
 * 슬롯 영역 편집: 숫자로 고치거나, 게임 화면의 점선 상자를 끌어서 옮기고 모서리로 크기를 바꾼다.
 * 좌표는 게임 논리 화면(1280×900) 기준이다. 저장해야 게임이 새 좌표를 쓴다.
 */
export function ArtRegionEditor({ slot, slots, regions }: { slot: ArtSlot; slots: readonly ArtSlot[]; regions: SlotRegionsState }) {
  const indexes = editableIndexes(slot);
  // 맞추기 기준이 될 수 있는 슬롯: 같은 그룹에서 영역이 있는 다른 슬롯 (층 순서가 있는 그룹은 아래층이 먼저)
  const candidates = useMemo(() => slots.filter((s) => s.group === slot.group && s.id !== slot.id && (s.regions?.length ?? 0) > 0), [slots, slot]);
  const [refId, setRefId] = useState('');
  const ref = candidates.find((s) => s.id === refId) ?? candidates[0];
  const align = (i: number, how: AlignHow) => {
    if (!ref?.regions) return;
    const target = ref.regions[Math.min(i, ref.regions.length - 1)];
    regions.edit(slot.id, i, alignRegion(slot.regions![i], target, how));
  };
  const layers = layerOrder(slots.filter((s) => s.group === slot.group));
  const warnings = regionWarnings(slot);
  return (
    <section className="art-region-editor" data-section="region-editor" aria-label={`${slot.id} 영역 편집`}>
      <header>
        <h4>
          영역 편집 <small>{slot.id} · {slot.name}</small>
        </h4>
        <div className="art-region-actions">
          {regions.dirty && <span className="badge art-dirty">저장 안 한 변경 {regions.changed.join(', ')}</span>}
          <button type="button" data-action="regions-revert" disabled={!regions.dirty} onClick={regions.revert}>
            되돌리기
          </button>
          <button type="button" className="primary" data-action="regions-save" disabled={!regions.dirty || regions.saving} onClick={() => void regions.save()}>
            {regions.saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </header>
      {layers.length > 0 && (
        <div className="art-layers" data-section="layer-order">
          <span className="vc-label">겹침 순서</span>
          <ol aria-label="층 순서 (아래에서 위)">
            {layers.map((s) => (
              <li key={s.id} className={s.id === slot.id ? 'now' : ''} data-layer={s.id}>
                <b>{s.id}</b> {s.name}
              </li>
            ))}
          </ol>
          <span className="note">왼쪽이 맨 아래, 오른쪽이 맨 위입니다. 같은 칸에 있는 슬롯은 같은 층입니다. 순서는 코드가 정합니다.</span>
        </div>
      )}
      <p className="note">{modeNote(slot)}</p>
      {editModeOf(slot) === 'mirror' && (
        <label className="check">
          <input type="checkbox" data-action="regions-linked" checked={regions.linked} onChange={(e) => regions.setLinked(e.target.checked)} />
          <span>좌우 대칭 유지</span>
        </label>
      )}
      {indexes.length === 0 ? (
        editModeOf(slot) === 'locked' && (slot.regions?.length ?? 0) > 0 ? (
          <p className="note">{slot.follow ? `${slot.follow} 슬롯과 같은 영역입니다. ${slot.follow}를 고치면 따라옵니다.` : '이 슬롯은 코드가 위치를 정합니다.'}</p>
        ) : null
      ) : (
        <div className="art-region-rows">
          {candidates.length > 0 && (
            <label className="vc-inline art-ref">
              <span>맞출 기준</span>
              <select aria-label="맞출 기준 슬롯" value={ref?.id ?? ''} onChange={(e) => setRefId(e.target.value)}>
                {candidates.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id} {s.name}
                  </option>
                ))}
              </select>
              <small>아래 줄의 버튼으로 기준 슬롯의 영역에 맞춥니다 (저장 전까지 미리 보기)</small>
            </label>
          )}
          {indexes.map((i) => {
            const r = slot.regions![i];
            return (
              <div key={i} className="art-region-row" data-region={i}>
                <span className="art-region-name">{regionLabel(slot, i)}</span>
                {FIELDS.map((f) => (
                  <label key={f.key} className="art-region-field">
                    <span>{f.label}</span>
                    <NumberCell
                      aria-label={`${slot.id} ${regionLabel(slot, i)} ${f.label}`}
                      data-field={f.key}
                      min={f.key === 'w' || f.key === 'h' ? 1 : 0}
                      max={f.max}
                      step={1}
                      value={r[f.key]}
                      onCommit={(n) => regions.edit(slot.id, i, { ...r, [f.key]: n })}
                    />
                  </label>
                ))}
                {ref && (
                  <div className="art-align" role="group" aria-label={`${regionLabel(slot, i)} 맞추기`}>
                    {(['rect', 'size', 'height', 'left', 'right'] as AlignHow[]).map((how) => (
                      <button key={how} type="button" data-align={how} onClick={() => align(i, how)}>
                        {ALIGN_LABEL[how]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {warnings.map((w) => (
        <p key={w} className="note shared">
          ⚠ {w}
        </p>
      ))}
      {regions.message && <p className="note">{regions.message}</p>}
    </section>
  );
}
