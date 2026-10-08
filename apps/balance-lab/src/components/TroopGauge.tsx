import { useLab } from '../lab/LabContext';
import { num } from '../lib/format';
import { computeFormula, troopCurve } from '../lib/formulaLab';
import type { FormulaInput } from '../lib/formulaLab';

const W = 560;
const H = 170;
const PAD = { left: 40, right: 12, top: 36, bottom: 24 };
const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

interface Props {
  input: FormulaInput;
  onChange: (input: FormulaInput) => void;
  level: number;
}

/**
 * 병력 보정 게이지. 공격 쪽 병력을 드래그로 바꾸면 병력 보정과 피해가 바로 바뀌고,
 * 병력 → 병력 보정 곡선 위에 지금 위치를 표시한다. 밸런스 값(꺾이는 지점 등)을 고치면 곡선이 다시 그려진다.
 */
export function TroopGauge({ input, onChange, level }: Props) {
  const { state } = useLab();
  const { data, balance } = state;
  const result = computeFormula(data, balance, input, level);
  if (!result) return <p className="note">이 병종의 일반 행동은 공격이 아니어서 병력 보정을 볼 수 없습니다.</p>;

  const mode = balance.troopFactor.mode ?? 'absolute';
  const t = balance.troopFactor.tiered;
  // 비율 구간식은 최대 병력까지만 의미가 있다 (넘어도 1)
  const maxX = mode === 'ratio' ? result.attackerMaxTroops : Math.max(result.attackerMaxTroops * 2, 2000, Math.round(input.attackerTroops * 1.1));
  const curve = troopCurve(data, balance, input, level, maxX);
  const maxY = Math.max(1.2, ...curve.map((p) => p.y)) * 1.1;
  const sx = (x: number) => PAD.left + (x / maxX) * (W - PAD.left - PAD.right);
  const sy = (y: number) => H - PAD.bottom - (y / maxY) * (H - PAD.top - PAD.bottom);
  const path = curve.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  // 환산 병력이 켜져 있으면 꺾이는 지점은 "환산 병력" 기준이라 실제 병력으로는 병력 배율만큼 옮겨진다
  const scale = balance.troopFactor.normalizeByScale !== false ? (data.unitTypes[input.attacker]?.troopScale ?? 1) : 1;
  const marks: { x: number; label: string }[] = [{ x: result.attackerMaxTroops, label: '최대 병력' }];
  if (mode === 'tiered' && t) {
    marks.push({ x: t.knee * scale, label: '꺾이는 지점' }, { x: t.knee2 * scale, label: '두 번째 지점' });
    // 하한: 유효 병력이 이 아래로 내려가지 않는 병력
    if (t.floor > 0) marks.push({ x: t.floor * scale, label: '하한' });
  }
  if (mode === 'absolute') marks.push({ x: balance.troopFactor.reference * scale, label: '기준 병력' });
  const r = balance.troopFactor.ratio;
  if (mode === 'ratio' && r) {
    const max = result.attackerMaxTroops;
    marks.push({ x: r.knee * max, label: `${Math.round(r.knee * 100)}%` }, { x: r.knee2 * max, label: `${Math.round(r.knee2 * 100)}%` }, { x: r.knee3 * max, label: `${Math.round(r.knee3 * 100)}%` });
    if (r.floorTroops > 0) marks.push({ x: r.floorTroops, label: '하한 병력' });
  }
  const yTicks = [0, 0.5, 1, 1.5, 2].filter((v) => v <= maxY);

  const setTroops = (v: number) => onChange({ ...input, attackerTroops: Math.max(1, Math.round(v)) });
  const lost = Math.min(result.damage, input.defenderTroops);

  return (
    <div className="troop-gauge">
      <div className="gauge-row">
        <label className="gauge-label" htmlFor="gauge-attacker">
          공격 쪽 병력 <b className="num">{num(input.attackerTroops)}</b>
          <small> / 최대 {num(result.attackerMaxTroops)}</small>
        </label>
        <input id="gauge-attacker" type="range" aria-label="공격 쪽 병력 게이지" min={1} max={maxX} step={10} value={input.attackerTroops} onChange={(e) => setTroops(Number(e.target.value))} />
        <button type="button" onClick={() => setTroops(result.attackerMaxTroops)}>
          가득
        </button>
      </div>
      <div className="gauge-readout">
        병력 보정 <b className="num big">× {fmt(result.troop)}</b>
        <span className="arrow">→</span>
        피해 <b className="num big">{num(result.damage)}</b>
        {mode === 'relative' && <small> (상대 비교: 방어 쪽 병력 {num(input.defenderTroops)}과 비교)</small>}
      </div>
      <svg className="gauge-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="병력 보정 곡선">
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={sy(v)} y2={sy(v)} className="grid" />
            <text x={PAD.left - 6} y={sy(v) + 4} className="tick" textAnchor="end">
              ×{v}
            </text>
          </g>
        ))}
        {marks
          .filter((m) => m.x > 0 && m.x <= maxX)
          .sort((p, q) => p.x - q.x)
          .map((m, i) => (
            <g key={m.label}>
              <line x1={sx(m.x)} x2={sx(m.x)} y1={10 + (i % 3) * 11 - 8} y2={H - PAD.bottom} className="mark" />
              <text x={sx(m.x) > W - 90 ? sx(m.x) - 3 : sx(m.x) + 3} y={10 + (i % 3) * 11} className="mark-label" textAnchor={sx(m.x) > W - 90 ? 'end' : 'start'}>
                {m.label} {num(m.x)}
              </text>
            </g>
          ))}
        <path d={path} className="curve" />
        <line x1={sx(input.attackerTroops)} x2={sx(input.attackerTroops)} y1={PAD.top} y2={H - PAD.bottom} className="now" />
        <circle cx={sx(input.attackerTroops)} cy={sy(result.troop)} r={5} className="now-dot" />
        <text x={PAD.left} y={H - 6} className="tick">
          0
        </text>
        <text x={W - PAD.right} y={H - 6} className="tick" textAnchor="end">
          {num(maxX)}명
        </text>
      </svg>

      <div className="gauge-row">
        <label className="gauge-label" htmlFor="gauge-defender">
          방어 쪽 병력 <b className="num">{num(input.defenderTroops)}</b>
          <small> / 최대 {num(result.defenderMaxTroops)}</small>
        </label>
        <input id="gauge-defender" type="range" aria-label="방어 쪽 병력 게이지" min={1} max={result.defenderMaxTroops} step={10} value={Math.min(input.defenderTroops, result.defenderMaxTroops)} onChange={(e) => onChange({ ...input, defenderTroops: Number(e.target.value) })} />
        <button type="button" onClick={() => onChange({ ...input, defenderTroops: result.defenderMaxTroops })}>
          가득
        </button>
      </div>
      <div className="hp-bar" title={`방어 쪽 병력 ${input.defenderTroops} 중 ${lost} 손실`}>
        <div className="hp-left" style={{ width: `${((input.defenderTroops - lost) / result.defenderMaxTroops) * 100}%` }} />
        <div className="hp-lost" style={{ width: `${(lost / result.defenderMaxTroops) * 100}%` }} />
      </div>
      <p className="note">
        한 번에 방어 쪽 최대 병력의 <b>{Math.round((lost / result.defenderMaxTroops) * 100)}%</b>를 깎습니다. 같은 피해로 계속 때리면 <b>{result.hitsToKill}번</b>에 전멸합니다 (병력이 줄면 실제로는 피해가 달라집니다).
      </p>
    </div>
  );
}
