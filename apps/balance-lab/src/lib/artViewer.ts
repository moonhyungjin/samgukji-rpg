import type { ArtSlot } from './artReview';

/** Lab → 게임 Viewer 메시지 (게임 쪽 ArtViewer.tsx와 같은 모양) */
export type ViewerOutgoing =
  | { type: 'art-viewer:highlight'; rects: { x: number; y: number; w: number; h: number }[]; label: string }
  | { type: 'art-viewer:overrides'; overrides: Record<string, string> };

export const DEFAULT_GAME_URL = 'http://localhost:5174';

/** 슬롯을 Viewer에 표시하는 메시지. 영역이 없으면 빈 목록(표시 없음) */
export function highlightMessage(slot: ArtSlot | undefined): ViewerOutgoing {
  return { type: 'art-viewer:highlight', rects: slot?.regions ?? [], label: slot ? `${slot.id} ${slot.name}` : '' };
}

/** 끼워 볼 그림의 주소 (게임 화면이 Lab 개발 서버에서 직접 읽는다) */
export function viewerImageUrl(origin: string, path: string): string {
  // 확장자가 주소 끝에 있어야 PixiJS가 그림으로 읽는다 (그래서 ?path= 형태를 쓰지 않는다)
  return `${origin}/api/art/file/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** Viewer 주소: 게임 서버 주소 뒤에 ?viewer=1 */
export function viewerSrc(gameUrl: string): string {
  const base = gameUrl.trim().replace(/\/+$/, '') || DEFAULT_GAME_URL;
  return `${base}/?viewer=1`;
}

/** 이 슬롯에서 끼워 볼 수 있는 게임 텍스처 목록. 없으면 코드로 그리거나 지금 화면에서 쓰지 않는 슬롯이다 */
export function applicableKeys(slot: ArtSlot | undefined): string[] {
  return slot?.artKeys ?? [];
}
