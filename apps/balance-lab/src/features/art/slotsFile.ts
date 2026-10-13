import type { Region } from './artRegions';

interface SlotsFile {
  version: number;
  note: string;
  slots: { id: string; regions?: Region[] }[];
}

const isRegion = (r: unknown): r is Region => {
  const v = r as Partial<Region> | null;
  return !!v && [v.x, v.y, v.w, v.h].every((n) => typeof n === 'number' && Number.isFinite(n)) && (v.w as number) >= 1 && (v.h as number) >= 1;
};

/** 슬롯 하나를 한 줄로: {"id": "A1", "regions": [{"x": 0, ...}]} 모양 (콤마와 콜론 뒤에 공백 하나) */
function oneLine(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(oneLine).join(', ')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${oneLine(v)}`).join(', ')}}`;
  return JSON.stringify(value);
}

/**
 * docs/art/battle-slots.json의 글에서 슬롯 영역(regions)만 바꾼 새 글을 만든다.
 * 슬롯 하나가 한 줄인 지금의 모양을 그대로 유지하고(줄 바꿈 \r\n 포함), 영역의 개수는 바꾸지 못한다.
 */
export function applyRegionChanges(text: string, changes: Record<string, unknown>): { text: string } | { error: string } {
  const crlf = text.includes('\r\n');
  let file: SlotsFile;
  try {
    file = JSON.parse(text) as SlotsFile;
  } catch {
    return { error: 'battle-slots.json을 읽지 못했습니다.' };
  }
  for (const [id, value] of Object.entries(changes)) {
    const slot = file.slots.find((s) => s.id === id);
    if (!slot?.regions) return { error: `${id}는 영역이 있는 슬롯이 아닙니다.` };
    if (!Array.isArray(value) || value.length !== slot.regions.length) return { error: `${id}의 영역 개수는 바꿀 수 없습니다.` };
    if (!value.every(isRegion)) return { error: `${id}의 영역 값이 올바르지 않습니다 (x, y, w, h는 숫자이고 w, h는 1 이상).` };
    slot.regions = value.map((r) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }));
  }
  const rows = file.slots.map((s, i) => `    ${oneLine(s)}${i < file.slots.length - 1 ? ',' : ''}`);
  const lines = ['{', `  "version": ${file.version},`, `  "note": ${JSON.stringify(file.note)},`, '  "slots": [', ...rows, '  ]', '}', ''];
  const out = lines.join('\n');
  return { text: crlf ? out.replace(/\n/g, '\r\n') : out };
}
