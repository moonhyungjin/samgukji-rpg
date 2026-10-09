import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { DEFAULT_ADDITIVE, DEFAULT_DEBUFFS, DEFAULT_GAP, DEFAULT_RATIO, DEFAULT_TIERED } from '@samgukji/battle-engine';
import { setIn } from '../lib/path';
import { filesSnapshot, syncWithFiles } from '../lib/fileSync';
import type { DataFiles } from '../lib/fileSync';
import { createDefaultState } from './defaults';
import type { LabState } from './types';

// 기본 데이터가 바뀌면 저장 키를 올린다. 이전 저장값이 새 기본값을 가리지 않도록 이전 저장값은 쓰지 않는다.
// v2: 사기 5:5·피해 영향 없음 / v3: 병력 배율(풍수사 0.6, 책사·기병 0.8), 곽가 도사, 보병 가드, 기병 전열 공격
const STORAGE_KEY = 'samgukji-balance-lab-v27';

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** 저장/가져오기 데이터가 Lab 상태로 쓸 수 있는 모양인지 확인한다. */
export function isLabState(x: unknown): x is LabState {
  if (!isObject(x)) return false;
  const { data, balance, teamA, teamB, sim } = x;
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
    isObject(sim)
  );
}

/** 저장된 상태에 이후 추가된 설정이 없으면 기본값으로 채운다. */
export function normalizeState(saved: LabState): LabState {
  const defaults = createDefaultState();
  // 이후 추가된 필드를 기본값으로 채운다 (예: 병종의 troopScale)
  const unitTypes = Object.fromEntries(
    Object.entries(saved.data.unitTypes).map(([id, u]) => [id, { ...u, troopScale: u.troopScale ?? 1, baseAp: u.baseAp ?? 0, damageTakenByType: { physical: 1, magic: 1, ...u.damageTakenByType }, statMods: { attack: 0, defense: 0, intellect: 0, speed: 0, ...u.statMods } }]),
  );
  const characters = Object.fromEntries(
    Object.entries(saved.data.characters).map(([id, c]) => [id, { ...c, stats: { ...c.stats, action: c.stats.action ?? 0 } }]),
  );
  return {
    ...saved,
    data: { ...saved.data, unitTypes, characters },
    // 값의 순서를 바꾸지 않도록 빠진 값만 채운다 (순서가 바뀌면 파일과 달라 보여 "저장 안 됨"이 된다)
    balance: {
      ...saved.balance,
      damage: {
        ...saved.balance.damage,
        formula: saved.balance.damage.formula ?? 'divide',
        additive: saved.balance.damage.additive ?? { ...DEFAULT_ADDITIVE },
        gap: saved.balance.damage.gap ?? { ...DEFAULT_GAP },
      },
      critical: saved.balance.critical ?? { chance: 10, multiplier: 1.5 },
      debuffs: saved.balance.debuffs ?? structuredClone(DEFAULT_DEBUFFS),
      heal: saved.balance.heal.useTroopFactor === undefined ? { ...saved.balance.heal, useTroopFactor: false } : saved.balance.heal,
      action: saved.balance.action ?? { perAp: 2, cap: 10 },
      troopFactor: {
        ...saved.balance.troopFactor,
        mode: saved.balance.troopFactor.mode ?? 'absolute',
        normalizeByScale: saved.balance.troopFactor.normalizeByScale ?? true,
        relative: saved.balance.troopFactor.relative ?? { min: 0.5, max: 1.5, exponent: 0.5 },
        self: saved.balance.troopFactor.self ?? { min: 0.3, max: 1 },
        tiered: saved.balance.troopFactor.tiered ?? { ...DEFAULT_TIERED },
        ratio: saved.balance.troopFactor.ratio ?? { ...DEFAULT_RATIO },
      },
    },
    sim: { ...defaults.sim, ...saved.sim },
    campaign: saved.campaign ?? defaults.campaign,
    // 예전의 "목표 지표"(targets)는 버리고 경고 기준(warnings)을 쓴다 (2026-10-09)
    targets: undefined,
    warnings: { ...defaults.warnings, ...saved.warnings },
  } as LabState;
}

function loadState(): LabState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      // 데이터 파일이 바뀌었으면(저장했거나 git으로 받았으면) 작업 중이던 초안을 버리고 파일 값으로 시작한다 (가져오기에는 적용하지 않는다)
      if (isLabState(parsed)) return syncWithFiles(normalizeState(parsed), filesSnapshot());
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
  /** 프로젝트 파일에 저장돼 있는 값 ("저장 안 됨" 표시와 되돌리기의 기준) */
  baseline: DataFiles;
  /** 저장에 성공했을 때 기준을 바꾼다 */
  setBaseline: (files: DataFiles) => void;
}

const LabContext = createContext<LabApi | null>(null);

export function LabProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LabState>(loadState);
  const [baseline, setBaseline] = useState<DataFiles>(filesSnapshot);

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

  const api = useMemo(() => ({ state, set, update, replace, reset, baseline, setBaseline }), [state, set, update, replace, reset, baseline]);
  return <LabContext.Provider value={api}>{children}</LabContext.Provider>;
}

export function useLab(): LabApi {
  const ctx = useContext(LabContext);
  if (!ctx) throw new Error('useLab must be used inside <LabProvider>');
  return ctx;
}
