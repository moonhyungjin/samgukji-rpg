import type { ReactNode } from 'react';
import { NumberField } from '../../shared/Fields';

export const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

/** 실험값 칸: 값과 슬라이더. 바꿔도 데이터에는 저장되지 않는다 */
export function Var({ label, value, min, max, step, onChange, from }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; from?: string }) {
  return (
    <div className="chip var" title={from ? `처음 값: ${from}. 슬라이더로 바꿔 보는 값은 저장되지 않습니다` : '슬라이더로 바꿔 보는 값은 저장되지 않습니다'}>
      <span className="chip-label">{label}</span>
      <input type="number" aria-label={`실험 ${label}`} value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value) || 0)} />
      <input type="range" aria-label={`실험 ${label} 슬라이더`} value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} />
      {from && <small>{from}</small>}
    </div>
  );
}

/** 공식 계수 칸: 실제 밸런스 값이라 고치면 "파일에 저장" 대상이 된다 */
export function Coef({ label, path, step = 1 }: { label: string; path: string; step?: number }) {
  return (
    <div className="chip coef" title="밸런스 값입니다. 고치면 저장 대상이 됩니다">
      <span className="chip-label">{label}</span>
      <NumberField path={path} step={step} min={0} />
    </div>
  );
}

export function Out({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className={big ? 'chip out big' : 'chip out'}>
      <span className="chip-label">{label}</span>
      <b className="num">{value}</b>
    </div>
  );
}

export const Op = ({ children }: { children: ReactNode }) => <span className="op">{children}</span>;
