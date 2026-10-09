import { createDefaultPolicy, runBattle } from '@samgukji/battle-engine';
import type { BattleResult, LineupEntry } from '@samgukji/battle-engine';
import { presets } from '@samgukji/game-data';
import { describe, expect, it } from 'vitest';
import { createDefaultState } from '../lab/defaults';
import { explainHit, hitContext } from './battleHits';

const lab = createDefaultState();
const { balance } = lab;
// 자동 개인 버프(군주)도 빼서 버프가 없는 전투로 만든다
const data = { ...lab.data, unitTypes: Object.fromEntries(Object.entries(lab.data.unitTypes).map(([id, u]) => [id, { ...u, autoBuffSkillId: undefined }])) };

/** 버프가 없는 전투 (버프로 오른 스탯은 다시 계산할 수 없으므로) */
function battle(attacker: LineupEntry[], defender: LineupEntry[], seed: number): BattleResult {
  return runBattle({ data, balance, attacker, defender, seed, recordEvents: true, policy: createDefaultPolicy({ buffMode: 'never' }) });
}

describe('전투 로그의 피해 한 줄 다시 계산하기', () => {
  it('크리티컬·결계·함께 맞은 타격이 아니면 다시 계산한 피해가 실제 피해와 같다', () => {
    const pairs: [LineupEntry[], LineupEntry[]][] = [
      [presets.shu, presets.wei],
      [presets.wei, presets.shu],
      [presets.shuStart, presets.yellowHard],
    ];
    let checked = 0;
    for (const [attacker, defender] of pairs)
      for (let seed = 1; seed <= 5; seed++) {
        const result = battle(attacker, defender, seed);
        (result.events ?? []).forEach((e, index) => {
          const ctx = hitContext(result, { attacker, defender }, data, index);
          if (!ctx || ctx.critical || ctx.barrierBlocked || ctx.splash) return;
          const explained = explainHit(result, ctx, data, balance);
          expect(explained.ok).toBe(true);
          if (!explained.ok) return;
          expect(Math.min(explained.explanation.damage, ctx.targetTroops), `seed ${seed} event ${index}`).toBe(ctx.actual);
          checked++;
        });
      }
    expect(checked).toBeGreaterThan(30);
  });

  it('공격 피해가 아닌 줄은 다시 계산하지 않는다', () => {
    const result = battle(presets.shu, presets.wei, 1);
    const index = (result.events ?? []).findIndex((e) => e.type === 'roundStart');
    expect(hitContext(result, { attacker: presets.shu, defender: presets.wei }, data, index)).toBeNull();
  });
});
