import type { ArtImage, ArtSlot } from './artReview';

/** 제작 크기는 표시 크기의 2배까지 (battle-slots.md 규칙 4) */
export const MAX_SCALE = 2;
/** 비율이 슬롯과 이만큼(8%)까지 다르면 같은 비율로 본다 */
export const RATIO_TOLERANCE = 0.08;

const SHOWN_FROM = 'docs/art/battle-slots.json';

/** 슬롯의 대표 영역 (영역이 여럿이면 첫 번째. 좌우 슬롯은 왼쪽, 카드 슬롯은 첫 카드) */
function mainRegion(slot: ArtSlot) {
  return slot.regions?.[0];
}

/** 이 슬롯에 그림을 만들 때의 조건이 정해져 있는가 */
export function hasSpec(slot: ArtSlot | undefined): slot is ArtSlot & { spec: NonNullable<ArtSlot['spec']> } {
  return !!slot?.spec && !!mainRegion(slot);
}

/** 파일 이름 규칙: `<슬롯 ID>_<slug>[_<변형>].png` */
export function fileNameOf(slot: ArtSlot): string {
  const spec = slot.spec;
  if (!spec) return `${slot.id}_이름.png`;
  const variant = spec.variants && spec.variants.length > 0 ? `_<${spec.variants.join('|')}>` : '';
  return `${slot.id}_${spec.slug}${variant}.png`;
}

/** Codex/Gemini에 그대로 넘기는 제작 명세서 (글). 게임 화면 크기가 아니라 만들 그림의 조건을 적는다 */
export function specMarkdown(slot: ArtSlot, slots: readonly ArtSlot[]): string {
  const r = mainRegion(slot);
  if (!r || !slot.spec) return '';
  const spec = slot.spec;
  const target = { w: r.w * MAX_SCALE, h: r.h * MAX_SCALE };
  const above = slots.filter((s) => s.group === slot.group && s.layer !== undefined && slot.layer !== undefined && s.layer > slot.layer && s.id !== slot.id).map((s) => `${s.id} ${s.name}`);
  const below = slots.filter((s) => s.group === slot.group && s.layer !== undefined && slot.layer !== undefined && s.layer < slot.layer && s.id !== slot.id).map((s) => `${s.id} ${s.name}`);
  const lines = [
    `# ${slot.id} ${slot.name} 제작 명세서`,
    '',
    `- 파일 이름: \`${fileNameOf(slot)}\` (PNG)`,
    `- 화면에 보이는 크기: **${r.w}×${r.h}** (비율 ${(r.w / r.h).toFixed(2)}:1), 게임 화면 1280×900 기준 위치 (${r.x}, ${r.y})`,
    `- 만들 크기: **${target.w}×${target.h}** (표시 크기의 ${MAX_SCALE}배). 이보다 크게 만들지 않는다. 비율은 ±${Math.round(RATIO_TOLERANCE * 100)}% 안으로 맞춘다.`,
    `- 배경: ${spec.transparent ? '**투명 배경(알파 채널 필수)**. 안쪽이 비어야 하는 부분은 완전히 투명하게 둔다.' : '불투명하게 채운다.'}`,
  ];
  if (spec.slice) lines.push(`- 가운데만 늘어나는 구조: 양 끝 ${spec.slice * MAX_SCALE}px(만든 크기 기준)는 장식으로 고정하고, 그 사이는 가로로 늘려도 어색하지 않게 단순하게 만든다.`);
  if (spec.mirrored) lines.push('- 좌우 반전: 오른쪽 영역은 이 그림을 좌우로 뒤집어 쓴다. 한쪽 방향 빛, 글자, 비대칭 무늬를 넣지 않는다.');
  if (spec.variants && spec.variants.length > 0) lines.push(`- 변형: ${spec.variants.join(', ')} 각각 한 장. 크기와 구조는 같고 색(분위기)만 다르게.`);
  if ((slot.regions?.length ?? 0) > 1 && !spec.mirrored) lines.push(`- 같은 그림이 화면의 ${slot.regions!.length}곳에 쓰인다.`);
  if (slot.layer !== undefined) lines.push(`- 겹침: ${below.length > 0 ? `아래에 ${below.join(', ')}` : '맨 아래 층'}${above.length > 0 ? ` / 위에 ${above.join(', ')}가 올라간다` : ' / 맨 위 층'}.`);
  if (spec.note) lines.push(`- 참고: ${spec.note}`);
  lines.push('- 글자(숫자, 이름)는 그림에 넣지 않는다. 글자는 코드가 쓴다.');
  lines.push('- 그림체는 docs/art/WORKFLOW.md의 "그래픽 방향"(어둡고 색이 적은 UI 키트)을 따른다.');
  lines.push('', `(슬롯 정보 출처: ${SHOWN_FROM}. 크기를 바꾸면 이 명세서도 달라진다.)`);
  return lines.join('\n');
}

export interface FitCheck {
  key: 'ratio' | 'size' | 'alpha';
  ok: boolean;
  text: string;
}

/** 후보 그림이 슬롯 조건(비율, 크기, 투명)에 맞는지. 슬롯에 조건이 없거나 크기를 모르면 빈 목록 */
export function fitChecks(img: Pick<ArtImage, 'width' | 'height' | 'hasAlpha'>, slot: ArtSlot | undefined): FitCheck[] {
  const r = slot ? mainRegion(slot) : undefined;
  if (!slot || !slot.spec || !r || !img.width || !img.height) return [];
  const out: FitCheck[] = [];
  const want = r.w / r.h;
  const have = img.width / img.height;
  const off = Math.abs(have / want - 1);
  out.push({ key: 'ratio', ok: off <= RATIO_TOLERANCE, text: off <= RATIO_TOLERANCE ? `비율 맞음 (${have.toFixed(2)}:1)` : `비율 ${have.toFixed(2)}:1 · 슬롯 ${want.toFixed(2)}:1` });
  const max = r.w * MAX_SCALE * 1.1;
  const sizeOk = img.width >= r.w * 0.9 && img.width <= max;
  out.push({ key: 'size', ok: sizeOk, text: sizeOk ? `크기 맞음 (${img.width}×${img.height})` : `가로 ${img.width}px · ${r.w}~${r.w * MAX_SCALE}px여야 함` });
  if (slot.spec.transparent && img.hasAlpha !== null) out.push({ key: 'alpha', ok: img.hasAlpha, text: img.hasAlpha ? '투명 채널 있음' : '투명 채널 없음 (배경이 채워짐)' });
  return out;
}
