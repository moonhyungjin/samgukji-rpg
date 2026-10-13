import { statModsTotal } from '@samgukji/battle-engine';
import type { UnitTypeData } from '@samgukji/battle-engine';
import { MOD_FIELDS, promotionDepth, promotionPathLabel, unitTypeRecord } from '../../lib/unitTypes';
import { signed, toggle } from './shared';
import type { SectionProps } from './shared';

const DEPTH_NAME = (depth: number) => (depth === 0 ? '0차' : `${depth}차`);

/** 승급 길, 보정 합계, 승급 대상 */
export function PromotionSection({ u, onEdit, every }: SectionProps & { every: readonly UnitTypeData[] }) {
  return (
    <>
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
    </>
  );
}
