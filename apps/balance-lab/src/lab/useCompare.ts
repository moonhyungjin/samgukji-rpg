import { useCallback, useEffect, useRef, useState } from 'react';
import type { BalanceConfig, GameData, SimulationReport } from '@samgukji/battle-engine';
import { lineupFromSlots } from '../lib/slots';
import type { SimRequest, SimResponse } from '../worker/protocol';
import type { LabState } from './types';

export interface CompareColumn {
  data: GameData;
  balance: BalanceConfig;
}

export interface CompareResult {
  report: SimulationReport | null;
  error: string | null;
}

interface Status {
  results: CompareResult[] | null;
  running: boolean;
  elapsedMs: number;
}

/**
 * 여러 설정을 같은 편성, 같은 시드, 같은 AI로 차례대로 돌린다 (시뮬레이션 탭과 같은 워커).
 * 다시 돌리면 이전 요청의 응답은 버린다.
 */
export function useCompare(state: LabState) {
  const workerRef = useRef<Worker | null>(null);
  const batch = useRef({ first: 0, count: 0, started: 0, results: [] as CompareResult[] });
  const nextId = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [status, setStatus] = useState<Status>({ results: null, running: false, elapsedMs: 0 });

  useEffect(() => {
    const worker = new Worker(new URL('../worker/sim.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<SimResponse>) => {
      const res = event.data;
      const b = batch.current;
      const index = res.id - b.first;
      if (index < 0 || index >= b.count) return;
      b.results[index] = { report: res.report ?? null, error: res.report ? null : (res.error ?? '알 수 없는 오류') };
      const done = b.results.filter(Boolean).length === b.count;
      setStatus({ results: [...b.results], running: !done, elapsedMs: performance.now() - b.started });
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const run = useCallback((columns: CompareColumn[], iterations: number) => {
    const worker = workerRef.current;
    if (!worker || columns.length === 0) return;
    const s = stateRef.current;
    const first = nextId.current + 1;
    nextId.current += columns.length;
    batch.current = { first, count: columns.length, started: performance.now(), results: [] };
    setStatus({ results: null, running: true, elapsedMs: 0 });
    columns.forEach((column, i) => {
      const request: SimRequest = {
        id: first + i,
        data: column.data,
        balance: column.balance,
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
    });
  }, []);

  return { ...status, run };
}
