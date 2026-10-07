import type { LineupEntry } from '@samgukji/battle-engine';
import presetsJson from '../data/presets.json';

/** 기본 편성 한 개. id는 CLI(--team-a)와 게임 주소의 편성 이름이고, label은 화면에 보이는 이름이다. */
export interface PresetDef {
  id: string;
  label: string;
  lineup: LineupEntry[];
}

// 기본 편성의 원본은 data/presets.json이다. 장수 편집기(apps/character-editor, `npm run chars`)의 "기본 편성" 탭에서 고친다.
// 6 vs 6 기본 대결(촉/위/황건적)과 초반 시나리오(유관장 vs 황건적 쉬움/보통/어려움)가 들어 있다.
export const presetList = presetsJson as unknown as PresetDef[];

/** 시뮬레이션/테스트용 기본 편성 (id → 편성) */
export const presets: Record<string, LineupEntry[]> = Object.fromEntries(presetList.map((p) => [p.id, p.lineup]));

/** 편성의 화면 이름 (id → 이름) */
export const presetLabels: Record<string, string> = Object.fromEntries(presetList.map((p) => [p.id, p.label]));
