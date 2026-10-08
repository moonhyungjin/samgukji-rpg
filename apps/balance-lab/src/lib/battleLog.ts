import type { BattleResult, GameData } from '@samgukji/battle-engine';
import { DECIDED_BY_LABEL, END_CAUSE_LABEL } from './format';

const STAT_NAME = { attack: '공격', defense: '방어', intellect: '지력', speed: '속도' } as const;

/** 로그 한 줄과 그 줄을 만든 이벤트의 위치 (result.events의 인덱스) */
export interface LogEntry {
  text: string;
  eventIndex: number;
}

/** 엔진 이벤트를 사람이 읽는 로그로 바꾼다. result.events가 있어야 한다. */
export function formatBattleLog(result: BattleResult, data: GameData): string[] {
  return formatBattleLogEntries(result, data).map((e) => e.text);
}

/** formatBattleLog와 같고, 줄마다 이벤트 위치를 함께 돌려준다 (전투 1회 탭에서 피해 줄을 눌러 계산 과정을 볼 때 쓴다) */
export function formatBattleLogEntries(result: BattleResult, data: GameData): LogEntry[] {
  const names = new Map(result.units.map((u) => [u.uid, `${u.side === 'attacker' ? '공' : '방'}:${u.name}`]));
  const name = (uid: string) => names.get(uid) ?? uid;
  const sideLabel = (side: 'attacker' | 'defender') => (side === 'attacker' ? '공격측' : '방어측');
  const entries: LogEntry[] = [];
  let index = 0;
  const lines = { push: (text: string) => entries.push({ text, eventIndex: index }) };

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
        lines.push(`    ${e.critical ? '치명타! ' : ''}${e.splash ? '관통 ' : ''}${e.kind === 'counter' ? '반격' : '피해'} ${e.amount} → ${name(e.target)} 병력 ${e.troopsAfter}`);
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
      case 'debuffApply':
        lines.push(`    ${e.name}${e.refresh ? ' 갱신' : ''} → ${name(e.unit)} (${e.rounds}라운드, 라운드 끝마다 ${e.tick})`);
        break;
      case 'debuffTick':
        lines.push(`    ${e.name} 피해 ${e.amount} → ${name(e.unit)} 병력 ${e.troopsAfter}`);
        break;
      case 'debuffEnd':
        lines.push(`    ${name(e.unit)} ${e.name} ${e.reason === 'cleanse' ? '해제 (치유)' : '끝남'}`);
        break;
      case 'unitDestroyed':
        lines.push(`    ✕ ${name(e.unit)} 전멸 (${name(e.by)})`);
        break;
      case 'revive':
        lines.push(`    ✚ ${name(e.target)} 부활 (병력 ${e.troopsAfter}, ${e.row === 'front' ? '전열' : '후열'})`);
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
    index++;
  }
  return entries;
}
