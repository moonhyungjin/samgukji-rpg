import type { CampaignData, CampaignRun, CampaignRunsSummary } from '@samgukji/battle-engine';
import { num, pct } from '../../lib/format';

/** 캠페인을 여러 번 돌린 결과: 요약 카드, 전투별 표, 한 번 따라가 본 기록 */
export function CampaignResultView({ summary, sample, campaign, ms, name }: { summary: CampaignRunsSummary; sample: CampaignRun; campaign: CampaignData; ms: number; name: (id: string) => string }) {
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
              {l.summary.retrained?.length ? ` · 보직 변경: ${l.summary.retrained.map(name).join(', ')}` : ''}
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
