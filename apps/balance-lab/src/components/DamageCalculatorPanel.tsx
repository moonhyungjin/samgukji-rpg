import { useState } from 'react';
import type { Row } from '@samgukji/battle-engine';
import { useLab } from '../lab/LabContext';
import { explainDamage } from '../lib/damageExplain';

const GROUP_ORDER = ['입력', '스탯', '기본 피해', '격차 배율', '배수', '결과', '크리티컬', '반격'];

/**
 * 장수 둘과 스킬을 고르면, 지금 Lab 값(병종 카드, 스킬 표, 밸런스 수치)으로 피해가 어떻게 계산되는지 한 단계씩 보여 준다.
 * 병종 값을 고치면 이 계산도 바로 바뀐다. 계산은 엔진의 DamageCalculator를 그대로 쓴다.
 */
export function DamageCalculatorPanel() {
  const { state } = useLab();
  const { data, balance } = state;
  const ids = Object.keys(data.characters);
  const [attackerId, setAttackerId] = useState(() => (data.characters.guanYu ? 'guanYu' : ids[0]));
  const [defenderId, setDefenderId] = useState(() => (data.characters.xuChu ? 'xuChu' : ids[ids.length - 1]));
  const [skillChoice, setSkillChoice] = useState('');
  const [attackerPct, setAttackerPct] = useState(100);
  const [defenderPct, setDefenderPct] = useState(100);
  const [defenderRow, setDefenderRow] = useState<Row>('front');
  const [guarding, setGuarding] = useState(false);

  const attacker = data.characters[attackerId];
  const defender = data.characters[defenderId];
  const aType = attacker ? data.unitTypes[attacker.unitType] : undefined;
  const dType = defender ? data.unitTypes[defender.unitType] : undefined;
  const skillIds = aType ? [aType.basicSkillId, ...aType.extraSkillIds].filter((id) => data.skills[id]?.kind === 'attack') : [];
  const skillId = skillIds.includes(skillChoice) ? skillChoice : (skillIds[0] ?? '');

  const result = explainDamage(data, balance, { attackerId, defenderId, skillId, attackerPct, defenderPct, defenderRow, defenderGuarding: guarding });
  const charLabel = (id: string) => `${data.characters[id].name} (${data.unitTypes[data.characters[id].unitType]?.name ?? '?'})`;

  return (
    <section className="panel calc-panel">
      <h3>피해 계산기</h3>
      <p className="note">장수 둘과 스킬을 고르면 지금 Lab 값으로 피해가 어떻게 계산되는지 한 단계씩 보여 줍니다. 병종 카드나 스킬 표, 밸런스 수치를 고치면 이 계산도 바로 바뀝니다. 반올림만 빼면 실제 전투와 같은 계산입니다.</p>
      <div className="calc-controls">
        <label className="field">
          <span>공격자</span>
          <select aria-label="계산기 공격자" value={attackerId} onChange={(e) => setAttackerId(e.target.value)}>
            {ids.map((id) => (
              <option key={id} value={id}>
                {charLabel(id)}
              </option>
            ))}
          </select>
        </label>
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
          <span>공격자 병력 %</span>
          <input type="number" aria-label="계산기 공격자 병력" min={1} max={100} step={5} value={attackerPct} onChange={(e) => setAttackerPct(Number(e.target.value) || 1)} />
        </label>
        <label className="field">
          <span>방어자</span>
          <select aria-label="계산기 방어자" value={defenderId} onChange={(e) => setDefenderId(e.target.value)}>
            {ids.map((id) => (
              <option key={id} value={id}>
                {charLabel(id)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>방어자 열</span>
          <select aria-label="계산기 방어자 열" value={defenderRow} onChange={(e) => setDefenderRow(e.target.value as Row)}>
            <option value="front">전열</option>
            <option value="back">후열</option>
          </select>
        </label>
        <label className="field">
          <span>방어자 병력 %</span>
          <input type="number" aria-label="계산기 방어자 병력" min={1} max={100} step={5} value={defenderPct} onChange={(e) => setDefenderPct(Number(e.target.value) || 1)} />
        </label>
        {dType?.guard && (
          <label className="check">
            <input type="checkbox" aria-label="계산기 가드 중" checked={guarding} onChange={(e) => setGuarding(e.target.checked)} />
            <span>방어자가 가드 중</span>
          </label>
        )}
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
