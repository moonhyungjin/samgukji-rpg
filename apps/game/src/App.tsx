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

  return (
    <div className="app">
      <header className="top">
        <h1>삼국지 전투</h1>
        <span className="sub">전투 프로토타입 · 임시 도형과 임시 수치</span>
      </header>
      {started ? (
        <BattleView config={config} onExit={() => setStarted(false)} />
      ) : (
        <SetupPanel config={config} presetNames={presetNames} onChange={setConfig} onStart={() => setStarted(true)} />
      )}
    </div>
  );
}
