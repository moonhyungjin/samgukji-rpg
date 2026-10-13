import { useMemo, useState } from 'react';
import { TERRAINS } from '@samgukji/battle-engine';
import type { Terrain } from '@samgukji/battle-engine';
import type { MapCastleFile, MapFile, MapRegionFile } from '@samgukji/game-data';
import { useLab } from '../../lab/LabContext';
import { mapIssues } from '../../lib/dataIssues';
import { TERRAIN_LABEL } from './mapLabels';
import { MapFactionsPanel } from './MapFactionsPanel';
import { MapPreviewPanel } from './MapPreviewPanel';


/**
 * 지도 탭 (설계 문서 04). map.json의 세력, 지역(이름, 세력, 지형, 수입, 국력, 위치, 맞닿은 지역), 성(이름, 지형, 수비 부대)을 고친다.
 * 지형은 아직 표시용이다. 규칙(턴, 행동, 전쟁)은 엔진의 strategy/가 이 데이터를 읽는다.
 */
export function MapTab() {
  const { state, update } = useLab();
  const map = state.map;
  const [selected, setSelected] = useState(map.regions[0]?.id ?? '');
  const issues = useMemo(() => mapIssues({ data: state.data, balance: state.balance, presets: state.presets, campaign: state.campaign, map }), [state.data, state.balance, state.presets, state.campaign, map]);

  const setMap = (fn: (m: MapFile) => MapFile) => update((s) => ({ ...s, map: fn(s.map) }));
  const setRegion = (id: string, fn: (r: MapRegionFile) => MapRegionFile) => setMap((m) => ({ ...m, regions: m.regions.map((r) => (r.id === id ? fn(r) : r)) }));
  const region = map.regions.find((r) => r.id === selected) ?? map.regions[0];
  const presetOptions = state.presets.map((p) => ({ value: p.id, label: p.label }));

  /** 맞닿음은 양쪽에 함께 적는다 */
  const toggleNeighbor = (a: string, b: string) =>
    setMap((m) => {
      const linked = m.regions.find((r) => r.id === a)?.neighbors.includes(b) ?? false;
      return {
        ...m,
        regions: m.regions.map((r) => {
          if (r.id === a) return { ...r, neighbors: linked ? r.neighbors.filter((n) => n !== b) : [...r.neighbors, b] };
          if (r.id === b) return { ...r, neighbors: linked ? r.neighbors.filter((n) => n !== a) : [...r.neighbors, a] };
          return r;
        }),
      };
    });

  const addRegion = () =>
    setMap((m) => {
      let n = m.regions.length + 1;
      while (m.regions.some((r) => r.id === `region${n}`)) n++;
      const id = `region${n}`;
      const enemy = m.factions.find((f) => !f.player) ?? m.factions[0];
      const preset = state.presets[0]?.id ?? '';
      setSelected(id);
      return {
        ...m,
        regions: [...m.regions, { id, name: `새 지역 ${n}`, faction: enemy.id, terrain: 'plain', income: 300, power: 2, neighbors: [], x: 50, y: 50, castles: [{ id: `${id}-1`, name: '성 1', terrain: 'plain', garrison: { preset, level: 1 } }] }],
      };
    });

  const removeRegion = (id: string) =>
    setMap((m) => ({ ...m, regions: m.regions.filter((r) => r.id !== id).map((r) => ({ ...r, neighbors: r.neighbors.filter((n) => n !== id) })) }));

  const setCastle = (rid: string, cid: string, fn: (c: MapCastleFile) => MapCastleFile) => setRegion(rid, (r) => ({ ...r, castles: r.castles.map((c) => (c.id === cid ? fn(c) : c)) }));

  return (
    <div className="balance-page">
      <MapPreviewPanel map={map} region={region} setSelected={setSelected} issues={issues} />

      <MapFactionsPanel map={map} setMap={setMap} />

      {region && (
        <section className="panel" data-panel="map-region" data-region-editor={region.id}>
          <h3>
            지역: {region.name} <small className="muted">({region.id})</small>
          </h3>
          <div className="fields-grid">
            <label className="field">
              <span>이름</span>
              <input type="text" aria-label="지역 이름" value={region.name} onChange={(e) => setRegion(region.id, (r) => ({ ...r, name: e.target.value }))} />
            </label>
            <label className="field">
              <span>처음 지배 세력</span>
              <select aria-label="지역 세력" value={region.faction} onChange={(e) => setRegion(region.id, (r) => ({ ...r, faction: e.target.value }))}>
                {map.factions.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>지형 (표시용)</span>
              <select aria-label="지역 지형" value={region.terrain} onChange={(e) => setRegion(region.id, (r) => ({ ...r, terrain: e.target.value as Terrain }))}>
                {TERRAINS.map((t) => (
                  <option key={t} value={t}>
                    {TERRAIN_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            {numberInput('턴마다 수입 (금)', region.income, 50, 0, (v) => setRegion(region.id, (r) => ({ ...r, income: v })))}
            {numberInput('국력', region.power, 1, 0, (v) => setRegion(region.id, (r) => ({ ...r, power: v })))}
            {numberInput('지도 위치 x (0~100)', region.x, 1, 0, (v) => setRegion(region.id, (r) => ({ ...r, x: Math.min(100, v) })))}
            {numberInput('지도 위치 y (0~100)', region.y, 1, 0, (v) => setRegion(region.id, (r) => ({ ...r, y: Math.min(100, v) })))}
          </div>

          <h4 className="sub">맞닿은 지역 (선전포고와 출진은 맞닿은 지역에만)</h4>
          <div className="check-group">
            {map.regions
              .filter((r) => r.id !== region.id)
              .map((r) => (
                <label key={r.id} className="check">
                  <input type="checkbox" aria-label={`${region.name}-${r.name} 맞닿음`} checked={region.neighbors.includes(r.id)} onChange={() => toggleNeighbor(region.id, r.id)} />
                  <span>{r.name}</span>
                </label>
              ))}
          </div>

          <h4 className="sub">성 ({region.castles.length}/4, 모두 차지해야 지역을 얻는다)</h4>
          <table className="campaign-table">
            <thead>
              <tr>
                <th>이름</th>
                <th>지형</th>
                <th>수비 부대 편성</th>
                <th>레벨</th>
                <th>병력 (비우면 상한 가득)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {region.castles.map((c) => (
                <tr key={c.id} data-castle={c.id}>
                  <td>
                    <input type="text" aria-label={`${c.id} 이름`} value={c.name} onChange={(e) => setCastle(region.id, c.id, (x) => ({ ...x, name: e.target.value }))} />
                  </td>
                  <td>
                    <select aria-label={`${c.id} 지형`} value={c.terrain} onChange={(e) => setCastle(region.id, c.id, (x) => ({ ...x, terrain: e.target.value as Terrain }))}>
                      {TERRAINS.map((t) => (
                        <option key={t} value={t}>
                          {TERRAIN_LABEL[t]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      aria-label={`${c.id} 수비 부대`}
                      value={c.garrison?.preset ?? ''}
                      onChange={(e) => setCastle(region.id, c.id, (x) => ({ ...x, garrison: e.target.value ? { preset: e.target.value, level: x.garrison?.level ?? 1, ...(x.garrison?.troops !== undefined ? { troops: x.garrison.troops } : {}) } : null }))}
                    >
                      <option value="">없음 (플레이어 성)</option>
                      {presetOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {c.garrison && (
                      <input type="number" aria-label={`${c.id} 레벨`} min={1} value={c.garrison.level} onChange={(e) => setCastle(region.id, c.id, (x) => ({ ...x, garrison: x.garrison && { ...x.garrison, level: Math.max(1, Number(e.target.value) || 1) } }))} />
                    )}
                  </td>
                  <td>
                    {c.garrison && (
                      <input
                        type="number"
                        aria-label={`${c.id} 병력`}
                        min={1}
                        step={10}
                        placeholder="상한 가득"
                        value={c.garrison.troops ?? ''}
                        onChange={(e) =>
                          setCastle(region.id, c.id, (x) => {
                            if (!x.garrison) return x;
                            const { troops: _old, ...rest } = x.garrison;
                            return { ...x, garrison: e.target.value === '' ? rest : { ...rest, troops: Math.max(1, Number(e.target.value) || 1) } };
                          })
                        }
                      />
                    )}
                  </td>
                  <td>
                    <button type="button" disabled={region.castles.length <= 1} onClick={() => setRegion(region.id, (r) => ({ ...r, castles: r.castles.filter((x) => x.id !== c.id) }))}>
                      빼기
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row">
            <button
              type="button"
              disabled={region.castles.length >= 4}
              onClick={() =>
                setRegion(region.id, (r) => {
                  let n = r.castles.length + 1;
                  while (r.castles.some((c) => c.id === `${r.id}-${n}`)) n++;
                  const last = r.castles[r.castles.length - 1];
                  return { ...r, castles: [...r.castles, { id: `${r.id}-${n}`, name: `성 ${n}`, terrain: r.terrain, garrison: last?.garrison ? { ...last.garrison } : null }] };
                })
              }
            >
              성 추가
            </button>
            <button type="button" onClick={addRegion}>
              지역 추가
            </button>
            <button type="button" className="danger" disabled={map.regions.length <= 1 || region.id === map.goalRegion} onClick={() => removeRegion(region.id)} title={region.id === map.goalRegion ? '목표 지역은 지울 수 없습니다' : undefined}>
              이 지역 지우기
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function numberInput(label: string, value: number, step: number, min: number, onChange: (v: number) => void) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" aria-label={label} value={value} step={step} min={min} onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))} />
    </label>
  );
}
