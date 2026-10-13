import { useMemo } from 'react';
import type { CampaignFile } from '@samgukji/game-data';
import { useLab } from '../../lab/LabContext';
import { campaignIssues } from '../../lib/dataIssues';
import { CampaignBattlesPanel } from './CampaignBattlesPanel';
import { CampaignRunPanel } from './CampaignRunPanel';
import { CampaignSettingsPanel } from './CampaignSettingsPanel';

/**
 * 캠페인 탭 (설계 문서 03). campaign.json의 값(시작 자금, 전투별 적 편성·레벨·보상·합류, 경험치, 승급 레벨)을 고치고,
 * 자동 정비 AI로 캠페인을 여러 번 끝까지 돌려 결과를 본다. 작업 중인 데이터·밸런스·편성(저장 전 값 포함)을 그대로 쓴다.
 * 패널은 Campaign*Panel 파일에 있다.
 */
export function CampaignTab() {
  const { state, update } = useLab();
  const { campaign: file, data, balance, presets } = state;
  const presetOptions = presets.map((p) => ({ value: p.id, label: p.label }));
  const characterOptions = Object.values(data.characters).map((c) => ({ value: c.id, label: c.name }));
  const issues = useMemo(() => campaignIssues({ data, balance, presets, campaign: file, map: state.map }), [data, balance, presets, file, state.map]);

  const setFile = (fn: (f: CampaignFile) => CampaignFile) => update((s) => ({ ...s, campaign: fn(s.campaign) }));
  const setBattles = (fn: (b: CampaignFile['battles']) => CampaignFile['battles']) => setFile((f) => ({ ...f, battles: fn(f.battles) }));

  return (
    <div className="balance-page">
      <CampaignSettingsPanel file={file} data={data} presets={presets} presetOptions={presetOptions} setFile={setFile} />
      <CampaignBattlesPanel file={file} data={data} presetOptions={presetOptions} characterOptions={characterOptions} issues={issues} setBattles={setBattles} />
      <CampaignRunPanel file={file} data={data} balance={balance} presets={presets} blocked={issues.length > 0} />
    </div>
  );
}
