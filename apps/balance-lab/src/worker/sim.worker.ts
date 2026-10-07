// 시뮬레이션은 UI 스레드를 막지 않도록 워커에서 돌린다. 게임과 같은 BattleEngine을 사용한다.
import { BattleSimulator, createDefaultPolicy } from '@samgukji/battle-engine';
import type { SimRequest, SimResponse } from './protocol';

self.onmessage = (event: MessageEvent<SimRequest>) => {
  const req = event.data;
  const started = performance.now();
  try {
    const report = BattleSimulator.run({
      data: req.data,
      balance: req.balance,
      teamA: req.teamA,
      teamB: req.teamB,
      iterations: req.iterations,
      seed: req.seed,
      roles: req.roles,
      lineups: req.lineups,
      pool: req.pool,
      policy: createDefaultPolicy({ targetPolicy: req.targetPolicy, guardMode: req.guardMode, buffMode: req.buffMode }),
    });
    const response: SimResponse = { id: req.id, report, elapsedMs: performance.now() - started };
    self.postMessage(response);
  } catch (error) {
    const response: SimResponse = {
      id: req.id,
      error: error instanceof Error ? error.message : String(error),
      elapsedMs: performance.now() - started,
    };
    self.postMessage(response);
  }
};
