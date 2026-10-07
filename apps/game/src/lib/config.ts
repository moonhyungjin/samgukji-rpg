export type Control = 'attacker' | 'defender' | 'watch';

export interface BattleConfig {
  attackerPreset: string;
  defenderPreset: string;
  /** 내가 조작할 진영. watch는 관전(양쪽 AI) */
  control: Control;
  seed: number;
  /** 애니메이션 배속. 0이면 즉시 */
  speed: number;
}

export interface ParsedUrl {
  config: BattleConfig;
  /** 설정 화면 없이 바로 시작한다 */
  autostart: boolean;
}

export const DEFAULT_CONFIG: BattleConfig = {
  attackerPreset: 'shu',
  defenderPreset: 'wei',
  control: 'attacker',
  seed: 1,
  speed: 2,
};

const CONTROLS: readonly string[] = ['attacker', 'defender', 'watch'];

/**
 * 주소의 쿼리로 설정을 읽는다. 잘못된 값은 기본값으로 대신한다.
 * 예: ?control=watch&seed=7&speed=0&autostart=1
 * 편성 이름(a, d)은 presets에 있는 것만 받는다.
 */
export function parseConfig(search: string, presetNames: readonly string[]): ParsedUrl {
  const q = new URLSearchParams(search);
  const pick = (key: string, fallback: string) => {
    const v = q.get(key);
    return v !== null && presetNames.includes(v) ? v : fallback;
  };
  const num = (key: string, fallback: number) => {
    const raw = q.get(key);
    if (raw === null || raw.trim() === '') return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  const control = q.get('control');
  return {
    autostart: q.get('autostart') === '1',
    config: {
      attackerPreset: pick('a', DEFAULT_CONFIG.attackerPreset),
      defenderPreset: pick('d', DEFAULT_CONFIG.defenderPreset),
      control: control !== null && CONTROLS.includes(control) ? (control as Control) : DEFAULT_CONFIG.control,
      seed: Math.floor(num('seed', DEFAULT_CONFIG.seed)),
      speed: num('speed', DEFAULT_CONFIG.speed),
    },
  };
}
