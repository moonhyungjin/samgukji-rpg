import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { setIn } from '../lib/path';
import { createDefaultState } from './defaults';
import type { LabState } from './types';

// 기본 데이터가 바뀌면 저장 키를 올린다. 이전 저장값이 새 기본값을 가리지 않도록 이전 저장값은 쓰지 않는다.
// v2: 사기 5:5·피해 영향 없음 / v3: 병력 배율(풍수사 0.6, 책사·기병 0.8), 곽가 도사, 보병 가드, 기병 전열 공격
const STORAGE_KEY = 'samgukji-balance-lab-v21';

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** 저장/가져오기 데이터가 Lab 상태로 쓸 수 있는 모양인지 확인한다. */
export function isLabState(x: unknown): x is LabState {
  if (!isObject(x)) return false;
  const { data, balance, teamA, teamB, sim, targets } = x;
  return (
    isObject(data) &&
    isObject(data.skills) &&
    isObject(data.traits) &&
    isObject(data.unitTypes) &&
    isObject(data.characters) &&
    isObject(balance) &&
    isObject(balance.damage) &&
    isObject(balance.troops) &&
    isObject(balance.morale) &&
    Array.isArray(balance.statCurve) &&
    Array.isArray(teamA) &&
    teamA.length === 6 &&
    Array.isArray(teamB) &&
    teamB.length === 6 &&
    isObject(sim) &&
    isObject(targets)
  );
}

/** 저장된 상태에 이후 추가된 설정이 없으면 기본값으로 채운다. */
export function normalizeState(saved: LabState): LabState {
  const defaults = createDefaultState();
  // 이후 추가된 필드를 기본값으로 채운다 (예: 병종의 troopScale)
  const unitTypes = Object.fromEntries(
    Object.entries(saved.data.unitTypes).map(([id, u]) => [id, { ...u, troopScale: u.troopScale ?? 1, baseAp: u.baseAp ?? 0, counterRate: u.counterRate ?? saved.balance.counter.rate, damageTakenByType: { physical: 1, magic: 1, ...u.damageTakenByType }, statMods: { attack: 0, defense: 0, intellect: 0, speed: 0, ...u.statMods } }]),
  );
  const characters = Object.fromEntries(
    Object.entries(saved.data.characters).map(([id, c]) => [id, { ...c, stats: { ...c.stats, action: c.stats.action ?? 0 } }]),
  );
  return {
    ...saved,
    data: { ...saved.data, unitTypes, characters },
    balance: { ...saved.balance, heal: { useTroopFactor: false, ...saved.balance.heal }, action: { perAp: 2, cap: 10, ...saved.balance.action } },
    sim: { ...defaults.sim, ...saved.sim },
    targets: {
      ...defaults.targets,
      ...saved.targets,
      familySurvival: { ...defaults.targets.familySurvival, ...saved.targets.familySurvival },
    },
  };
}

function loadState(): LabState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isLabState(parsed)) return normalizeState(parsed);
    }
  } catch {
    // 저장소를 쓸 수 없는 환경이면 기본값으로 시작한다.
  }
  return createDefaultState();
}

interface LabApi {
  state: LabState;
  /** 경로(`balance.damage.attackScale`)의 값을 바꾼다 */
  set: (path: string, value: unknown) => void;
  update: (fn: (state: LabState) => LabState) => void;
  replace: (state: LabState) => void;
  reset: () => void;
}

const LabContext = createContext<LabApi | null>(null);

export function LabProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LabState>(loadState);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 저장 실패는 무시한다 (시크릿 모드 등)
    }
  }, [state]);

  const set = useCallback((path: string, value: unknown) => setState((s) => setIn(s, path, value)), []);
  const update = useCallback((fn: (state: LabState) => LabState) => setState((s) => fn(s)), []);
  const replace = useCallback((next: LabState) => setState(next), []);
  const reset = useCallback(() => setState(createDefaultState()), []);

  const api = useMemo(() => ({ state, set, update, replace, reset }), [state, set, update, replace, reset]);
  return <LabContext.Provider value={api}>{children}</LabContext.Provider>;
}

export function useLab(): LabApi {
  const ctx = useContext(LabContext);
  if (!ctx) throw new Error('useLab must be used inside <LabProvider>');
  return ctx;
}
