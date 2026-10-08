import { DamageCalculator, buildUnits } from '@samgukji/battle-engine';
import type { BalanceConfig, CharacterData, CharacterState, GameData, Row } from '@samgukji/battle-engine';

/** 상성표 계산에 쓰는 기준 장수의 id. 실제 데이터에는 없고 계산할 때만 끼워 넣는다 */
export const REFERENCE_ID = '__matchupReference';

export interface MatchupOptions {
  /** 공격/방어/지력/속도/행동력에 똑같이 넣는 기준 스탯 */
  stat: number;
  level: number;
  /** 방어 쪽이 서 있는 열 */
  defenderRow: Row;
  /** 방어 쪽이 가드할 수 있는 병종이면 가드 커맨드를 한 번 쓴 상태로 시작한다 */
  guarding: boolean;
}

export interface MatchupCell {
  /** 공격 쪽 일반공격 스킬 (공격 스킬이 아니면 null) */
  skillId: string | null;
  /** 둘 다 병력이 가득일 때 한 번 맞는 피해 */
  damage: number;
  /** 방어 쪽 최대 병력 대비 한 번 피해 비율 (0~1) */
  ratio: number;
  /** 공격 쪽이 병력 가득인 채로 계속 때릴 때 전멸까지 걸리는 횟수 (반격, 크리티컬 무시). MAX_HITS를 넘으면 null */
  hits: number | null;
  /** 첫 공격에 대한 반격 피해 */
  counter: number;
  defenderMaxTroops: number;
}

export const MAX_HITS = 30;

export function referenceData(data: GameData, options: MatchupOptions): GameData {
  const s = options.stat;
  const reference: CharacterData = {
    id: REFERENCE_ID,
    name: '기준 장수',
    rank: 'normal',
    unitType: Object.keys(data.unitTypes)[0],
    level: options.level,
    stats: { attack: s, defense: s, intellect: s, speed: s, action: s, diplomacy: s, politics: s, charm: s },
  };
  return { ...data, characters: { ...data.characters, [REFERENCE_ID]: reference } };
}

export function referenceUnit(data: GameData, balance: BalanceConfig, side: 'attacker' | 'defender', unitTypeId: string, row: Row | null): CharacterState {
  const type = data.unitTypes[unitTypeId];
  // 배치 가능한 열로 만든 뒤 계산할 열로 덮어쓴다 (열 제한은 편성 규칙이고 피해 계산과는 무관하다)
  const [unit] = buildUnits(side, [{ characterId: REFERENCE_ID, row: type.allowedRows[0], unitType: unitTypeId }], data, balance);
  if (row) unit.row = row;
  return unit;
}

/**
 * 같은 스탯의 기준 장수가 병종만 바꿔 서로 일반공격할 때의 피해 표.
 * 숫자는 모두 엔진의 DamageCalculator에서 나온다 (사기 50%, 크리티컬 없음).
 */
export function matchupTable(data: GameData, balance: BalanceConfig, attackerIds: string[], defenderIds: string[], options: MatchupOptions): MatchupCell[][] {
  const ref = referenceData(data, options);
  const calc = new DamageCalculator(balance, ref);
  const share = 50;

  return attackerIds.map((aId) =>
    defenderIds.map((dId): MatchupCell => {
      const aType = ref.unitTypes[aId];
      const dType = ref.unitTypes[dId];
      const attacker = referenceUnit(ref, balance, 'attacker', aId, null);
      const defender = referenceUnit(ref, balance, 'defender', dId, options.defenderRow);
      const guard = dType.guard;
      defender.guardRate = options.guarding && guard ? Math.max(1, guard.start + Math.round(guard.gain + defender.stats.intellect * (guard.gainPerIntellect ?? 0))) : 0;

      const skill = ref.skills[aType.basicSkillId];
      if (!skill || skill.kind !== 'attack') return { skillId: null, damage: 0, ratio: 0, hits: null, counter: 0, defenderMaxTroops: defender.maxTroops };

      const rowRatio = (skill.rowAttack ?? 0) > 0 ? skill.rowAttack! : 1;
      const hit = (target: CharacterState) => {
        const single = calc.damage(attacker, target, skill, share);
        return rowRatio === 1 ? single : Math.round(single * rowRatio);
      };

      const damage = hit(defender);

      let counter = 0;
      const counterSkill = ref.skills[dType.basicSkillId];
      if (skill.counterable && dType.canCounter && counterSkill?.kind === 'attack' && damage < defender.troops) {
        counter = calc.counterDamage(defender, attacker, counterSkill, skill, share);
      }

      // 방어 쪽 병력이 줄어드는 것(상대 비교식 병력 보정)과 가드 감소를 반영해 전멸까지 때린다
      const target = { ...defender };
      let hits: number | null = null;
      for (let n = 1; n <= MAX_HITS; n++) {
        target.troops -= Math.min(target.troops, hit(target));
        if (guard && target.guardRate > 0) target.guardRate = Math.max(0, target.guardRate - guard.decay);
        if (target.troops <= 0) {
          hits = n;
          break;
        }
      }

      return { skillId: skill.id, damage, ratio: damage / defender.maxTroops, hits, counter, defenderMaxTroops: defender.maxTroops };
    }),
  );
}
