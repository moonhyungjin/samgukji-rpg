import { Assets, Texture } from 'pixi.js';
import type { ViewUnit } from '../battle/viewState';

const base = `${import.meta.env.BASE_URL}art/battle/`;
export const ART_URLS = {
  field: `${base}plain-v1.png`,
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

/** Missing artwork falls back to labeled tokens; gameplay remains available. */
export async function loadBattleArt(units?: readonly Pick<ViewUnit, 'characterId' | 'family'>[]): Promise<BattleTextures> {
  const keys = units ? battleArtKeys(units) : Object.keys(ART_URLS) as (keyof typeof ART_URLS)[];
  const entries = await Promise.all(keys.map(async key => {
    const url = ART_URLS[key];
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
  if (unit.family !== 'infantry') return null;
  if (unit.characterId === 'liuBei') return { commander: SPRITE_SPECS.liuBei, soldier: SPRITE_SPECS.shuSoldier, portrait: 'liuPortrait' };
  if (unit.characterId === 'ytInfantryA' || unit.characterId === 'ytInfantryB') {
    return { commander: SPRITE_SPECS.yellowCaptain, soldier: SPRITE_SPECS.yellowSoldier, portrait: 'yellowPortrait' };
  }
  return null;
}

/** Load only art used by this lineup; a new character must not enlarge every battle download. */
export function battleArtKeys(units: readonly Pick<ViewUnit, 'characterId' | 'family'>[]): (keyof typeof ART_URLS)[] {
  const keys = new Set<keyof typeof ART_URLS>(['field']);
  for (const unit of units) {
    const art = unitArt(unit);
    if (!art) continue;
    keys.add(art.commander.texture);
    keys.add(art.soldier.texture);
    if (art.portrait) keys.add(art.portrait);
  }
  return [...keys];
}
