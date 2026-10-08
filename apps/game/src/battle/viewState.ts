import type { BattleEvent, BuffStat, CharacterState, DecidedBy, EndCause, Family, Row, Side } from '@samgukji/battle-engine';

/**
 * 화면이 보여 주는 전투 상태. 엔진의 BattleEvent만으로 재구성할 수 있어야 하며,
 * 그래야 관전/수동 플레이/건너뛰기가 모두 같은 이벤트 스트림 하나로 동작한다.
 */
export interface ViewUnit {
  debuffs?: { id: string; name: string; roundsLeft: number }[];
  uid: string;
  characterId?: string;
  name: string;
  side: Side;
  family: Family;
  unitType: string;
  level: number;
  maxTroops: number;
  troops: number;
  ap: number;
  maxAp: number;
  /** 같은 열 아군을 대신 맞아줄 확률 (%p). 가드를 못 쓰는 병종은 0 */
  guardRate: number;
  /** 버프로 올라간 스탯 */
  buffs: Record<BuffStat, number>;
  /** 남은 피해 무시(결계) 횟수 */
  barrier: number;
  row: Row;
  slot: number;
  dead: boolean;
}

export interface BattleOutcome {
  winner: Side;
  endCause: EndCause;
  decidedBy: DecidedBy;
  rounds: number;
}

export interface ViewState {
  round: number;
  units: ViewUnit[];
  /** 방어측 사기 비율 (0~100). 공격측 = 100 - 값 */
  defenderMorale: number;
  outcome: BattleOutcome | null;
}

export function createViewState(units: readonly CharacterState[], defenderMorale: number): ViewState {
  return {
    round: 0,
    defenderMorale,
    outcome: null,
    units: units.map((u) => ({
      uid: u.uid,
      characterId: u.characterId,
      name: u.name,
      side: u.side,
      family: u.family,
      unitType: u.unitType,
      level: u.level,
      maxTroops: u.maxTroops,
      troops: u.troops,
      ap: u.ap,
      maxAp: u.maxAp,
      guardRate: u.guardRate,
      buffs: { ...u.buffs },
      barrier: u.barrier,
      debuffs: u.debuffs?.map(d => ({ id: d.id, name: d.id, roundsLeft: d.roundsLeft })),
      row: u.row,
      slot: u.slot,
      dead: u.isDead,
    })),
  };
}

function patch(state: ViewState, uid: string, change: Partial<ViewUnit>): ViewState {
  return { ...state, units: state.units.map((u) => (u.uid === uid ? { ...u, ...change } : u)) };
}

/** 이벤트 하나를 적용한 새 상태를 돌려준다. 원본은 바꾸지 않는다. */
export function applyEvent(state: ViewState, event: BattleEvent): ViewState {
  switch (event.type) {
    case 'roundStart':
      return { ...state, round: event.round };
    case 'action':
      return patch(state, event.actor, { ap: event.apAfter });
    case 'damage':
    case 'heal':
      return patch(state, event.target, { troops: event.troopsAfter });
    case 'debuffTick':
      return patch(state, event.unit, { troops: event.troopsAfter, debuffs: state.units.find(u => u.uid === event.unit)?.debuffs?.map(d => d.id === event.debuffId ? { ...d, roundsLeft: Math.max(0, d.roundsLeft - 1) } : d) });
    case 'debuffApply': {
      const debuffs = state.units.find(u => u.uid === event.unit)?.debuffs ?? [];
      return patch(state, event.unit, { debuffs: [...debuffs.filter(d => d.id !== event.debuffId), { id: event.debuffId, name: event.name, roundsLeft: event.rounds }] });
    }
    case 'debuffEnd':
      return patch(state, event.unit, { debuffs: state.units.find(u => u.uid === event.unit)?.debuffs?.filter(d => d.id !== event.debuffId) });
    case 'unitDestroyed':
      return patch(state, event.unit, { troops: 0, dead: true });
    case 'revive':
      return patch(state, event.target, { troops: event.troopsAfter, dead: false, row: event.row, slot: event.slot });
    case 'rowAdvance': {
      const advancing = new Set(event.units);
      return {
        ...state,
        units: state.units.map((u) => (advancing.has(u.uid) ? { ...u, row: 'front' as const } : u)),
      };
    }
    case 'guardChange':
      return patch(state, event.unit, { guardRate: event.rate });
    case 'buff': {
      const unit = state.units.find((u) => u.uid === event.target);
      if (!unit) return state;
      const buffs = { ...unit.buffs };
      for (const c of event.changes) buffs[c.stat] += c.amount;
      return patch(state, event.target, { buffs });
    }
    case 'barrier':
      return patch(state, event.unit, { barrier: event.charges });
    case 'intercept':
      // 대신 맞는 것은 이어지는 damage 이벤트가 처리한다. 상태는 바뀌지 않는다.
      return state;
    case 'morale':
      return { ...state, defenderMorale: event.defenderMorale };
    case 'battleEnd':
      return { ...state, outcome: { winner: event.winner, endCause: event.endCause, decidedBy: event.decidedBy, rounds: event.rounds } };
  }
}

export function applyEvents(state: ViewState, events: readonly BattleEvent[]): ViewState {
  return events.reduce(applyEvent, state);
}
