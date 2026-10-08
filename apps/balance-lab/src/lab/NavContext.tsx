import { createContext, useContext } from 'react';

export type LabTab = 'sim' | 'battle' | 'calc' | 'balance' | 'data' | 'characters' | 'presets' | 'settings';

interface Nav {
  /** 이동하려는 요소(CSS 선택자). 이동한 화면이 필요한 선택 상태를 맞추는 데 쓴다 */
  anchor: string | null;
  /** 탭을 옮기고, anchor(CSS 선택자)가 있으면 그 요소로 스크롤한다 */
  go: (tab: LabTab, anchor?: string) => void;
}

/** 다른 탭의 값을 고치러 가는 이동. 제공자가 없으면(테스트 등) 아무것도 하지 않는다. */
export const NavContext = createContext<Nav>({ anchor: null, go: () => {} });
export const useNav = () => useContext(NavContext);
