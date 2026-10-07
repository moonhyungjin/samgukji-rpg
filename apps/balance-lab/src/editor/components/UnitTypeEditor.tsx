import { FAMILIES } from '@samgukji/battle-engine';
import type { BalanceConfig, Family, GameData, Row, UnitTypeData } from '@samgukji/battle-engine';
import type { Issue } from '../lib/editor';
import { DEFAULT_GUARD, FAMILY_LABEL, MOD_FIELDS, charactersUsing, unitTypeSummary } from '../lib/unitTypes';

type Patch = Partial<Omit<UnitTypeData, 'statMods' | 'damageTakenByType' | 'guard'>> & {
  statMods?: Partial<NonNullable<UnitTypeData['statMods']>>;
  damageTakenByType?: Partial<NonNullable<UnitTypeData['damageTakenByType']>>;
  /** null이면 가드를 끈다 */
  guard?: Partial<NonNullable<UnitTypeData['guard']>> | null;
};

interface Props {
  unitTypes: readonly UnitTypeData[];
  savedIds: ReadonlySet<string>;
  changed: ReadonlySet<string>;
  issues: readonly Issue[];
  /** 병종을 쓰는 장수 이름을 알려 주기 위해 */
  characters: GameData['characters'];
  /** 스킬/특성 목록 */
  data: GameData;
  balance: BalanceConfig;
  onEdit: (id: string, patch: Patch) => void;
  onDuplicate: (id: string) => void;
  onRevert: (id: string) => void;
  onRemove: (id: string) => void;
}

const num = (value: string) => (value === '' ? 0 : Number(value));

