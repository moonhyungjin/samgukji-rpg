import { useCallback, useEffect, useRef, useState } from 'react';
import type { SimulationReport } from '@samgukji/battle-engine';
import { lineupFromSlots } from '../lib/slots';
import type { SimRequest, SimResponse } from '../worker/protocol';
import type { LabState } from './types';

interface Status {
  report: SimulationReport | null;
  /** 직전 실행 결과. 변화량 비교에 쓴다 */
  previous: SimulationReport | null;
  running: boolean;
  error: string | null;
  elapsedMs: number;
}

export interface SimulationHook extends Status {
  run: (iterations: number) => void;
}

/** 시뮬레이션 워커를 관리한다. 오래된 요청의 응답은 버린다. */
export function useSimulation(state: LabState): SimulationHook {
  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [status, setStatus] = useState<Status>({ report: null, previous: null, running: false, error: null, elapsedMs: 0 });

  useEffect(() => {
    const worker = new Worker(new URL('../worker/sim.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<SimResponse>) => {
      const res = event.data;
      if (res.id !== requestId.current) return;
      setStatus((s) =>
        res.report
          ? { report: res.report, previous: s.report, running: false, error: null, elapsedMs: res.elapsedMs }
          : { ...s, running: false, error: res.error ?? '알 수 없는 오류', elapsedMs: res.elapsedMs },
      );
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const run = useCallback((iterations: number) => {
    const worker = workerRef.current;
    if (!worker) return;
    const s = stateRef.current;
    const id = ++requestId.current;
    setStatus((prev) => ({ ...prev, running: true }));
    const request: SimRequest = {
      id,
      data: s.data,
      balance: s.balance,
      teamA: lineupFromSlots(s.teamA),
      teamB: lineupFromSlots(s.teamB),
      iterations,
      seed: s.sim.seed,
      roles: s.sim.roles,
      lineups: s.sim.lineups,
      targetPolicy: s.sim.targetPolicy,
      guardMode: s.sim.guardMode,
      buffMode: s.sim.buffMode,
      pool: s.sim.pool,
    };
    worker.postMessage(request);
  }, []);

  return { ...status, run };
}
