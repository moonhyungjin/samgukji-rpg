import { DEFAULT_GUARD } from '../../lib/unitTypes';
import { field, num } from './shared';
import type { SectionProps } from './shared';

/** 가드 사용 여부와 가드 수치 (시작, 상승, 감소, 피해 배수, 범위, 도술 방어, 공격해도 유지) */
export function GuardSection({ u, onEdit }: SectionProps) {
  return (
    <>
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
    </>
  );
}
