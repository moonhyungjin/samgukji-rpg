import { useMemo, useRef, useState } from 'react';
import type { SkillData } from '@samgukji/battle-engine';
import { useLab } from '../lab/LabContext';
import { CheckField, NumberField, SelectField } from './Fields';

type SortKey = 'name' | 'kind' | 'scalesWith' | 'power' | 'apCost' | 'counterable' | 'guardable' | 'ignoreDefense' | 'behindHit' | 'rowAttack' | 'area';

const COLUMNS: { key: SortKey; label: string; title?: string }[] = [
  { key: 'name', label: '스킬' },
  { key: 'kind', label: '종류' },
  { key: 'scalesWith', label: '기준 스탯' },
  { key: 'power', label: '계수' },
  { key: 'apCost', label: 'AP 소모' },
  { key: 'counterable', label: '반격 유발', title: '이 스킬로 때리면 맞은 쪽이 반격하는가' },
  { key: 'guardable', label: '가드로 막힘' },
  { key: 'ignoreDefense', label: '방어 무시' },
  { key: 'behindHit', label: '동시 타격' },
  { key: 'rowAttack', label: '열 공격' },
  { key: 'area', label: '범위' },
];

const AREA_ORDER: Record<string, number> = { '': 0, row: 1, all: 2 };

/** 정렬용 값. 문자열은 가나다순, 나머지는 숫자로 비교한다 */
function sortValue(s: SkillData, key: SortKey): string | number {
  switch (key) {
    case 'name': return s.name;
    case 'kind': return s.kind;
    case 'scalesWith': return s.scalesWith;
    case 'counterable': return s.counterable ? 1 : 0;
    case 'guardable': return s.guardable ? 1 : 0;
    case 'area': return AREA_ORDER[s.area ?? ''] ?? 0;
    default: return Number(s[key] ?? 0);
  }
}

/**
 * 스킬 id 목록의 표. 병종 카드(그 병종의 스킬)와 "전체 스킬 표"가 같이 쓴다. 값을 고치면 같은 스킬을 쓰는 모든 병종에 적용된다.
 * 머리글을 누르면 그 열로 정렬한다 (한 번 더 누르면 반대로, 세 번째에는 원래 순서). 값을 고치는 동안에는 줄이 움직이지 않고, 머리글을 누를 때 다시 정렬한다.
 */
