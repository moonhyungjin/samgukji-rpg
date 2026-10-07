import type { BattleEvent, CharacterState, GameData } from '@samgukji/battle-engine';
import { DECIDED_BY_LABEL, END_CAUSE_LABEL, SIDE_LABEL, STAT_LABEL } from './labels';

/** uid → 표시 이름 ("공:관우" / "방:하후돈") */
export function buildNameMap(units: readonly CharacterState[]): Map<string, string> {
  return new Map(units.map((u) => [u.uid, `${u.side === 'attacker' ? '공' : '방'}:${u.name}`]));
}

/** 이벤트를 전투 로그 한 줄로 바꾼다. 로그에 남기지 않는 이벤트는 null. */
export function formatEvent(event: BattleEvent, names: ReadonlyMap<string, string>, data: GameData): string | null {
  const name = (uid: string) => names.get(uid) ?? uid;
  switch (event.type) {
    case 'roundStart':
      return `── 라운드 ${event.round} ──`;
    case 'action': {
      if (event.skillId === 'wait') return `${name(event.actor)} 대기`;
      const skill = data.skills[event.skillId]?.name ?? event.skillId;
      // 가드처럼 자기 자신에게 쓰는 스킬은 대상을 적지 않는다
      if (!event.target || event.target === event.actor) return `${name(event.actor)} · ${skill}`;
      return `${name(event.actor)} · ${skill} → ${name(event.target)}`;
    }
    case 'intercept':
      return `    방패 ${name(event.guardian)} → ${name(event.target)} 대신 맞음`;
    case 'guardChange':
      if (event.reason === 'reset') return `    ${name(event.unit)} 가드 해제 (공격)`;
      return `    ${name(event.unit)} 가드 확률 ${event.rate}%`;
    case 'damage':
      return `    ${event.kind === 'counter' ? '반격' : '피해'} ${event.amount} → ${name(event.target)} (병력 ${event.troopsAfter})`;
    case 'heal':
      return `    회복 ${event.amount} → ${name(event.target)} (병력 ${event.troopsAfter})`;
    case 'buff':
      return `    ${event.changes.map((c) => `${STAT_LABEL[c.stat]} +${c.amount}`).join(', ')} → ${name(event.target)}`;
    case 'barrier':
      return event.reason === 'gain'
        ? `    결계 → ${name(event.unit)} (피해 ${event.charges}회 무시)`
        : `    결계가 피해를 무시 → ${name(event.unit)} (남은 ${event.charges}회)`;
    case 'unitDestroyed':
      return `    ✕ ${name(event.unit)} 전멸`;
    case 'rowAdvance':
      return `    ▶ ${SIDE_LABEL[event.side]} 후열이 전열로: ${event.units.map(name).join(', ')}`;
    case 'battleEnd':
      return `══ ${SIDE_LABEL[event.winner]} 승리 (${END_CAUSE_LABEL[event.endCause]} · 판정 ${DECIDED_BY_LABEL[event.decidedBy]}) — ${event.rounds}라운드`;
    case 'morale':
      return null;
  }
}
