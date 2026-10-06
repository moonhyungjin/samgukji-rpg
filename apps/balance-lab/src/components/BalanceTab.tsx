import { CheckField, NumberField, SelectField } from './Fields';

/** 전투 공식과 규칙 수치. 고치면 즉시 시뮬레이션에 반영된다(자동 실행이 켜져 있을 때). */
export function BalanceTab() {
  return (
    <div className="grid">
      <section className="panel">
        <h3>피해 공식</h3>
        <p className="note">피해 = 공격 스탯 × 공격 계수 × 스킬 계수 × 특성 × 병력 보정 × 사기 보정 ÷ (1 + 방어 × 방어 계수)</p>
        <NumberField label="공격 계수 (attackScale)" path="balance.damage.attackScale" step={1} min={0} />
        <NumberField label="방어 계수 (defenseScale)" path="balance.damage.defenseScale" step={0.01} min={0} />
        <NumberField label="지력 저항 계수 (resistScale)" path="balance.damage.resistScale" step={0.01} min={0} />
        <NumberField label="최소 피해" path="balance.damage.minDamage" min={0} />
        <NumberField label="회복 계수 (heal.scale)" path="balance.heal.scale" step={1} min={0} />
        <CheckField label="치유량에도 시전자의 병력 보정 적용" path="balance.heal.useTroopFactor" />
      </section>

      <section className="panel">
        <h3>병력</h3>
        <NumberField label="Lv1 최대 병력" path="balance.troops.base" step={10} min={1} />
        <NumberField label="레벨당 병력 증가" path="balance.troops.perLevel" step={5} min={0} />
        <NumberField label="병력 보정 기준 병력" path="balance.troopFactor.reference" step={50} min={1} hint="현재 병력 ÷ 이 값이 보정이 된다" />
        <NumberField label="병력 보정 하한" path="balance.troopFactor.min" step={0.05} min={0} />
        <NumberField label="병력 보정 상한" path="balance.troopFactor.max" step={0.05} min={0} />
      </section>

      <section className="panel">
        <h3>반격 · 전투 길이</h3>
        <NumberField label="반격 비율" path="balance.counter.rate" step={0.05} min={0} hint="반격 피해 = 반격자의 일반공격 피해 × 이 값" />
        <NumberField label="총 전투 턴 한도" path="balance.maxTurns" min={1} />
      </section>

      <section className="panel">
        <h3>사기 (제로섬)</h3>
        <p className="note">기본은 피해에 영향을 주지 않고 최종 판정에서만 쓰입니다.</p>
        <NumberField label="방어측 시작 비율" path="balance.morale.defenderStart" step={1} min={0} max={100} hint="50이면 동등. 공격측 = 100 − 값" />
        <NumberField label="피해 보정 폭" path="balance.morale.maxEffect" step={0.01} min={0} hint="0이면 사기는 피해에 영향을 주지 않는다 (기본). 사기가 100:0일 때 ± 몇 %" />
        <SelectField
          label="최종 판정에서 사기 순서"
          path="balance.morale.judgement"
          options={[
            { value: 'tiebreak', label: '전멸 수 → 병력 → 사기 → 방어측 (기본)' },
            { value: 'before-troops', label: '전멸 수 → 사기 → 병력 → 방어측' },
          ]}
        />
        <NumberField label="군단 전멸 시 변동" path="balance.morale.onUnitDestroyed" step={1} min={0} />
        <NumberField label="피격 시 변동" path="balance.morale.onHit" step={0.5} min={0} />
      </section>

      <section className="panel">
        <h3>스탯 변환</h3>
        <NumberField label="스탯 입력 상한" path="balance.statCap" min={10} hint="아이템 보정 하드캡" />
        <p className="note">스탯(0~10) → 유효 스탯 곡선. 10을 넘으면 마지막 기울기로 이어진다.</p>
        <div className="curve">
          {Array.from({ length: 11 }, (_, i) => (
            <label className="field" key={i}>
              <span>{i}</span>
              <NumberField path={`balance.statCurve.${i}`} step={0.1} />
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
