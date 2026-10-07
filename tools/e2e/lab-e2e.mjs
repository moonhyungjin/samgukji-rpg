// Balance Lab을 실제 브라우저로 조작해 확인하는 스크립트. 계수/스탯/행동력 입력란이 보이고, 값을 바꾸면 저장되는지 본다.
//
//   npm run lab           # 다른 터미널에서 개발 서버를 켜 둔다 (http://localhost:5173)
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


const tabs = async (label) => evalJs(`(() => { const b = [...document.querySelectorAll('button.tab')].find(b => b.textContent.includes(${JSON.stringify(label)})); if (!b) return false; b.click(); return true; })()`);
const inputsIn = (sel) => evalJs(`document.querySelectorAll(${JSON.stringify(sel)} + ' input').length`);
try {
  const targets = await (async () => { for (let i = 0; i < 50; i++) { try { return await getJson('/json'); } catch { await sleep(200); } } throw new Error('no browser'); })();
  const page = targets.find((t) => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 300)); };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: BASE }); await sleep(1500);
  await evalJs(`localStorage.clear()`);
  await send('Page.navigate', { url: BASE }); await sleep(1500);

  await sleep(300);
  await tabs('밸런스');
  await sleep(300);
  const bal = await text('main');
  check('밸런스 탭: 행동력 → AP 설정', bal.includes('행동력 몇 마다 AP 1') && bal.includes('공격 계수'));
  await shot('lab-balance');

  await tabs('병종');
  await sleep(300);
  const data = await text('main');
  check('병종 탭: 기본 AP, 스탯 보정, 계수, 방어 무시, 버프', ['기본 AP', '스탯 보정', '계수', '방어 무시', '피해 무시 횟수', '무작위 가짓수'].every((k) => data.includes(k)), '');
  const nanData = await evalJs(`[...document.querySelectorAll('main input')].some(i => i.value === 'NaN' || i.value === '')`);
  check('병종 탭: 비어 있거나 NaN인 입력란이 없다', !nanData);
  // 계수를 실제로 바꿔 본다: 첫 번째 스킬 계수 입력란
  const changed = await evalJs(`(() => { const row = [...document.querySelectorAll('tr')].find(r => r.querySelector('td') && r.querySelector('td').textContent.trim() === '돌격'); if (!row) return 'no row'; const inp = [...row.querySelectorAll('input[type=number]')].find(i => i.value === '1.2'); if (!inp) return 'no 1.2 input: ' + [...row.querySelectorAll('input[type=number]')].map(i=>i.value).join(','); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(inp, '1.5'); inp.dispatchEvent(new Event('input', { bubbles: true })); return 'ok'; })()`);
  check('돌격 계수 입력란을 찾아 1.5로 바꾼다', changed === 'ok', String(changed));
  await sleep(300);
  const saved = await evalJs(`JSON.stringify(Object.keys(localStorage))`);
  const val = await evalJs(`(() => { const k = Object.keys(localStorage)[0]; return JSON.parse(localStorage.getItem(k)).data.skills['cavalry-charge'].power; })()`);
  check('바꾼 값이 저장된다', val === 1.5, `power ${val}`);
  await shot('lab-data');

  await tabs('캐릭터');
  await sleep(300);
  const chars = await text('main');
  check('캐릭터 탭: 행동력과 AP 열', chars.includes('행동력') && chars.includes('AP') && chars.includes('레벨'));
  const apCell = await evalJs(`(() => { const row = [...document.querySelectorAll('tr')].find(r => r.querySelector('input[value=\"장비\"]')); return row ? row.textContent : 'none'; })()`);
  check('장비의 총 AP가 표시된다', /5/.test(String(apCell)), String(apCell));
  await shot('lab-characters');
  // 장수 편집기에서 장수 파일이 바뀌면 Lab이 다음에 열 때 그 값을 쓰는지 확인한다 (끝나면 파일을 원래대로 되돌린다).
  const FILE = resolve('packages/game-data/data/characters.json');
  const originalFile = readFileSync(FILE, 'utf-8');
  try {
    const list = JSON.parse(originalFile);
    const guan = list.find((c) => c.id === 'guanYu');
    const oldAttack = guan.stats.attack;
    guan.stats.attack = oldAttack + 1;
    writeFileSync(FILE, JSON.stringify(list, null, 2) + '\n');
    await sleep(1200); // 개발 서버가 파일 변경을 읽을 시간
    await send('Page.navigate', { url: BASE });
    await waitFor(`document.querySelectorAll('button.tab').length > 0`, 30000, 'Lab 로드');
    await sleep(500);
    await tabs('캐릭터');
    await sleep(300);
    const synced = await evalJs(`(() => { const row = [...document.querySelectorAll('tr')].find(r => r.querySelector('input[value="관우"]')); if (!row) return 'no row'; const nums = [...row.querySelectorAll('input[type=number]')].map(i => i.value); return nums[0]; })()`);
    check('장수 파일의 변경이 Lab 캐릭터 탭에 반영된다', Number(synced) === oldAttack + 1, `관우 공격 ${oldAttack} → ${synced}`);
  } finally {
    writeFileSync(FILE, originalFile);
  }
  check('콘솔 오류가 없다', errors.length === 0, errors.join(' | '));
} catch (e) {
  console.log('ERROR', e.message);
} finally {
  proc.kill();
  const bad = results.filter((r) => !r.ok).length;
  console.log(`${results.length - bad}/${results.length} 통과`);
  process.exit(bad ? 1 : 0);
}
