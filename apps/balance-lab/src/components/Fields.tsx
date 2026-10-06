import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useLab } from '../lab/LabContext';
import { getIn } from '../lib/path';

interface WrapProps {
  label?: string;
  hint?: string;
  children: ReactNode;
}

/** label이 있으면 라벨 달린 필드로, 없으면 표 안에 넣을 입력만 렌더링한다. */
function Wrap({ label, hint, children }: WrapProps) {
  if (!label) return <>{children}</>;
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

interface NumberFieldProps extends Omit<WrapProps, 'children'> {
  path: string;
  step?: number;
  min?: number;
  max?: number;
}

export function NumberField({ label, hint, path, step = 1, min, max }: NumberFieldProps) {
  const { state, set } = useLab();
  const value = Number(getIn(state, path));
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText((current) => (Number(current) === value ? current : String(value)));
  }, [value]);

  return (
    <Wrap label={label} hint={hint}>
      <input
        type="number"
        value={text}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseFloat(e.target.value);
          if (Number.isFinite(n)) set(path, n);
        }}
        onBlur={() => setText(String(value))}
      />
    </Wrap>
  );
}

export function TextField({ label, hint, path }: Omit<WrapProps, 'children'> & { path: string }) {
  const { state, set } = useLab();
  return (
    <Wrap label={label} hint={hint}>
      <input type="text" value={String(getIn(state, path) ?? '')} onChange={(e) => set(path, e.target.value)} />
    </Wrap>
  );
}

export interface Option {
  value: string;
  label: string;
}

export function SelectField({ label, hint, path, options }: Omit<WrapProps, 'children'> & { path: string; options: Option[] }) {
  const { state, set } = useLab();
  return (
    <Wrap label={label} hint={hint}>
      <select value={String(getIn(state, path) ?? '')} onChange={(e) => set(path, e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Wrap>
  );
}

export function CheckField({ label, path }: { label: string; path: string }) {
  const { state, set } = useLab();
  return (
    <label className="check">
      <input type="checkbox" checked={Boolean(getIn(state, path))} onChange={(e) => set(path, e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/** 문자열 배열 값을 체크박스 묶음으로 편집한다. 값이 없으면 빈 배열로 본다. */
export function CheckGroup({ path, options }: { path: string; options: Option[] }) {
  const { state, set } = useLab();
  const value = (getIn(state, path) as string[] | undefined) ?? [];
  return (
    <span className="check-group">
      {options.map((o) => (
        <label key={o.value} className="check">
          <input
            type="checkbox"
            checked={value.includes(o.value)}
            onChange={() => set(path, value.includes(o.value) ? value.filter((v) => v !== o.value) : [...value, o.value])}
          />
          <span>{o.label}</span>
        </label>
      ))}
    </span>
  );
}
