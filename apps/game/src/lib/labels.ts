import type { DecidedBy, EndCause, Family, Side } from '@samgukji/battle-engine';

export const FAMILY_LABEL: Record<Family, string> = {
  infantry: '보병',
  cavalry: '기병',
  archer: '궁병',
  strategist: '책사',
  taoist: '도사',
  geomancer: '풍수사',
};

export const SIDE_LABEL: Record<Side, string> = { attacker: '공격측', defender: '방어측' };

/** 기본 편성 이름 (game-data/presets) */
export const PRESET_LABEL: Record<string, string> = { shu: '촉', wei: '위' };

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
