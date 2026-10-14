/** 에셋 검수 탭에서 쓰는 순수 함수와 타입. 개발 서버 API(`artApi.ts`)도 같은 함수를 쓴다. */

export type ReviewStatus = 'ok' | 'no';
export type ReviewMap = Record<string, ReviewStatus>;

export interface ArtSlot {
  id: string;
  group: string;
  name: string;
  size: string;
  states: string[];
  note?: string;
  /** 그림이 아니라 코드/CSS로 그리는 요소 */
  codeDrawn?: boolean;
  /** 후보 그림을 찾는 경로 패턴 (* 는 / 를 뺀 아무 글자) */
  match?: string[];
  /** 게임 화면에서 이 슬롯이 차지하는 영역들 (논리 화면 1280×900 좌표). Viewer가 점선으로 표시한다 */
  regions?: { x: number; y: number; w: number; h: number }[];
  /** 영역을 Lab에서 고치는 방식 (artRegions.ts). 없으면 영역마다 따로(free) */
  edit?: 'free' | 'mirror' | 'cards' | 'locked';
  /** edit가 cards일 때 카드 한 장 안의 영역 수 (카드 12장이 이 수만큼씩 이어진다). 없으면 1 */
  parts?: number;
  /** 그림을 만들 때의 조건 (artSpec.ts가 제작 명세서와 맞춤 검사에 쓴다) */
  spec?: {
    /** 파일 이름에 쓰는 영문 이름 */
    slug: string;
    /** 투명 배경(알파 채널)이 필요하다 */
    transparent: boolean;
    /** 양 끝 장식을 고정하고 가운데만 늘이는 폭 (표시 크기 기준 px) */
    slice?: number;
    /** 오른쪽 영역은 이 그림을 좌우 반전해서 쓴다 */
    mirrored?: boolean;
    /** 변형 이름 (진영 등). 변형마다 한 장 */
    variants?: string[];
    note?: string;
  };
  /** 겹치는 순서 (작을수록 아래, 코드가 정한다). 있으면 편집 화면에 층 순서로 보여 준다 */
  layer?: number;
  /** 다른 슬롯과 같은 영역을 쓴다 (그 슬롯을 고치면 따라온다) */
  follow?: string;
  /** 후보 그림을 끼워 볼 수 있는 게임 텍스처 이름 (battleArt.ts의 ART_URLS 키) */
  artKeys?: string[];
}

export interface ArtImage {
  path: string;
  bytes: number;
  width: number | null;
  height: number | null;
  /** 게임 코드가 파일 이름을 부른다 (삭제하면 화면이 깨진다) */
  usedByGame: boolean;
  /** 문서/스크립트가 파일 이름을 부른다 (미리보기 페이지 등) */
  usedByDocs: boolean;
  /** PNG에 알파(투명도) 채널이 있다. PNG가 아니면 null */
  hasAlpha: boolean | null;
}

/** `*`만 지원하는 경로 패턴을 정규식으로 바꾼다. `*`는 `/`를 넘지 않는다. */
export function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\?]/g, '\\$&').replace(/\*/g, '[^/]*');
  return new RegExp(`^${escaped}$`);
}

/** 이 경로가 속한 슬롯들. 어느 슬롯에도 안 속하면 빈 목록이다. */
export function slotsFor(path: string, slots: readonly ArtSlot[]): ArtSlot[] {
  return slots.filter((s) => (s.match ?? []).some((p) => globToRegExp(p).test(path)));
}

export type StatusFilter = 'all' | 'pending' | 'ok' | 'no';

export function statusOf(path: string, review: ReviewMap): 'pending' | ReviewStatus {
  return review[path] ?? 'pending';
}

export function matchesFilter(path: string, review: ReviewMap, filter: StatusFilter): boolean {
  return filter === 'all' || statusOf(path, review) === filter;
}

/** 파일 크기를 사람이 읽는 글자로 */
export function formatBytes(bytes: number): string {
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))}KB`;
}

/** NO로 표시한 것 중 지워도 되는 것과 막힌 것(게임이 쓰는 파일)을 나눈다. */
export function splitDeletable(images: readonly ArtImage[], review: ReviewMap): { deletable: ArtImage[]; blocked: ArtImage[] } {
  const marked = images.filter((i) => review[i.path] === 'no');
  return { deletable: marked.filter((i) => !i.usedByGame), blocked: marked.filter((i) => i.usedByGame) };
}

/** 슬롯별 개수: 후보 수와 OK/NO/대기 */
export function slotSummary(slot: ArtSlot, images: readonly ArtImage[], review: ReviewMap): { total: number; ok: number; no: number; pending: number } {
  const mine = images.filter((i) => slotsFor(i.path, [slot]).length > 0);
  const ok = mine.filter((i) => review[i.path] === 'ok').length;
  const no = mine.filter((i) => review[i.path] === 'no').length;
  return { total: mine.length, ok, no, pending: mine.length - ok - no };
}
