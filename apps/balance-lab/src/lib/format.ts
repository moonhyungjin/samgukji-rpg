import type { DecidedBy, EndCause, Family } from '@samgukji/battle-engine';

export const FAMILY_LABEL: Record<Family, string> = {
  infantry: '보병',
  shield: '방패병',
  cavalry: '기병',
  archer: '궁병',
  strategist: '책사',
  taoist: '도사',
  geomancer: '풍수사',
};

export const END_CAUSE_LABEL: Record<EndCause, string> = {
  wipe: '한쪽 전멸',
  'no-ap': 'AP 소진',
  stall: '교착',
  'max-turns': '턴 한도',
};

export const DECIDED_BY_LABEL: Record<DecidedBy, string> = {
  destroyed: '전멸 군단 수',
  troops: '잔여 병력',
  morale: '사기',
  defender: '방어측 우선',
};

export const pct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;
export const num = (n: number, digits = 0) => n.toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** 변화량 문자열. 부호를 붙인다. */
export function signed(n: number, digits = 1): string {
  const fixed = n.toFixed(digits);
  return n > 0 ? `+${fixed}` : fixed;
}
