import { Assets, Texture } from 'pixi.js';
import type { ViewUnit } from '../battle/viewState';

const base = `${import.meta.env.BASE_URL}art/battle/`;
export const ART_URLS = {
  field: `${base}battlefield_camp_bg.png`,
  headerBg: `${base}ui/header/header_bg_bar.png`,
  factionFrame: `${base}ui/header/faction_frame.png`,
  factionFrameFlipped: `${base}ui/header/faction_frame_flipped.png`,
  factionInnerGreen: `${base}ui/header/faction_inner_green.png`,
  factionInnerOchre: `${base}ui/header/faction_inner_ochre.png`,
  factionInnerBlue: `${base}ui/header/faction_inner_blue.png`,
  plaqueShu: `${base}ui/header/plaque_faction_shu.png`,
  plaqueYellow: `${base}ui/header/plaque_faction_yellow.png`,
  plaqueRound: `${base}ui/header/plaque_round_dragons_ornate.png`,
  moraleBar: `${base}ui/header/gauge_morale_tug_bar.png`,
  moralePointer: `${base}ui/header/pointer_morale_indicator.png`,
  bracketL: `${base}ui/header/decor_header_bracket_l.png`,
  bracketR: `${base}ui/header/decor_header_bracket_r.png`,
  liuBei: `${base}liu-bei-idle-v1.png`,
  shuSoldier: `${base}shu-infantry-idle-v1.png`,
  yellowCaptain: `${base}yellow-turban-captain-idle-v1.png`,
  yellowSoldier: `${base}yellow-turban-infantry-idle-v1.png`,
  liuPortrait: `${base}liu-bei-neutral-v1.png`,
  yellowPortrait: `${base}yellow-turban-captain-portrait-v1.png`,
  guanYu: `${base}guan-yu-mounted-v1.png`,
  shuCavalry: `${base}shu-cavalry-mounted-v1.png`,
};
export type BattleTextures = Partial<Record<keyof typeof ART_URLS, Texture>>;

/** 에셋 검수 Viewer가 후보 그림을 화면에 끼워 볼 때 쓰는 교체 목록 (키 → 주소). 평소에는 비어 있다 */
let artOverrides: Partial<Record<keyof typeof ART_URLS, string>> = {};
export function setArtOverrides(overrides: Partial<Record<keyof typeof ART_URLS, string>>): void {
  artOverrides = { ...overrides };
}

/** Missing artwork falls back to labeled tokens; gameplay remains available. */
export async function loadBattleArt(units?: readonly Pick<ViewUnit, 'characterId' | 'family'>[]): Promise<BattleTextures> {
  const keys = units ? battleArtKeys(units) : Object.keys(ART_URLS) as (keyof typeof ART_URLS)[];
  const entries = await Promise.all(keys.map(async key => {
    const url = artOverrides[key] ?? ART_URLS[key];
    try { return [key, await Assets.load<Texture>({ src: url, data: { autoGenerateMipmaps: true, scaleMode: 'linear' } })] as const; }
    catch { return [key, undefined] as const; }
  }));
  return Object.fromEntries(entries);
}

export interface SpriteSpec {
  texture: 'liuBei' | 'shuSoldier' | 'yellowCaptain' | 'yellowSoldier' | 'guanYu' | 'shuCavalry';
  ground: [number, number];
  head: number;
  facing: 1 | -1;
  /** Fixed head-to-ground height for mounted figures, independent of lane count. */
  displayHeight?: number;
}
export const SPRITE_SPECS: Record<SpriteSpec['texture'], SpriteSpec> = {
  liuBei: { texture: 'liuBei', ground: [760, 1007], head: 100, facing: 1 },
  shuSoldier: { texture: 'shuSoldier', ground: [580, 1168], head: 120, facing: 1 },
  yellowCaptain: { texture: 'yellowCaptain', ground: [950, 1010], head: 75, facing: -1 },
  yellowSoldier: { texture: 'yellowSoldier', ground: [800, 1147], head: 100, facing: -1 },
  guanYu: { texture: 'guanYu', ground: [754, 1008], head: 64, facing: 1, displayHeight: 116 },
  shuCavalry: { texture: 'shuCavalry', ground: [754, 1008], head: 70, facing: 1, displayHeight: 116 * 68 / 86 },
};

/** Art is mapped by stable character IDs, never by attacker/defender or translated name. */
export function unitArt(unit: Pick<ViewUnit, 'characterId' | 'family'>): {
  commander: SpriteSpec; soldier: SpriteSpec; portrait?: 'liuPortrait' | 'yellowPortrait';
} | null {
  if (unit.characterId === 'guanYu' && unit.family === 'cavalry') {
    return { commander: SPRITE_SPECS.guanYu, soldier: SPRITE_SPECS.shuCavalry };
  }
  // 유비는 군주 계열(자기 병종)이 된 뒤에도 같은 그림을 쓴다. 다른 병종(기병 등)으로 바뀌면 그림이 맞지 않아 표식으로 돌아간다
  if (unit.characterId === 'liuBei' && (unit.family === 'infantry' || unit.family === 'lord')) return { commander: SPRITE_SPECS.liuBei, soldier: SPRITE_SPECS.shuSoldier, portrait: 'liuPortrait' };
  if (unit.family !== 'infantry') return null;
  if (unit.characterId === 'ytInfantryA' || unit.characterId === 'ytInfantryB') {
    return { commander: SPRITE_SPECS.yellowCaptain, soldier: SPRITE_SPECS.yellowSoldier, portrait: 'yellowPortrait' };
  }
  return null;
}

/** 군단과 상관없이 전투 화면 틀에 항상 쓰이는 그림 (상단 헤더). 대체 그림 경로로만 쓰이는 현판/괄호(plaqueShu, plaqueYellow, bracketL/R)는 뺐다 */
export const FRAME_ART_KEYS = [
  'headerBg',
  'factionFrame',
  'factionFrameFlipped',
  'factionInnerGreen',
  'factionInnerOchre',
  'factionInnerBlue',
  'plaqueRound',
  'moraleBar',
  'moralePointer',
] as const satisfies readonly (keyof typeof ART_URLS)[];

/** Load only art used by this lineup (plus the screen frame); a new character must not enlarge every battle download. */
export function battleArtKeys(units: readonly Pick<ViewUnit, 'characterId' | 'family'>[]): (keyof typeof ART_URLS)[] {
  const keys = new Set<keyof typeof ART_URLS>(['field', ...FRAME_ART_KEYS]);
  for (const unit of units) {
    const art = unitArt(unit);
    if (!art) continue;
    keys.add(art.commander.texture);
    keys.add(art.soldier.texture);
    if (art.portrait) keys.add(art.portrait);
  }
  return [...keys];
}
