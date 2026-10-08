import { useLab } from '../lab/LabContext';
import { CheckField, NumberField, SelectField } from './Fields';
import { FormulaPanel } from './FormulaPanel';

/** 전투 공식과 규칙 수치. 고치면 즉시 시뮬레이션에 반영된다(자동 실행이 켜져 있을 때). */
export function BalanceTab() {
  const { state } = useLab();
  const { formula = 'divide', gap } = state.balance.damage;
  const mode = state.balance.troopFactor.mode ?? 'absolute';

  // 지금 고른 공식/병력 보정 방식에서 쓰지 않는 칸은 이유와 함께 흐리게 표시한다
  const notAdditive = formula !== 'additive' ? '원작식을 고를 때만 씁니다' : undefined;
  const notGap = formula !== 'gap' ? '격차식을 고를 때만 씁니다' : undefined;
  const notGapFlat = notGap ?? (gap?.baseMode !== 'flat' ? '격차식의 기본 피해가 "고정값"일 때만 씁니다' : undefined);
  const attackScaleUnused = formula === 'additive' ? '원작식은 공격 계수 대신 [원작식] 값을 씁니다' : formula === 'gap' && gap?.baseMode === 'flat' ? '격차식의 기본 피해가 고정값입니다' : undefined;
  const notDivide = formula !== 'divide' ? '기존 공식을 고를 때만 씁니다' : undefined;
  const notTiered = mode !== 'tiered' ? '병력 보정이 구간식일 때만 씁니다' : undefined;
  const notRelative = mode !== 'relative' ? '병력 보정이 상대 비교일 때만 씁니다' : undefined;
  const notAbsolute = mode !== 'absolute' ? '병력 보정이 기존 방식일 때만 씁니다' : undefined;
  const referenceUnused = mode === 'relative' ? '상대 비교는 기준 병력을 쓰지 않습니다' : undefined;

  return (
    <div className="balance-page">
      <FormulaPanel />
      <div className="balance-cols">
        <div className="col">
              <section className="panel">
                <h3>피해 공식 값</h3>
                <p className="note">식은 위의 "지금 피해 공식"에 나옵니다. 흐리게 보이는 칸은 지금 고른 방식에서 쓰지 않는 값입니다. 병종 특성은 지금 쓰지 않습니다.</p>
                <SelectField
                  label="피해 공식"
                  path="balance.damage.formula"
                  options={[
                    { value: 'additive', label: '원작식: (병종 보정 + 대상 취약 + 공격×10 − 방어×8) × 10 × 병력 보정' },
                    { value: 'divide', label: '기존: 공격 × 공격 계수 ÷ (1 + 방어 × 방어 계수)' },
                    { value: 'gap', label: '격차식: 기본 피해 × (1 + (공격 − 방어) × 격차 1점당 비율)' },
                  ]}
                />
                <h4 className="sub">격차식 (기본)</h4>
                <p className="note">격차식은 공격 − 방어 스탯 격차 1점마다 피해가 일정 비율(기본 10%)씩 늘거나 줍니다. 기본 피해는 "기준 스탯 × 공격 계수" 또는 고정값입니다.</p>
                <SelectField
                  label="[격차식] 기본 피해"
                  path="balance.damage.gap.baseMode" unused={notGap}
                  options={[
                    { value: 'stat', label: '기준 스탯 × 공격 계수' },
                    { value: 'flat', label: '고정값' },
                  ]}
                />
                <div className="fields-2">
                  <NumberField label="[격차식] 격차 1점당 비율" path="balance.damage.gap.perPoint" unused={notGap} step={0.01} min={0} />
                  <NumberField label="[격차식] 배율 하한" path="balance.damage.gap.min" unused={notGap} step={0.05} min={0} />
                  <NumberField label="[격차식] 고정 기본 피해" path="balance.damage.gap.flat" unused={notGapFlat} step={10} min={0} />
                  <NumberField label="[격차식] 병종 보정 나누기 (0이면 안 씀)" path="balance.damage.gap.bonusDiv" unused={notGap} step={1} min={0} />
                  <NumberField label="공격 계수 (attackScale, 격차식·처음 공식)" path="balance.damage.attackScale" unused={attackScaleUnused} step={1} min={0} />
                </div>
                <h4 className="sub">원작식</h4>
                <p className="note">원작식은 병종 차이를 더하기로 줍니다. 병종 보정과 취약 보정은 병종 카드에서 고칩니다. 기본값 × 배율 × 병력 보정(구간식 ÷ 1000)이라, 배율 10이면 "기본값 × 병력 ÷ 100"(원작과 같은 꼴)입니다. [처음 공식] 방어/저항 계수는 처음 공식에서만 씁니다.</p>
                <div className="fields-2">
                  <NumberField label="[원작식] 공격 1당" path="balance.damage.additive.attackMul" unused={notAdditive} step={1} min={0} />
                  <NumberField label="[원작식] 방어 1당 빼기" path="balance.damage.additive.defenseMul" unused={notAdditive} step={1} min={0} />
                  <NumberField label="[원작식] 지력 1당 (책략)" path="balance.damage.additive.intellectMul" unused={notAdditive} step={1} min={0} />
                  <NumberField label="[원작식] 대상 지력 1당 빼기 (책략)" path="balance.damage.additive.resistMul" unused={notAdditive} step={1} min={0} />
                  <NumberField label="[원작식] 기본값 하한" path="balance.damage.additive.min" unused={notAdditive} step={1} min={0} />
                  <NumberField label="[원작식] 배율" path="balance.damage.additive.scale" unused={notAdditive} step={0.5} min={0} />
                </div>
                <h4 className="sub">처음 공식 (기존)</h4>
                <p className="note">처음 공식은 공격 계수(위 격차식 묶음의 "공격 계수")와 아래 두 값을 씁니다.</p>
                <div className="fields-2">
                  <NumberField label="[기존] 방어 계수 (defenseScale)" path="balance.damage.defenseScale" unused={notDivide} step={0.01} min={0} />
                  <NumberField label="[기존] 지력 저항 계수 (resistScale)" path="balance.damage.resistScale" unused={notDivide} step={0.01} min={0} />
                </div>
                <h4 className="sub">공통 · 크리티컬 · 치유</h4>
                <div className="fields-2">
                  <NumberField label="최소 피해" path="balance.damage.minDamage" min={0} />
                  <NumberField label="치명타 확률 % (0이면 꺼짐)" path="balance.critical.chance" step={1} min={0} max={100} />
                  <NumberField label="치명타 피해 배율" path="balance.critical.multiplier" step={0.1} min={1} />
                </div>
                <p className="note">일반공격과 책략 공격이 확률로 피해를 키웁니다. 반격과 치유에는 적용되지 않습니다.</p>
                <NumberField label="회복 계수 (heal.scale)" path="balance.heal.scale" step={1} min={0} />
                <CheckField label="치유량에도 시전자의 병력 보정 적용" path="balance.heal.useTroopFactor" />
              </section>

              <section className="panel">
                <h3>반격 · 전투 길이</h3>
                <div className="fields-2">
                  <NumberField label="기본 반격 비율" path="balance.counter.rate" step={0.05} min={0} hint="기술에 반격 비율이 없을 때 쓴다. 반격 비율은 스킬 표에서 기술마다 정한다" />
                  <NumberField label="총 전투 턴 한도" path="balance.maxTurns" min={1} />
                </div>
              </section>

              <section className="panel">
                <h3>사기 (제로섬)</h3>
                <p className="note">기본은 피해에 영향을 주지 않고 최종 판정에서만 쓰입니다.</p>
                <div className="fields-2">
                  <NumberField label="방어측 시작 비율" path="balance.morale.defenderStart" step={1} min={0} max={100} hint="50이면 동등. 공격측 = 100 − 값" />
                  <NumberField label="피해 보정 폭" path="balance.morale.maxEffect" step={0.01} min={0} hint="0이면 사기는 피해에 영향을 주지 않는다 (기본). 사기가 100:0일 때 ± 몇 %" />
                </div>
                <SelectField
                  label="최종 판정에서 사기 순서"
                  path="balance.morale.judgement"
                  options={[
                    { value: 'tiebreak', label: '전멸 수 → 병력 → 사기 → 방어측 (기본)' },
                    { value: 'before-troops', label: '전멸 수 → 사기 → 병력 → 방어측' },
                  ]}
                />
                <div className="fields-2">
                  <NumberField label="군단 전멸 시 변동" path="balance.morale.onUnitDestroyed" step={1} min={0} />
                  <NumberField label="피격 시 변동" path="balance.morale.onHit" step={0.5} min={0} />
                </div>
              </section>
        </div>
        <div className="col">
              <section className="panel">
                <h3>병력</h3>
                <div className="fields-2">
                  <NumberField label="Lv1 최대 병력" path="balance.troops.base" step={10} min={1} />
                  <NumberField label="레벨당 병력 증가" path="balance.troops.perLevel" step={5} min={0} />
                </div>
                <SelectField
                  label="병력 보정 방식"
                  path="balance.troopFactor.mode"
                  options={[
                    { value: 'tiered', label: '구간식(원작 방식): 꺾이는 지점까지 1명당 1, 이후 효율 감소' },
                    { value: 'absolute', label: '기존: 모든 병종 같은 기준 병력(1000)' },
                    { value: 'relative', label: '상대 비교: 공격력 기반은 상대 병력과 비교, 지력 기반은 내 최대 병력 대비' },
                  ]}
                />
                <CheckField label="병종 병력 배율은 피해에 영향을 주지 않는다 (환산 병력)" path="balance.troopFactor.normalizeByScale" />
                <p className="note">끄면(원작 방식) 실제 병력 수로 피해를 계산해서 병력이 많은 병종이 더 세게 때립니다. 켜면 병력 보정에 쓰는 병력을 병력 배율로 나눈 값(환산 병력)으로 세어서, 최대 병력이 800인 병종도 가득 차면 1000인 병종과 같은 세기로 때립니다.</p>
                <p className="note">구간식: 유효 병력 = 꺾이는 지점까지 1명당 1 + 두 번째 지점까지 1명당 (구간 2 효율) + 그 이상 1명당 (구간 3 효율), 최소 하한. 보정 = 유효 병력 ÷ 기준 병력. 원작은 500 / 2000이고, 우리 병력 단위(Lv15 1000)에 맞춰 1000 / 4000으로 옮겼습니다.</p>
                <div className="fields-2">
                  <NumberField label="[구간식] 꺾이는 지점" path="balance.troopFactor.tiered.knee" unused={notTiered} step={50} min={1} />
                  <NumberField label="[구간식] 두 번째 지점" path="balance.troopFactor.tiered.knee2" unused={notTiered} step={100} min={1} />
                  <NumberField label="[구간식] 구간 2 효율" path="balance.troopFactor.tiered.rate2" unused={notTiered} step={0.05} min={0} />
                  <NumberField label="[구간식] 구간 3 효율" path="balance.troopFactor.tiered.rate3" unused={notTiered} step={0.05} min={0} />
                  <NumberField label="[구간식] 유효 병력 하한" path="balance.troopFactor.tiered.floor" unused={notTiered} step={10} min={0} />
                </div>
                <CheckField label="[구간식] 피해가 공격자의 현재 병력을 넘지 않는다" path="balance.troopFactor.tiered.capAtTroops" unused={notTiered} />
                <p className="note">기존 방식: 보정 = 현재 병력 ÷ 기준 병력 (하한~상한). 병종마다 최대 병력이 달라도 같은 기준을 써서 최대 병력이 800인 병종은 가득 차도 0.8입니다.</p>
                <div className="fields-2">
                  <NumberField label="[기존·구간식] 병력 보정 기준 병력" path="balance.troopFactor.reference" unused={referenceUnused} step={50} min={1} hint="(유효) 병력 ÷ 이 값이 보정이 된다" />
                  <NumberField label="[기존] 병력 보정 하한" path="balance.troopFactor.min" unused={notAbsolute} step={0.05} min={0} />
                  <NumberField label="[기존] 병력 보정 상한" path="balance.troopFactor.max" unused={notAbsolute} step={0.05} min={0} />
                </div>
                <p className="note">상대 비교 방식: 공격력 기반(일반공격/돌격/화살/풍수사 활)은 (내 병력 ÷ 상대 병력)의 거듭제곱, 지력 기반(책략/독연/치유)은 상대와 무관하게 내 최대 병력 대비 현재 병력입니다.</p>
                <div className="fields-2">
                  <NumberField label="[상대 비교] 하한" path="balance.troopFactor.relative.min" unused={notRelative} step={0.05} min={0} hint="약한 쪽이 얼마까지 약해지는가" />
                  <NumberField label="[상대 비교] 상한" path="balance.troopFactor.relative.max" unused={notRelative} step={0.05} min={0} hint="큰 쪽의 이점이 어디서 멈추는가" />
                  <NumberField label="[상대 비교] 지수" path="balance.troopFactor.relative.exponent" unused={notRelative} step={0.05} min={0} hint="0.5면 완만(제곱근), 1이면 병력 비율 그대로" />
                  <NumberField label="[지력 기반] 하한" path="balance.troopFactor.self.min" unused={notRelative} step={0.05} min={0} hint="내 병력이 거의 없을 때의 최소 보정" />
                  <NumberField label="[지력 기반] 상한" path="balance.troopFactor.self.max" unused={notRelative} step={0.05} min={0} hint="1이면 병력이 가득 찼을 때가 최대" />
                </div>
              </section>

              <section className="panel">
                <h3>행동력 → AP</h3>
                <div className="fields-2">
                  <NumberField label="행동력 몇 마다 AP 1" path="balance.action.perAp" step={1} min={1} hint="추가 AP = 올림(행동력 ÷ 이 값). 전투 총 AP = 병종 기본 AP + 추가 AP" />
                  <NumberField label="행동력 상한" path="balance.action.cap" step={1} min={1} hint="이보다 큰 행동력은 세지 않는다 (아이템으로 올리는 한계)" />
                </div>
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
      </div>
    </div>
  );
}
