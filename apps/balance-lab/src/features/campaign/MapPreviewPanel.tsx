import type { MapFile, MapRegionFile } from '@samgukji/game-data';
import type { mapIssues } from '../../lib/dataIssues';
import { TERRAIN_LABEL } from './mapLabels';

const W = 640;
const H = 420;

interface Props {
  map: MapFile;
  /** 지금 고른 지역 (강조) */
  region: MapRegionFile | undefined;
  setSelected: (id: string) => void;
  issues: ReturnType<typeof mapIssues>;
}

/** 지도 미리보기(SVG): 지역 점과 맞닿음 선, 세력 색, 범례, 데이터 오류 */
export function MapPreviewPanel({ map, region, setSelected, issues }: Props) {
  const sx = (x: number) => 30 + (x / 100) * (W - 60);
  const sy = (y: number) => 30 + (y / 100) * (H - 60);
  const factionOf = (id: string) => map.factions.find((f) => f.id === id);
  return (
  <section className="panel" data-panel="map-preview">
    <h3>지도: {map.name}</h3>
    <p className="note">지역을 누르면 아래에서 고칩니다. 선은 맞닿은 지역, 색은 처음 지배 세력, 원 안의 숫자는 성 개수입니다. ★은 목표 지역(차지하면 클리어). 지형은 아직 표시용입니다 (설계 문서 04).</p>
    <svg className="map-preview" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="지도 미리보기">
      {map.regions.flatMap((r) =>
        r.neighbors
          .filter((n) => n > r.id)
          .map((n) => {
            const o = map.regions.find((x) => x.id === n);
            return o ? <line key={`${r.id}-${n}`} x1={sx(r.x)} y1={sy(r.y)} x2={sx(o.x)} y2={sy(o.y)} className="map-link" /> : null;
          }),
      )}
      {map.regions.map((r) => (
        <g key={r.id} className={r.id === region?.id ? 'map-node selected' : 'map-node'} onClick={() => setSelected(r.id)} data-region={r.id}>
          <circle cx={sx(r.x)} cy={sy(r.y)} r={22} fill={factionOf(r.faction)?.color ?? '#666'} />
          <text x={sx(r.x)} y={sy(r.y) + 4} textAnchor="middle" className="map-count">
            {r.castles.length}
          </text>
          <text x={sx(r.x)} y={sy(r.y) + 38} textAnchor="middle" className="map-name">
            {r.id === map.goalRegion ? '★ ' : ''}
            {r.name} · {TERRAIN_LABEL[r.terrain]}
          </text>
        </g>
      ))}
    </svg>
    <div className="map-legend">
      {map.factions.map((f) => (
        <span key={f.id}>
          <i style={{ background: f.color }} /> {f.name}
          {f.player ? ' (플레이어)' : f.neutral ? ' (중립)' : ''}
        </span>
      ))}
    </div>
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
  );
}
