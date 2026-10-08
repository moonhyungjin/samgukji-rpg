import { describe, expect, it } from 'vitest';
import { actionsForTarget } from './CardActions';
import type { WaitingInfo } from '../battle/controller';

const waiting: WaitingInfo = {
  uid: 'actor', name: '장수', family: 'shield', ap: 3, maxAp: 3, troops: 100, maxTroops: 100,
  commands: [
    { skillId: 'attack', skillName: '공격', apCost: 1, kind: 'attack', targets: [{ uid: 'enemy', name: '적', troops: 100, maxTroops: 100, preview: { kind: 'attack', damage: 20, counter: 0, interceptChance: 0, targetBarrier: false, targetTroopsAfter: 80, actorTroopsAfter: 100 } }] },
    { skillId: 'guard', skillName: '가드', apCost: 1, kind: 'guard', targets: [{ uid: 'actor', name: '장수', troops: 100, maxTroops: 100, preview: { kind: 'guard', rateAfter: 80 } }] },
    { skillId: 'heal', skillName: '회복', apCost: 1, kind: 'heal', targets: [{ uid: 'ally', name: '아군', troops: 50, maxTroops: 100, preview: { kind: 'heal', amount: 30 } }] },
  ],
};

describe('카드별 합법 행동', () => {
  it('적/자신/아군에게 엔진이 허용한 행동과 예측만 반환한다', () => {
    expect(actionsForTarget(waiting, 'enemy').map(a => a.command.skillId)).toEqual(['attack']);
    expect(actionsForTarget(waiting, 'actor').map(a => a.command.skillId)).toEqual(['guard']);
    expect(actionsForTarget(waiting, 'ally')[0].target.preview).toEqual({ kind: 'heal', amount: 30 });
  });
  it('사거리 밖·격파·AP 부족 등으로 합법 대상 목록에 없으면 선택지가 없다', () => {
    expect(actionsForTarget(waiting, 'unavailable')).toEqual([]);
    expect(actionsForTarget({ ...waiting, commands: [] }, 'enemy')).toEqual([]);
  });
});
