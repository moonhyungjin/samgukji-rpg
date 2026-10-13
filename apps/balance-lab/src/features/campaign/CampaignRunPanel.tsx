import { useState } from 'react';
import { runCampaign, startCampaign, summarizeCampaignRuns } from '@samgukji/battle-engine';
import type { CampaignData, CampaignRun, CampaignRunsSummary, GameData } from '@samgukji/battle-engine';
import { resolveCampaign } from '@samgukji/game-data';
import type { CampaignFile } from '@samgukji/game-data';
import type { BalanceConfig } from '@samgukji/battle-engine';
import type { LabState } from '../../lab/types';
import { CampaignResultView } from './CampaignResultView';

const RUN_COUNTS = [100, 300, 1000];

interface Props {
  file: CampaignFile;
  data: GameData;
  balance: BalanceConfig;
  presets: LabState['presets'];
  /** 데이터에 오류가 있으면 돌리지 않는다 */
  blocked: boolean;
}

/** 자동 정비 AI로 캠페인을 여러 번 끝까지 돌려 결과를 본다 (CLI npm run sim:campaign과 같은 계산) */
export function CampaignRunPanel({ file, data, balance, presets, blocked }: Props) {
  const [runs, setRuns] = useState(300);
  const [seed, setSeed] = useState(1);
  const [maxAttempts, setMaxAttempts] = useState(5);
  const [result, setResult] = useState<{ summary: CampaignRunsSummary; sample: CampaignRun; campaign: CampaignData; ms: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = (id: string) => data.characters[id]?.name ?? id;

  const run = () => {
    try {
      const started = performance.now();
      const campaign = resolveCampaign(file, Object.fromEntries(presets.map((p) => [p.id, p.lineup])));
      const all = Array.from({ length: runs }, (_, r) => runCampaign(campaign, data, balance, startCampaign(campaign, data, balance), seed + r * 1000, maxAttempts));
      setResult({ summary: summarizeCampaignRuns(all, campaign, data), sample: all[0], campaign, ms: performance.now() - started });
      setError(null);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
  <section className="panel" data-panel="campaign-run">
    <h3>돌려 보기</h3>
    <div className="row">
      <label className="field">
        <span>횟수</span>
        <select aria-label="캠페인 횟수" value={runs} onChange={(e) => setRuns(Number(e.target.value))}>
          {RUN_COUNTS.map((n) => (
            <option key={n} value={n}>
              {n}회
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>시드</span>
        <input type="number" aria-label="캠페인 시드" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 0)} />
      </label>
      <label className="field">
        <span>전투당 최대 도전</span>
        <input type="number" aria-label="캠페인 최대 도전" min={1} value={maxAttempts} onChange={(e) => setMaxAttempts(Math.max(1, Number(e.target.value) || 1))} />
      </label>
      <button type="button" className="primary" disabled={blocked} onClick={run}>
        캠페인 돌려 보기
      </button>
    </div>
    {error && <div className="error">{error}</div>}
    {result && <CampaignResultView {...result} name={name} />}
  </section>
  );
}
