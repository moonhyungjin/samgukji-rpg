import type { BattleConfig, Control } from '../lib/config';
import { PRESET_LABEL } from '../lib/labels';

interface Props {
  config: BattleConfig;
  presetNames: readonly string[];
  onChange: (config: BattleConfig) => void;
  onStart: () => void;
}

const CONTROL_OPTIONS: { value: Control; label: string; hint: string }[] = [
  { value: 'attacker', label: '공격측을 조작', hint: '방어측은 AI가 조작합니다' },
  { value: 'defender', label: '방어측을 조작', hint: '공격측은 AI가 조작합니다' },
  { value: 'watch', label: '관전', hint: '양쪽 모두 AI가 조작합니다' },
];

const SPEED_OPTIONS = [
  { value: 0.5, label: '0.5배' },
  { value: 1, label: '1배' },
  { value: 2, label: '2배' },
  { value: 4, label: '4배' },
  { value: 0, label: '즉시' },
];

/** 전투 시작 전 설정. 편성, 조작할 진영, 시드. */
export function SetupPanel({ config, presetNames, onChange, onStart }: Props) {
  const label = (name: string) => PRESET_LABEL[name] ?? name;
  const set = <K extends keyof BattleConfig>(key: K, value: BattleConfig[K]) => onChange({ ...config, [key]: value });

  return (
    <section className="panel setup">
      <h2>전투 설정</h2>
      <div className="grid">
        <label className="field">
          <span>공격측 편성</span>
          <select value={config.attackerPreset} onChange={(e) => set('attackerPreset', e.target.value)}>
            {presetNames.map((n) => (
              <option key={n} value={n}>
                {label(n)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>방어측 편성</span>
          <select value={config.defenderPreset} onChange={(e) => set('defenderPreset', e.target.value)}>
            {presetNames.map((n) => (
              <option key={n} value={n}>
                {label(n)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>조작</span>
          <select value={config.control} onChange={(e) => set('control', e.target.value as Control)}>
            {CONTROL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <small>{CONTROL_OPTIONS.find((o) => o.value === config.control)?.hint}</small>
        </label>
        <label className="field">
          <span>시드 (같은 시드는 같은 전투)</span>
          <input type="number" min={0} value={config.seed} onChange={(e) => set('seed', Math.max(0, Math.floor(Number(e.target.value)) || 0))} />
        </label>
        <label className="field">
          <span>애니메이션 속도</span>
          <select value={config.speed} onChange={(e) => set('speed', Number(e.target.value))}>
            {SPEED_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button type="button" className="primary big" onClick={onStart}>
        전투 시작
      </button>
    </section>
  );
}
