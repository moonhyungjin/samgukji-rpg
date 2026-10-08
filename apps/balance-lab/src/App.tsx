import { useEffect, useState } from 'react';
import type { SimulationReport } from '@samgukji/battle-engine';
import { BalanceTab } from './components/BalanceTab';
import { BattleTab } from './components/BattleTab';
import { CharactersTab } from './components/CharactersTab';
import { CompareTab } from './components/CompareTab';
import { DamageCalculatorPanel } from './components/DamageCalculatorPanel';
import { DataTab } from './components/DataTab';
import { MatchupTab } from './components/MatchupTab';
import { PresetsTab } from './components/PresetsTab';
import { SaveBar } from './components/SaveBar';
import { SettingsTab } from './components/SettingsTab';
import { SimulationTab } from './components/SimulationTab';
import { LabProvider, useLab } from './lab/LabContext';
import { NavContext } from './lab/NavContext';
import type { LabTab } from './lab/NavContext';
import { useSimulation } from './lab/useSimulation';

/** 시뮬레이션 탭 안의 하위 탭 (결과를 확인하는 도구들) */
const SIM_TABS = [
  { id: 'sim', label: '시뮬레이션' },
  { id: 'compare', label: '설정 비교' },
  { id: 'battle', label: '전투 1회' },
  { id: 'calc', label: '피해 계산기' },
] as const;

type SimTabId = (typeof SIM_TABS)[number]['id'];
const isSimTab = (tab: LabTab): tab is SimTabId => SIM_TABS.some((t) => t.id === tab);

const TABS = [
  { id: 'sim', label: '시뮬레이션' },
  { id: 'matchup', label: '병종 상성표' },
  { id: 'balance', label: '밸런스' },
  { id: 'data', label: '병종 · 스킬' },
  { id: 'characters', label: '장수' },
  { id: 'presets', label: '기본 편성' },
  { id: 'settings', label: '경고 기준 · 가져오기' },
] as const;

type TabId = (typeof TABS)[number]['id'] | SimTabId;

function Shell() {
  const { state } = useLab();
  const sim = useSimulation(state);
  const [tab, setTab] = useState<TabId>('sim');
  // 시뮬레이션 탭으로 돌아오면 마지막에 보던 하위 탭을 연다
  const [lastSimTab, setLastSimTab] = useState<SimTabId>('sim');
  const [compareOpened, setCompareOpened] = useState(false);
  useEffect(() => {
    if (isSimTab(tab)) setLastSimTab(tab);
    if (tab === 'compare') setCompareOpened(true);
  }, [tab]);
  const [pinned, setPinned] = useState<SimulationReport | null>(null);
  const [anchor, setAnchor] = useState<string | null>(null);
  const nav = { anchor, go: (next: LabTab, target?: string) => { setTab(next as TabId); setAnchor(target ?? null); } };

  // 다른 탭의 값을 고치러 이동하면 그 카드/행으로 스크롤하고 잠깐 강조한다.
  // 이동한 화면이 선택 상태(예: 병종 트리에서 어느 병종)를 맞추고 나서야 요소가 생기므로 몇 프레임 기다리며 찾는다.
  useEffect(() => {
    if (!anchor) return;
    let frames = 0;
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const el = document.querySelector(anchor);
      if (el) {
        setAnchor(null);
        el.scrollIntoView({ block: 'start' });
        el.classList.add('flash');
        timer = setTimeout(() => el.classList.remove('flash'), 1800);
      } else if (frames++ < 30) {
        raf = requestAnimationFrame(tick);
      } else {
        setAnchor(null);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
    };
  }, [tab, anchor]);

  // 수치/편성/설정이 바뀌면 잠시 뒤 자동으로 다시 돌린다. 탭을 옮겨도 결과가 유지되도록 여기서 관리한다.
  const { autoRun, autoRunIterations } = state.sim;
  const autoKey = JSON.stringify([state.data, state.balance, state.teamA, state.teamB, state.sim]);
  useEffect(() => {
    if (!autoRun) return;
    const timer = setTimeout(() => sim.run(autoRunIterations), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoKey]);

  return (
    <NavContext.Provider value={nav}>
    <div className="app">
      <header className="top">
        <h1>Balance Lab</h1>
        <nav>
          {TABS.map((t) => (
            <button key={t.id} type="button" className={t.id === tab || (t.id === 'sim' && isSimTab(tab)) ? 'tab active' : 'tab'} onClick={() => setTab(t.id === 'sim' ? lastSimTab : t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <SaveBar />
      <main>
        {isSimTab(tab) && (
          <nav className="sub-tabs">
            {SIM_TABS.map((t) => (
              <button key={t.id} type="button" className={t.id === tab ? 'tab sub active' : 'tab sub'} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
        )}
        {tab === 'sim' && <SimulationTab sim={sim} pinned={pinned} setPinned={setPinned} />}
        {/* 설정 비교는 하위 탭을 옮겨도 결과가 남도록 한 번 열면 계속 붙여 둔다 */}
        {(compareOpened || tab === 'compare') && (
          <div hidden={tab !== 'compare'}>
            <CompareTab />
          </div>
        )}
        {tab === 'battle' && <BattleTab />}
        {tab === 'calc' && <DamageCalculatorPanel />}
        {tab === 'matchup' && <MatchupTab />}
        {tab === 'balance' && <BalanceTab />}
        {tab === 'data' && <DataTab />}
        {tab === 'characters' && <CharactersTab />}
        {tab === 'presets' && <PresetsTab />}
        {tab === 'settings' && <SettingsTab />}
      </main>
    </div>
    </NavContext.Provider>
  );
}

export default function App() {
  return (
    <LabProvider>
      <Shell />
    </LabProvider>
  );
}
