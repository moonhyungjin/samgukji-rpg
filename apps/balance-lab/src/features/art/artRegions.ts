import type { ArtSlot } from './artReview';

/** 논리 화면 크기 (게임 화면 1280×900) */
export const SCREEN_W = 1280;
export const SCREEN_H = 900;

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type EditMode = 'free' | 'mirror' | 'cards' | 'locked';

/** 이 슬롯의 영역을 고치는 방식. 영역이 없거나 코드가 정하는 슬롯은 locked */
export function editModeOf(slot: ArtSlot | undefined): EditMode {
  if (!slot || !slot.regions || slot.regions.length === 0) return 'locked';
  return slot.edit ?? 'free';
}

/** 사람이 직접 고치는 영역의 번호들 (나머지는 규칙에 따라 따라온다) */
export function editableIndexes(slot: ArtSlot | undefined): number[] {
  const regions = slot?.regions ?? [];
  switch (editModeOf(slot)) {
    case 'locked':
      return [];
    case 'mirror':
      return regions.map((_, i) => i);
    case 'cards':
      return Array.from({ length: Math.min(slot?.parts ?? 1, regions.length) }, (_, i) => i);
    default:
      return regions.map((_, i) => i);
  }
}

/** 편집 줄의 이름: "왼쪽", "부품 2/3" 같은 말 */
export function regionLabel(slot: ArtSlot, index: number): string {
  const mode = editModeOf(slot);
  const count = slot.regions?.length ?? 0;
  if (mode === 'mirror') return index === 0 ? '왼쪽' : '오른쪽';
  if (mode === 'cards') return (slot.parts ?? 1) > 1 ? `카드 안 부품 ${index + 1}/${slot.parts}` : '카드 안 위치';
  return count > 1 ? `영역 ${index + 1}/${count}` : '영역';
}

/** 규칙 설명 (편집기에 보여 준다) */
export function modeNote(slot: ArtSlot): string {
  switch (editModeOf(slot)) {
    case 'locked':
      return slot.regions && slot.regions.length > 0 ? '이 영역은 코드가 정해서 여기서 고치지 않습니다.' : '화면 안의 고정 영역이 없는 슬롯입니다.';
    case 'mirror':
      return '"좌우 대칭 유지"가 켜져 있으면 한쪽을 고칠 때 반대쪽이 화면 가운데 기준으로 대칭이 되도록 따라옵니다. 끄면 양쪽을 따로 고칩니다.';
    case 'cards':
      return '첫 카드에서 고치면 카드 12장 모두 같은 위치로 바뀝니다. 숫자는 화면 기준 좌표입니다.';
    default:
      return '영역마다 따로 고칩니다.';
  }
}

const rounded = (r: Region): Region => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.max(1, Math.round(r.w)), h: Math.max(1, Math.round(r.h)) });

/** 한 슬롯의 영역을 고친 새 목록 (규칙대로 거울/카드 12장/따라오는 슬롯까지 맞춘다). 원본은 바꾸지 않는다 */
export function setRegion(slots: readonly ArtSlot[], slotId: string, index: number, next: Region, linked = true): ArtSlot[] {
  const target = slots.find((s) => s.id === slotId);
  if (!target?.regions || !target.regions[index]) return [...slots];
  const to = rounded(next);
  const old = target.regions;
  let regions: Region[];
  switch (editModeOf(target)) {
    case 'locked':
      return [...slots];
    case 'mirror': {
      if (!linked) {
        regions = old.map((r, i) => (i === index ? to : r));
        break;
      }
      const left = index === 0 ? to : { ...to, x: SCREEN_W - to.x - to.w };
      regions = old.map((_, i) => (i === 0 ? left : { ...left, x: SCREEN_W - left.x - left.w }));
      break;
    }
    case 'cards': {
      const parts = target.parts ?? 1;
      const d = { x: to.x - old[index].x, y: to.y - old[index].y, w: to.w - old[index].w, h: to.h - old[index].h };
      regions = old.map((r, j) => (j % parts === index % parts ? { x: r.x + d.x, y: r.y + d.y, w: Math.max(1, r.w + d.w), h: Math.max(1, r.h + d.h) } : r));
      break;
    }
    default:
      regions = old.map((r, i) => (i === index ? to : r));
  }
  return slots.map((s) => (s.id === slotId ? { ...s, regions } : s.follow === slotId ? { ...s, regions: regions.map((r) => ({ ...r })) } : s));
}

/** 화면 밖으로 나간 영역 등 눈에 띄는 문제 */
export function regionWarnings(slot: ArtSlot): string[] {
  for (const [i, r] of (slot.regions ?? []).entries()) {
    if (r.x < 0 || r.y < 0 || r.x + r.w > SCREEN_W || r.y + r.h > SCREEN_H) return [`${i + 1}번 영역이 화면(${SCREEN_W}×${SCREEN_H}) 밖으로 나갔습니다.`];
  }
  return [];
}

/** 저장할 때 보낼 것: 영역이 달라진 슬롯만 */
export function changedRegions(loaded: readonly ArtSlot[], draft: readonly ArtSlot[]): Record<string, Region[]> {
  const before = new Map(loaded.map((s) => [s.id, JSON.stringify(s.regions ?? null)]));
  const out: Record<string, Region[]> = {};
  for (const s of draft) if (s.regions && before.get(s.id) !== JSON.stringify(s.regions)) out[s.id] = s.regions;
  return out;
}

export type AlignHow = 'rect' | 'size' | 'height' | 'left' | 'right';

export const ALIGN_LABEL: Record<AlignHow, string> = { rect: '같은 영역', size: '같은 크기', height: '같은 높이·세로 위치', left: '왼쪽 끝 맞춤', right: '오른쪽 끝 맞춤' };

/** 다른 영역에 맞춘 새 영역: 같은 영역 / 같은 크기 / 높이(y·h)만 / 왼쪽 끝 / 오른쪽 끝 */
export function alignRegion(region: Region, ref: Region, how: AlignHow): Region {
  switch (how) {
    case 'rect':
      return { ...ref };
    case 'size':
      return { ...region, w: ref.w, h: ref.h };
    case 'height':
      return { ...region, y: ref.y, h: ref.h };
    case 'left':
      return { ...region, x: ref.x };
    case 'right':
      return { ...region, x: ref.x + ref.w - region.w };
  }
}

/** 층 순서(아래 → 위): layer가 있는 슬롯만, 같은 층은 목록 순서대로 */
export function layerOrder(slots: readonly ArtSlot[]): ArtSlot[] {
  return slots.filter((s) => s.layer !== undefined).sort((a, b) => (a.layer as number) - (b.layer as number));
}