/** 병종 목록. 카드마다 병력, AP, 사거리, 보정, 받는 피해, 반격, 스킬, 가드를 고친다. */
export function UnitTypeEditor({ unitTypes, savedIds, changed, issues, characters, data, balance, onEdit, onDuplicate, onRevert, onRemove }: Props) {
  const bad = new Set(issues.filter((i) => i.level === 'error' && i.id !== undefined).map((i) => i.id));
  const skills = Object.values(data.skills);
  const traits = Object.values(data.traits);
  const toggle = (list: readonly string[], id: string, on: boolean) => (on ? [...list, id] : list.filter((x) => x !== id));

  return (
    <div className="unittypes">
      {unitTypes.map((u) => {
        const isSaved = savedIds.has(u.id);
        const className = ['unittype', !isSaved ? 'added' : changed.has(u.id) ? 'changed' : '', bad.has(u.id) ? 'invalid' : ''].filter(Boolean).join(' ');
        const users = charactersUsing(u.id, Object.values(characters));
        const summary = unitTypeSummary(u, balance);
        const own = issues.filter((i) => i.id === u.id);
        const mods = { attack: 0, defense: 0, intellect: 0, speed: 0, action: 0, ...u.statMods };
        const taken = { physical: 1, magic: 1, ...u.damageTakenByType };
        const field = (label: string, input: React.ReactNode, hint?: string) => (
          <label className="ufield" title={hint}>
            <span>{label}</span>
            {input}
          </label>
        );
        return (
          <section key={u.id} className={className} data-unittype={u.id}>
            <header className="preset-head">
              <input className="label-input" aria-label={`${u.id} 이름`} value={u.name} onChange={(e) => onEdit(u.id, { name: e.target.value })} />
              {isSaved ? (
                <code className="preset-id">{u.id}</code>
              ) : (
                <input className="id-input" aria-label="새 병종 id" value={u.id} onChange={(e) => onEdit(u.id, { id: e.target.value })} />
              )}
              <span className="spacer" />
              <span className="badge" title="레벨 15 기준 최대 병력">
                병력 {summary.troops} · {summary.rows}
              </span>
              <button type="button" onClick={() => onDuplicate(u.id)}>
                복제
              </button>
              {isSaved && changed.has(u.id) && (
                <button type="button" onClick={() => onRevert(u.id)}>
                  되돌리기
                </button>
              )}
              <button
                type="button"
                className="danger"
                disabled={users.length > 0}
                title={users.length > 0 ? `장수 ${users.length}명이 쓰고 있어 삭제할 수 없습니다 (${users.slice(0, 4).join(', ')}${users.length > 4 ? ' …' : ''})` : '삭제'}
                onClick={() => onRemove(u.id)}
              >
                삭제
              </button>
            </header>

            <div className="ugrid">
              {field(
                '계열',
                <select aria-label={`${u.id} 계열`} value={u.family} onChange={(e) => onEdit(u.id, { family: e.target.value as Family })}>
                  {FAMILIES.map((f) => (
                    <option key={f} value={f}>
                      {FAMILY_LABEL[f]}
                    </option>
                  ))}
                </select>,
                '통계와 특성 조건에 쓰이는 분류',
              )}
              {field(
                '사거리',
                <input type="number" min={1} step={1} aria-label={`${u.id} 사거리`} value={u.range} onChange={(e) => onEdit(u.id, { range: num(e.target.value) })} />,
                '1: 전열에서 적 전열만, 3: 어느 열에서든 모든 열',
              )}
              {field(
                '병력 배율',
                <input type="number" min={0.05} step={0.05} aria-label={`${u.id} 병력 배율`} value={u.troopScale ?? 1} onChange={(e) => onEdit(u.id, { troopScale: num(e.target.value) })} />,
                '같은 레벨에서 최대 병력에 곱하는 값',
              )}
              {field(
                '기본 AP',
                <input type="number" min={0} step={1} aria-label={`${u.id} 기본 AP`} value={u.baseAp ?? 0} onChange={(e) => onEdit(u.id, { baseAp: num(e.target.value) })} />,
                '총 AP = 기본 AP + 행동력 추가 AP',
              )}
              <div className="ufield rows" role="group" aria-label={`${u.id} 배치 가능 열`}>
                <span>배치 가능 열</span>
                {(['front', 'back'] as Row[]).map((row) => (
                  <label key={row} className="check">
                    <input
                      type="checkbox"
                      aria-label={`${u.id} ${row === 'front' ? '전열' : '후열'} 배치`}
                      checked={u.allowedRows.includes(row)}
                      onChange={(e) => onEdit(u.id, { allowedRows: toggle(u.allowedRows, row, e.target.checked) as Row[] })}
                    />
                    {row === 'front' ? '전열' : '후열'}
                  </label>
                ))}
              </div>
            </div>

            <div className="usection">스탯 보정 (캐릭터 기본 스탯에 더해짐)</div>
            <div className="ugrid">
              {MOD_FIELDS.map((f) =>
                field(
                  f.label,
                  <input type="number" step={1} aria-label={`${u.id} 보정 ${f.label}`} value={mods[f.key]} onChange={(e) => onEdit(u.id, { statMods: { [f.key]: num(e.target.value) } })} />,
                ),
              )}
            </div>

            <div className="usection">받는 피해 배수 · 반격</div>
            <div className="ugrid">
              {field(
                '물리',
                <input type="number" min={0.05} step={0.05} aria-label={`${u.id} 받는 피해 물리`} value={taken.physical} onChange={(e) => onEdit(u.id, { damageTakenByType: { physical: num(e.target.value) } })} />,
                '일반공격/돌격/화살로 맞을 때',
              )}
              {field(
                '책략',
                <input type="number" min={0.05} step={0.05} aria-label={`${u.id} 받는 피해 책략`} value={taken.magic} onChange={(e) => onEdit(u.id, { damageTakenByType: { magic: num(e.target.value) } })} />,
                '책략/독연으로 맞을 때',
              )}
              <label className="ufield check-field">
                <span>반격</span>
                <input type="checkbox" aria-label={`${u.id} 반격함`} checked={u.canCounter} onChange={(e) => onEdit(u.id, { canCounter: e.target.checked })} />
              </label>
              {field(
                '반격 비율',
                <input type="number" min={0} step={0.05} aria-label={`${u.id} 반격 비율`} value={u.counterRate ?? 0.5} disabled={!u.canCounter} onChange={(e) => onEdit(u.id, { counterRate: num(e.target.value) })} />,
                '반격 피해 = 일반공격 피해 × 이 값',
              )}
            </div>

            <div className="usection">스킬 · 특성</div>
            <div className="ugrid wide">
              {field(
                '일반공격',
                <select aria-label={`${u.id} 일반공격`} value={u.basicSkillId} onChange={(e) => onEdit(u.id, { basicSkillId: e.target.value })}>
                  {skills.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.id})
                    </option>
                  ))}
                  {!data.skills[u.basicSkillId] && <option value={u.basicSkillId}>{u.basicSkillId} (없음)</option>}
                </select>,
              )}
            </div>
            <div className="checks" role="group" aria-label={`${u.id} 추가 스킬`}>
              <span className="check-title">추가 스킬</span>
              {skills.map((s) => (
                <label key={s.id} className="check">
                  <input
                    type="checkbox"
                    aria-label={`${u.id} 스킬 ${s.name}`}
                    checked={u.extraSkillIds.includes(s.id)}
                    onChange={(e) => onEdit(u.id, { extraSkillIds: toggle(u.extraSkillIds, s.id, e.target.checked) })}
                  />
                  {s.name}
                </label>
              ))}
            </div>
            <div className="checks" role="group" aria-label={`${u.id} 특성`}>
              <span className="check-title">특성</span>
              {traits.map((t) => (
                <label key={t.id} className="check">
                  <input
                    type="checkbox"
                    aria-label={`${u.id} 특성 ${t.name}`}
                    checked={u.traitIds.includes(t.id)}
                    onChange={(e) => onEdit(u.id, { traitIds: toggle(u.traitIds, t.id, e.target.checked) })}
                  />
                  {t.name}
                </label>
              ))}
            </div>

            <div className="usection">
              <label className="check">
                <input
                  type="checkbox"
                  aria-label={`${u.id} 가드 사용`}
                  checked={u.guard !== undefined}
                  onChange={(e) => onEdit(u.id, { guard: e.target.checked ? { ...DEFAULT_GUARD } : null })}
                />
                가드 (같은 열 아군을 대신 맞을 확률)
              </label>
            </div>
            {u.guard && (
              <div className="ugrid">
                {field('시작 %p', <input type="number" min={0} step={5} aria-label={`${u.id} 가드 시작`} value={u.guard.start} onChange={(e) => onEdit(u.id, { guard: { start: num(e.target.value) } })} />)}
                {field('상승 %p', <input type="number" min={0} step={5} aria-label={`${u.id} 가드 상승`} value={u.guard.gain} onChange={(e) => onEdit(u.id, { guard: { gain: num(e.target.value) } })} />)}
                {field('감소 %p', <input type="number" min={0} step={5} aria-label={`${u.id} 가드 감소`} value={u.guard.decay} onChange={(e) => onEdit(u.id, { guard: { decay: num(e.target.value) } })} />)}
                {field(
                  '받는 피해 배수',
                  <input type="number" min={0.05} step={0.05} aria-label={`${u.id} 가드 피해 배수`} value={u.guard.damageTaken ?? 1} onChange={(e) => onEdit(u.id, { guard: { damageTaken: num(e.target.value) } })} />,
                  '가드 상태(확률 > 0)인 동안 받는 피해에 곱함',
                )}
              </div>
            )}

            {users.length > 0 && <div className="preset-summary">쓰는 장수 {users.length}명: {users.slice(0, 6).join(', ')}{users.length > 6 ? ' …' : ''}</div>}
            {own.length > 0 && (
              <div className="preset-summary">
                {own.map((i, index) => (
                  <div key={index} className={i.level}>
                    {i.message}
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
