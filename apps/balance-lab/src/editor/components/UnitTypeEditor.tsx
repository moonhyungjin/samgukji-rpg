import { FAMILIES, statModsTotal } from '@samgukji/battle-engine';
import type { BalanceConfig, Family, GameData, Row, UnitTypeData } from '@samgukji/battle-engine';
import { skillUsers } from '../../lib/skillOwnership';
import type { Issue } from '../lib/editor';
import { DEFAULT_GUARD, FAMILY_LABEL, MOD_FIELDS, charactersUsing, groupByPromotion, promotionDepth, promotionPathLabel, unitTypeRecord, unitTypeSummary } from '../lib/unitTypes';

type Patch = Partial<Omit<UnitTypeData, 'statMods' | 'damageTakenByType' | 'damageDealtByRow' | 'guard' | 'recruit' | 'typeBonus' | 'vulnerability'>> & {
  statMods?: Partial<NonNullable<UnitTypeData['statMods']>>;
  typeBonus?: Partial<NonNullable<UnitTypeData['typeBonus']>>;
  vulnerability?: Partial<NonNullable<UnitTypeData['vulnerability']>>;
  recruit?: Partial<NonNullable<UnitTypeData['recruit']>>;
  damageTakenByType?: Partial<NonNullable<UnitTypeData['damageTakenByType']>>;
  damageDealtByRow?: Partial<NonNullable<UnitTypeData['damageDealtByRow']>>;
  /** null이면 가드를 끈다 */
  guard?: Partial<NonNullable<UnitTypeData['guard']>> | null;
};

const SKILL_KIND_ORDER = ['attack', 'heal', 'guard', 'buff', 'revive'] as const;
const SKILL_KIND_LABEL: Record<(typeof SKILL_KIND_ORDER)[number], string> = { attack: '공격', heal: '회복', guard: '가드', buff: '버프', revive: '부활' };
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const DEPTH_NAME = (depth: number) => (depth === 0 ? '0차' : `${depth}차`);

