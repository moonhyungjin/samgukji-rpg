import { useEffect, useState } from 'react';
import type { SimulationReport } from '@samgukji/battle-engine';
import { BalanceTab } from './components/BalanceTab';
import { BattleTab } from './components/BattleTab';
import { CharactersTab } from './components/CharactersTab';
import { DataTab } from './components/DataTab';
import { PresetsTab } from './components/PresetsTab';
import { SaveBar } from './components/SaveBar';
import { SettingsTab } from './components/SettingsTab';
import { SimulationTab } from './components/SimulationTab';
import { LabProvider, useLab } from './lab/LabContext';
import { useSimulation } from './lab/useSimulation';

const TABS = [
  { id: 'sim', label: '시뮬레이션' },
  { id: 'battle', label: '전투 1회' },
  { id: 'balance', label: '밸런스 수치' },
  { id: 'data', label: '병종 · 특성 · 스킬' },
  { id: 'characters', label: '장수' },
  { id: 'presets', label: '기본 편성' },
  { id: 'settings', label: '목표 · 가져오기' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function Shell() {
  const { state } = useLab();
  const sim = useSimulation(state);
  const [tab, setTab] = useState<TabId>('sim');
  const [pinned, setPinned] = useState<SimulationReport | null>(null);

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
    <div className="app">
      <header className="top">
        <h1>Balance Lab</h1>
        <nav>
          {TABS.map((t) => (
            <button key={t.id} type="button" className={t.id === tab ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <SaveBar />
      <main>
        {tab === 'sim' && <SimulationTab sim={sim} pinned={pinned} setPinned={setPinned} />}
        {tab === 'battle' && <BattleTab />}
        {tab === 'balance' && <BalanceTab />}
        {tab === 'data' && <DataTab />}
        {tab === 'characters' && <CharactersTab />}
        {tab === 'presets' && <PresetsTab />}
        {tab === 'settings' && <SettingsTab />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <LabProvider>
      <Shell />
    </LabProvider>
  );
}
