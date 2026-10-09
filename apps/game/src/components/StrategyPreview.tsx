import { useState, type CSSProperties } from 'react';
import { strategyMap } from '@samgukji/game-data';
import './strategy.css';

const terrain = { plain: '평지', mountain: '산지', river: '하천', forest: '숲' };

/** 초기 지도 표시만 한다. 전략 규칙이나 진행 상태를 만들지 않는다. */
export function StrategyPreview({ onExit }: { onExit: () => void }) {
  const [selected, select] = useState(strategyMap.regions[0]?.id);
  const region = strategyMap.regions.find(r => r.id === selected);
  if (!region) return <button onClick={onExit}>돌아가기</button>;
  const faction = strategyMap.factions.find(f => f.id === region.faction);
  return <section className="strategy-preview" aria-label="전략 지도 시안">
    <header className="strategy-heading"><div><small>전략 지도 · 배치 시안</small><h2>{strategyMap.name}</h2><p>목표 · {strategyMap.regions.find(r => r.id === strategyMap.goalRegion)?.name} 점령</p></div><button onClick={onExit}>설정으로 돌아가기</button></header>
    <p className="strategy-notice">지역을 선택해 정보를 살펴보세요. 초기 지도 기준이며, 턴 진행과 행동 실행은 아직 연결되지 않았습니다.</p>
    <div className="strategy-resources">{['턴', '남은 행동', '금', '코스트 / 국력', '민심'].map(label => <div key={label}><small>{label}</small><strong>—</strong></div>)}<button disabled>턴 종료</button></div>
    <div className="strategy-layout"><div className="strategy-map-panel">
      <div className="strategy-legend">{strategyMap.factions.map(f => <span key={f.id}><i style={{ background: f.color }} />{f.name}{f.player ? ' · 자국' : ''}</span>)}</div>
      <div className="strategy-map" aria-label="지역 지도"><span className="strategy-north" aria-hidden="true">北<br />↑</span>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{strategyMap.regions.flatMap(r => r.neighbors.filter(id => r.id < id).map(id => {
          const n = strategyMap.regions.find(other => other.id === id);
          return n ? <line key={`${r.id}-${id}`} x1={r.x} y1={r.y} x2={n.x} y2={n.y} className={r.id === selected || id === selected ? 'selected' : ''} /> : null;
        }))}</svg>
        {strategyMap.regions.map(r => {
          const owner = strategyMap.factions.find(f => f.id === r.faction);
          return <button key={r.id} className="strategy-region" aria-pressed={r.id === selected} aria-label={`${r.name}, ${owner?.name}, 성 ${r.castles.length}개`} onClick={() => select(r.id)} style={{ left: `${r.x}%`, top: `${r.y}%`, '--faction': owner?.color ?? '#aaa' } as CSSProperties}><strong>{r.id === strategyMap.goalRegion ? '◇ ' : ''}{r.name}</strong><small>{owner?.player ? '자국' : owner?.neutral ? '중립' : owner?.name} · 성 {r.castles.length}</small></button>;
        })}
      </div><p className="strategy-caption">연결선 · 인접 지역　◇ · 목표 지역</p>
    </div><aside className="strategy-detail" aria-label="선택 지역 정보">
      <small>선택 지역</small><h3>{region.name}</h3><p>{faction?.name} · {terrain[region.terrain]}</p>
      <dl><div><dt>지역 수입</dt><dd>금 {region.income} / 턴</dd></div><div><dt>기본 국력</dt><dd>{region.power}</dd></div></dl>
      <h4>지역의 성 · {region.castles.length}</h4><ul>{region.castles.map(c => <li key={c.id}><span aria-hidden="true">▣</span><div><strong>{c.name}</strong><small>{terrain[c.terrain]} · {c.garrison ? `수비 Lv.${c.garrison.level}` : '자국 거점'}</small></div><small>{faction?.name}</small></li>)}</ul>
      <h4>지역 행동</h4><div className="strategy-actions">{(faction?.player ? ['개발', '임시 징수', '전군 휴식'] : ['선전포고', '출진']).map(action => <button key={action} disabled>{action}</button>)}</div><small>행동 실행 연결 예정</small>
    </aside></div>
    <nav className="strategy-menu" aria-label="전략 메뉴"><button aria-current="page">지도</button>{['병력 · 편성', '포로 · 등용', '민심 보너스'].map(label => <button key={label} disabled>{label}</button>)}</nav>
  </section>;
}
