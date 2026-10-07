import type { BattleResult, GameData } from '@samgukji/battle-engine';
import { DECIDED_BY_LABEL, END_CAUSE_LABEL } from './format';

const STAT_NAME = { attack: '공격', defense: '방어', intellect: '지력', speed: '속도' } as const;

/** 엔진 이벤트를 사람이 읽는 로그로 바꾼다. result.events가 있어야 한다. */
export function formatBattleLog(result: BattleResult, data: GameData): string[] {
  const names = new Map(result.units.map((u) => [u.uid, `${u.side === 'attacker' ? '공' : '방'}:${u.name}`]));
  const name = (uid: string) => names.get(uid) ?? uid;
  const sideLabel = (side: 'attacker' | 'defender') => (side === 'attacker' ? '공격측' : '방어측');
  const lines: string[] = [];

  for (const e of result.events ?? []) {
    switch (e.type) {
      case 'roundStart':
        lines.push(`── 라운드 ${e.round} ──`);
        break;
      case 'action':
        if (e.skillId === 'wait') {
          lines.push(`${name(e.actor)} 대기`);
        } else {
          const skill = data.skills[e.skillId]?.name ?? e.skillId;
          const self = !e.target || e.target === e.actor; // 가드처럼 자기 자신에게 쓰는 스킬
          lines.push(`${name(e.actor)} → ${skill}${self ? '' : ` → ${name(e.target!)}`}  (AP ${e.apAfter} 남음)`);
        }
        break;
      case 'intercept':
        lines.push(`    방패 ${name(e.guardian)} → ${name(e.target)} 대신 맞음`);
        break;
      case 'guardChange':
        lines.push(e.reason === 'reset' ? `    ${name(e.unit)} 가드 해제 (공격)` : `    ${name(e.unit)} 가드 확률 ${e.rate}%`);
        break;
      case 'damage':
        lines.push(`    ${e.critical ? '치명타! ' : ''}${e.kind === 'counter' ? '반격' : '피해'} ${e.amount} → ${name(e.target)} 병력 ${e.troopsAfter}`);
        break;
      case 'heal':
        lines.push(`    회복 ${e.amount} → ${name(e.target)} 병력 ${e.troopsAfter}`);
        break;
      case 'buff':
        lines.push(`    ${e.changes.map((c) => `${STAT_NAME[c.stat]} +${c.amount}`).join(', ')} → ${name(e.target)}`);
        break;
      case 'barrier':
        lines.push(e.reason === 'gain' ? `    결계 → ${name(e.unit)} (피해 ${e.charges}회 무시)` : `    결계가 피해를 무시 → ${name(e.unit)} (남은 ${e.charges}회)`);
        break;
      case 'unitDestroyed':
        lines.push(`    ✕ ${name(e.unit)} 전멸 (${name(e.by)})`);
        break;
      case 'rowAdvance':
        lines.push(`    ▶ ${sideLabel(e.side)} 후열이 전열로 이동: ${e.units.map(name).join(', ')}`);
        break;
      case 'battleEnd':
        lines.push(
          `══ 종료: ${sideLabel(e.winner)} 승 (${END_CAUSE_LABEL[e.endCause]}, 판정 ${DECIDED_BY_LABEL[e.decidedBy]}) — ${e.rounds}라운드`,
        );
        break;
      case 'morale':
        break;
    }
  }
  return lines;
}
