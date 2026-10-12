import { describe, expect, it } from 'vitest';
import {
  applyCastleBattle,
  attackIssue,
  declareWar,
  declareWarIssue,
  endTurn,
  playerFaction,
  playerRegions,
  regionOwner,
  runBattle,
  startStrategy,
  strategyBattleInput,
  turnIncome,
} from '@samgukji/battle-engine';
import type { BattleResult, StrategyMap, StrategyState } from '@samgukji/battle-engine';
import { campaign, defaultBalance, gameData, strategyMap } from '../src';

// 전략 규칙 (설계 문서 04): 선전포고와 성 공격. 지도 값은 Lab에서 바뀌므로 작은 지도를 따로 만들어 규칙을 확인하고, 실제 지도로는 흐름만 본다.
const garrison = (level: number) => ({ lineup: campaign.battles[0].enemy.map((e) => ({ ...e, level })), level });
const tiny: StrategyMap = {
  id: 'tiny',
  name: '시험 지도',
  actionsPerTurn: 3,
  goalRegion: 'c',
  factions: [
    { id: 'me', name: '자국', color: '#3f6fd4', player: true },
    { id: 'foe', name: '적', color: '#d4a017' },
    { id: 'far', name: '먼 적', color: '#888888' },
  ],
  regions: [
    { id: 'a', name: '가', faction: 'me', terrain: 'plain', income: 300, power: 2, neighbors: ['b'], x: 0, y: 0, castles: [{ id: 'a1', name: '가성', terrain: 'plain', garrison: null }] },
    { id: 'b', name: '나', faction: 'foe', terrain: 'plain', income: 200, power: 1, neighbors: ['a', 'c'], x: 1, y: 0, castles: [{ id: 'b1', name: '나성1', terrain: 'plain', garrison: garrison(1) }, { id: 'b2', name: '나성2', terrain: 'plain', garrison: garrison(1) }] },
    { id: 'c', name: '다', faction: 'far', terrain: 'plain', income: 500, power: 3, neighbors: ['b'], x: 2, y: 0, castles: [{ id: 'c1', name: '다성', terrain: 'plain', garrison: garrison(1) }] },
  ],
};

const start = () => startStrategy(tiny, campaign, gameData, defaultBalance);
const ok = (r: ReturnType<typeof declareWar>): StrategyState => {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};
/** 전투를 직접 돌리지 않고 이긴/진 결과를 만든다 (군단 보고는 실제 전투 입력의 공격측 그대로) */
const fakeResult = (state: StrategyState, castleId: string, won: boolean): BattleResult => {
  const input = strategyBattleInput(state, tiny, castleId, campaign, gameData, defaultBalance, 1);
  const real = runBattle({ ...input });
  return { ...real, winner: won ? 'attacker' : 'defender' };
};

describe('전략: 선전포고', () => {
  it('시작하면 전쟁이 없고, 행동 수는 지도의 턴당 행동 수다', () => {
    const s = start();
    expect(s.wars).toEqual([]);
    expect(s.actionsLeft).toBe(3);
    expect(playerRegions(s, tiny).map((r) => r.id)).toEqual(['a']);
  });

  it('맞닿은 세력에만 선전포고할 수 있고, 행동 1을 쓴다', () => {
    const s = start();
    expect(declareWarIssue(s, tiny, 'far')).toContain('맞닿아 있지 않습니다');
    expect(declareWarIssue(s, tiny, 'me')).not.toBeNull();
    const next = ok(declareWar(s, tiny, 'foe'));
    expect(next.wars).toEqual(['foe']);
    expect(next.actionsLeft).toBe(2);
    expect(declareWarIssue(next, tiny, 'foe')).toContain('이미');
  });

  it('행동이 없으면 선전포고할 수 없다', () => {
    expect(declareWarIssue({ ...start(), actionsLeft: 0 }, tiny, 'foe')).toContain('행동');
  });
});