interface Props {
  /** 그릴 병종들 */
  unitTypes: readonly UnitTypeData[];
  /** 승급 길과 승급 대상 이름을 찾을 전체 병종 (생략하면 unitTypes) */
  all?: readonly UnitTypeData[];
  /** 병종 카드 안에 넣을 스킬 영역 (Lab 상태가 필요해서 바깥에서 주입한다) */
  renderSkills?: (unit: UnitTypeData) => React.ReactNode;
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
export function UnitTypeEditor({ unitTypes, all, renderSkills, savedIds, changed, issues, characters, data, balance, onEdit, onDuplicate, onRevert, onRemove }: Props) {
  const bad = new Set(issues.filter((i) => i.level === 'error' && i.id !== undefined).map((i) => i.id));
  const skills = Object.values(data.skills);
  // 같은 이름의 스킬(공격, 가드 …)은 쓰는 병종 이름을 붙여 구분한다
  const nameCount = skills.reduce<Record<string, number>>((m, s) => ({ ...m, [s.name]: (m[s.name] ?? 0) + 1 }), {});
  /** 스킬 선택 목록: 종류(공격/회복/가드/버프/부활)별로 묶어 모든 스킬을 보여 준다. 병종이 쓸 수 있는 스킬을 제한하지 않는다 */
  const skillOptions = (include: (s: (typeof skills)[number]) => boolean) =>
    SKILL_KIND_ORDER.map((kind) => ({ kind, items: skills.filter((s) => s.kind === kind && include(s)) }))
      .filter((g) => g.items.length > 0)
      .map((g) => (
        <optgroup key={g.kind} label={SKILL_KIND_LABEL[g.kind]}>
          {g.items.map((s) => (
            <option key={s.id} value={s.id}>
              {skillLabel(s.id, s.name)}
            </option>
          ))}
        </optgroup>
      ));
  const skillLabel = (id: string, name: string) => {
    const owner = nameCount[name] > 1 ? skillUsers(data.unitTypes, id)[0] : undefined;
    return owner ? `${name} · ${owner.name}` : name;
  };
  const every = all ?? unitTypes;
  const toggle = (list: readonly string[], id: string, on: boolean) => (on ? [...list, id] : list.filter((x) => x !== id));

  return (
    <div className="unittypes">
      {groupByPromotion(unitTypes).map((group) => (
        <div className="tier-group" key={group.depth} data-tier={group.depth}>
          <h4 className="sub tier-title">
            {group.label} <span className="badge">{group.items.length}종</span>
          </h4>
          {group.items.map((u) => renderCard(u))}
        </div>
      ))}
    </div>
  );

  function renderCard(u: UnitTypeData) {
    {
        const isSaved = savedIds.has(u.id);
        const className = ['unittype', !isSaved ? 'added' : changed.has(u.id) ? 'changed' : '', bad.has(u.id) ? 'invalid' : ''].filter(Boolean).join(' ');
        const users = charactersUsing(u.id, Object.values(characters));
        const summary = unitTypeSummary(u, balance);
        const own = issues.filter((i) => i.id === u.id);
        const mods = { attack: 0, defense: 0, intellect: 0, speed: 0, action: 0, ...u.statMods };
        const taken = { physical: 1, magic: 1, ...u.damageTakenByType };
        const dealt = { front: 1, back: 1, ...u.damageDealtByRow };
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
                '레벨이 오를 때 병력 상한이 늘어나는 배율. 레벨당 증가 = 밸런스의 "레벨당 병력 상한 증가" × 이 값 (Lv1은 모든 병종이 같다)',
              )}
              {field(
                '증원 단가',
                <input type="number" min={0} step={1} aria-label={`${u.id} 증원 단가`} value={u.recruit?.reinforce ?? 0} onChange={(e) => onEdit(u.id, { recruit: { reinforce: num(e.target.value) } })} />,
                '정원을 1명 늘리는 돈 (아직 전투에서 쓰지 않음)',
              )}
              {field(
                '보충 단가',
                <input type="number" min={0} step={0.5} aria-label={`${u.id} 보충 단가`} value={u.recruit?.replenish ?? 0} onChange={(e) => onEdit(u.id, { recruit: { replenish: num(e.target.value) } })} />,
                '잃은 병사 1명을 채우는 돈',
              )}
              {field(
                '해고 환급',
                <input type="number" min={0} step={0.5} aria-label={`${u.id} 해고 환급`} value={u.recruit?.dismiss ?? 0} onChange={(e) => onEdit(u.id, { recruit: { dismiss: num(e.target.value) } })} />,
                '1명을 줄일 때 돌려받는 돈',
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

            <div className="usection">스탯 보정 (앞 병종의 보정에 더해짐)</div>
            <div className="ugrid">
              {MOD_FIELDS.map((f) =>
                field(
                  f.label,
                  <input type="number" step={1} aria-label={`${u.id} 보정 ${f.label}`} value={mods[f.key]} onChange={(e) => onEdit(u.id, { statMods: { [f.key]: num(e.target.value) } })} />,
                ),
              )}
            </div>

            <div className="usection">승급 ({DEPTH_NAME(promotionDepth(every, u.id))})</div>
            <p className="note promo-note">
              {promotionPathLabel(every, u.id)}
              {u.promotesTo.length > 0 ? ` → 다음: ${u.promotesTo.map((id) => every.find((x) => x.id === id)?.name ?? id).join(' / ')}` : ''}
            </p>
            <p className="note">
              장수에게 적용되는 보정 합계 (기본 병종부터 이 병종까지): {MOD_FIELDS.map((f) => `${f.label} ${signed(statModsTotal(unitTypeRecord(every), u.id)[f.key])}`).join(' · ')}
            </p>
            <div className="checks" role="group" aria-label={`${u.id} 승급 대상`}>
              <span className="check-title">승급 대상</span>
              {u.promotesTo.map((id) => (
                <span key={id} className="skill-chip">
                  {every.find((x) => x.id === id)?.name ?? `${id} (없음)`}
                  <button type="button" aria-label={`${u.id} 승급 대상 ${every.find((x) => x.id === id)?.name ?? id} 빼기`} onClick={() => onEdit(u.id, { promotesTo: toggle(u.promotesTo, id, false) })}>
                    ×
                  </button>
                </span>
              ))}
              <select
                aria-label={`${u.id} 승급 대상 추가`}
                value=""
                onChange={(e) => e.target.value && onEdit(u.id, { promotesTo: toggle(u.promotesTo, e.target.value, true) })}
              >
                <option value="">+ 승급 대상 추가…</option>
                {[
                  { label: '같은 계열', items: every.filter((x) => x.id !== u.id && x.family === u.family && !u.promotesTo.includes(x.id)) },
                  { label: '다른 계열', items: every.filter((x) => x.id !== u.id && x.family !== u.family && !u.promotesTo.includes(x.id)) },
                ]
                  .filter((g) => g.items.length > 0)
                  .map((g) => (
                    <optgroup key={g.label} label={g.label}>
                      {g.items.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
              </select>
            </div>

            <div className="usection">피해 배수 · 반격</div>
            <div className="ugrid">
              {field(
                '받는 물리',
                <input type="number" min={0.05} step={0.05} aria-label={`${u.id} 받는 피해 물리`} value={taken.physical} onChange={(e) => onEdit(u.id, { damageTakenByType: { physical: num(e.target.value) } })} />,
                '일반공격/돌격/화살로 맞을 때',
              )}
              {field(
                '받는 책략',
                <input type="number" min={0.05} step={0.05} aria-label={`${u.id} 받는 피해 책략`} value={taken.magic} onChange={(e) => onEdit(u.id, { damageTakenByType: { magic: num(e.target.value) } })} />,
                '책략/도술로 맞을 때',
              )}
              {field(
                '줄 때 전열',
                <input type="number" min={0.05} step={0.05} aria-label={`${u.id} 주는 피해 대상 전열`} value={dealt.front} onChange={(e) => onEdit(u.id, { damageDealtByRow: { front: num(e.target.value) } })} />,
                '대상이 전열일 때 이 병종이 주는 피해에 곱함',
              )}
              {field(
                '줄 때 후열',
                <input type="number" min={0.05} step={0.05} aria-label={`${u.id} 주는 피해 대상 후열`} value={dealt.back} onChange={(e) => onEdit(u.id, { damageDealtByRow: { back: num(e.target.value) } })} />,
                '대상이 후열일 때 이 병종이 주는 피해에 곱함',
              )}
              {field(
                '병종 보정 물리',
                <input type="number" step={1} aria-label={`${u.id} 병종 보정 물리`} value={u.typeBonus?.physical ?? 0} onChange={(e) => onEdit(u.id, { typeBonus: { physical: num(e.target.value) } })} />,
                '원작식 공식: 이 병종이 공격력으로 때릴 때 더하는 값 (원작 기마 50, 무사 30)',
              )}
              {field(
                '병종 보정 책략',
                <input type="number" step={1} aria-label={`${u.id} 병종 보정 책략`} value={u.typeBonus?.magic ?? 0} onChange={(e) => onEdit(u.id, { typeBonus: { magic: num(e.target.value) } })} />,
                '원작식 공식: 이 병종이 지력으로 때릴 때 더하는 값 (원작 음양사 40)',
              )}
              {field(
                '취약 물리',
                <input type="number" step={1} aria-label={`${u.id} 취약 물리`} value={u.vulnerability?.physical ?? 0} onChange={(e) => onEdit(u.id, { vulnerability: { physical: num(e.target.value) } })} />,
                '원작식 공식: 이 병종이 물리 공격에 맞을 때 더하는 값 (원작 무사 0, 지력 계열 20)',
              )}
              {field(
                '취약 책략',
                <input type="number" step={1} aria-label={`${u.id} 취약 책략`} value={u.vulnerability?.magic ?? 0} onChange={(e) => onEdit(u.id, { vulnerability: { magic: num(e.target.value) } })} />,
                '원작식 공식: 이 병종이 책략에 맞을 때 더하는 값',
              )}
              <label className="ufield check-field">
                <span>반격</span>
                <input type="checkbox" aria-label={`${u.id} 반격함`} checked={u.canCounter} onChange={(e) => onEdit(u.id, { canCounter: e.target.checked })} />
              </label>
              {field(
                '반격 배율',
                <input type="number" min={0} step={0.1} aria-label={`${u.id} 반격 배율`} value={u.counterPower ?? 1} onChange={(e) => onEdit(u.id, { counterPower: num(e.target.value) })} />,
                '이 병종이 반격할 때 반격 피해에 곱함 (반격 비율은 공격한 쪽 스킬의 값이고, 이 값은 반격하는 쪽의 세기)',
              )}
              <label className="ufield check-field" title="이 병종이 치유하면 대상의 디버프(화상, 역병 등)를 모두 지운다">
                <span>치유 시 디버프 해제</span>
                <input type="checkbox" aria-label={`${u.id} 치유 시 디버프 해제`} checked={u.cleanseOnHeal === true} onChange={(e) => onEdit(u.id, { cleanseOnHeal: e.target.checked })} />
              </label>
            </div>

            <div className="usection">스킬</div>
            <div className="ugrid wide">
              {field(
                '일반공격',
                <select aria-label={`${u.id} 일반공격`} value={u.basicSkillId} onChange={(e) => onEdit(u.id, { basicSkillId: e.target.value })}>
                  {skillOptions(() => true)}
                  {!data.skills[u.basicSkillId] && <option value={u.basicSkillId}>{u.basicSkillId} (없음)</option>}
                </select>,
              )}
            </div>
            <div className="checks" role="group" aria-label={`${u.id} 추가 스킬`}>
              <span className="check-title">추가 스킬</span>
              {u.extraSkillIds.map((id) => (
                <span key={id} className="skill-chip" title={id}>
                  {data.skills[id] ? skillLabel(id, data.skills[id].name) : `${id} (없음)`}
                  <button type="button" aria-label={`${u.id} 스킬 ${data.skills[id]?.name ?? id} 빼기`} onClick={() => onEdit(u.id, { extraSkillIds: toggle(u.extraSkillIds, id, false) })}>
                    ×
                  </button>
                </span>
              ))}
              <select
                aria-label={`${u.id} 스킬 추가`}
                value=""
                onChange={(e) => e.target.value && onEdit(u.id, { extraSkillIds: toggle(u.extraSkillIds, e.target.value, true) })}
              >
                <option value="">+ 스킬 추가…</option>
                {skillOptions((sk) => sk.id !== u.basicSkillId && !u.extraSkillIds.includes(sk.id))}
              </select>
            </div>
            {renderSkills?.(u)}

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
                {field('상승 %p', <input type="number" min={0} step={5} aria-label={`${u.id} 가드 상승`} value={u.guard.gain} onChange={(e) => onEdit(u.id, { guard: { gain: num(e.target.value) } })} />, '가드 한 번에 고정으로 오르는 확률')}
                {field(
                  '지력당 상승 %p',
                  <input type="number" min={0} step={1} aria-label={`${u.id} 가드 지력당 상승`} value={u.guard.gainPerIntellect ?? 0} onChange={(e) => onEdit(u.id, { guard: { gainPerIntellect: num(e.target.value) } })} />,
                  '가드 한 번에 지력 1당 더 오르는 확률 (원작: 지력 × 20)',
                )}
                {field('감소 %p', <input type="number" min={0} step={5} aria-label={`${u.id} 가드 감소`} value={u.guard.decay} onChange={(e) => onEdit(u.id, { guard: { decay: num(e.target.value) } })} />, '가드 중에 맞을 때마다 (대신 맞든 직접 맞든)')}
                {field(
                  '받는 피해 배수',
                  <input type="number" min={0.05} step={0.05} aria-label={`${u.id} 가드 피해 배수`} value={u.guard.damageTaken ?? 1} onChange={(e) => onEdit(u.id, { guard: { damageTaken: num(e.target.value) } })} />,
                  '가드 상태(확률 > 0)인 동안 받는 피해에 곱함',
                )}
                {field(
                  '지키는 범위',
                  <select aria-label={`${u.id} 가드 범위`} value={u.guard.scope ?? 'row'} onChange={(e) => onEdit(u.id, { guard: { scope: e.target.value as 'row' | 'all' } })}>
                    <option value="row">같은 열 아군</option>
                    <option value="all">모든 아군 (전체 가드)</option>
                  </select>,
                  '대신 맞아 줄 수 있는 아군의 범위',
                )}
                {field(
                  '도술도 막음',
                  <input type="checkbox" aria-label={`${u.id} 가드 도술 방어`} checked={u.guard.interceptsMagic ?? false} onChange={(e) => onEdit(u.id, { guard: { interceptsMagic: e.target.checked } })} />,
                  '지력 기반 공격(책략/도술)도 대신 맞는다 (원래는 가드로 막을 수 없다)',
                )}
                {field(
                  '공격해도 가드 유지',
                  <input type="checkbox" aria-label={`${u.id} 가드 유지 공격`} checked={u.guard.keepOnAttack ?? false} onChange={(e) => onEdit(u.id, { guard: { keepOnAttack: e.target.checked } })} />,
                  '공격해도 가드 확률이 풀리지 않는다 (원래는 공격하면 모두 사라진다)',
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
    }
  }
}
