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
};
export type BattleTextures = Partial<Record<keyof typeof ART_URLS, Texture>>;

/** Missing artwork falls back to labeled tokens; gameplay remains available. */
export async function loadBattleArt(): Promise<BattleTextures> {
  const entries = await Promise.all(Object.entries(ART_URLS).map(async ([key, url]) => {
    try { return [key, await Assets.load<Texture>({ src: url, data: { autoGenerateMipmaps: true, scaleMode: 'linear' } })] as const; }
    catch { return [key, undefined] as const; }
  }));
  return Object.fromEntries(entries);
}

export interface SpriteSpec {
  texture: 'liuBei' | 'shuSoldier' | 'yellowCaptain' | 'yellowSoldier';
  ground: [number, number];
  head: number;
  facing: 1 | -1;
}
export const SPRITE_SPECS: Record<SpriteSpec['texture'], SpriteSpec> = {
  liuBei: { texture: 'liuBei', ground: [760, 1007], head: 100, facing: 1 },
  shuSoldier: { texture: 'shuSoldier', ground: [580, 1168], head: 120, facing: 1 },
  yellowCaptain: { texture: 'yellowCaptain', ground: [950, 1010], head: 75, facing: -1 },
  yellowSoldier: { texture: 'yellowSoldier', ground: [800, 1147], head: 100, facing: -1 },
};

/** Art is mapped by stable character IDs, never by attacker/defender or translated name. */
export function unitArt(unit: Pick<ViewUnit, 'characterId' | 'family'>): {
  commander: SpriteSpec; soldier: SpriteSpec; portrait?: 'liuPortrait' | 'yellowPortrait';
} | null {
  if (unit.family !== 'infantry') return null;
  if (unit.characterId === 'liuBei') return { commander: SPRITE_SPECS.liuBei, soldier: SPRITE_SPECS.shuSoldier, portrait: 'liuPortrait' };
  if (unit.characterId === 'ytInfantryA' || unit.characterId === 'ytInfantryB') {
    return { commander: SPRITE_SPECS.yellowCaptain, soldier: SPRITE_SPECS.yellowSoldier, portrait: 'yellowPortrait' };
  }
  return null;
}
