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
// 구간 선택: LAB_E2E_SECTION=screens,art 처럼 쉼표로 고른다. 없으면 전부. 구간은 tools/qa/rules.mjs의 표와 같다.
//   screens(탭 훑기 + 스킬 저장) · art(에셋 검수 + Viewer) · characters(장수) · unittypes(병종 카드) · presets(기본 편성) · external(외부 변경)
const ONLY = (process.env.LAB_E2E_SECTION ?? '').split(',').filter(Boolean);
const on = (name) => ONLY.length === 0 || ONLY.includes(name);
const errors = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok && process.env.E2E_FAIL_FAST) throw new Error(`첫 실패에서 멈춤: ${name}`);
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
const shot = async (name, full = false) => {
  const r = await send('Page.captureScreenshot', { format: 'png', ...(full ? { captureBeyondViewport: true } : {}) });
  // 파일은 남기지 않아도(E2E_NO_SHOTS) 캡처는 한다: 화면을 그리는 일이 포커스/호버 같은 상태를 만들어, 일부 검사가 그 상태에 기댄다
  if (!process.env.E2E_NO_SHOTS) writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.data, 'base64'));
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


const clickTab = (label) => evalJs(`(() => { const b = [...document.querySelectorAll('button.tab')].find(b => b.textContent.trim() === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true; })()`);
// 설정 비교, 전투 1회, 피해 계산기는 시뮬레이션 탭 안의 하위 탭이다. 보이지 않으면 시뮬레이션 탭을 먼저 연다
const tabs = async (label) => {
  if (await clickTab(label)) return true;
  // 탭은 분류 안에 있다: 보이지 않으면 분류를 하나씩 열어 찾는다
  const categories = await evalJs(`[...document.querySelectorAll('button.tab.cat')].map(b => b.textContent.trim())`);
  for (const category of categories) {
    await clickTab(category);
    await sleep(150);
    if (await clickTab(label)) return true;
  }
  return false;
};
/** 라벨 글자로 찾은 입력칸/선택칸의 값을 바꾼다 (Lab의 NumberField/SelectField에는 aria-label이 없다) */
const setByLabel = (label, value) =>
  evalJs(`(() => { const l = [...document.querySelectorAll('main label.field')].find(l => l.querySelector('span')?.textContent.trim() === ${JSON.stringify(label)}); const el = l?.querySelector('input, select'); if (!el) return 'missing'; const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(String(value))}); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return 'ok'; })()`);
