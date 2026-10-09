import { useMemo, useState } from 'react';
import { applyBattleResult, campaignBattleInput, dismiss, lineupIssue, promote, promotionDepthOf, promotionOptions, recruitCost, reinforce, reinforceCostToCap, replenish, replenishCostToFull, setLineup, unitCap } from '@samgukji/battle-engine';
import type { BattleInput, BattleResult, CampaignResult, CampaignSlot } from '@samgukji/battle-engine';
import { campaign, defaultBalance, gameData } from '@samgukji/game-data';
import { freshProgress, loadProgress, saveProgress } from '../campaign/progress';
import type { CampaignProgress } from '../campaign/progress';
import { DEFAULT_CONFIG } from '../lib/config';
import { BattleView } from './BattleView';

const nameOf = (id: string) => gameData.characters[id]?.name ?? id;

export function CampaignView({ onExit }: { onExit: () => void }) {
  const [loaded] = useState(loadProgress);
  const [progress, setProgress] = useState<CampaignProgress | null>(null);
  const [error, setError] = useState<string | null>(loaded.error);
  const [saveError, setSaveError] = useState(false);
  const [draft, setDraft] = useState<CampaignSlot[]>([]);
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [resetting, setResetting] = useState(false);
  const config = useMemo(() => ({ ...DEFAULT_CONFIG, control: 'attacker' as const }), []);
  const [input, setInput] = useState<BattleInput | null>(null);

  function commit(next: CampaignProgress) {
    setProgress(next);
    setSaveError(!saveProgress(next));
    setError(null);
  }
  function enter(next: CampaignProgress) {
    try {
      if (next.phase === 'battle') setInput(campaignBattleInput(next.state, campaign, gameData, defaultBalance, next.seed));
      setDraft(next.state.lineup);
      commit(next);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  function maintain(result: CampaignResult) {
    if (!result.ok) { setError(result.reason); return; }
    if (!progress) return;
    if (result.state.lineup !== progress.state.lineup) setDraft(result.state.lineup);
    commit({ ...progress, state: result.state });
  }
  function launch() {
    if (!progress) return;
    const formed = setLineup(progress.state, draft, gameData);
    if (!formed.ok) { setError(formed.reason); return; }
    enter({ ...progress, state: formed.state, phase: 'battle', summary: null });
  }
  function finish(result: BattleResult) {
    if (!progress || progress.phase !== 'battle') return;
    const next = applyBattleResult(progress.state, campaign, result, gameData, defaultBalance);
    setInput(null);
    setDraft(next.state.lineup);
    commit({ version: 1, ...next, phase: 'result', seed: progress.seed + 1 });
  }
  function chooseSlot(index: number, characterId: string) {
    const row = index < 3 ? 'front' : 'back', slot = index % 3;
    setDraft(old => [...old.filter(s => !(s.row === row && s.slot === slot) && s.characterId !== characterId), ...(characterId ? [{ characterId, row, slot } as CampaignSlot] : [])]);
    setError(null);
  }

  if (progress?.phase === 'battle' && input) return <section className="campaign">
    <p className="campaign-eyebrow">{campaign.name} · {progress.state.battleIndex + 1}전 · {progress.state.attempt}번째 도전</p>
    <BattleView config={config} battleInput={input} onExit={onExit} onComplete={finish} />
    {saveError && <p role="alert">자동 저장에 실패했습니다. 이 화면을 닫으면 진행이 사라질 수 있습니다.</p>}
  </section>;

  if (!progress) return <section className="campaign campaign-intro">
    <p className="campaign-eyebrow">연속 전투 캠페인</p><h2>{campaign.name}</h2>
    <p>군단을 정비하고 다음 전투로 나아가세요.<br />병력과 자금은 전투 사이에 이어집니다.</p>
    <ol className="campaign-route">{campaign.battles.map((b, i) => <li key={b.id}><span>{i + 1}전</span><strong>{b.name}</strong><small>승리 보상 {b.reward.toLocaleString()} · {b.joins.length ? `${b.joins.map(j => nameOf(j.characterId)).join(', ')} 합류` : '최종 전투'}</small></li>)}</ol>
    {error && <p role="alert" className="error">{error}</p>}
    <div className="row">
      {loaded.progress && <button className="primary" onClick={() => enter(loaded.progress!)}>이어하기</button>}
      {!resetting ? <button className={loaded.progress ? '' : 'primary'} onClick={() => loaded.progress || loaded.error ? setResetting(true) : enter(freshProgress())}>새 캠페인 시작</button> : <><span>기존 저장을 지우고 시작할까요?</span><button onClick={() => enter(freshProgress())}>새로 시작 확인</button><button onClick={() => setResetting(false)}>취소</button></>}
      <button onClick={onExit}>전투 설정으로</button>
    </div><p className="note">이 브라우저에 자동 저장됩니다. 전투 중 종료하면 같은 전투를 처음부터 이어갑니다.</p>
  </section>;

  const state = progress.state;
  const nextBattle = campaign.battles[state.battleIndex];
  const issue = lineupIssue(state, draft, gameData);
  const summary = progress.summary;
  return <section className="campaign">
    <header className="campaign-header"><div><p className="campaign-eyebrow">{campaign.name}</p><h2>{progress.phase === 'result' ? '전투 결과' : state.finished ? '토벌 완료' : '출전 준비'}</h2></div><strong className="campaign-gold">자금 <span>{state.gold.toLocaleString()}</span></strong><button onClick={onExit}>전투 설정으로</button></header>
    {saveError && <p role="alert" className="error">자동 저장에 실패했습니다. 현재 진행은 이 화면에만 유지됩니다.</p>}
    {error && <p role="alert" className="error">{error}</p>}
    {progress.phase === 'result' && summary ? <div className="campaign-result">
      <h3>{summary.won ? summary.finished ? '황건적 토벌 완료' : '승리' : '패배 · 정비 후 재도전'}</h3>
      <p>획득 자금 <strong>+{summary.goldGained.toLocaleString()}</strong></p>
      <ul>{summary.units.map(u => <li key={u.characterId}><strong>{nameOf(u.characterId)}</strong><span>경험치 +{u.expGained}</span><span>{u.levelsGained ? `레벨 +${u.levelsGained}` : '레벨 유지'}</span><span>남은 병력 {u.troopsAfter}</span></li>)}</ul>
      {summary.joined.length > 0 && <p className="campaign-joins">새로운 동료 · {summary.joined.map(nameOf).join(', ')}</p>}
      <button className="primary" onClick={() => commit({ ...progress, phase: 'prepare', summary: null })}>{summary.finished ? '군단 확인' : summary.won ? '다음 전투 정비' : '재도전 정비'}</button>
    </div> : <>
      <ol className="campaign-route">{campaign.battles.map((b, i) => <li key={b.id} aria-current={i === state.battleIndex ? 'step' : undefined} className={i < state.battleIndex ? 'cleared' : ''}><span>{i < state.battleIndex ? '완료' : `${i + 1}전`}</span><strong>{b.name}</strong></li>)}</ol>
      <div className="campaign-layout"><div className="campaign-roster">
        {state.roster.map(unit => {
          const id = unit.characterId, type = gameData.unitTypes[unit.unitType];
          const cap = unitCap(unit, gameData, defaultBalance), cost = recruitCost(unit.unitType, gameData);
          const options = promotionOptions(state, id, campaign, gameData);
          const requiredLevel = campaign.promotionLevels[promotionDepthOf(unit.unitType, gameData)];
          const amount = amounts[id] ?? 1;
          const run = (action: 'replenish' | 'reinforce' | 'dismiss') => {
            if (!Number.isSafeInteger(amount) || amount < 1) { setError('인원은 1 이상의 정수로 입력하세요.'); return; }
            maintain(action === 'replenish' ? replenish(state, id, amount, gameData) : action === 'reinforce' ? reinforce(state, id, amount, gameData, defaultBalance) : dismiss(state, id, amount, gameData));
          };
          return <article className="campaign-unit" data-roster={id} key={id}>
            <header><div><h3>{nameOf(id)}</h3><span>{type.name}</span></div><strong>Lv.{unit.level}</strong></header>
            <p className="campaign-exp">경험치 {unit.exp} / {campaign.exp.perLevel}</p>
            <div className="campaign-strength"><strong>{unit.troops}<small> / 정원 {unit.capacity}</small></strong><span>레벨 상한 {cap}</span></div>
            <meter min={0} max={Math.max(1, unit.capacity)} value={unit.troops} aria-label={`${nameOf(id)} 병력`} />
            <p className="note">1명당 보충 {cost.replenish} · 증원 {cost.reinforce} · 해고 반환 {cost.dismiss}</p>
            <div className="campaign-recruit"><label>인원 <input type="number" min={1} step={1} value={Number.isNaN(amount) ? '' : amount} aria-label={`${nameOf(id)} 정비 인원`} onChange={e => setAmounts(a => ({ ...a, [id]: e.target.valueAsNumber }))} /></label><button onClick={() => run('replenish')}>보충</button><button onClick={() => run('reinforce')}>증원</button><button onClick={() => run('dismiss')}>해고</button></div>
            <div className="row"><button disabled={unit.troops >= unit.capacity} onClick={() => maintain(replenish(state, id, unit.capacity - unit.troops, gameData))}>정원까지 보충 · {replenishCostToFull(unit, gameData)}</button><button disabled={unit.capacity >= cap} onClick={() => maintain(reinforce(state, id, cap - unit.capacity, gameData, defaultBalance))}>상한까지 증원 · {reinforceCostToCap(unit, gameData, defaultBalance)}</button></div>
            <div className="campaign-promote">{options.length ? <><span>승급 가능</span>{options.map(to => <button key={to} onClick={() => maintain(promote(state, id, to, campaign, gameData, defaultBalance))}>{gameData.unitTypes[to].name} 승급</button>)}</> : <small>{type.promotesTo.length && requiredLevel !== undefined ? `승급은 Lv.${requiredLevel}부터` : '최종 병종'}</small>}</div>
          </article>;
        })}
      </div><aside className="campaign-lineup">
        <h3>출전 편성</h3><p className="note">전열 1·2·3 / 후열 4·5·6<br />다른 자리를 고르면 해당 장수가 이동합니다.</p>
        <div className="campaign-slots">{Array.from({ length: 6 }, (_, index) => {
          const row = index < 3 ? 'front' : 'back', slot = index % 3;
          return <label key={index}><span>{index + 1} · {row === 'front' ? '전열' : '후열'}</span><select aria-label={`출전 ${index + 1}번`} value={draft.find(s => s.row === row && s.slot === slot)?.characterId ?? ''} onChange={e => chooseSlot(index, e.target.value)}><option value="">빈 슬롯</option>{state.roster.map(u => <option key={u.characterId} value={u.characterId}>{nameOf(u.characterId)}{u.troops === 0 ? ' · 보충 필요' : ''}</option>)}</select></label>;
        })}</div>
        <button onClick={() => maintain(setLineup(state, draft, gameData))}>편성 적용</button>
        {issue && !state.finished && <p className="error">{issue}</p>}
        {nextBattle && !state.finished ? <div className="campaign-depart"><p>{state.battleIndex + 1} / {campaign.battles.length}전 · {state.attempt}번째 도전</p><h3>{nextBattle.name}</h3><p>승리 보상 {nextBattle.reward.toLocaleString()}</p><button className="primary" disabled={!!issue} onClick={launch}>{state.attempt > 1 ? '재도전 출전' : '출전'}</button></div> : <p className="campaign-joins">모든 전투를 완료했습니다.</p>}
      </aside></div>
    </>}
  </section>;
}
