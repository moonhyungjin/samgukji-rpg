import type { MapFile } from '@samgukji/game-data';

interface Props {
  map: MapFile;
  setMap: (fn: (m: MapFile) => MapFile) => void;
}

/** 선택 깃발(player/neutral)을 켜거나 끈다. 끄면 키를 지운다 (저장 형식을 깔끔하게) */
function withFlag<T extends { player?: boolean; neutral?: boolean }>(x: T, key: 'player' | 'neutral', on: boolean): T {
  const { [key]: _old, ...rest } = x;
  return (on ? { ...rest, [key]: true } : rest) as T;
}

/** 세력 표(이름, 색, 플레이어, 중립), 목표 지역, 턴당 행동 수 */
export function MapFactionsPanel({ map, setMap }: Props) {
  return (
  <section className="panel" data-panel="map-factions">
    <h3>세력</h3>
    <table className="campaign-table">
      <thead>
        <tr>
          <th>id</th>
          <th>이름</th>
          <th>색</th>
          <th>플레이어</th>
          <th>중립</th>
          <th>지역 수</th>
        </tr>
      </thead>
      <tbody>
        {map.factions.map((f, i) => (
          <tr key={f.id}>
            <td>
              <code>{f.id}</code>
            </td>
            <td>
              <input type="text" aria-label={`세력 ${f.id} 이름`} value={f.name} onChange={(e) => setMap((m) => ({ ...m, factions: m.factions.map((x, n) => (n === i ? { ...x, name: e.target.value } : x)) }))} />
            </td>
            <td>
              <input type="color" aria-label={`세력 ${f.id} 색`} value={f.color} onChange={(e) => setMap((m) => ({ ...m, factions: m.factions.map((x, n) => (n === i ? { ...x, color: e.target.value } : x)) }))} />
            </td>
            <td>
              <input type="radio" name="player-faction" aria-label={`세력 ${f.id} 플레이어`} checked={f.player === true} onChange={() => setMap((m) => ({ ...m, factions: m.factions.map((x, n) => withFlag(x, 'player', n === i)) }))} />
            </td>
            <td>
              <input type="checkbox" aria-label={`세력 ${f.id} 중립`} checked={f.neutral === true} disabled={f.player === true} onChange={(e) => setMap((m) => ({ ...m, factions: m.factions.map((x, n) => (n === i ? withFlag(x, 'neutral', e.target.checked) : x)) }))} />
            </td>
            <td>{map.regions.filter((r) => r.faction === f.id).length}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <label className="field">
      <span>목표 지역 (차지하면 클리어)</span>
      <select aria-label="목표 지역" value={map.goalRegion} onChange={(e) => setMap((m) => ({ ...m, goalRegion: e.target.value }))}>
        {map.regions.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </label>
    <label className="field">
      <span>턴당 행동 수</span>
      <input type="number" min={1} step={1} aria-label="턴당 행동 수" value={map.actionsPerTurn} onChange={(e) => setMap((m) => ({ ...m, actionsPerTurn: Number(e.target.value) }))} />
    </label>
  </section>
  );
}
