import { useEffect, useState } from 'react';
import type { SimulationReport } from '@samgukji/battle-engine';
import { BalanceTab } from './features/balance/BalanceTab';
import { BattleTab } from './features/sim/BattleTab';
import { CampaignTab } from './features/campaign/CampaignTab';
import { CharactersTab } from './features/data/CharactersTab';
import { CompareTab } from './features/sim/CompareTab';
import { DamageAnalysisTab } from './features/sim/DamageAnalysisTab';
import { DataTab } from './features/data/DataTab';
import { MapTab } from './features/campaign/MapTab';
import { MatchupTab } from './features/sim/MatchupTab';
import { PresetsTab } from './features/data/PresetsTab';
import { SaveBar } from './shared/SaveBar';
import { SettingsTab } from './features/settings/SettingsTab';
import { SimulationTab } from './features/sim/SimulationTab';
import { ArtReviewTab } from './features/art/ArtReviewTab';
import { LabProvider, useLab } from './lab/LabContext';
import { NavContext } from './lab/NavContext';
import type { LabTab } from './lab/NavContext';
import { useSimulation } from './lab/useSimulation';
import { CATEGORIES, categoryOf } from './nav';

function Shell() {
  const { state } = useLab();
  const sim = useSimulation(state);
  const [tab, setTab] = useState<LabTab>('sim');
  // 분류로 돌아오면 그 분류에서 마지막에 보던 탭을 연다
  const [lastTab, setLastTab] = useState<Record<string, LabTab>>({});
  const category = categoryOf(tab);
  const [compareOpened, setCompareOpened] = useState(false);
  useEffect(() => {
    setLastTab((cur) => (cur[category.id] === tab ? cur : { ...cur, [category.id]: tab }));
    if (tab === 'compare') setCompareOpened(true);
  }, [tab, category.id]);
  const [pinned, setPinned] = useState<SimulationReport | null>(null);
  const [anchor, setAnchor] = useState<string | null>(null);
  const nav = { anchor, go: (next: LabTab, target?: string) => { setTab(next); setAnchor(target ?? null); } };

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
        <nav className="categories" aria-label="분류">
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" title={c.hint} data-category={c.id} className={c.id === category.id ? 'tab cat active' : 'tab cat'} onClick={() => setTab(lastTab[c.id] ?? c.tabs[0].id)}>
              {c.label}
            </button>
          ))}
        </nav>
      </header>
      <SaveBar />
      <main>
        {(
          <nav className="sub-tabs" aria-label={`${category.label} 탭`}>
            {category.tabs.map((t) => (
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
        {tab === 'calc' && <DamageAnalysisTab />}
        {tab === 'matchup' && <MatchupTab />}
        {tab === 'balance' && <BalanceTab />}
        {tab === 'data' && <DataTab />}
        {tab === 'characters' && <CharactersTab />}
        {tab === 'presets' && <PresetsTab />}
        {tab === 'campaign' && <CampaignTab />}
        {tab === 'map' && <MapTab />}
        {tab === 'art' && <ArtReviewTab />}
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
