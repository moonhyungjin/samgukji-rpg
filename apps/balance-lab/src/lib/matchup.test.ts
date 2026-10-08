import { DamageCalculator, buildUnits } from '@samgukji/battle-engine';
import { describe, expect, it } from 'vitest';
import { createDefaultState } from '../lab/defaults';
import { REFERENCE_ID, matchupTable } from './matchup';

const { data, balance } = createDefaultState();
const ids = Object.keys(data.unitTypes);
const options = { stat: 6, level: 15, defenderRow: 'front' as const, guarding: false };

describe('병종 상성표', () => {
  it('공격 병종 × 방어 병종 크기의 표를 만들고, 실제 데이터에 기준 장수를 남기지 않는다', () => {
    const table = matchupTable(data, balance, ids, ids.slice(0, 3), options);
    expect(table).toHaveLength(ids.length);
    for (const row of table) expect(row).toHaveLength(3);
    expect(data.characters[REFERENCE_ID]).toBeUndefined();
  });

  it('한 번 피해는 엔진의 DamageCalculator와 같다', () => {
    const attack = ids.find((id) => data.skills[data.unitTypes[id].basicSkillId]?.kind === 'attack' && !data.skills[data.unitTypes[id].basicSkillId].rowAttack)!;
    const defend = ids[ids.length - 1];
    const [cell] = matchupTable(data, balance, [attack], [defend], options)[0];
    const s = options.stat;
    const ref = { ...data, characters: { ...data.characters, x: { id: 'x', name: 'x', unitType: attack, level: 15, stats: { attack: s, defense: s, intellect: s, speed: s, action: s, diplomacy: s, politics: s, charm: s } } } };
    const [a] = buildUnits('attacker', [{ characterId: 'x', row: data.unitTypes[attack].allowedRows[0], unitType: attack }], ref, balance);
    const [d] = buildUnits('defender', [{ characterId: 'x', row: data.unitTypes[defend].allowedRows[0], unitType: defend }], ref, balance);
    d.row = 'front';
    d.guardRate = 0;
    expect(cell.damage).toBe(new DamageCalculator(balance, ref).damage(a, d, data.skills[data.unitTypes[attack].basicSkillId], 50));
  });

  it('전멸 횟수: 그 횟수만큼 때리면 쓰러지고, 한 번 덜 때리면 살아 있다', () => {
    const table = matchupTable(data, balance, ids.slice(0, 7), ids.slice(0, 7), options);
    for (const row of table)
      for (const cell of row) {
        if (!cell.skillId || cell.hits === null) continue;
        expect(cell.hits).toBeGreaterThanOrEqual(1);
        // 한 번 피해가 최대 병력보다 크면 1회
        if (cell.damage >= cell.defenderMaxTroops) expect(cell.hits).toBe(1);
        else expect(cell.hits).toBeGreaterThan(1);
      }
  });

  it('가드 중이면 받는 피해 감소가 있는 가드 병종의 피해가 줄어든다', () => {
    const guardId = ids.find((id) => (data.unitTypes[id].guard?.damageTaken ?? 1) < 1);
    const attack = ids.find((id) => data.skills[data.unitTypes[id].basicSkillId]?.kind === 'attack');
    if (!guardId || !attack) return;
    const plain = matchupTable(data, balance, [attack], [guardId], options)[0][0];
    const guarded = matchupTable(data, balance, [attack], [guardId], { ...options, guarding: true })[0][0];
    expect(guarded.damage).toBeLessThan(plain.damage);
  });
});
