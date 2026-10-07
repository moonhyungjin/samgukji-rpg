import { presets } from '@samgukji/game-data';
import { useMemo, useState } from 'react';
import { BattleView } from './components/BattleView';
import { SetupPanel } from './components/SetupPanel';
import { parseConfig } from './lib/config';

export default function App() {
  const presetNames = useMemo(() => Object.keys(presets), []);
  // 주소 쿼리로 설정을 받을 수 있다. 예: ?control=watch&seed=7&speed=0&autostart=1
  const initial = useMemo(() => parseConfig(window.location.search, presetNames), [presetNames]);
  const [config, setConfig] = useState(initial.config);
  const [started, setStarted] = useState(initial.autostart);
  const [artTrial, setArtTrial] = useState(() => new URLSearchParams(window.location.search).get('artTrial') === '1');

  return (
    <div className="app">
      <header className="top">
        <h1>삼국지 전투</h1>
        <span className="sub">전투 프로토타입 · 첫 전장 아트 / 미제작 병종은 표식 표시</span>
      </header>
      {started ? (
        <BattleView config={config} artTrial={artTrial} onExit={() => { setStarted(false); setArtTrial(false); }} />
      ) : (
        <SetupPanel config={config} presetNames={presetNames} onChange={setConfig} onStart={() => setStarted(true)} />
      )}
    </div>
  );
}
