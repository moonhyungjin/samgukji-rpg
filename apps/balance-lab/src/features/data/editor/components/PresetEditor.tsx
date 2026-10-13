import { rootIdOf } from '../lib/unitTypes';
import type { BalanceConfig, CharacterData, GameData } from '@samgukji/battle-engine';
import type { PresetDef } from '@samgukji/game-data';
import type { Issue } from '../lib/editor';
import { REQUIRED_PRESETS, ROW_CAPACITY, slotsFromLineup, summarizeLineup } from '../lib/presets';

interface Props {
  presets: readonly PresetDef[];
  savedIds: ReadonlySet<string>;
  changed: ReadonlySet<string>;
  issues: readonly Issue[];
  characters: readonly CharacterData[];
  data: GameData;
  balance: BalanceConfig;
  onEdit: (id: string, patch: Partial<Pick<PresetDef, 'id' | 'label'>>) => void;
  onSetSlot: (id: string, index: number, characterId: string) => void;
  /** 칸의 병종(승급 단계). undefined이면 장수의 병종 */
  onSetUnitType: (id: string, index: number, unitType: string | undefined) => void;
  onDuplicate: (id: string) => void;
  onRevert: (id: string) => void;
  onRemove: (id: string) => void;
}

/** 기본 편성 목록. 칸마다 장수를 골라 전열 3 + 후열 3을 짠다. */
export function PresetEditor({ presets, savedIds, changed, issues, characters, data, balance, onEdit, onSetSlot, onSetUnitType, onDuplicate, onRevert, onRemove }: Props) {
  const bad = new Set(issues.filter((i) => i.level === 'error' && i.id !== undefined).map((i) => i.id));
  const unitTypeList = Object.values(data.unitTypes);
  const typeName = (c: CharacterData) => data.unitTypes[c.unitType]?.name ?? c.unitType;

  return (
    <div className="preset-list">
      {presets.map((p) => {
        const slots = slotsFromLineup(p.lineup);
        const summary = summarizeLineup(p.lineup, data, balance);
        const isSaved = savedIds.has(p.id);
        const className = ['preset', !isSaved ? 'added' : changed.has(p.id) ? 'changed' : '', bad.has(p.id) ? 'invalid' : ''].filter(Boolean).join(' ');
        const own = issues.filter((i) => i.id === p.id);
        const required = REQUIRED_PRESETS.includes(p.id);
        return (
          <section key={p.id} className={className} data-preset={p.id}>
            <header className="preset-head">
              <input className="label-input" aria-label={`${p.id} 이름`} value={p.label} onChange={(e) => onEdit(p.id, { label: e.target.value })} />
              {isSaved ? (
                <code className="preset-id">{p.id}</code>
              ) : (
                <input className="id-input" aria-label="새 편성 id" value={p.id} onChange={(e) => onEdit(p.id, { id: e.target.value })} />
              )}
              <span className="spacer" />
              <span className="badge">
                {summary.units}군단 · 병력 {summary.troops}
              </span>
              <button type="button" onClick={() => onDuplicate(p.id)}>
                복제
              </button>
              {isSaved && changed.has(p.id) && (
                <button type="button" onClick={() => onRevert(p.id)}>
                  되돌리기
                </button>
              )}
              <button
                type="button"
                className="danger"
                disabled={required}
                title={required ? 'Lab과 게임의 기본 대결(촉 vs 위)에 쓰여 삭제할 수 없습니다' : '삭제'}
                onClick={() => onRemove(p.id)}
              >
                삭제
              </button>
            </header>
            <div className="slot-grid">
              {(['front', 'back'] as const).map((row) => (
                <div className="slot-row" key={row}>
                  <span className="row-name">{row === 'front' ? '전열' : '후열'}</span>
                  {Array.from({ length: ROW_CAPACITY }, (_, i) => {
                    const index = (row === 'front' ? 0 : ROW_CAPACITY) + i;
                    const slot = slots[index];
                    const slotChar = slot ? characters.find((c) => c.id === slot.characterId) : undefined;
                    return (
                      <div className="slot-cell" key={index}>
                        <select aria-label={`${p.id} ${row === 'front' ? '전열' : '후열'} ${i + 1}`} value={slot?.characterId ?? ''} onChange={(e) => onSetSlot(p.id, index, e.target.value)}>
                          <option value="">(비움)</option>
                          {characters.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} · {typeName(c)}
                            </option>
                          ))}
                          {slot && !slotChar && <option value={slot.characterId}>{slot.characterId} (없음)</option>}
                        </select>
                        {slot && (
                          <div className="slot-extra">
                            <select aria-label={`${p.id} ${row === 'front' ? '전열' : '후열'} ${i + 1} 병종`} title="이 편성에서 지금 맡은 병종 (승급 단계). 기본은 장수의 병종" value={slot.unitType ?? ''} onChange={(e) => onSetUnitType(p.id, index, e.target.value || undefined)}>
                              <option value="">장수 병종 (기본)</option>
                              {Object.values(data.unitTypes)
                                // 장수의 병종과 같은 승급 계열만 (이미 다른 계열을 고른 값은 그대로 보인다)
                                .filter((u) => u.id === slot.unitType || (u.allowedRows.includes(row) && (!slotChar || rootIdOf(unitTypeList, u.id) === rootIdOf(unitTypeList, slotChar.unitType))))
                                .map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.name}
                                  </option>
                                ))}
                            </select>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="preset-summary">
              {summary.composition}
              {own.map((i, index) => (
                <div key={index} className={i.level}>
                  {i.message}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
