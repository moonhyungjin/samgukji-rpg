import { useState } from 'react';
import type { Row } from '@samgukji/battle-engine';
import { useLab } from '../lab/LabContext';
import { useNav } from '../lab/NavContext';
import { explainDamage } from '../lib/damageExplain';
import { groupByPromotion } from '../editor/lib/unitTypes';

const GROUP_ORDER = ['입력', '스탯', '기본 피해', '격차 배율', '배수', '결과', '크리티컬', '반격'];

/**
 * 피해 계산기. 공격 병종과 방어 병종(과 장수)을 고르면
 *  1) 그 병종을 골랐을 때 공식에 들어가는 값이 어느 탭의 어느 칸에서 오는지, 지금 공식에서 쓰이는지,
 *  2) 지금 Lab 값으로 피해가 한 단계씩 어떻게 계산되는지를 보여 준다.
 * 계산은 엔진의 DamageCalculator를 그대로 쓰므로 값을 고치면 바로 바뀐다.
 */
export function DamageCalculatorPanel() {
  const { state } = useLab();
  const { go } = useNav();
  const { data, balance } = state;
  const ids = Object.keys(data.characters);
  const unitList = Object.values(data.unitTypes);
  const groups = groupByPromotion(unitList);

  const [attackerId, setAttackerId] = useState(() => (data.characters.liuBei ? 'liuBei' : ids[0]));
  const [attackerType, setAttackerType] = useState(''); // 비어 있으면 장수의 병종
  const [defenderId, setDefenderId] = useState(() => (data.characters.xuChu ? 'xuChu' : ids[ids.length - 1]));
  const [defenderType, setDefenderType] = useState('');
  const [skillChoice, setSkillChoice] = useState('');
  const [attackerPct, setAttackerPct] = useState(100);
  const [defenderPct, setDefenderPct] = useState(100);
  const [defenderRow, setDefenderRow] = useState<Row>('front');
  const [guarding, setGuarding] = useState(false);

  const attacker = data.characters[attackerId];
  const defender = data.characters[defenderId];
  const aTypeId = attackerType && data.unitTypes[attackerType] ? attackerType : attacker?.unitType;
  const dTypeId = defenderType && data.unitTypes[defenderType] ? defenderType : defender?.unitType;
  const aType = aTypeId ? data.unitTypes[aTypeId] : undefined;
  const dType = dTypeId ? data.unitTypes[dTypeId] : undefined;
  const skillIds = aType ? [aType.basicSkillId, ...aType.extraSkillIds].filter((id) => data.skills[id]?.kind === 'attack') : [];
  const skillId = skillIds.includes(skillChoice) ? skillChoice : (skillIds[0] ?? '');

  const result = explainDamage(data, balance, {
    attackerId,
    attackerUnitType: attackerType || undefined,
    defenderId,
    defenderUnitType: defenderType || undefined,
    skillId,
    attackerPct,
    defenderPct,
    defenderRow,
    defenderGuarding: guarding,
  });
  const charLabel = (id: string) => `${data.characters[id].name} (${data.unitTypes[data.characters[id].unitType]?.name ?? '?'})`;

  const typeSelect = (label: string, value: string, characterId: string, onChange: (v: string) => void) => (
    <label className="field">
      <span>{label}</span>
      <select aria-label={`계산기 ${label}`} value={value} onChange={(e) => onChange(e.target.value)} title="이 계산에서 맡는 병종(승급 단계). 기본은 장수의 병종입니다">
        <option value="">장수의 병종 ({data.unitTypes[data.characters[characterId]?.unitType]?.name ?? '-'})</option>
        {groups.map((g) => (
          <optgroup key={g.depth} label={g.label}>
            {g.items.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );

  return (
    <section className="panel calc-panel">
      <h3>피해 계산기</h3>
      <p className="note">
        공격 병종과 방어 병종을 고르면, 그 병종의 어떤 값이 피해 공식에 들어가는지(어느 탭의 어느 칸인지, 지금 공식에서 쓰이는지)와 피해가 한 단계씩 어떻게 계산되는지를 보여 줍니다. 아래 표의 "수정하러 가기"를 누르면 그 칸이 있는 탭으로 이동합니다. 계산은 실제 전투와 같습니다 (반올림만 다름).
      </p>
      <div className="calc-sides">
        <div className="calc-side">
          <h4 className="sub">공격 쪽</h4>
          <div className="calc-controls">
            <label className="field">
              <span>장수 (스탯)</span>
              <select aria-label="계산기 공격자" value={attackerId} onChange={(e) => setAttackerId(e.target.value)}>
                {ids.map((id) => (
                  <option key={id} value={id}>
                    {charLabel(id)}
                  </option>
                ))}
              </select>
            </label>
            {typeSelect('공격 병종', attackerType, attackerId, setAttackerType)}
            <label className="field">
              <span>스킬</span>
              <select aria-label="계산기 스킬" value={skillId} onChange={(e) => setSkillChoice(e.target.value)}>
                {skillIds.map((id) => (
                  <option key={id} value={id}>
                    {data.skills[id].name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>병력 %</span>
              <input type="number" aria-label="계산기 공격자 병력" min={1} max={100} step={5} value={attackerPct} onChange={(e) => setAttackerPct(Number(e.target.value) || 1)} />
            </label>
          </div>
        </div>
        <div className="calc-side">
          <h4 className="sub">방어 쪽</h4>
          <div className="calc-controls">
            <label className="field">
              <span>장수 (스탯)</span>
              <select aria-label="계산기 방어자" value={defenderId} onChange={(e) => setDefenderId(e.target.value)}>
                {ids.map((id) => (
                  <option key={id} value={id}>
                    {charLabel(id)}
                  </option>
                ))}
              </select>
            </label>
            {typeSelect('방어 병종', defenderType, defenderId, setDefenderType)}
            <label className="field">
              <span>열</span>
              <select aria-label="계산기 방어자 열" value={defenderRow} onChange={(e) => setDefenderRow(e.target.value as Row)}>
                <option value="front">전열</option>
                <option value="back">후열</option>
              </select>
            </label>
            <label className="field">
              <span>병력 %</span>
              <input type="number" aria-label="계산기 방어자 병력" min={1} max={100} step={5} value={defenderPct} onChange={(e) => setDefenderPct(Number(e.target.value) || 1)} />
            </label>
            {dType?.guard && (
              <label className="check">
                <input type="checkbox" aria-label="계산기 가드 중" checked={guarding} onChange={(e) => setGuarding(e.target.checked)} />
                <span>가드 중</span>
              </label>
            )}
          </div>
        </div>
      </div>

      {!result.ok ? (
        <p className="note">{result.reason}</p>
      ) : (
        <>
          <div className="calc-summary">
            <span>
              한 번 맞는 피해 <b className="num">{result.explanation.damage}</b>
            </span>
            {result.explanation.critical !== null && (
              <span>
                크리티컬이면 <b className="num">{result.explanation.critical}</b>
              </span>
            )}
            <span>
              반격 <b className="num">{result.explanation.counter}</b>
            </span>
          </div>

          <h4 className="sub">공식에 들어가는 값과 출처</h4>
          <p className="note">흐리게 보이는 줄은 지금 공식 설정에서는 쓰이지 않는 값입니다.</p>
          <div className="table-scroll">
          <table className="calc-table sources-table" aria-label="공식에 들어가는 값과 출처">
            <colgroup>
              <col style={{ width: 230 }} />
              <col style={{ width: 170 }} />
              <col />
              <col />
              <col style={{ width: 120 }} />
            </colgroup>
            <thead>
              <tr>
                <th>값</th>
                <th>지금 값</th>
                <th>어디서 가져오나</th>
                <th>어떻게 쓰이나</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {result.explanation.sources.map((r) => (
                <tr key={r.label} className={r.used ? 'src-used' : 'src-unused'}>
                  <td className="calc-label">{r.label}</td>
                  <td className="calc-value">{r.value}</td>
                  <td className="calc-formula">{r.where}</td>
                  <td className="calc-formula">{r.used ? '' : '쓰지 않음 · '}{r.note}</td>
                  <td>
                    <button type="button" className="goto" onClick={() => go(r.tab, r.anchor)}>
                      수정하러 가기
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          <h4 className="sub">계산 과정</h4>
          <table className="calc-table">
            <tbody>
              {GROUP_ORDER.filter((g) => result.explanation.rows.some((r) => r.group === g)).map((g) => (
                <GroupRows key={g} group={g} rows={result.explanation.rows.filter((r) => r.group === g)} />
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

function GroupRows({ group, rows }: { group: string; rows: { label: string; formula: string; value: string }[] }) {
  return (
    <>
      <tr className="calc-group">
        <th colSpan={3}>{group}</th>
      </tr>
      {rows.map((r) => (
        <tr key={`${group}-${r.label}`}>
          <td className="calc-label">{r.label}</td>
          <td className="calc-formula">{r.formula}</td>
          <td className="calc-value">{r.value}</td>
        </tr>
      ))}
    </>
  );
}