const valueByLabel = (label) => evalJs(`[...document.querySelectorAll('main label.field')].find(l => l.querySelector('span')?.textContent.trim() === ${JSON.stringify(label)})?.querySelector('input, select')?.value ?? null`);
/** 병종 탭에서 계열 탭과 트리 노드를 눌러 병종을 고른다 (카드는 선택한 병종 하나만 그린다) */
const selectUnit = async (rootId, id = rootId) => {
  await evalJs(`document.querySelector('button.family-tab[data-root="${rootId}"]')?.click()`);
  await sleep(150);
  await evalJs(`document.querySelector('button.tree-node[data-node="${id}"]')?.click()`);
  await sleep(200);
};
const setValue = (selector, value) =>
  evalJs(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return 'missing'; const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(String(value))}); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return 'ok'; })()`);

// 데이터 파일(packages/game-data/data/*.json)을 시험 전에 보관하고, 끝나면 (실패해도) 원래 내용으로 되돌린다.
const DATA_DIR = resolve('packages/game-data/data');
const DATA_NAMES = ['skills', 'traits', 'unitTypes', 'characters', 'presets', 'balance', 'campaign', 'map'];
const originals = Object.fromEntries(DATA_NAMES.map((n) => [n, readFileSync(join(DATA_DIR, `${n}.json`), 'utf-8')]));
const CHANGELOG = join(DATA_DIR, 'changelog.md');
const originalChangelog = existsSync(CHANGELOG) ? readFileSync(CHANGELOG, 'utf-8') : null;
const restoreChangelog = () => (originalChangelog === null ? rmSync(CHANGELOG, { force: true }) : writeFileSync(CHANGELOG, originalChangelog));
const readChangelog = () => (existsSync(CHANGELOG) ? readFileSync(CHANGELOG, 'utf-8') : '');
const readData = (name) => JSON.parse(readFileSync(join(DATA_DIR, `${name}.json`), 'utf-8'));
const writeData = (name, value) => writeFileSync(join(DATA_DIR, `${name}.json`), JSON.stringify(value, null, 2) + '\n');
// 에셋 검수 시험이 만드는 파일: 검수 결과(review.json)와 임시 그림 폴더
const REVIEW = resolve('docs/art/review.json');
const originalReview = existsSync(REVIEW) ? readFileSync(REVIEW, 'utf-8') : null;
const ART_TMP = resolve('docs/art/_e2e-tmp');
const restoreArt = () => {
  rmSync(ART_TMP, { recursive: true, force: true });
  if (originalReview === null) rmSync(REVIEW, { force: true });
  else writeFileSync(REVIEW, originalReview);
};
const restoreAll = () => {
  DATA_NAMES.forEach((n) => writeFileSync(join(DATA_DIR, `${n}.json`), originals[n]));
  restoreChangelog();
  restoreArt();
};
const filesEqualOriginal = () =>
  DATA_NAMES.every((n) => readFileSync(join(DATA_DIR, `${n}.json`), 'utf-8') === originals[n]) && readChangelog() === (originalChangelog ?? '');
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
  if (on('screens')) {
  await tabs('밸런스');
  await sleep(300);
  const bal = await text('main');
  check('밸런스 탭: 행동력 → AP 설정', bal.includes('행동력 몇 마다 AP 1'));
  check('밸런스 탭: 지금 값이 들어간 피해 공식이 식으로 나온다', bal.includes('지금 피해 공식') && bal.includes('최종 피해') && bal.includes('병력 보정'));
  check('밸런스 탭: 공식 실험대(①②③ 단계)와 병력 보정 게이지가 나온다', bal.includes('① 기본값') && bal.includes('③ 최종 피해') && (await evalJs(`document.querySelectorAll('svg.gauge-chart path.curve').length`)) === 2);
  await shot('lab-balance', true);
  // 실험대: 게이지를 끌면 병력 보정과 피해가 바뀌고, 실험값은 저장 대상이 아니다
  const finalDamage = () => evalJs(`document.querySelector('.formula-explorer .chip.out.big .num').textContent`);
  const gaugeReadout = () => evalJs(`document.querySelector('.formula-explorer .gauge-readout').textContent`);
  const damage0 = await finalDamage();
  const readout0 = await gaugeReadout();
  const troops0 = Number(await evalJs(`document.querySelector('input[aria-label="공격 쪽 병력 게이지"]').value`));
  await setValue('input[aria-label="공격 쪽 병력 게이지"]', Math.round(troops0 / 4));
  await sleep(200);
  const damageDragged = await finalDamage();
  const readoutDragged = await gaugeReadout();
  check('실험대: 공격 쪽 병력 게이지를 끌면 병력 보정과 최종 피해가 바뀐다', damageDragged !== damage0 && readoutDragged !== readout0, `${damage0} → ${damageDragged}`);
  await evalJs(`[...document.querySelectorAll('.formula-explorer .troop-gauge button')].find(b => b.textContent === '가득').click()`);
  await sleep(200);
  check('실험대: "가득"을 누르면 처음 피해로 돌아온다', (await finalDamage()) === damage0);
  const power0 = Number(await evalJs(`document.querySelector('input[aria-label^="실험 스킬 계수"][type=range]').value`));
  await setValue('input[aria-label^="실험 스킬 계수"][type=range]', power0 * 2);
  await sleep(200);
  const damagePower = Number((await finalDamage()).replace(/,/g, ''));
  check('실험대: 스킬 계수 슬라이더를 두 배로 하면 피해가 약 두 배가 되고, 저장 대상이 아니다', Math.abs(damagePower / Number(damage0.replace(/,/g, '')) - 2) < 0.05 && (await text('.savebar .badge')).includes('프로젝트 파일과 같음'), `${damage0} → ${damagePower}`);
  await evalJs(`[...document.querySelectorAll('.formula-explorer button')].find(b => b.textContent === '병종 값으로 되돌리기').click()`);
  await sleep(200);
  // 노란 칸(공식 계수)은 실제 밸런스 값이다
  const coefBefore = await evalJs(`document.querySelector('.formula-explorer .chip.coef input').value`);
  await setValue('.formula-explorer .chip.coef input', Number(coefBefore) + 5);
  await sleep(300);
  const coefBadge = (await text('.savebar .badge')).trim();
  const damageCoef = await finalDamage();
  await setValue('.formula-explorer .chip.coef input', coefBefore);
  await sleep(300);
  check('실험대: 노란 칸(공식 계수)을 고치면 피해가 바뀌고 저장 대상이 된다, 되돌리면 같음', damageCoef !== damage0 && coefBadge.includes('저장 안 됨') && (await finalDamage()) === damage0, `${coefBadge}, ${damage0} → ${damageCoef}`);
  // 피해 공식을 고르면 그 공식의 칸만 나온다 (확인 뒤 원래 공식으로 되돌린다)
  const formulaBefore = await valueByLabel('피해 공식');
  await setByLabel('피해 공식', 'divide');
  await sleep(200);
  const divideText = await text('main');
  await setByLabel('피해 공식', 'additive');
  await sleep(200);
  const additiveText = await text('main');
  await setByLabel('피해 공식', formulaBefore);
  await sleep(200);
  check('밸런스 탭: 피해 공식을 고르면 그 공식의 칸만 나온다', divideText.includes('방어 계수 (defenseScale)') && !divideText.includes('방어 1당 빼기') && additiveText.includes('방어 1당 빼기') && !additiveText.includes('방어 계수 (defenseScale)'), `원래 ${formulaBefore}`);
  // 병력 칸을 고치면 병력 패널의 게이지가 바로 바뀐다
  const previewRow = () => evalJs(`document.querySelector('.troop-preview .troop-gauge').textContent`);
  const rowBefore = await previewRow();
  const baseBefore = await valueByLabel('Lv1 최대 병력 (모든 병종)');
  await setByLabel('Lv1 최대 병력 (모든 병종)', Number(baseBefore) * 2);
  await sleep(200);
  const rowAfter = await previewRow();
  await setByLabel('Lv1 최대 병력 (모든 병종)', baseBefore);
  await sleep(200);
  check('밸런스 탭: 병력 값을 고치면 병력 패널의 게이지가 바로 바뀐다', rowBefore !== rowAfter && (await previewRow()) === rowBefore, `${rowBefore} → ${rowAfter}`);
  const debuffPanel = await text('section[data-panel="debuffs"]');
  const balanceDebuffs = readData('balance').debuffs ?? {};
  check('밸런스 탭: 디버프 패널에 디버프마다 고정값·비율·지속과 거는 스킬이 나온다', Object.values(balanceDebuffs).every((d) => debuffPanel.includes(d.name)) && debuffPanel.includes('고정값') && debuffPanel.includes('지속 (라운드)') && debuffPanel.includes('이 디버프를 거는 스킬'), Object.keys(balanceDebuffs).join(','));
  check('밸런스 탭: 되돌리면 "프로젝트 파일과 같음"', (await text('.savebar .badge')).includes('프로젝트 파일과 같음'), (await text('.savebar .badge')).trim());

  await tabs('피해 계산기');
  await sleep(300);
  const calcText = await text('main');
  check('피해 계산기 탭: 값의 출처 표와 계산 과정이 나온다', ['공식에 들어가는 값과 출처', '병종 보정', '대상 취약', '수정하러 가기', '계산 과정', '최종 피해'].every((k) => calcText.includes(k)));
  await shot('lab-calc', true);

  await tabs('병종 상성표');
  await sleep(300);
  const muInfo = await evalJs(`JSON.stringify({ rows: document.querySelectorAll('table.matchup-table tbody tr').length, cols: document.querySelectorAll('table.matchup-table thead th').length - 1 })`).then(JSON.parse);
  const unitList = readData('unitTypes');
  const roots = unitList.filter((u) => !unitList.some((p) => p.id !== u.id && p.promotesTo.includes(u.id))).length;
  check(`병종 상성표 탭: 기본 병종 ${roots} × ${roots} 표가 나온다`, muInfo.rows === roots && muInfo.cols === roots, JSON.stringify(muInfo));
  const shieldCell = () => evalJs(`[...document.querySelectorAll('table.matchup-table tbody tr')][0].querySelectorAll('td')[1].querySelector('.num').textContent`).then(Number);
  const plainShield = await shieldCell();
  await evalJs(`document.querySelector('input[aria-label="상성표 가드 중"]').click()`);
  await sleep(200);
  check('병종 상성표: 가드 중을 켜면 방패병이 받는 피해가 줄어든다', (await shieldCell()) < plainShield, `${plainShield} → ${await shieldCell()}`);
  await evalJs(`document.querySelector('input[aria-label="상성표 가드 중"]').click()`);
  await shot('lab-matchup', true);

  await tabs('설정 비교');
  await sleep(300);
  await setValue('input[aria-label="설정 이름"]', 'e2e 설정');
  await clickButton('지금 작업 값을 설정으로 저장');
  await sleep(300);
  const picks = await evalJs(`JSON.stringify([...document.querySelectorAll('table.compare-pick tbody tr')].map(r => [r.children[1].textContent, r.querySelector('input').checked, r.children[3].textContent]))`).then(JSON.parse);
  check('설정 비교: 저장한 설정이 목록에 생기고 비교에 들어간다 (지금 값과 같음)', picks.length === 3 && picks[2][0] === 'e2e 설정' && picks.every((p) => p[1]) && picks[2][2] === '같음', JSON.stringify(picks));
  await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('1,000회씩 실행')).click()`);
  await waitFor(`!!document.querySelector('table.compare-table')`, 60000, '설정 비교 실행');
  const cmp = await evalJs(`JSON.stringify({ cols: document.querySelectorAll('table.compare-table thead th').length - 1, rows: document.querySelectorAll('table.compare-table tbody td.compare-label').length, deltas: document.querySelectorAll('table.compare-table .delta').length })`).then(JSON.parse);
  check('설정 비교: 같은 값 세 벌을 같은 시드로 돌리면 결과가 같다 (차이 표시 없음)', cmp.cols === 3 && cmp.rows > 10 && cmp.deltas === 0, JSON.stringify(cmp));
  await shot('lab-compare', true);
  await evalJs(`window.confirm = () => true; [...document.querySelectorAll('table.compare-pick button')].find(b => b.textContent === '지우기').click()`);
  await sleep(200);
  check('설정 비교: 저장한 설정을 지울 수 있다', (await evalJs(`document.querySelectorAll('table.compare-pick tbody tr').length`)) === 2);

  // 전투 1회: 피해 줄의 "계산"을 누르면 그 순간의 계산 과정이 펼쳐진다
  await tabs('전투 1회');
  await sleep(200);
  await clickButton('전투 1회 실행');
  await waitFor(`document.querySelectorAll('.log .log-calc').length > 0`, 20000, '전투 1회 로그');
  await evalJs(`document.querySelector('.log .log-calc').click()`);
  await sleep(200);
  const hitText = await text('.log .hit-explain');
  check('전투 1회: 피해 줄의 "계산"을 누르면 실제 피해와 다시 계산한 과정이 나온다', hitText.includes('실제 피해') && hitText.includes('다시 계산') && hitText.includes('최종 피해'), hitText.slice(0, 80));
  await shot('lab-battle-hit', true);

  // 캠페인 탭: 돌려 보면 전투별 결과와 한 번 따라가 보기가 나오고, 값을 고치면 저장 대상이 된다
  await tabs('캠페인');
  await sleep(200);
  await clickButton('캠페인 돌려 보기');
  await waitFor(`!!document.querySelector('table[aria-label="캠페인 전투별 결과"]')`, 30000, '캠페인 돌려 보기');
  const campaignBattles = readData('campaign').battles.length;
  const campRows = await evalJs(`document.querySelectorAll('table[aria-label="캠페인 전투별 결과"] tbody tr').length`);
  const campLog = await evalJs(`document.querySelectorAll('.campaign-log li').length`);
  check('캠페인 탭: 돌려 보면 전투별 결과와 한 번 따라가 보기가 나온다', campRows === campaignBattles && campLog >= 1, `전투 ${campRows}/${campaignBattles}, 기록 ${campLog}줄`);
  await shot('lab-campaign', true);
  const goldBefore = await valueByLabel('시작 자금');
  await setByLabel('시작 자금', Number(goldBefore) + 100);
  await sleep(300);
  const campBadge = (await text('.savebar .badge')).trim();
  await setByLabel('시작 자금', goldBefore);
  await sleep(300);
  check('캠페인 탭: 값을 고치면 "저장 안 됨 (캠페인)", 되돌리면 같음', campBadge.includes('캠페인') && (await text('.savebar .badge')).includes('프로젝트 파일과 같음'), campBadge);
  // 지도 탭: 지역을 누르면 그 지역을 고치고, 맞닿음은 양쪽에 함께 바뀐다
  await tabs('지도');
  await sleep(200);
  const mapData = readData('map');
  const nodes = await evalJs(`document.querySelectorAll('svg.map-preview g.map-node').length`);
  const second = mapData.regions[1];
  await evalJs(`document.querySelector('g.map-node[data-region="${second.id}"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  await sleep(200);
  const editing = await evalJs(`document.querySelector('[data-region-editor]')?.getAttribute('data-region-editor')`);
  const other = mapData.regions.find((r) => r.id !== second.id && !second.neighbors.includes(r.id));
  let symmetric = 'skip';
  if (other) {
    await evalJs(`document.querySelector('input[aria-label="${second.name}-${other.name} 맞닿음"]').click()`);
    await sleep(200);
    await evalJs(`document.querySelector('g.map-node[data-region="${other.id}"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
    await sleep(200);
    symmetric = String(await evalJs(`document.querySelector('input[aria-label="${other.name}-${second.name} 맞닿음"]').checked`));
  }
  const mapBadge = (await text('.savebar .badge')).trim();
  await clickButton('파일 값으로 되돌리기');
  await sleep(300);
  check('지도 탭: 지역 수만큼 그려지고, 누르면 그 지역을 고치며, 맞닿음은 양쪽에 함께 바뀌고 저장 대상이 된다', nodes === mapData.regions.length && editing === second.id && symmetric !== 'false' && mapBadge.includes('지도') && (await text('.savebar .badge')).includes('프로젝트 파일과 같음'), `${nodes}개, 편집 ${editing}, 양쪽 ${symmetric}, ${mapBadge}`);
  await shot('lab-map', true);
  await tabs('캠페인');
  await sleep(200);

  // 시작 장수 레벨: 장수마다 칸이 있고, 넣으면 저장 대상, 비우면 다시 같음
  const levelInputs = await evalJs(`document.querySelectorAll('input[aria-label$=" 시작 레벨"]').length`);
  const startCount = (JSON.parse(originals.presets).find((p) => p.id === readData('campaign').startPreset)?.lineup ?? []).length;
  await setValue('input[aria-label$=" 시작 레벨"]', 5);
  await sleep(300);
  const levelBadge = (await text('.savebar .badge')).trim();
  await setValue('input[aria-label$=" 시작 레벨"]', '');
  await sleep(300);
  check('캠페인 탭: 시작 편성의 장수마다 시작 레벨 칸이 있고, 넣으면 저장 대상, 비우면 같음', levelInputs === startCount && levelBadge.includes('캠페인') && (await text('.savebar .badge')).includes('프로젝트 파일과 같음'), `${levelInputs}/${startCount}칸, ${levelBadge}`);

  await tabs('피해 계산기');
  await sleep(300);
  // "수정하러 가기"를 누르면 병종 · 스킬 탭으로 이동한다
  await evalJs(`[...document.querySelectorAll('button.goto')].find((b) => b.closest('tr').textContent.includes('병종 보정')).click()`);
  await sleep(500);
  check('수정하러 가기: 병종 · 스킬 탭의 해당 병종 카드로 이동한다', (await evalJs(`document.querySelector('button.tab.sub.active').textContent`)) === '병종 · 스킬' && !!(await evalJs(`document.querySelector('[data-unittype].flash') ? true : false`)));

  await tabs('병종 · 스킬');
  await sleep(300);
  const data = await text('main');
  check('병종 탭: 병종 카드, 스킬 표(계수, 방어 무시, 버프)', ['기본 AP', '사거리', '받는 물리', '반격 유발', '가드로 막힘', '방어 무시', '피해 무시 횟수', '가짓수 최소'].every((k) => data.includes(k)));
  check('병종 탭: 비어 있거나 NaN인 입력란이 없다', !(await evalJs(`[...document.querySelectorAll('main input[type=number]')].some(i => i.value === 'NaN' || i.value === '')`)));
  const treeInfo = await evalJs(`JSON.stringify({ tabs: document.querySelectorAll('button.family-tab').length, nodes: [...document.querySelectorAll('button.tree-node')].map(n => n.dataset.node) })`);
  // 바로 앞의 "수정하러 가기"가 고른 병종의 계열이 열려 있다 (승급 갈래가 아직 없는 군주 계열이면 1종)
  check('병종 탭: 계열 탭(7 + 군주)과 승급 트리가 나온다', JSON.parse(treeInfo).tabs === 8 && JSON.parse(treeInfo).nodes.length >= 1, treeInfo);
  await selectUnit('cavalry', 'heavy-cavalry');
  check('트리에서 중기병을 누르면 그 병종 카드가 나온다 (스킬도 카드 안에 있다)', (await evalJs(`!!document.querySelector('section[data-unittype="heavy-cavalry"] [data-skills-of="heavy-cavalry"] table.skill-table')`)) === true && !(await evalJs(`!!document.querySelector('section[data-unittype="cavalry"]')`)));
  // 스킬 표 머리글을 누르면 정렬된다: 계수 오름차순 → 내림차순 → 원래 순서
  const powers = () => evalJs(`JSON.stringify([...document.querySelectorAll('section.all-skills tbody tr')].map(r => Number(r.querySelectorAll('input[type=number]')[0].value)))`).then(JSON.parse);
  const clickSort = (key) => evalJs(`document.querySelector('section.all-skills [data-sort="${key}"]').click()`);
  const original = await powers();
  await clickSort('power'); await sleep(150);
  const asc = await powers();
  await clickSort('power'); await sleep(150);
  const desc = await powers();
  await clickSort('power'); await sleep(150);
  const back = await powers();
  check('스킬 표: 머리글(계수)을 누르면 오름차순, 다시 누르면 내림차순, 세 번째는 원래 순서', asc.every((v, k) => k === 0 || asc[k - 1] <= v) && desc.every((v, k) => k === 0 || desc[k - 1] >= v) && JSON.stringify(back) === JSON.stringify(original) && asc.length > 20, `${asc.length}줄`);
  check('혼자 쓰는 스킬은 카드에 "이 병종만 쓰는 스킬"이라고 나온다', (await text('[data-skills-of="heavy-cavalry"]')).includes('이 병종만 쓰는 스킬입니다'));
  // 디버프 칸: 데이터에 디버프가 있는 스킬은 그 디버프가 골라져 있다
  const skillWithDebuff = readData('skills').find((s) => s.debuff);
  if (skillWithDebuff) {
    const selected = await evalJs(`document.querySelector('section.all-skills select[aria-label="${skillWithDebuff.id} 디버프"]')?.value ?? null`);
    check(`스킬 표: 디버프 칸에 ${skillWithDebuff.name}의 디버프(${skillWithDebuff.debuff.id})가 골라져 있다`, selected === skillWithDebuff.debuff.id, String(selected));
  }
  await selectUnit('infantry');
  await evalJs('window.scrollTo(0, 0)'); await shot('lab-unittypes', true);

  // 스킬 계수 입력란 (값은 Lab에서 계속 바뀌므로 지금 값에서 출발한다)
  const chargeBefore = readData('skills').find((s) => s.id === 'cavalry-charge').power;
  const chargeAfter = Math.round((chargeBefore + 0.25) * 100) / 100;
  const changed = await evalJs(`(() => { const row = [...document.querySelectorAll('tr')].find(r => r.querySelector('td') && r.querySelector('td').textContent.trim() === '돌격'); if (!row) return 'no row'; const inp = [...row.querySelectorAll('input[type=number]')].find(i => i.value === '${chargeBefore}'); if (!inp) return 'no ${chargeBefore} input: ' + [...row.querySelectorAll('input[type=number]')].map(i=>i.value).join(','); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(inp, '${chargeAfter}'); inp.dispatchEvent(new Event('input', { bubbles: true })); return 'ok'; })()`);
  check(`돌격 계수 입력란을 찾아 ${chargeAfter}로 바꾼다`, changed === 'ok', String(changed));
  await sleep(300);
  check('저장 줄에 "저장 안 됨 (스킬)"이 뜬다', (await text('.savebar .badge')).includes('저장 안 됨 (스킬)'), (await text('.savebar .badge')).trim());

  // ---- 2. 파일에 저장: 스킬 ----
  const skillBefore = readData('skills').find((s) => s.id === 'cavalry-charge').power;
  await setValue('input[aria-label="변경 메모"]', '시험: 돌격 계수 올림');
  await clickButton('파일에 저장');
  await waitFor(`!!document.querySelector('.savemsg.ok') || document.querySelectorAll('button.tab').length === 0`, 8000, '저장').catch(() => {});
  await sleep(1500); // 저장하면 개발 서버가 페이지를 새로고침한다
  await waitFor(`document.querySelectorAll('button.tab').length > 0`, 30000, '새로고침 뒤 Lab');
  check('스킬 계수를 저장하면 skills.json이 바뀐다', readData('skills').find((s) => s.id === 'cavalry-charge').power === chargeAfter, `${skillBefore} → ${readData('skills').find((s) => s.id === 'cavalry-charge').power}`);
  const log1 = readChangelog().slice((originalChangelog ?? '').length);
  check('저장하면 changelog.md에 무엇이 어떻게 바뀌었는지 남는다', log1.includes('— 스킬') && log1.includes(`- skills.cavalry-charge.power: ${chargeBefore} → ${chargeAfter}`), log1.split('\n').filter(Boolean).slice(0, 3).join(' | '));
  check('변경 메모가 기록에 들어간다', log1.includes('메모: 시험: 돌격 계수 올림'));
  check('저장 뒤 페이지가 새로고침되고 안내 문구가 남는다', (await text('.savemsg')).includes('스킬'), (await text('.savemsg')).trim().slice(0, 50));
  check('새로고침 뒤 "프로젝트 파일과 같음"이다', (await text('.savebar .badge')).includes('프로젝트 파일과 같음'));
  writeData('skills', JSON.parse(originals.skills)); // 스킬 변경은 여기서 되돌린다
  await sleep(1500);
  await load();

  }

  // ---- 2b. 에셋 검수 탭: 슬롯 목록, 그림 표시, OK/NO 저장, NO 정리 ----
  if (on('art')) {
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    mkdirSync(ART_TMP, { recursive: true });
    writeFileSync(join(ART_TMP, 'e2e-keep.png'), PNG);
    writeFileSync(join(ART_TMP, 'e2e-drop.png'), PNG);
    await tabs('에셋 검수');
    await waitFor(`document.querySelectorAll('.art-slot').length > 10`, 20000, '슬롯 목록');
    check('에셋 검수 탭: 슬롯 목록(A~F)이 나온다', (await evalJs(`['A1','B1','D1','E3','F2'].every(id => !!document.querySelector('[data-slot="'+id+'"]'))`)) === true);
    await evalJs(`document.querySelector('[data-view="all"]').click()`);
    await sleep(500);
    await waitFor(`!!document.querySelector('.art-card[data-path="docs/art/_e2e-tmp/e2e-keep.png"]')`, 15000, '임시 그림 카드');
    await evalJs(`document.querySelector('.art-card[data-path="docs/art/_e2e-tmp/e2e-keep.png"]').scrollIntoView()`);
    await sleep(800);
    check('에셋 검수 탭: 그림이 실제로 그려진다 (미리보기 로드)', (await evalJs(`(() => { const im = document.querySelector('.art-card[data-path="docs/art/_e2e-tmp/e2e-keep.png"] img'); return !!im && im.complete && im.naturalWidth === 1; })()`)) === true);
    const act = (path, a) => evalJs(`document.querySelector('.art-card[data-path="${path}"] [data-act="${a}"]').click()`);
    await act('docs/art/_e2e-tmp/e2e-keep.png', 'ok');
    await act('docs/art/_e2e-tmp/e2e-drop.png', 'no');
    await sleep(600);
    const review = JSON.parse(readFileSync(REVIEW, 'utf-8'));
    check('OK/NO 표시가 docs/art/review.json에 저장된다', review['docs/art/_e2e-tmp/e2e-keep.png'] === 'ok' && review['docs/art/_e2e-tmp/e2e-drop.png'] === 'no');
    await evalJs(`window.confirm = () => true`);
    await evalJs(`document.querySelector('[data-action="apply"]').click()`);
    await sleep(1200);
    check('NO 정리: NO만 지워지고 OK와 대기는 남는다', !existsSync(join(ART_TMP, 'e2e-drop.png')) && existsSync(join(ART_TMP, 'e2e-keep.png')));
    check('NO 정리 뒤 검수 결과에서 NO 기록이 빠진다', !('docs/art/_e2e-tmp/e2e-drop.png' in JSON.parse(readFileSync(REVIEW, 'utf-8'))));
    // 게임이 쓰는 그림은 NO로 표시해도 지워지지 않는다
    const GAME_FILE = 'apps/game/public/art/battle/liu-bei-idle-v1.png';
    await evalJs(`fetch('/api/art/review', { method: 'POST', body: JSON.stringify({ '${GAME_FILE}': 'no' }) }).then(r => r.ok)`);
    const applied = await evalJs(`fetch('/api/art/apply', { method: 'POST', body: '{}' }).then(r => r.json())`);
    check('NO 정리: 게임이 쓰는 파일은 지우지 않고 알려 준다', existsSync(resolve(GAME_FILE)) && applied.blocked.includes(GAME_FILE), JSON.stringify(applied.blocked));
    await evalJs(`fetch('/api/art/review', { method: 'POST', body: JSON.stringify({ '${GAME_FILE}': null }) })`);
    await evalJs(`fetch('/api/art/review', { method: 'POST', body: JSON.stringify({ '../../package.json': 'no' }) }).then(r => r.status)`).then((status) => check('검수 API는 아트 폴더 밖 경로를 거부한다', status === 400, String(status)));
    restoreArt();
  }

  // ---- 2c. 에셋 검수 Viewer: Lab 안의 게임 화면 (게임 서버 주소 GAME_URL이 있을 때만) ----
  if (on('art') && process.env.GAME_URL) {
    await evalJs(`localStorage.setItem('art-viewer-game-url', ${JSON.stringify(process.env.GAME_URL)})`);
    await load();
    await tabs('에셋 검수');
    await waitFor(`document.querySelectorAll('.art-slot').length > 10`, 20000, '슬롯 목록');
    await evalJs(`window.__ready = []; window.addEventListener('message', (e) => { if (e.data && e.data.type === 'art-viewer:ready') window.__ready.push(e.data); })`);
    await evalJs(`document.querySelector('[data-action="viewer-reopen"]').click()`);
    await waitFor(`document.querySelector('.art-viewer-iframe').dataset.viewerReady === 'true'`, 40000, 'Viewer 연결');
    check('에셋 검수: 게임 화면 Viewer가 Lab 안에서 연결된다', true);
    await evalJs(`document.querySelector('[data-slot="A1"]').click()`);
    await sleep(800);
    check('에셋 검수: 그림을 끼울 수 있는 슬롯은 "화면에 적용" 버튼이 있고, 코드로 그리는 슬롯은 없다', (await evalJs(`!!document.querySelector('.art-card [data-act="view"]')`)) === true);
    // 후보 그림을 끼우면 게임 화면이 다시 그려지고 그 그림을 실제로 읽는다 (Lab 개발 서버에서 다른 포트로 읽기)
    await evalJs(`window.__ready.length = 0; document.querySelector('.art-card [data-act="view"]').click()`);
    await waitFor(`window.__ready.length > 0 && window.__ready[window.__ready.length - 1].overrides.includes('headerBg')`, 40000, '그림 끼우기 완료');
    check('에셋 검수: 끼운 그림을 게임 화면이 읽어서 그린다 (다른 포트의 그림 읽기)', (await evalJs(`window.__ready[window.__ready.length - 1].loaded.split(',').includes('headerBg')`)) === true);
    check('에셋 검수: 적용 중인 그림이 표시되고 "원래대로"가 켜진다', (await evalJs(`document.body.textContent.includes('적용 중: headerBg') && !document.querySelector('[data-action="viewer-reset"]').disabled`)) === true);
    await evalJs(`window.__ready.length = 0; document.querySelector('[data-action="viewer-reset"]').click()`);
    await waitFor(`window.__ready.length > 0 && window.__ready[window.__ready.length - 1].overrides.length === 0`, 40000, '원래대로');
    check('에셋 검수: 원래대로를 누르면 끼운 그림이 없어진다', (await evalJs(`document.querySelector('[data-action="viewer-reset"]').disabled`)) === true);
    // 구조 보기: 헤더를 쪼갠 슬롯을 칩으로 하나씩 켜고 끈다
    await evalJs(`document.querySelector('[data-slot="A2"]').click()`);
    await sleep(500);
    await evalJs(`document.querySelector('[data-action="viewer-group"]').click()`);
    await sleep(500);
    check('에셋 검수: 구조 보기를 켜면 같은 그룹(헤더)의 슬롯이 칩으로 나온다', (await evalJs(`['A1','A2','A3','A4','A5','A6','A7','A8','A9'].every(id => !!document.querySelector('[data-chip="' + id + '"]'))`)) === true);
    await evalJs(`document.querySelector('[data-action="chips-only"]').click()`);
    await sleep(300);
    check('에셋 검수: "지금 슬롯만"을 누르면 고른 슬롯만 켜진다 (겹치지 않게 하나씩 본다)', (await evalJs(`[...document.querySelectorAll('[data-chip]')].every(b => (b.dataset.chip === 'A2') === (b.getAttribute('aria-pressed') === 'true'))`)) === true);
    await evalJs(`document.querySelector('[data-chip="A3"]').click()`);
    await sleep(200);
    const a3On = (await evalJs(`document.querySelector('[data-chip="A3"]').getAttribute('aria-pressed') === 'true'`)) === true;
    await evalJs(`document.querySelector('[data-action="chips-all"]').click()`);
    await sleep(300);
    check('에셋 검수: 칩을 눌러 슬롯을 더 켜고, "모두 켜기"로 되돌린다', a3On && (await evalJs(`[...document.querySelectorAll('[data-chip]')].every(b => b.getAttribute('aria-pressed') === 'true')`)) === true);
    await evalJs(`document.querySelector('[data-action="viewer-group"]').click()`);
    await evalJs(`document.querySelector('[data-slot="D5"]').click()`);
    await sleep(600);
    check('에셋 검수: 이 슬롯은 지금 코드가 그림을 쓰지 않아 끼워 볼 수 없다고 안내한다', (await evalJs(`!document.querySelector('.art-card [data-act="view"]') && document.querySelector('.art-viewer-bar').textContent.includes('끼워 볼 수 없습니다')`)) === true);
    await evalJs(`localStorage.removeItem('art-viewer-game-url')`);
  }

  if (on('characters')) {
  // ---- 3. 장수 탭: 계산값, 수정, 저장 ----
  await tabs('장수');
  await sleep(300);
  const rows = await evalJs(`document.querySelectorAll('section.ed tbody tr').length`);
  check('장수 탭에 장수 표가 나온다', rows === JSON.parse(originals.characters).length, `${rows}줄`);
  // 실제 스탯 = 초기 스탯 + 승급 길(기본 병종부터 지금 병종까지)의 스탯 보정 누적 (데이터에서 계산한다)
  const expectedStats = (() => {
    const types = readData('unitTypes');
    const zf = readData('characters').find((c) => c.id === 'zhangFei');
    const byId = Object.fromEntries(types.map((t) => [t.id, t]));
    const parent = (id) => types.find((t) => t.promotesTo.includes(id))?.id;
    const chain = [];
    for (let id = zf.unitType; id; id = parent(id)) chain.unshift(byId[id]);
    const stat = (k) => Math.max(0, zf.stats[k] + chain.reduce((sum, t) => sum + (t.statMods?.[k] ?? 0), 0));
    return `${stat('attack')} / ${stat('defense')} / ${stat('intellect')} / ${stat('speed')}`;
  })();
  check(`승급 길의 스탯 보정을 반영한 실제 스탯이 나온다 (장비: ${expectedStats})`, (await evalJs(`document.querySelector('tr[data-id="zhangFei"]').textContent`)).includes(expectedStats));
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
  check('두 번째 저장도 기록이 쌓인다 (장수, 메모 없음)', readChangelog().includes('— 장수') && readChangelog().includes('- characters.guanYu.stats.attack:'));
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

  }

  if (on('unittypes')) {
  // ---- 4. 병종 카드: 수정 → 저장 → 장수 탭의 계산값이 따라 바뀐다 ----
  await tabs('병종 · 스킬');
  await sleep(300);
  await selectUnit('cavalry');
  const cavBefore = readData('unitTypes').find((u) => u.id === 'cavalry').troopScale;
  const cavNew = cavBefore === 0.75 ? 0.85 : 0.75;
  const balanceNow = readData('balance');
  // 병력 배율은 레벨당 병력 상한 증가에 곱한다 (Lv15 = Lv1 병력 + 레벨당 증가 × 배율 × 14)
  const cavTroops = Math.round(balanceNow.troops.base + balanceNow.troops.perLevel * cavNew * 14);
  await setValue('input[aria-label="cavalry 병력 배율"]', cavNew);
  await sleep(300);
  check(`병력 배율을 고치면 카드의 병력 요약이 바뀐다 (${cavBefore} → ${cavNew}, 병력 ${cavTroops})`, (await text('section[data-unittype="cavalry"] .badge')).includes(`병력 ${cavTroops}`));
  await tabs('장수');
  await sleep(300);
  // 기병(0차)을 쓰는 장수로 확인한다 (관우는 승급 트리의 호표기라 기병 배율을 받지 않는다)
  const cavalryChar = readData('characters').find((c) => c.unitType === 'cavalry').id;
  check(`장수 탭의 기병 장수(${cavalryChar}) 병력이 새 배율을 바로 반영한다 (저장 전, ${cavTroops})`, String(await evalJs(`document.querySelector('tr[data-id="${cavalryChar}"]').textContent`)).includes(String(cavTroops)));
  await tabs('병종 · 스킬');
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
  check('병종을 저장하면 unitTypes.json에 기록된다', readData('unitTypes').find((u) => u.id === 'cavalry').troopScale === cavNew, `${cavBefore} → ${readData('unitTypes').find((u) => u.id === 'cavalry').troopScale}`);
  writeData('unitTypes', JSON.parse(originals.unitTypes));
  await sleep(1500);
  await load();

  }

  if (on('presets')) {
  // ---- 5. 기본 편성 탭 ----
  await tabs('기본 편성');
  await sleep(300);
  check('기본 편성 탭에 편성 카드가 나온다', (await evalJs(`document.querySelectorAll('section.preset').length`)) === JSON.parse(originals.presets).length);
  const startTypes = readData('presets').find((p) => p.id === 'shuStart').lineup.map((e) => readData('unitTypes').find((u) => u.id === (e.unitType ?? readData('characters').find((c) => c.id === e.characterId).unitType)).name);
  check(`편성 카드에 구성이 나온다 (유관장: ${startTypes.join(' · ')})`, (await text('section[data-preset="shuStart"] .preset-summary')).includes(startTypes.join(' · ')));
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
  await setValue('select[aria-label="preset1 후열 3"]', 'huangZhong');
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
  await tabs('기본 편성');
  check('6번 슬롯의 빈칸을 저장하고 다시 불러와도 압축하지 않는다',
    presetsSaved.find(p => p.id === 'preset1').lineup.some(e => e.characterId === 'huangZhong' && e.row === 'back' && e.slot === 2) &&
    await evalJs(`document.querySelector('select[aria-label="preset1 후열 3"]').value === 'huangZhong' && document.querySelector('select[aria-label="preset1 후열 1"]').value === ''`));
  check('편성을 저장하면 presets.json에 기록된다', presetsSaved.length === JSON.parse(originals.presets).length + 1 && presetsSaved.find((p) => p.id === 'shuStart').lineup.some((e) => e.characterId === 'huangZhong' && e.row === 'back'));
  writeData('presets', JSON.parse(originals.presets));
  await sleep(1500);
  await load();

  }

  if (on('external')) {
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
  }

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
