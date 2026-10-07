// Balance Lab을 실제 브라우저로 조작해 확인하는 스크립트.
// 계수/스탯/행동력 입력, 장수/병종/기본 편성 편집, "파일에 저장"으로 packages/game-data/data/*.json이 실제로 바뀌는 것, 오류가 저장을 막는 것,
// 파일이 바뀌면 Lab 초안이 파일 값으로 갱신되는 것을 본다. 시험 중에 바뀐 데이터 파일은 끝나면(실패해도) 원래대로 되돌린다.
//
//   npm run lab           # 다른 터미널에서 개발 서버를 켜 둔다 (http://localhost:5173). 저장 API가 있는 개발 서버여야 한다
//   npm run e2e:lab       # 이 스크립트 실행. 스크린샷은 out/lab-e2e/ 에 저장된다
// 환경 변수: LAB_URL, BROWSER, E2E_OUT. 게임 화면용 game-e2e.mjs와 같은 방식(DevTools Protocol)이다.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const BASE = process.env.LAB_URL ?? 'http://localhost:5173/';
const OUT = resolve(process.env.E2E_OUT ?? 'out/lab-e2e');
const PORT = 9444;
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


const tabs = async (label) => evalJs(`(() => { const b = [...document.querySelectorAll('button.tab')].find(b => b.textContent.trim() === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true; })()`);
const setValue = (selector, value) =>
  evalJs(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return 'missing'; const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(String(value))}); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return 'ok'; })()`);

// 데이터 파일(packages/game-data/data/*.json)을 시험 전에 보관하고, 끝나면 (실패해도) 원래 내용으로 되돌린다.
const DATA_DIR = resolve('packages/game-data/data');
const DATA_NAMES = ['skills', 'traits', 'unitTypes', 'characters', 'presets', 'balance'];
const originals = Object.fromEntries(DATA_NAMES.map((n) => [n, readFileSync(join(DATA_DIR, `${n}.json`), 'utf-8')]));
const readData = (name) => JSON.parse(readFileSync(join(DATA_DIR, `${name}.json`), 'utf-8'));
const writeData = (name, value) => writeFileSync(join(DATA_DIR, `${name}.json`), JSON.stringify(value, null, 2) + '\n');
const restoreAll = () => DATA_NAMES.forEach((n) => writeFileSync(join(DATA_DIR, `${n}.json`), originals[n]));
const filesEqualOriginal = () => DATA_NAMES.every((n) => readFileSync(join(DATA_DIR, `${n}.json`), 'utf-8') === originals[n]);
const load = async () => {
  await send('Page.navigate', { url: BASE });
  // 개발 서버가 처음 요청을 컴파일하는 동안 기다린다
  await waitFor(`document.querySelectorAll('button.tab').length > 0`, 30000, 'Lab 로드');
  await sleep(500);
};
const clearStorage = () => evalJs(`(() => { localStorage.clear(); sessionStorage.clear(); return true; })()`);

try {
  const targets = await (async () => { for (let i = 0; i < 50; i++) { try { return await getJson('/json'); } catch { await sleep(200); } } throw new Error('no browser'); })();
  const page = targets.find((t) => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 300)); };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: BASE });
  await waitFor(`document.querySelectorAll('button.tab').length > 0`, 30000, 'Lab 로드');
  await clearStorage();
  await load();

  // ---- 1. 기존 화면 ----
  await tabs('밸런스 수치');
  await sleep(300);
  const bal = await text('main');
  check('밸런스 탭: 행동력 → AP 설정', bal.includes('행동력 몇 마다 AP 1') && bal.includes('공격 계수'));

  await tabs('병종 · 특성 · 스킬');
  await sleep(300);
  const data = await text('main');
  check('병종 탭: 병종 카드, 스킬 표(계수, 방어 무시, 버프)', ['기본 AP', '사거리', '받는 피해 배수', '반격 비율', '가드로 막힘', '방어 무시', '피해 무시 횟수', '무작위 가짓수'].every((k) => data.includes(k)));
  check('병종 탭: 비어 있거나 NaN인 입력란이 없다', !(await evalJs(`[...document.querySelectorAll('main input[type=number]')].some(i => i.value === 'NaN' || i.value === '')`)));
  await shot('lab-unittypes');

  // 스킬 계수 입력란
  const changed = await evalJs(`(() => { const row = [...document.querySelectorAll('tr')].find(r => r.querySelector('td') && r.querySelector('td').textContent.trim() === '돌격'); if (!row) return 'no row'; const inp = [...row.querySelectorAll('input[type=number]')].find(i => i.value === '1.2'); if (!inp) return 'no 1.2 input: ' + [...row.querySelectorAll('input[type=number]')].map(i=>i.value).join(','); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(inp, '1.5'); inp.dispatchEvent(new Event('input', { bubbles: true })); return 'ok'; })()`);
  check('돌격 계수 입력란을 찾아 1.5로 바꾼다', changed === 'ok', String(changed));
  await sleep(300);
  check('저장 줄에 "저장 안 됨 (스킬)"이 뜬다', (await text('.savebar .badge')).includes('저장 안 됨 (스킬)'), (await text('.savebar .badge')).trim());

  // ---- 2. 파일에 저장: 스킬 ----
  const skillBefore = readData('skills').find((s) => s.id === 'cavalry-charge').power;
  await clickButton('파일에 저장');
  await waitFor(`!!document.querySelector('.savemsg.ok') || document.querySelectorAll('button.tab').length === 0`, 8000, '저장').catch(() => {});
  await sleep(1500); // 저장하면 개발 서버가 페이지를 새로고침한다
  await waitFor(`document.querySelectorAll('button.tab').length > 0`, 30000, '새로고침 뒤 Lab');
  check('스킬 계수를 저장하면 skills.json이 바뀐다', readData('skills').find((s) => s.id === 'cavalry-charge').power === 1.5, `${skillBefore} → ${readData('skills').find((s) => s.id === 'cavalry-charge').power}`);
  check('저장 뒤 페이지가 새로고침되고 안내 문구가 남는다', (await text('.savemsg')).includes('스킬'), (await text('.savemsg')).trim().slice(0, 50));
  check('새로고침 뒤 "프로젝트 파일과 같음"이다', (await text('.savebar .badge')).includes('프로젝트 파일과 같음'));
  writeData('skills', JSON.parse(originals.skills)); // 스킬 변경은 여기서 되돌린다
  await sleep(1500);
  await load();

  // ---- 3. 장수 탭: 계산값, 수정, 저장 ----
  await tabs('장수');
  await sleep(300);
  const rows = await evalJs(`document.querySelectorAll('section.ed tbody tr').length`);
  check('장수 탭에 장수 표가 나온다', rows === JSON.parse(originals.characters).length, `${rows}줄`);
  check('병종 보정을 반영한 실제 스탯과 총 AP가 나온다 (장비: 7 / 9 / 4 / 4, AP 5)', /7 \/ 9 \/ 4 \/ 4/.test(await evalJs(`document.querySelector('tr[data-id="zhangFei"]').textContent`)));
  await shot('lab-characters');

  const guanBefore = readData('characters').find((c) => c.id === 'guanYu').stats.attack;
  await setValue('input[aria-label="guanYu 공격"]', guanBefore + 1);
  await sleep(300);
  const rowClass = await evalJs(`document.querySelector('tr[data-id="guanYu"]').className`);
  const badgeText = (await text('.savebar .badge')).trim();
  check('장수를 고치면 줄이 노랗게 표시되고 저장 줄이 "장수"를 알려 준다', rowClass === 'changed' && badgeText.includes('저장 안 됨 (장수)'), `줄 "${rowClass}", 표시 "${badgeText}"`);

  // 범위 밖 값은 저장할 수 없다
  await setValue('input[aria-label="guanYu 공격"]', 99);
  await sleep(300);
  check('범위 밖 스탯은 오류로 표시된다', (await text('.saveissues')).includes('범위'));
  await clickButton('파일에 저장');
  await sleep(500);
  check('오류가 있으면 저장되지 않고 파일은 그대로다', readData('characters').find((c) => c.id === 'guanYu').stats.attack === guanBefore && (await text('.savemsg')).includes('고쳐야 저장'));

  await setValue('input[aria-label="guanYu 공격"]', guanBefore + 1);
  await sleep(300);
  await clickButton('파일에 저장');
  await sleep(2500);
  await waitFor(`document.querySelectorAll('button.tab').length > 0`, 30000, '새로고침 뒤 Lab');
  check('장수를 저장하면 characters.json에 기록된다', readData('characters').find((c) => c.id === 'guanYu').stats.attack === guanBefore + 1, `${guanBefore} → ${readData('characters').find((c) => c.id === 'guanYu').stats.attack}`);
  await tabs('장수');
  await sleep(300);
  check('새로고침 뒤에도 저장된 값이 보인다', (await evalJs(`document.querySelector('input[aria-label="guanYu 공격"]').value`)) === String(guanBefore + 1));
  check('기본 편성에서 쓰는 장수(관우)는 삭제할 수 없다', (await evalJs(`document.querySelector('tr[data-id="guanYu"] button.danger').disabled`)) === true);

  // 검색, 새 장수, 파일 값으로 되돌리기
  await setValue('input[aria-label="검색"]', '관우');
  await sleep(200);
  check('검색으로 줄을 걸러낸다', (await evalJs(`document.querySelectorAll('section.ed tbody tr').length`)) === 1);
  await setValue('input[aria-label="검색"]', '');
  await clickButton('+ 새 장수');
  await sleep(200);
  check('새 장수를 추가하면 줄이 늘고 초록으로 표시된다', (await evalJs(`document.querySelectorAll('tr.added').length`)) === 1);
  await clickButton('파일 값으로 되돌리기');
  await sleep(300);
  check('"파일 값으로 되돌리기"가 초안을 지운다', (await evalJs(`document.querySelectorAll('tr.added').length`)) === 0 && (await text('.savebar .badge')).includes('프로젝트 파일과 같음'));
  writeData('characters', JSON.parse(originals.characters));
  await sleep(1500);
  await load();

  // ---- 4. 병종 카드: 수정 → 저장 → 장수 탭의 계산값이 따라 바뀐다 ----
  await tabs('병종 · 특성 · 스킬');
  await sleep(300);
  const cavBefore = readData('unitTypes').find((u) => u.id === 'cavalry').troopScale;
  await setValue('input[aria-label="cavalry 병력 배율"]', 0.9);
  await sleep(300);
  check('병력 배율을 고치면 카드의 병력 요약이 바뀐다 (800 → 900)', (await text('section[data-unittype="cavalry"] .badge')).includes('병력 900'));
  await tabs('장수');
  await sleep(300);
  check('장수 탭의 관우 병력이 새 배율을 바로 반영한다 (저장 전, 900)', String(await evalJs(`document.querySelector('tr[data-id="guanYu"]').textContent`)).includes('900'));
  await tabs('병종 · 특성 · 스킬');
  await sleep(200);
  await setValue('input[aria-label="cavalry 사거리"]', 0);
  await sleep(300);
  check('사거리 0은 오류로 표시되고 저장되지 않는다', (await text('.saveissues')).includes('사거리'));
  await setValue('input[aria-label="cavalry 사거리"]', 1);
  await sleep(300);
  check('장수가 쓰는 병종(기병)은 삭제할 수 없다', (await evalJs(`document.querySelector('section[data-unittype="cavalry"] button.danger').disabled`)) === true);
  await clickButton('파일에 저장');
  await sleep(2500);
  await waitFor(`document.querySelectorAll('button.tab').length > 0`, 30000, '새로고침 뒤 Lab');
  check('병종을 저장하면 unitTypes.json에 기록된다', readData('unitTypes').find((u) => u.id === 'cavalry').troopScale === 0.9, `${cavBefore} → ${readData('unitTypes').find((u) => u.id === 'cavalry').troopScale}`);
  writeData('unitTypes', JSON.parse(originals.unitTypes));
  await sleep(1500);
  await load();

  // ---- 5. 기본 편성 탭 ----
  await tabs('기본 편성');
  await sleep(300);
  check('기본 편성 탭에 편성 카드가 나온다', (await evalJs(`document.querySelectorAll('section.preset').length`)) === JSON.parse(originals.presets).length);
  check('편성 카드에 구성이 나온다 (유관장: 방패병 · 보병 · 기병)', (await text('section[data-preset="shuStart"] .preset-summary')).includes('방패병 · 보병 · 기병'));
  await shot('lab-presets');
  await setValue('select[aria-label="shuStart 후열 1"]', 'huangZhong');
  await sleep(300);
  check('칸을 고르면 구성이 바뀌고 카드가 노랗게 표시된다', (await text('section[data-preset="shuStart"] .preset-summary')).includes('궁병') && (await evalJs(`document.querySelector('section[data-preset="shuStart"]').className`)).includes('changed'));
  check('기본 대결용 편성(shu)은 삭제할 수 없다', (await evalJs(`document.querySelector('section[data-preset="shu"] button.danger').disabled`)) === true);
  // 시뮬레이션 탭의 편성 버튼도 같은 목록을 따른다
  await clickButton('+ 새 편성');
  await sleep(200);
  check('빈 새 편성은 오류로 표시되고 저장되지 않는다', (await text('.saveissues')).includes('군단이 하나도 없습니다'));
  await setValue('select[aria-label="preset1 전열 1"]', 'weiYan');
  await sleep(300);
  check('새 편성에 장수를 넣으면 오류가 사라진다', !(await text('.saveissues')).includes('군단이 하나도 없습니다'));
  await tabs('전투 1회');
  await sleep(300);
  check('전투 1회 탭의 편성 버튼이 작업 중인 편성 목록을 따른다 (새 편성 포함)', (await evalJs(`[...document.querySelectorAll('.presets button')].some(b => b.textContent.includes('새 편성'))`)) === true);
  await tabs('기본 편성');
  await sleep(200);
  await clickButton('파일에 저장');
  await sleep(2500);
  await waitFor(`document.querySelectorAll('button.tab').length > 0`, 30000, '새로고침 뒤 Lab');
  const presetsSaved = readData('presets');
  check('편성을 저장하면 presets.json에 기록된다', presetsSaved.length === JSON.parse(originals.presets).length + 1 && presetsSaved.find((p) => p.id === 'shuStart').lineup.some((e) => e.characterId === 'huangZhong' && e.row === 'back'));
  writeData('presets', JSON.parse(originals.presets));
  await sleep(1500);
  await load();

  // ---- 6. 외부에서 파일이 바뀌면 Lab 초안은 버려지고 파일 값으로 시작한다 ----
  await tabs('장수');
  await sleep(200);
  await setValue('input[aria-label="guanYu 방어"]', 1); // 저장하지 않은 초안
  await sleep(300);
  const edited = readData('characters');
  edited.find((c) => c.id === 'guanYu').stats.attack += 2;
  writeData('characters', edited); // 다른 곳(git, 직접 수정)에서 파일이 바뀐 상황
  await sleep(1500);
  await load();
  await tabs('장수');
  await sleep(300);
  check('파일이 바뀌면 저장하지 않은 초안은 버리고 파일 값으로 시작한다', (await evalJs(`document.querySelector('input[aria-label="guanYu 방어"]').value`)) === String(JSON.parse(originals.characters).find((c) => c.id === 'guanYu').stats.defense), '방어는 원래 값');
  check('바뀐 파일의 값이 화면에 반영된다', (await evalJs(`document.querySelector('input[aria-label="guanYu 공격"]').value`)) === String(edited.find((c) => c.id === 'guanYu').stats.attack));
  restoreAll();
  await sleep(1500);

  check('브라우저 콘솔에 오류가 없다', errors.length === 0, errors.join(' | '));
} catch (e) {
  console.log('ERROR', e.message);
  results.push({ name: '시나리오 실행', ok: false });
} finally {
  restoreAll(); // 시험 값을 남기지 않는다
  proc.kill();
  const bad = results.filter((r) => !r.ok).length;
  console.log(`${results.length - bad}/${results.length} 통과 (스크린샷: ${OUT}) — 데이터 파일은 원래 내용으로 되돌렸습니다 (${filesEqualOriginal() ? '확인됨' : '확인 실패'})`);
  process.exit(bad ? 1 : 0);
}
