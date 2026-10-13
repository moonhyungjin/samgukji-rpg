import type { UnitTypeData } from '@samgukji/battle-engine';

/** 병종 카드에서 고친 값(patch): 안쪽 값만 합치고, guard가 null이면 가드를 끈다 */
export type Patch = Partial<Omit<UnitTypeData, 'statMods' | 'damageTakenByType' | 'damageDealtByRow' | 'guard' | 'recruit' | 'typeBonus' | 'vulnerability'>> & {
  statMods?: Partial<NonNullable<UnitTypeData['statMods']>>;
  typeBonus?: Partial<NonNullable<UnitTypeData['typeBonus']>>;
  vulnerability?: Partial<NonNullable<UnitTypeData['vulnerability']>>;
  recruit?: Partial<NonNullable<UnitTypeData['recruit']>>;
  damageTakenByType?: Partial<NonNullable<UnitTypeData['damageTakenByType']>>;
  damageDealtByRow?: Partial<NonNullable<UnitTypeData['damageDealtByRow']>>;
  /** null이면 가드를 끈다 */
  guard?: Partial<NonNullable<UnitTypeData['guard']>> | null;
};

/** 섹션 컴포넌트가 공통으로 받는 것: 병종 하나와 고치기 */
export interface SectionProps {
  u: UnitTypeData;
  onEdit: (id: string, patch: Patch) => void;
}

export const num = (value: string) => (value === '' ? 0 : Number(value));
export const toggle = (list: readonly string[], id: string, on: boolean) => (on ? [...list, id] : list.filter((x) => x !== id));
export const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** 라벨 + 입력칸 + 툴팁 한 칸 */
export function field(label: string, input: React.ReactNode, hint?: string) {
  return (
    <label className="ufield" title={hint}>
      <span>{label}</span>
      {input}
    </label>
  );
}