describe('전략: 성 공격', () => {
  it('전쟁 중이 아니면 공격할 수 없고, 선전포고하면 맞닿은 지역의 성을 공격할 수 있다', () => {
    const s = start();
    expect(attackIssue(s, tiny, 'b1', gameData)).toContain('선전포고');
    const war = ok(declareWar(s, tiny, 'foe'));
    expect(attackIssue(war, tiny, 'b1', gameData)).toBeNull();
    expect(attackIssue(war, tiny, 'a1', gameData)).toContain('자국');
  });

  it('이기면 성을 차지하고 행동 1을 쓴다. 성이 남으면 지역은 아직 적의 것이다', () => {
    const war = ok(declareWar(start(), tiny, 'foe'));
    const { state, outcome } = applyCastleBattle(war, tiny, 'b1', fakeResult(war, 'b1', true), campaign, gameData, defaultBalance);
    expect(outcome.castleTaken).toBe(true);
    expect(outcome.regionTaken).toBeNull();
    expect(state.castleOwner.b1).toBe('me');
    expect(state.actionsLeft).toBe(war.actionsLeft - 1);
    expect(regionOwner(state, tiny.regions[1])).toBe('foe');
    // 이미 차지한 성은 다시 공격할 수 없다
    expect(attackIssue(state, tiny, 'b1', gameData)).toContain('자국');
  });

  it('지역의 성을 모두 차지하면 지역을 얻고, 그 지역과 맞닿은 세력에 선전포고할 수 있게 된다', () => {
    let s = ok(declareWar(start(), tiny, 'foe'));
    s = applyCastleBattle(s, tiny, 'b1', fakeResult(s, 'b1', true), campaign, gameData, defaultBalance).state;
    const second = applyCastleBattle(s, tiny, 'b2', fakeResult(s, 'b2', true), campaign, gameData, defaultBalance);
    expect(second.outcome.regionTaken).toBe('b');
    expect(playerRegions(second.state, tiny).map((r) => r.id)).toEqual(['a', 'b']);
    // 행동 셋을 다 썼으므로 다음 턴에 선전포고한다
    expect(declareWarIssue(second.state, tiny, 'far')).toContain('행동');
    expect(declareWarIssue(endTurn(second.state, tiny).state, tiny, 'far')).toBeNull();
  });

  it('지면 성은 그대로이고 행동은 쓴다. 군단의 병력은 전투 결과대로 줄어든다', () => {
    const war = ok(declareWar(start(), tiny, 'foe'));
    const result = fakeResult(war, 'b1', false);
    const { state, outcome } = applyCastleBattle(war, tiny, 'b1', result, campaign, gameData, defaultBalance);
    expect(outcome.castleTaken).toBe(false);
    expect(state.castleOwner.b1).toBe('foe');
    expect(state.actionsLeft).toBe(war.actionsLeft - 1);
    const first = state.army.lineup[0].characterId;
    expect(state.army.roster.find((u) => u.characterId === first)!.troops).toBe(result.units.find((u) => u.uid === 'attacker:0')!.finalTroops);
  });

  it('목표 지역을 차지하면 클리어하고, 그 뒤에는 행동할 수 없다', () => {
    let s = ok(declareWar(start(), tiny, 'foe'));
    for (const id of ['b1', 'b2']) s = applyCastleBattle(s, tiny, id, fakeResult(s, id, true), campaign, gameData, defaultBalance).state;
    s = endTurn(s, tiny).state;
    s = ok(declareWar(s, tiny, 'far'));
    const last = applyCastleBattle(s, tiny, 'c1', fakeResult(s, 'c1', true), campaign, gameData, defaultBalance);
    expect(last.outcome.cleared).toBe(true);
    expect(last.state.cleared).toBe(true);
    expect(declareWarIssue(last.state, tiny, 'foe')).toContain('클리어');
  });

  it('병력이 없는 군단이 출전 편성에 있으면 공격할 수 없다 (보충하라는 이유)', () => {
    const war = ok(declareWar(start(), tiny, 'foe'));
    const broken = { ...war, army: { ...war.army, roster: war.army.roster.map((u, i) => (i === 0 ? { ...u, troops: 0 } : u)) } };
    expect(attackIssue(broken, tiny, 'b1', gameData)).toContain('보충');
  });
});

describe('전략: 턴 종료', () => {
  it('가진 지역의 수입이 들어오고 다음 턴, 행동이 다시 찬다', () => {
    const s = { ...start(), actionsLeft: 0 };
    const { state, income } = endTurn(s, tiny);
    expect(income).toBe(300);
    expect(turnIncome(s, tiny)).toBe(300);
    expect(state.turn).toBe(2);
    expect(state.actionsLeft).toBe(3);
    expect(state.army.gold).toBe(s.army.gold + 300);
  });
});

describe('전략: 실제 지도 (map.json)', () => {
  it('시작 상태를 만들고, 맞닿은 세력에 선전포고한 뒤 실제 전투를 끝까지 돌려 반영할 수 있다', () => {
    let s = startStrategy(strategyMap, campaign, gameData, defaultBalance);
    const me = playerFaction(strategyMap).id;
    const target = strategyMap.factions.find((f) => !f.player && declareWarIssue(s, strategyMap, f.id) === null);
    expect(target, '선전포고할 수 있는 세력이 하나는 있어야 한다').toBeDefined();
    s = ok(declareWar(s, strategyMap, target!.id));
    const castle = strategyMap.regions.flatMap((r) => r.castles).find((c) => attackIssue(s, strategyMap, c.id, gameData) === null);
    expect(castle, '공격할 수 있는 성이 하나는 있어야 한다').toBeDefined();
    const input = strategyBattleInput(s, strategyMap, castle!.id, campaign, gameData, defaultBalance, 7);
    const result = runBattle(input);
    const after = applyCastleBattle(s, strategyMap, castle!.id, result, campaign, gameData, defaultBalance);
    expect(after.state.castleOwner[castle!.id]).toBe(result.winner === 'attacker' ? me : s.castleOwner[castle!.id]);
  });
});
