import { presets } from '@samgukji/game-data';
import { useMemo, useState } from 'react';
import { BattleView } from './components/BattleView';
import { SetupPanel } from './components/SetupPanel';
import { parseConfig } from './lib/config';
import { CampaignView } from './components/CampaignView';
import { StrategyPreview } from './components/StrategyPreview';

export default function App() {
  const presetNames = useMemo(() => Object.keys(presets), []);
  // 주소 쿼리로 설정을 받을 수 있다. 예: ?control=watch&seed=7&speed=0&autostart=1
  const initial = useMemo(() => parseConfig(window.location.search, presetNames), [presetNames]);
  const [config, setConfig] = useState(initial.config);
  const [started, setStarted] = useState(initial.autostart);
  const [artTrial, setArtTrial] = useState(() => new URLSearchParams(window.location.search).get('artTrial') === '1');
  const [inCampaign, setInCampaign] = useState(() => new URLSearchParams(window.location.search).get('campaign') === '1');
  const [inStrategy, setInStrategy] = useState(() => new URLSearchParams(window.location.search).get('strategy') === '1');

  return (
    <div className="app">
      <header className="top">
        <h1>삼국지 전투</h1>
        <span className="sub">전투 프로토타입 · 첫 전장 아트 / 미제작 병종은 표식 표시</span>
      </header>
      {!inStrategy && !inCampaign && !started && <section className="campaign-entry"><div><strong>전략 지도</strong><p className="note">지역과 성을 살펴보는 배치 시안</p></div><button onClick={() => setInStrategy(true)}>전략 지도 시안 보기</button></section>}
      {inStrategy ? <StrategyPreview onExit={() => setInStrategy(false)} /> : inCampaign ? <CampaignView onExit={() => setInCampaign(false)} /> : started ? (
        <BattleView config={config} artTrial={artTrial} onExit={() => { setStarted(false); setArtTrial(false); }} />
      ) : (
        <><section className="campaign-entry"><div><strong>황건적 토벌 캠페인</strong><p className="note">군단 정비와 성장이 이어지는 연속 전투</p></div><button className="primary" onClick={() => setInCampaign(true)}>캠페인 시작 / 이어하기</button></section><SetupPanel config={config} presetNames={presetNames} onChange={setConfig} onStart={() => setStarted(true)} /></>
      )}
    </div>
  );
}
