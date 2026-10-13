import type { Terrain } from '@samgukji/battle-engine';

/** 지형 이름 (지도 탭 화면들이 같이 쓴다) */
export const TERRAIN_LABEL: Record<Terrain, string> = { plain: '평원', mountain: '산악', river: '강', forest: '숲' };