export function SkillTable({ ids }: { ids: readonly string[] }) {
  const { state } = useLab();
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);
  const latest = useRef(state.data.skills);
  latest.current = state.data.skills;
  const idsKey = ids.join('|');
  const order = useMemo(() => {
    const list = ids.filter((id) => latest.current[id]);
    if (!sort) return list;
    const sign = sort.dir === 'asc' ? 1 : -1;
    return [...list].sort((x, y) => {
      const a = sortValue(latest.current[x], sort.key);
      const b = sortValue(latest.current[y], sort.key);
      const c = typeof a === 'string' || typeof b === 'string' ? String(a).localeCompare(String(b), 'ko') : a - b;
      return c * sign;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, idsKey]);
  const skills = order.map((id) => state.data.skills[id]).filter(Boolean);
  const clickHeader = (key: SortKey) => setSort((cur) => (cur?.key !== key ? { key, dir: 'asc' } : cur.dir === 'asc' ? { key, dir: 'desc' } : null));

  return (
    <div className="skill-scroll">
    <table className="skill-table">
      <thead>
        <tr>
          {COLUMNS.map((c) => (
            <th key={c.key} title={c.title} aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
              <button type="button" className="sort-head" data-sort={c.key} onClick={() => clickHeader(c.key)}>
                {c.label}
                <span className="sort-mark">{sort?.key === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
              </button>
            </th>
          ))}
          <th title="공격이 맞으면 거는 디버프와 확률. 디버프 값(틱 피해, 지속)은 밸런스 탭">디버프</th>
          <th>버프 · 부활</th>
        </tr>
      </thead>
      <tbody>
        {skills.map((s) => (
          <tr key={s.id} data-skill={s.id}>
            <td title={s.id}>{s.name}</td>
            <td>
              <SelectField
                path={`data.skills.${s.id}.kind`}
                options={[
                  { value: 'attack', label: '공격' },
                  { value: 'heal', label: '회복' },
                  { value: 'guard', label: '가드' },
                  { value: 'buff', label: '버프' },
                  { value: 'revive', label: '부활' },
                ]}
              />
            </td>
            <td title="공격: 방어로 경감 / 지력: 지력으로 저항">
              <SelectField
                path={`data.skills.${s.id}.scalesWith`}
                options={[
                  { value: 'attack', label: '공격' },
                  { value: 'intellect', label: '지력' },
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
              <span className="counter-cell">
                <CheckField label="유발" path={`data.skills.${s.id}.counterable`} />
                {s.counterable ? (
                  <span title="맞은 쪽이 공격자를 계수 1로 친 피해 × 이 값 (맞기 전 병력 기준). 비워 두면 밸런스 수치의 기본 반격 비율">
                    × <NumberField path={`data.skills.${s.id}.counterRate`} step={0.05} min={0} fallback={state.balance.counter.rate} />
                  </span>
                ) : null}
              </span>
            </td>
            <td>
              <CheckField label="막을 수 있음" path={`data.skills.${s.id}.guardable`} />
            </td>
            <td>{s.kind === 'attack' && s.scalesWith === 'attack' ? <NumberField path={`data.skills.${s.id}.ignoreDefense`} step={0.5} min={0} /> : null}</td>
            <td>{s.kind === 'attack' ? <NumberField path={`data.skills.${s.id}.behindHit`} step={0.05} min={0} fallback={0} hint="전열 대상을 칠 때 같은 칸 번호 후열 군단도 함께 침 (그 군단 기준 피해 × 이 값). 0이면 없음" /> : null}</td>
            <td>{s.kind === 'attack' ? <NumberField path={`data.skills.${s.id}.rowAttack`} step={0.05} min={0} fallback={0} hint="조준한 대상이 있는 열 전체를 침 (각 군단 기준 피해 × 이 값). 0이면 단일 대상. 가드로 대신 맞기는 없음" /> : null}</td>
            <td>{s.kind === 'buff' || s.kind === 'heal' ? <SelectField path={`data.skills.${s.id}.area`} options={[{ value: '', label: '대상 하나' }, { value: 'row', label: '그 열 전체' }, { value: 'all', label: '아군 전체' }]} /> : null}</td>
            <td>{s.kind === 'attack' ? <DebuffCell skill={s} /> : null}</td>
            <td>
              {s.kind === 'revive' ? (
                <span className="param-grid">
                  <NumberField label="되살아나는 비율" path={`data.skills.${s.id}.reviveRatio`} step={0.05} min={0.01} fallback={0.2} />
                  <NumberField label="전투당 횟수" path={`data.skills.${s.id}.maxUses`} min={1} fallback={1} />
                </span>
              ) : null}
              {s.kind === 'buff' && s.buff ? (
                s.buff.type === 'stats' ? (
                  <span className="param-grid">
                    <NumberField label="가짓수 최소" path={`data.skills.${s.id}.buff.minCount`} min={1} />
                    <NumberField label="가짓수 최대" path={`data.skills.${s.id}.buff.maxCount`} min={1} />
                    <NumberField label="올리는 양" path={`data.skills.${s.id}.buff.amount`} step={0.5} min={0} />
                    <NumberField label="최대 중첩" path={`data.skills.${s.id}.buff.maxStacks`} min={1} />
                  </span>
                ) : (
                  <span className="param-grid">
                    <NumberField label="피해 무시 횟수" path={`data.skills.${s.id}.buff.charges`} min={1} />
                    <NumberField label="최대 중첩" path={`data.skills.${s.id}.buff.maxStacks`} min={1} />
                  </span>
                )
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

/** 디버프 칸: 디버프 종류(없음 / balance.debuffs의 종류)와 걸릴 확률(%) */
function DebuffCell({ skill }: { skill: SkillData }) {
  const { state, update } = useLab();
  const kinds = Object.entries(state.balance.debuffs ?? {});
  const choose = (id: string) =>
    update((st) => {
      const { debuff: _old, ...rest } = st.data.skills[skill.id];
      const next: SkillData = id ? { ...rest, debuff: { id, chance: skill.debuff?.chance ?? 100 } } : rest;
      return { ...st, data: { ...st.data, skills: { ...st.data.skills, [skill.id]: next } } };
    });
  return (
    <span className="param-grid">
      <select aria-label={`${skill.id} 디버프`} value={skill.debuff?.id ?? ''} onChange={(e) => choose(e.target.value)}>
        <option value="">없음</option>
        {kinds.map(([id, d]) => (
          <option key={id} value={id}>
            {d.name}
          </option>
        ))}
        {skill.debuff && !state.balance.debuffs?.[skill.debuff.id] ? <option value={skill.debuff.id}>{skill.debuff.id} (없는 디버프)</option> : null}
      </select>
      {skill.debuff ? <NumberField label="확률 %" path={`data.skills.${skill.id}.debuff.chance`} min={0} max={100} step={5} hint="100이면 맞으면 확정" /> : null}
    </span>
  );
}
