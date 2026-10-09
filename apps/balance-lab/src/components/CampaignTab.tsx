import { useMemo, useState } from 'react';
import { runCampaign, startCampaign, summarizeCampaignRuns } from '@samgukji/battle-engine';
import type { CampaignData, CampaignRun, CampaignRunsSummary } from '@samgukji/battle-engine';
import { resolveCampaign } from '@samgukji/game-data';
import type { CampaignFile } from '@samgukji/game-data';
import { useLab } from '../lab/LabContext';
import { campaignIssues } from '../lib/dataIssues';
import { num, pct } from '../lib/format';
import { NumberField, SelectField, TextField } from './Fields';

const RUN_COUNTS = [100, 300, 1000];

/**
 * 캠페인 탭 (설계 문서 03). campaign.json의 값(시작 자금, 전투별 적 편성·레벨·보상·합류, 경험치, 승급 레벨)을 고치고,
 * 자동 정비 AI로 캠페인을 여러 번 끝까지 돌려 결과를 본다. 계산은 CLI(npm run sim:campaign)와 같은 함수다.
 * 작업 중인 데이터·밸런스·편성(저장 전 값 포함)을 그대로 쓴다.
 */
export function CampaignTab() {
  const { state, update } = useLab();
  const { campaign: file, data, balance, presets } = state;
  const [runs, setRuns] = useState(300);
  const [seed, setSeed] = useState(1);
  const [maxAttempts, setMaxAttempts] = useState(5);
  const [result, setResult] = useState<{ summary: CampaignRunsSummary; sample: CampaignRun; campaign: CampaignData; ms: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const presetOptions = presets.map((p) => ({ value: p.id, label: p.label }));
  const characterOptions = Object.values(data.characters).map((c) => ({ value: c.id, label: c.name }));
  const issues = useMemo(() => campaignIssues({ data, balance, presets, campaign: file }), [data, balance, presets, file]);

  const setFile = (fn: (f: CampaignFile) => CampaignFile) => update((s) => ({ ...s, campaign: fn(s.campaign) }));
  const setBattles = (fn: (b: CampaignFile['battles']) => CampaignFile['battles']) => setFile((f) => ({ ...f, battles: fn(f.battles) }));

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

  const name = (id: string) => data.characters[id]?.name ?? id;

  return (
    <div className="balance-page">
      <section className="panel" data-panel="campaign-settings">
        <h3>캠페인: {file.name}</h3>
        <p className="note">
          시작·합류한 군단은 레벨 상한으로 가득 찬 병력입니다. 전투를 이어서 싸우고, 전투 사이에 자동 정비 AI가 승급 → 보충 → 남는 돈으로 증원을 합니다 (설계 문서 03). 값을 고친 뒤 아래 "돌려 보기"로 결과를 봅니다. 고친 값은 "파일에 저장"을 눌러야 게임에 들어갑니다. 숫자는 모두 [임시]입니다.
        </p>
        <div className="fields-grid">
          <NumberField label="시작 자금" path="campaign.startGold" step={100} min={0} />
          <NumberField label="시작 레벨" path="campaign.startLevel" step={1} min={1} />
          <SelectField label="시작 편성" path="campaign.startPreset" options={presetOptions} />
          <NumberField label="1차 승급 레벨" path="campaign.promotionLevels.0" step={1} min={1} />
          <NumberField label="2차 승급 레벨" path="campaign.promotionLevels.1" step={1} min={1} />
          <NumberField label="포획 비율" path="campaign.captureRate" step={0.01} min={0} hint="이기면 군단마다 자기가 줄인 적 병력 × 이 값만큼 정원과 병력이 는다 (레벨 상한까지). 0.05 = 5%" />
        </div>
        <h4 className="sub">시작 장수 레벨 (편성 순서대로)</h4>
        <p className="note">시작 편성의 장수마다 시작 레벨을 따로 정합니다. 비우면 위의 "시작 레벨"을 씁니다. 병력은 그 레벨의 상한으로 가득 찬 상태로 시작합니다.</p>
        <div className="fields-grid">
          {(presets.find((p) => p.id === file.startPreset)?.lineup ?? []).map((entry, i) => (
            <label className="field" key={entry.characterId}>
              <span>
                {i + 1}. {name(entry.characterId)}
              </span>
              <input
                type="number"
                aria-label={`${name(entry.characterId)} 시작 레벨`}
                min={1}
                step={1}
                value={file.startLevels?.[entry.characterId] ?? ''}
                placeholder={String(file.startLevel)}
                onChange={(e) => {
                  const v = e.target.value;
                  setFile((f) => {
                    const { [entry.characterId]: _old, ...rest } = f.startLevels ?? {};
                    const next = v === '' ? rest : { ...rest, [entry.characterId]: Math.max(1, Math.round(Number(v))) };
                    const { startLevels: _drop, ...without } = f;
                    return Object.keys(next).length > 0 ? { ...without, startLevels: next } : without;
                  });
                }}
              />
            </label>
          ))}
        </div>
        <h4 className="sub">경험치 (출전한 군단마다)</h4>
        <div className="fields-grid">
          <NumberField label="이기면" path="campaign.exp.win" step={10} min={0} />
          <NumberField label="지면" path="campaign.exp.lose" step={10} min={0} />
          <NumberField label="처치 1당 추가" path="campaign.exp.perKill" step={5} min={0} />
          <NumberField label="레벨당 필요 경험치" path="campaign.exp.perLevel" step={10} min={1} hint="경험치가 이만큼 쌓일 때마다 레벨이 하나 오르고 병력 상한이 는다" />
        </div>
      </section>

      <section className="panel" data-panel="campaign-battles">
        <h3>전투 순서</h3>
        <table className="campaign-table">
          <thead>
            <tr>
              <th>#</th>
              <th>이름</th>
              <th>적 편성</th>
              <th>적 레벨</th>
              <th title="적 군단마다의 병력. 비우면 레벨 상한으로 가득 (레벨 상한을 넘지 않음)">적 병력</th>
              <th>이기면 받는 돈</th>
              <th>이기면 합류</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {file.battles.map((b, i) => (
              <tr key={b.id}>
                <td>{i + 1}</td>
                <td>
                  <TextField path={`campaign.battles.${i}.name`} />
                </td>
                <td>
                  <SelectField path={`campaign.battles.${i}.enemyPreset`} options={presetOptions} />
                </td>
                <td>
                  <NumberField path={`campaign.battles.${i}.enemyLevel`} step={1} min={1} />
                </td>
                <td>
                  <input
                    type="number"
                    aria-label={`${b.name} 적 병력`}
                    min={1}
                    step={10}
                    value={b.enemyTroops ?? ''}
                    placeholder="상한 가득"
                    onChange={(e) => {
                      const v = e.target.value;
                      setBattles((list) =>
                        list.map((x, n) => {
                          if (n !== i) return x;
                          const { enemyTroops: _old, ...rest } = x;
                          return v === '' ? rest : { ...rest, enemyTroops: Number(v) };
                        }),
                      );
                    }}
                  />
                </td>
                <td>
                  <NumberField path={`campaign.battles.${i}.reward`} step={100} min={0} />
                </td>
                <td>
                  <span className="join-list">
                    {b.joins.map((j, k) => (
                      <button key={`${j.characterId}-${k}`} type="button" className="join-chip" title="눌러서 빼기" onClick={() => setBattles((list) => list.map((x, n) => (n === i ? { ...x, joins: x.joins.filter((_, m) => m !== k) } : x)))}>
                        {name(j.characterId)} ✕
                      </button>
                    ))}
                    <select
                      aria-label={`${b.name} 합류 추가`}
                      value=""
                      onChange={(e) => {
                        const id = e.target.value;
                        if (id) setBattles((list) => list.map((x, n) => (n === i ? { ...x, joins: [...x.joins, { characterId: id, unitType: data.characters[id]?.unitType }] } : x)));
                      }}
                    >
                      <option value="">+ 장수</option>
                      {characterOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </span>
                </td>
                <td>
                  <button type="button" disabled={file.battles.length <= 1} onClick={() => setBattles((list) => list.filter((_, n) => n !== i))}>
                    빼기
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          type="button"
          onClick={() =>
            setBattles((list) => {
              const last = list[list.length - 1];
              let n = list.length + 1;
              while (list.some((x) => x.id === `battle${n}`)) n++;
              return [...list, { ...last, id: `battle${n}`, name: `${last.name} (새)`, joins: [] }];
            })
          }
        >
          전투 추가 (마지막 전투 복사)
        </button>
        {issues.length > 0 && (
          <ul className="findings">
            {issues.map((i) => (
              <li key={i.message} className="warn">
                <span className="mark">!</span>
                {i.message}
              </li>
            ))}
          </ul>
        )}
      </section>

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
          <button type="button" className="primary" disabled={issues.length > 0} onClick={run}>
            캠페인 돌려 보기
          </button>
        </div>
        {error && <div className="error">{error}</div>}
        {result && <CampaignResultView {...result} name={name} />}
      </section>
    </div>
  );
}

function CampaignResultView({ summary, sample, campaign, ms, name }: { summary: CampaignRunsSummary; sample: CampaignRun; campaign: CampaignData; ms: number; name: (id: string) => string }) {
  return (
    <>
      <div className="cards">
        <div className="card">
          <span className="card-label">끝까지 이김</span>
          <strong>{pct(summary.clearRate)}</strong>
        </div>
        <div className="card">
          <span className="card-label">출전할 군단이 없어 멈춤</span>
          <strong>{pct(summary.stuckRate)}</strong>
        </div>
        <div className="card">
          <span className="card-label">끝난 뒤 평균 레벨</span>
          <strong>
            {summary.averageEndLevel.toFixed(1)} <small>(최고 {summary.maxEndLevel})</small>
          </strong>
        </div>
        <div className="card">
          <span className="card-label">끝난 뒤 남은 돈</span>
          <strong>{num(summary.averageEndGold)}</strong>
        </div>
        <div className="card">
          <span className="card-label">승급한 군단이 있음</span>
          <strong>{pct(summary.promotedRate)}</strong>
        </div>
        <div className="card">
          <span className="card-label">실행</span>
          <strong>
            {summary.runs}회 · {num(ms)}ms
          </strong>
        </div>
      </div>
      <table className="campaign-table" aria-label="캠페인 전투별 결과">
        <thead>
          <tr>
            <th>전투</th>
            <th>도달</th>
            <th>한 번에 이김</th>
            <th>평균 도전</th>
            <th>정비 뒤 남은 돈</th>
          </tr>
        </thead>
        <tbody>
          {summary.battles.map((b, i) => (
            <tr key={i}>
              <td>
                {i + 1}. {b.name}
              </td>
              <td>{pct(b.reachRate)}</td>
              <td>{pct(b.firstTryRate)}</td>
              <td>{b.averageAttempts.toFixed(2)}번</td>
              <td>{num(b.averageGoldBefore)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4 className="sub">한 번 따라가 보기 (첫 번째 실행)</h4>
      <ol className="campaign-log">
        {sample.stuck && <li className="warn">멈춤: {sample.stuck}</li>}
        {sample.log.map((l, i) => (
          <li key={i}>
            <b>
              {campaign.battles[l.battleIndex]?.name} {l.attempt > 1 ? `(${l.attempt}번째 도전)` : ''}
            </b>{' '}
            — {l.summary.won ? '승리' : '패배'}, 정비 뒤 돈 {num(l.goldBefore)}
            {l.summary.goldGained > 0 ? ` → 보상 +${num(l.summary.goldGained)}` : ''}
            <div className="note">
              {l.summary.units.map((u) => `${name(u.characterId)} 경험치 +${u.expGained}${u.levelsGained > 0 ? ` (레벨 +${u.levelsGained})` : ''}${u.captured > 0 ? `, 포획 +${u.captured}` : ''}, 남은 병력 ${num(u.troopsAfter)}`).join(' · ')}
              {l.summary.joined.length > 0 ? ` · 합류: ${l.summary.joined.map(name).join(', ')}` : ''}
            </div>
          </li>
        ))}
      </ol>
      <p className="note">
        끝난 뒤 군단: {sample.state.roster.map((u) => `${name(u.characterId)} Lv${u.level} (정원 ${num(u.capacity)}, 병력 ${num(u.troops)})`).join(' · ')}
      </p>
    </>
  );
}
