import { FONT } from './theme';

/** 제목 글씨용 폰트 이름 (배민 을지로체). 파일이 없으면 기본 고딕으로 대신한다 */
export const TITLE_FONT_NAME = 'BM EULJIRO';
export const FONT_TITLE = `"${TITLE_FONT_NAME}", ${FONT}`;

const CANDIDATES = ['BMEULJIRO.ttf', 'BMEULJIRO.otf', 'BMEULJIRO.woff2', 'BMEULJIRO.woff'];
let loading: Promise<boolean> | null = null;

/**
 * apps/game/public/fonts/ 에 을지로체 파일(BMEULJIRO.ttf 등)이 있으면 불러와 브라우저에 등록한다. 없으면 false (기본 고딕 사용).
 * PixiJS 글자는 폰트가 로드되기 전에 만들면 기본 글꼴로 굳으므로, 전투 화면을 만들기 전에 기다린다.
 * 파일이 없을 때 콘솔에 오류가 남지 않게 먼저 HEAD로 확인한다 (개발 서버는 없는 경로에 index.html을 돌려주니 종류도 본다).
 */
export function loadTitleFont(): Promise<boolean> {
  loading ??= (async () => {
    if (typeof document === 'undefined' || !('fonts' in document)) return false;
    for (const file of CANDIDATES) {
      const url = `${import.meta.env.BASE_URL}fonts/${file}`;
      try {
        const head = await fetch(url, { method: 'HEAD' });
        const type = head.headers.get('content-type') ?? '';
        if (!head.ok || type.includes('text/html')) continue;
        const face = new FontFace(TITLE_FONT_NAME, `url(${url})`);
        await face.load();
        document.fonts.add(face);
        return true;
      } catch {
        // 다음 후보
      }
    }
    return false;
  })();
  return loading;
}
