import type { LabTab } from './lab/NavContext';

/**
 * Lab의 화면 구성: 위 줄은 **분류**, 분류를 고르면 그 분류의 **탭**이 아래 줄에 나온다.
 * 탭을 더하거나 옮길 때는 여기만 고친다 (탭 id는 NavContext의 LabTab이다).
 */
export interface LabCategory {
  id: string;
  label: string;
  /** 이 분류가 하는 일 (분류 버튼의 툴팁) */
  hint: string;
  tabs: { id: LabTab; label: string }[];
}

export const CATEGORIES: readonly LabCategory[] = [
  {
    id: 'results',
    label: '결과 보기',
    hint: '값을 바꿔 가며 결과(승률, 피해, 상성)를 확인하는 도구',
    tabs: [
      { id: 'sim', label: '시뮬레이션' },
      { id: 'compare', label: '설정 비교' },
      { id: 'battle', label: '전투 1회' },
      { id: 'calc', label: '피해 분석' },
      { id: 'matchup', label: '병종 상성표' },
    ],
  },
  {
    id: 'data',
    label: '데이터 편집',
    hint: '밸런스 수치, 병종, 스킬, 장수, 편성을 고치고 파일에 저장',
    tabs: [
      { id: 'balance', label: '밸런스' },
      { id: 'data', label: '병종 · 스킬' },
      { id: 'characters', label: '장수' },
      { id: 'presets', label: '기본 편성' },
    ],
  },
  {
    id: 'story',
    label: '캠페인 · 지도',
    hint: '연속 전투(캠페인)와 전략 지도',
    tabs: [
      { id: 'campaign', label: '캠페인' },
      { id: 'map', label: '지도' },
    ],
  },
  {
    id: 'art',
    label: '에셋',
    hint: '그림을 OK/NO로 검수하고 실제 게임 화면에서 확인',
    tabs: [{ id: 'art', label: '에셋 검수' }],
  },
  {
    id: 'settings',
    label: '설정',
    hint: '경고 기준과 데이터 가져오기',
    tabs: [{ id: 'settings', label: '경고 기준 · 가져오기' }],
  },
];

/** 이 탭이 속한 분류 */
export function categoryOf(tab: LabTab): LabCategory {
  return CATEGORIES.find((c) => c.tabs.some((t) => t.id === tab)) ?? CATEGORIES[0];
}
