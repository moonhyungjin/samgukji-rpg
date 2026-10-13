import type { BalanceConfig, BattleResult, GameData, LineupEntry, Row } from '@samgukji/battle-engine';
import { explainDamage } from './damageExplain';
import type { ExplainResult } from './damageExplain';

/** 전투 로그의 공격 피해 한 줄을 다시 계산하는 데 필요한 그 순간의 상태 */
export interface HitContext {
  attackerUid: string;
  targetUid: string;
  skillId: string;
  /** 맞기 직전 병력 */
  attackerTroops: number;
  targetTroops: number;
  targetRow: Row;
  /** 맞을 때 가드 상태였는가 (가드 중 받는 피해 배수) */
  guarding: boolean;
  critical: boolean;
  /** 동시 타격/열 공격으로 함께 맞은 군단 */
  splash: boolean;
  /** 결계가 피해를 무시했는가 */
  barrierBlocked: boolean;
  /** 실제로 깎인 병력 */
  actual: number;
}

/**
 * 이벤트를 처음부터 다시 따라가서 eventIndex의 공격 피해가 날 때의 병력·열·가드 상태를 구한다.
 * 공격 피해(kind attack)가 아니면 null. lineups는 진영별 편성(군단 uid의 번호 순서)이다.
 */
export function hitContext(result: BattleResult, lineups: { attacker: LineupEntry[]; defender: LineupEntry[] }, data: GameData, eventIndex: number): HitContext | null {
  const events = result.events ?? [];
  const hit = events[eventIndex];
  if (!hit || hit.type !== 'damage' || hit.kind !== 'attack') return null;

  const troops = new Map(result.units.map((u) => [u.uid, u.maxTroops]));
  const rows = new Map<string, Row>();
  const guard = new Map<string, number>();
  for (const u of result.units) {
    const [side, index] = u.uid.split(':');
    rows.set(u.uid, lineups[side as 'attacker' | 'defender'][Number(index)]?.row ?? 'front');
    guard.set(u.uid, data.unitTypes[u.unitType]?.guard?.start ?? 0);
  }

  let skillId = '';
  let guardBefore: { uid: string; rate: number } | null = null;
  let barrierBlocked = false;
  for (let i = 0; i < eventIndex; i++) {
    const e = events[i];
    // 바로 앞의 가드 감소/결계는 이 타격에 딸린 것이라 이 타격 직전 상태로 되돌려 본다
    const last = i === eventIndex - 1;
    switch (e.type) {
      case 'action':
        skillId = e.skillId;
        break;
      case 'damage':
      case 'heal':
        troops.set(e.target, e.troopsAfter);
        break;
      case 'debuffTick':
        troops.set(e.unit, e.troopsAfter);
        break;
      case 'revive':
        troops.set(e.target, e.troopsAfter);
        rows.set(e.target, e.row);
        break;
      case 'unitDestroyed':
        troops.set(e.unit, 0);
        break;
      case 'rowAdvance':
        for (const uid of e.units) rows.set(uid, 'front');
        break;
      case 'guardChange':
        if (last && e.reason === 'block' && e.unit === hit.target) guardBefore = { uid: e.unit, rate: guard.get(e.unit) ?? 0 };
        guard.set(e.unit, e.rate);
        break;
      case 'barrier':
        if (last && e.reason === 'block' && e.unit === hit.target) barrierBlocked = true;
        break;
      default:
        break;
    }
  }
  // (결계가 막을 때는 가드가 줄지 않으므로 바로 앞 이벤트만 보면 된다)
  const guardRate = guardBefore ? guardBefore.rate : (guard.get(hit.target) ?? 0);

  return {
    attackerUid: hit.source,
    targetUid: hit.target,
    skillId,
    attackerTroops: troops.get(hit.source) ?? 0,
    targetTroops: troops.get(hit.target) ?? 0,
    targetRow: rows.get(hit.target) ?? 'front',
    guarding: guardRate > 0,
    critical: hit.critical === true,
    splash: hit.splash === true,
    barrierBlocked,
    actual: hit.amount,
  };
}

/** 그 순간의 상태로 피해 계산 과정을 푼다 (피해 계산기와 같은 계산). 전투 중에 오른 스탯(버프)은 반영하지 않는다 */
export function explainHit(result: BattleResult, context: HitContext, data: GameData, balance: BalanceConfig): ExplainResult {
  const a = result.units.find((u) => u.uid === context.attackerUid);
  const d = result.units.find((u) => u.uid === context.targetUid);
  if (!a || !d) return { ok: false, reason: '군단을 찾을 수 없습니다.' };
  return explainDamage(data, balance, {
    attackerId: a.characterId,
    attackerUnitType: a.unitType,
    defenderId: d.characterId,
    defenderUnitType: d.unitType,
    skillId: context.skillId,
    attackerPct: 100,
    defenderPct: 100,
    attackerLevel: a.level,
    defenderLevel: d.level,
    attackerTroops: context.attackerTroops,
    defenderTroops: context.targetTroops,
    defenderRow: context.targetRow,
    defenderGuarding: context.guarding,
  });
}
