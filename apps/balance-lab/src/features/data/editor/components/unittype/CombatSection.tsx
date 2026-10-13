import { field, num } from './shared';
import type { SectionProps } from './shared';

/** 피해 배수, 원작식 보정, 반격, 치유 시 디버프 해제 */
export function CombatSection({ u, onEdit }: SectionProps) {
  const taken = { physical: 1, magic: 1, ...u.damageTakenByType };
  const dealt = { front: 1, back: 1, ...u.damageDealtByRow };
  return (
    <>
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
    </>
  );
}
