import { FAMILIES } from '@samgukji/battle-engine';
import type { Family, Row } from '@samgukji/battle-engine';
import { FAMILY_LABEL } from '../../lib/unitTypes';
import { field, num, toggle } from './shared';
import type { SectionProps } from './shared';

/** 계열, 사거리, 병력 배율, 단가, 기본 AP, 배치 가능 열 */
export function BasicsSection({ u, onEdit }: SectionProps) {
  return (
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
  );
}
