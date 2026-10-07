// 장수 편집기를 실제 브라우저로 조작해 확인하는 스크립트. 값을 고치고 저장하면 characters.json이 실제로 바뀌는지, 오류가 저장을 막는지 본다.
//
//   npm run chars         # 다른 터미널에서 편집기 개발 서버를 켜 둔다 (http://localhost:5175)
//   npm run e2e:chars     # 이 스크립트 실행. 스크린샷은 out/chars-e2e/ 에 저장된다. 시험 중에 바뀐 characters.json은 끝나면 원래대로 되돌린다.
// 환경 변수: CHARS_URL, BROWSER, E2E_OUT. 게임 화면용 game-e2e.mjs와 같은 방식(DevTools Protocol)이다.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const BASE = process.env.CHARS_URL ?? 'http://localhost:5175/';
const OUT = resolve(process.env.E2E_OUT ?? 'out/chars-e2e');
const PORT = 9555;
const CANDIDATES = [
  process.env.BROWSER,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const BROWSER = CANDIDATES.find((p) => existsSync(p));
if (!BROWSER) {
  console.error('Edge/Chrome을 찾지 못했습니다. BROWSER 환경 변수에 실행 파일 경로를 지정하세요.');
  process.exit(2);
}

mkdirSync(OUT, { recursive: true });
const profile = join(OUT, 'browser-profile');
mkdirSync(profile, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const errors = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const proc = spawn(
  BROWSER,
  [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    '--hide-scrollbars', '--window-size=1400,1000', '--no-first-run', 'about:blank',
  ],
  { stdio: 'ignore' },
);

const getJson = async (path) => (await fetch(`http://127.0.0.1:${PORT}${path}`)).json();
let ws;
const pending = new Map();
let nextId = 0;
const send = (method, params = {}) =>
  new Promise((resolveSend, reject) => {
    const id = ++nextId;
    pending.set(id, (m) => (m.error ? reject(new Error(JSON.stringify(m.error))) : resolveSend(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception ?? r.exceptionDetails));
  return r.result.value;
};
/** expression은 반드시 불리언(또는 원시값)을 돌려줘야 한다. DOM 요소를 돌려주면 직렬화에 실패한다. */
const waitFor = async (expression, timeout = 15000, label = expression) => {
  const t0 = Date.now();
  for (;;) {
    const v = await evalJs(expression);
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error(`timeout: ${label}`);
    await sleep(120);
  }
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.data, 'base64'));
};
const mouse = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
};
const goto = async (query) => {
  await send('Page.navigate', { url: BASE + query });
  await sleep(600);
};
const text = (sel) => evalJs(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? ''`);
const clickSkill = () =>
  evalJs(`(() => { const b = [...document.querySelectorAll('.command .row button')].find(b => /\\(AP \\d/.test(b.textContent) && !/대기/.test(b.textContent)); if (!b) return false; b.click(); return b.textContent; })()`);
const clickButton = (label) =>
  evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(label)})); if (!b) return false; b.click(); return true; })()`);



// ---- 장수 편집기 시나리오 ----
// 저장하기는 packages/game-data/data/characters.json을 실제로 바꾼다. 끝나면 (실패해도) 원래 내용으로 되돌린다.
const CHARACTERS_FILE = resolve('packages/game-data/data/characters.json');
const original = readFileSync(CHARACTERS_FILE, 'utf-8');
const PRESETS_FILE = resolve('packages/game-data/data/presets.json');
const originalPresets = readFileSync(PRESETS_FILE, 'utf-8');
const readPresets = () => JSON.parse(readFileSync(PRESETS_FILE, 'utf-8'));
const setValue = (selector, value) =>
  evalJs(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return 'missing'; const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(String(value))}); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return 'ok'; })()`);
const readFile = () => JSON.parse(readFileSync(CHARACTERS_FILE, 'utf-8'));
const guanYuFile = () => readFile().find((c) => c.id === 'guanYu');

try {
  const targets = await (async () => { for (let i = 0; i < 50; i++) { try { return await getJson('/json'); } catch { await sleep(200); } } throw new Error('no browser'); })();
  const page = targets.find((t) => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(m.params.exceptionDetails.text)); };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: BASE });
  // 개발 서버가 처음 요청을 컴파일하는 동안 기다린다
  await waitFor(`document.querySelectorAll('tbody tr').length > 0`, 30000, '장수 표');
  await sleep(500);

  const rows = await evalJs(`document.querySelectorAll('tbody tr').length`);
  check('장수 표가 나온다', rows === JSON.parse(original).length, `${rows}줄`);
  const saveDisabled = await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('저장하기')).disabled`);
  check('처음에는 저장하기가 꺼져 있다 (저장된 상태)', saveDisabled === true);
  await shot('chars-initial');

  // 1. 수정 → 저장 → 파일이 바뀐다
  const before = guanYuFile().stats.attack;
  const set1 = await setValue('input[aria-label="guanYu 공격"]', before + 1);
  await sleep(200);
  const badge = await text('.badge.dirty');
  check('값을 고치면 "저장 안 됨" 표시가 뜬다', set1 === 'ok' && badge.includes('수정 1'), badge.trim());
  const derivedRow = await evalJs(`document.querySelector('tr[data-id="guanYu"]').textContent`);
  check('수정한 줄이 노랗게 표시되고 계산값이 갱신된다', (await evalJs(`document.querySelector('tr[data-id="guanYu"]').className`)) === 'changed', String(derivedRow).slice(0, 80));
  await shot('chars-edited');

  await clickButton('저장하기');
  await waitFor(`!!document.querySelector('.message.ok')`, 8000, '저장 성공 메시지').catch(() => {});
  const msg = await text('.message');
  check('저장하기를 누르면 성공 메시지가 나온다', msg.includes('저장했습니다'), msg.trim().slice(0, 60));
  check('characters.json 파일에 관우의 새 공격이 기록된다', guanYuFile().stats.attack === before + 1, `${before} → ${guanYuFile().stats.attack}`);
  check('저장 뒤 "저장된 상태"로 돌아간다', (await evalJs(`!!document.querySelector('.badge.clean')`)) === true);

  // 2. 새로고침해도 저장된 값이 보인다
  await send('Page.navigate', { url: BASE }); await sleep(2000);
  const reloaded = await evalJs(`document.querySelector('input[aria-label="guanYu 공격"]').value`);
  check('새로고침해도 저장된 값이 보인다', Number(reloaded) === before + 1, String(reloaded));

  // 3. 오류가 있으면 저장하지 못한다
  await setValue('input[aria-label="guanYu 공격"]', 99);
  await sleep(200);
  const issues = await text('.issues');
  check('범위 밖 스탯은 오류로 표시된다', issues.includes('범위'), issues.trim().slice(0, 60));
  await clickButton('저장하기');
  await sleep(400);
  check('오류가 있으면 저장되지 않고 파일은 그대로다', guanYuFile().stats.attack === before + 1, String(guanYuFile().stats.attack));
  check('오류 줄이 빨갛게 표시된다', ((await evalJs(`document.querySelector('tr[data-id="guanYu"]').className`)) || '').includes('invalid'));

  // 4. 되돌리기, 새 장수 추가, 복제, 필터
  await clickButton('전부 되돌리기');
  await sleep(200);
  check('전부 되돌리기로 저장된 값으로 돌아온다', (await evalJs(`document.querySelector('input[aria-label="guanYu 공격"]').value`)) === String(before + 1));
  await clickButton('+ 새 장수');
  await sleep(200);
  const rowsAfterAdd = await evalJs(`document.querySelectorAll('tbody tr').length`);
  check('새 장수를 추가하면 줄이 늘고 초록으로 표시된다', rowsAfterAdd === JSON.parse(original).length + 1 && (await evalJs(`document.querySelectorAll('tr.added').length`)) === 1);
  await clickButton('전부 되돌리기');
  await setValue('input[aria-label="검색"]', '관우');
  await sleep(200);
  check('검색으로 줄을 걸러낸다', (await evalJs(`document.querySelectorAll('tbody tr').length`)) === 1);
  await shot('chars-filtered');

  // 5. 기본 편성에서 쓰는 장수는 삭제할 수 없다
  const delDisabled = await evalJs(`document.querySelector('tr[data-id="guanYu"] button.danger').disabled`);
  check('기본 편성에서 쓰는 장수(관우)는 삭제 버튼이 막혀 있다', delDisabled === true);

  // 6. 기본 편성 탭: 칸을 고치고 저장하면 presets.json이 바뀐다
  await send('Page.navigate', { url: BASE });
  await waitFor(`document.querySelectorAll('tbody tr').length > 0`, 30000, '장수 표');
  await clickButton('기본 편성');
  await sleep(300);
  const presetCount = await evalJs(`document.querySelectorAll('section.preset').length`);
  check('기본 편성 탭에 편성 카드가 나온다', presetCount === JSON.parse(originalPresets).length, `${presetCount}개`);
  const startSummary = await evalJs(`document.querySelector('section[data-preset="shuStart"] .preset-summary').textContent`);
  check('편성 카드에 구성이 나온다 (유관장: 방패병 · 보병 · 기병)', String(startSummary).includes('방패병 · 보병 · 기병'), String(startSummary));
  await shot('chars-presets');

  // 후열 첫 칸에 황충(궁병)을 넣는다
  const slotSet = await setValue('select[aria-label="shuStart 후열 1"]', 'huangZhong');
  await sleep(300);
  const after = await evalJs(`document.querySelector('section[data-preset="shuStart"] .preset-summary').textContent`);
  check('칸을 고르면 구성과 병력이 바뀌고 카드가 노랗게 표시된다', slotSet === 'ok' && String(after).includes('궁병') && (await evalJs(`document.querySelector('section[data-preset="shuStart"]').className`)).includes('changed'), String(after));
  check('저장 안 됨 요약에 편성 수정이 나온다', (await text('.badge.dirty')).includes('편성 수정 1'));

  await clickButton('저장하기');
  await waitFor(`!!document.querySelector('.message.ok')`, 8000, '저장 성공').catch(() => {});
  const saved = readPresets().find((p) => p.id === 'shuStart');
  check('저장하면 presets.json에 새 편성이 기록된다', saved.lineup.some((e) => e.characterId === 'huangZhong' && e.row === 'back'), JSON.stringify(saved.lineup.map((e) => e.characterId)));
  check('저장 메시지에 편성이 들어 있다', (await text('.message')).includes('편성 7개'));

  // 사거리 1 병종을 후열에 두면 경고, 책사를 전열에 두면 오류 (저장 불가)
  await setValue('select[aria-label="shuStart 후열 2"]', 'weiYan');
  await sleep(200);
  check('사거리 1 병종을 후열에 두면 경고가 나온다', (await text('section[data-preset="shuStart"] .preset-summary')).includes('후열에서는 공격할 수 없습니다'));
  await setValue('select[aria-label="shuStart 전열 3"]', 'zhugeLiang');
  await sleep(200);
  check('후열 전용 병종을 전열에 두면 오류로 표시된다', (await evalJs(`document.querySelector('section[data-preset="shuStart"]').className`)).includes('invalid'));
  const beforeBad = JSON.stringify(readPresets());
  await clickButton('저장하기');
  await sleep(400);
  check('오류가 있으면 편성이 저장되지 않는다', JSON.stringify(readPresets()) === beforeBad);
  const requiredDisabled = await evalJs(`document.querySelector('section[data-preset="shu"] button.danger').disabled`);
  check('기본 대결용 편성(shu)은 삭제할 수 없다', requiredDisabled === true);
  await clickButton('+ 새 편성');
  await sleep(200);
  check('새 편성을 추가하면 카드가 늘어난다', (await evalJs(`document.querySelectorAll('section.preset').length`)) === presetCount + 1);

  check('브라우저 콘솔에 오류가 없다', errors.length === 0, errors.join(' | '));
} catch (e) {
  console.log('ERROR', e.message);
  results.push({ name: '시나리오 실행', ok: false });
} finally {
  writeFileSync(CHARACTERS_FILE, original); // 시험 값을 남기지 않는다
  writeFileSync(PRESETS_FILE, originalPresets);
  proc.kill();
  const bad = results.filter((r) => !r.ok).length;
  console.log(`${results.length - bad}/${results.length} 통과 (스크린샷: ${OUT}) — characters.json과 presets.json은 원래 내용으로 되돌렸습니다`);
  process.exit(bad ? 1 : 0);
}
