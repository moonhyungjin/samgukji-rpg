import type { GameData } from '@samgukji/battle-engine';
import { skillUsers } from '../../../skillOwnership';
import { field, toggle } from './shared';
import type { SectionProps } from './shared';

const SKILL_KIND_ORDER = ['attack', 'heal', 'guard', 'buff', 'revive'] as const;
const SKILL_KIND_LABEL: Record<(typeof SKILL_KIND_ORDER)[number], string> = { attack: '공격', heal: '회복', guard: '가드', buff: '버프', revive: '부활' };

/** 일반공격, 자동 버프, 추가 스킬, 그 병종이 쓰는 스킬 표(renderSkills) */
export function SkillsSection({ u, onEdit, data, renderSkills }: SectionProps & { data: GameData; renderSkills?: (unit: SectionProps['u']) => React.ReactNode }) {
  const skills = Object.values(data.skills);
  // 같은 이름의 스킬(공격, 가드 …)은 쓰는 병종 이름을 붙여 구분한다
  const nameCount = skills.reduce<Record<string, number>>((m, s) => ({ ...m, [s.name]: (m[s.name] ?? 0) + 1 }), {});
  const skillLabel = (id: string, name: string) => {
    const owner = nameCount[name] > 1 ? skillUsers(data.unitTypes, id)[0] : undefined;
    return owner ? `${name} · ${owner.name}` : name;
  };
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
  return (
    <>
        <div className="usection">스킬</div>
        <div className="ugrid wide">
          {field(
            '일반공격',
            <select aria-label={`${u.id} 일반공격`} value={u.basicSkillId} onChange={(e) => onEdit(u.id, { basicSkillId: e.target.value })}>
              {skillOptions(() => true)}
              {!data.skills[u.basicSkillId] && <option value={u.basicSkillId}>{u.basicSkillId} (없음)</option>}
            </select>,
          )}
          {field(
            '자동 버프',
            <select aria-label={`${u.id} 자동 버프`} value={u.autoBuffSkillId ?? ''} onChange={(e) => onEdit(u.id, { autoBuffSkillId: e.target.value || undefined })}>
              <option value="">없음</option>
              {skillOptions((sk) => sk.kind === 'buff')}
              {u.autoBuffSkillId && !data.skills[u.autoBuffSkillId] && <option value={u.autoBuffSkillId}>{u.autoBuffSkillId} (없음)</option>}
            </select>,
            '1라운드가 시작될 때 AP 없이 자기 자신에게 한 번 걸리는 버프 (군주). 범위는 무시하고 자신만 받는다',
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
    </>
  );
}
