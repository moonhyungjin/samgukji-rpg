import type { BalanceConfig, CharacterData, CharacterRank, GameData, LineupEntry } from '@samgukji/battle-engine';
import { RANK_LABEL, STAT_FIELDS, derive, presetsUsing } from '../lib/editor';
import type { Issue } from '../lib/editor';

interface Props {
  list: readonly CharacterData[];
  /** 표시할 장수 id (필터 결과). 없으면 전부 */
  visibleIds?: ReadonlySet<string>;
  savedIds: ReadonlySet<string>;
  changed: ReadonlySet<string>;
  issues: readonly Issue[];
  data: GameData;
  balance: BalanceConfig;
  presets: Record<string, LineupEntry[]>;
  onEdit: (id: string, patch: Partial<Omit<CharacterData, 'stats'>> & { stats?: Partial<CharacterData['stats']> }) => void;
  onDuplicate: (id: string) => void;
  onRevert: (id: string) => void;
  onRemove: (id: string) => void;
}

/** 장수 목록 표. 칸을 직접 고치면 onEdit이 불린다. */
export function CharacterTable({ list, visibleIds, savedIds, changed, issues, data, balance, presets, onEdit, onDuplicate, onRevert, onRemove }: Props) {
  const unitTypes = Object.values(data.unitTypes);
  const bad = new Set(issues.filter((i) => i.level === 'error' && i.id !== undefined).map((i) => i.id));

  return (
    <div className="tablewrap">
      <table className="characters">
        <thead>
          <tr>
            <th className="name">이름</th>
            <th>병종</th>
            <th>등급</th>
            <th>레벨</th>
            {STAT_FIELDS.map((f) => (
              <th key={f.key} title={f.hint}>
                {f.label}
              </th>
            ))}
            <th title="병종 보정을 더한 실제 공격/방어/지력/속도">실제 공/방/지/속</th>
            <th title="병종 기본 AP + 행동력 추가 AP">총 AP</th>
            <th title="레벨과 병종 병력 배율로 정해지는 최대 병력">병력</th>
            <th title="방어/지력 5, 병력 1000인 기준 상대에게 주는 일반공격 1회 피해">1회 피해</th>
            <th className="name">id</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {list
            .filter((c) => !visibleIds || visibleIds.has(c.id))
            .map((c) => {
              const d = derive(c, data, balance);
              const isSaved = savedIds.has(c.id);
              const usedBy = presetsUsing(c.id, presets);
              const className = [!isSaved ? 'added' : changed.has(c.id) ? 'changed' : '', bad.has(c.id) ? 'invalid' : ''].filter(Boolean).join(' ');
              return (
                <tr key={c.id} className={className} data-id={c.id}>
                  <td className="name">
                    <input className="name-input" aria-label={`${c.id} 이름`} value={c.name} onChange={(e) => onEdit(c.id, { name: e.target.value })} />
                  </td>
                  <td>
                    <select aria-label={`${c.id} 병종`} value={c.unitType} onChange={(e) => onEdit(c.id, { unitType: e.target.value })}>
                      {unitTypes.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                      {!data.unitTypes[c.unitType] && <option value={c.unitType}>{c.unitType} (없음)</option>}
                    </select>
                  </td>
                  <td>
                    <select aria-label={`${c.id} 등급`} value={c.rank ?? 'elite'} onChange={(e) => onEdit(c.id, { rank: e.target.value as CharacterRank })}>
                      {(Object.keys(RANK_LABEL) as CharacterRank[]).map((r) => (
                        <option key={r} value={r}>
                          {RANK_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="level-input"
                      type="number"
                      min={1}
                      aria-label={`${c.id} 레벨`}
                      value={Number.isFinite(c.level) ? c.level : ''}
                      onChange={(e) => onEdit(c.id, { level: e.target.value === '' ? 0 : Number(e.target.value) })}
                    />
                  </td>
                  {STAT_FIELDS.map((f) => (
                    <td key={f.key}>
                      <input
                        type="number"
                        min={0}
                        max={balance.statCap}
                        step={1}
                        aria-label={`${c.id} ${f.label}`}
                        value={Number.isFinite(c.stats[f.key]) ? c.stats[f.key] : ''}
                        onChange={(e) => onEdit(c.id, { stats: { [f.key]: e.target.value === '' ? 0 : Number(e.target.value) } })}
                      />
                    </td>
                  ))}
                  <td className="derived">{d ? <strong>{[d.finalStats.attack, d.finalStats.defense, d.finalStats.intellect, d.finalStats.speed].join(' / ')}</strong> : '-'}</td>
                  <td className="derived">{d ? <strong>{d.totalAp}</strong> : '-'}</td>
                  <td className="derived">{d ? d.troops : '-'}</td>
                  <td className="derived">{d && d.sampleDamage !== null ? <strong>{d.sampleDamage}</strong> : '-'}</td>
                  <td className="id">
                    {isSaved ? (
                      c.id
                    ) : (
                      <input aria-label="새 장수 id" value={c.id} onChange={(e) => onEdit(c.id, { id: e.target.value })} />
                    )}
                  </td>
                  <td className="actions">
                    <button type="button" title="복제" onClick={() => onDuplicate(c.id)}>
                      복제
                    </button>{' '}
                    {isSaved && changed.has(c.id) && (
                      <>
                        <button type="button" title="저장된 값으로 되돌리기" onClick={() => onRevert(c.id)}>
                          되돌리기
                        </button>{' '}
                      </>
                    )}
                    <button
                      type="button"
                      className="danger"
                      disabled={usedBy.length > 0}
                      title={usedBy.length > 0 ? `기본 편성(${usedBy.join(', ')})에서 쓰고 있어 삭제할 수 없습니다` : '삭제'}
                      onClick={() => onRemove(c.id)}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
