// 게임 화면(PixiJS)을 실제 브라우저로 조작해 확인하는 종단 간 검증 스크립트.
//
//   npm run game          # 다른 터미널에서 개발 서버를 켜 둔다 (http://localhost:5174)
//   npm run e2e           # 이 스크립트 실행. 스크린샷은 out/e2e/ 에 저장된다
//
// Playwright 같은 도구 없이 설치된 Edge/Chrome을 헤드리스로 띄우고 DevTools Protocol(Node 22 내장 WebSocket)로 조작한다.
// 환경 변수: GAME_URL(기본 http://localhost:5174/), BROWSER(브라우저 실행 파일 경로), E2E_OUT(스크린샷 폴더).
// 확인하는 것: 수동 플레이(스킬 선택 → 캔버스 카드 클릭 / 목록 버튼 / 대기 / AI 위임), 애니메이션 재생, 건너뛰기, 다시 하기, 콘솔 오류.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE = process.env.GAME_URL ?? 'http://localhost:5174/';
const OUT = resolve(process.env.E2E_OUT ?? 'out/e2e');
const PORT = Number(process.env.E2E_PORT ?? 9333);
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
    '--hide-scrollbars', '--window-size=1400,1400', '--no-first-run', 'about:blank',
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

// 방어측(위) 카드의 월드 좌표. apps/game/src/render/theme.ts의 열/행 좌표와 같은 값이다.
const WEI_POS = { 허저: [810, 510], 하후돈: [810, 636], 장료: [810, 762], 하후연: [1040, 510], 순욱: [1040, 636], 곽가: [1040, 762] };
const canvasPoint = (wx, wy) =>
  evalJs(`(() => { const c = document.querySelector('.stage canvas'); const r = c.getBoundingClientRect(); const s = Math.min(r.width / 1280, r.height / 900); const ox = (r.width - 1280 * s) / 2, oy = (r.height - 900 * s) / 2; return { x: r.left + ox + (${wx} + 100) * s, y: r.top + oy + (${wy} + 56) * s }; })()`);

try {
  for (let i = 0; i < 100; i++) {
    try { await getJson('/json/version'); break; } catch { await sleep(200); }
  }
  const page = (await getJson('/json/list')).find((t) => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method === 'Runtime.exceptionThrown') errors.push(String(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text));
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  });
  await send('Runtime.enable');
  await send('Page.enable');

  // Target first: hover reveals options, clicking an option submits exactly once.
  await goto('?control=attacker&autostart=1&speed=0&seed=1');
  await waitFor(`!!document.querySelector('.card-action-trigger')`, 20000);
  check('중앙 패널에는 공격/대기 선택 버튼이 없다', await evalJs(`!document.querySelector('.command [aria-pressed]') && ![...document.querySelectorAll('.command button')].some(b => b.textContent.includes('대기'))`));
  const enemySelector = '.card-action-trigger[data-side="defender"]:not([data-actions="0"])';
  const point = await evalJs(`(() => { const r = document.querySelector('${enemySelector}').getBoundingClientRect(); return { x:r.x+r.width/2, y:r.y+r.height/2 }; })()`);
  const beforeHover = await text('.log');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
  await waitFor(`!!document.querySelector('.card-action-menu')`, 3000);
  check('적 카드에 마우스를 올리면 공격과 예상 피해가 나온다', /피해/.test(await text('.card-action-menu')));
  check('적 카드에는 가드·대기·지원 행동이 없다', await evalJs(`![...document.querySelectorAll('.card-action-option')].some(b => ['guard','wait','buff','heal'].includes(b.dataset.kind))`));
  check('마우스를 올리는 것만으로 공격하지 않는다', beforeHover === await text('.log'));
  await shot('card-enemy-actions');
  const actionPoint = await evalJs(`(() => { const r = document.querySelector('.card-action-option').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...actionPoint });
  await mouse(actionPoint.x, actionPoint.y);
  await waitFor(`document.querySelector('.log').textContent !== ${JSON.stringify(beforeHover)}`, 8000);
  check('카드 메뉴의 공격 버튼으로 행동을 실행한다', true);
  await waitFor(`!!document.querySelector('.card-action-trigger[data-self="true"]')`, 8000);
  await evalJs(`document.querySelector('.card-action-trigger[data-self="true"]').click()`);
  check('행동 중인 아군 카드에는 대기가 있고 공격은 없다', await evalJs(`!!document.querySelector('.card-action-option[data-kind="wait"]') && ![...document.querySelectorAll('.card-action-option span')].some(e => /^피해 /.test(e.textContent))`));
  await shot('card-self-actions');
  await evalJs(`document.querySelector('.card-action-trigger[data-self="true"]').dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true }))`);
  check('Escape로 메뉴를 닫는다', await evalJs(`!document.querySelector('.card-action-menu')`));
  await evalJs(`document.querySelector('.card-action-trigger[data-self="true"]').click()`);
  await evalJs(`document.querySelector('.card-action-trigger[data-self="true"]').dispatchEvent(new KeyboardEvent('keydown', { key:'ArrowDown', bubbles:true }))`);
  const actionFocused = await evalJs(`document.activeElement.classList.contains('card-action-option')`);
  await evalJs(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true }))`);
  check('키보드로 행동에 접근하고 Esc로 카드에 돌아온다', actionFocused && await evalJs(`document.activeElement.classList.contains('card-action-trigger') && !document.querySelector('.card-action-menu')`));
  await evalJs(`document.querySelector('.card-action-trigger[data-self="true"]').click()`);
  await mouse(10, 10);
  check('카드 밖 클릭은 메뉴를 닫는다', await evalJs(`!document.querySelector('.card-action-menu')`));
  let guarded = false;
  for (let i=0; i<18 && !guarded; i++) {
    if (!(await text('.command h3')).includes('의 차례')) break;
    await evalJs(`document.querySelector('.card-action-trigger[data-self="true"]').click()`);
    const guard = await evalJs(`document.querySelector('.card-action-option[data-kind="guard"]')?.textContent`);
    const before = await text('.log');
    if (guard) {
      await shot('card-guard-actions');
      await evalJs(`document.querySelector('.card-action-option[data-kind="guard"]').click()`);
      const rate = /막을 확률 (\d+)%/.exec(guard)?.[1];
      await waitFor(`document.querySelector('.log').textContent !== ${JSON.stringify(before)}`, 8000);
      check('자기 카드에서 가드 실행 후 표시 확률이 로그에 반영된다', (await text('.log')).includes('가드 확률 '+rate+'%'));
      guarded = true;
    } else {
      await evalJs(`document.querySelector('.card-action-option[data-kind="wait"]').click()`);
      await waitFor(`document.querySelector('.log').textContent !== ${JSON.stringify(before)}`, 8000);
    }
    await waitFor(`!!document.querySelector('.card-action-trigger') || document.querySelector('.command h3')?.textContent.includes('전투 종료')`, 8000);
  }
  check('대기로 차례를 넘기고 방패병 가드를 검증했다', guarded);
  await clickButton('AI에게 맡기기');
  await waitFor(`!!document.querySelector('.command h3')?.textContent.includes('전투 종료')`, 30000);
  check('AI 위임 후 카드 메뉴가 사라지고 전투가 끝난다', await evalJs(`!document.querySelector('.card-action-trigger')`));
  await shot('play-finished');

  // 3. 실제 속도 애니메이션(관전)
  await goto('?control=watch&autostart=1&speed=4&seed=2');
  await waitFor(`!!document.querySelector('.stage canvas')`, 10000);
  await sleep(1500);
  const mid = await text('.command');
  check('애니메이션 재생 중에는 "진행 중"이 표시된다', mid.includes('진행 중'), mid.trim().slice(0, 30));
  await shot('watch-midway');
  const t0 = Date.now();
  await waitFor(`!!document.querySelector('.command h3')?.textContent.includes('전투 종료')`, 90000, '관전 종료');
  check('4배속 관전이 끝까지 재생된다', true, `${((Date.now() - t0) / 1000 + 1.5).toFixed(1)}초`);
  // 스탯 버프(독려)를 쓰는지는 전투 흐름(밸런스 수치)에 달려 있어서 필수로 보지 않는다 (로그 문구는 단위 테스트가 확인한다). 결계는 필수다.
  const watchLog = await text('.log');
  const statBuff = /(공격|방어|지력|속도) \+1/.test(watchLog);
  check('도사의 결계가 로그에 남는다', watchLog.includes('결계 →'), `결계 ${watchLog.includes('결계 →')}, 스탯 버프(참고) ${statBuff}`);

  // 4. 건너뛰기
  await goto('?control=watch&autostart=1&speed=1&seed=2');
  await waitFor(`!!document.querySelector('.stage canvas')`, 10000);
  await sleep(1200);
  check('재생 중에 건너뛰기 버튼이 보인다', !!(await clickButton('건너뛰기')));
  const s0 = Date.now();
  await waitFor(`!!document.querySelector('.command h3')?.textContent.includes('전투 종료')`, 10000, '건너뛰기 종료');
  check('건너뛰기를 누르면 즉시 끝난다', Date.now() - s0 < 8000, `${Date.now() - s0}ms`);
  await shot('skip-finished');

  // 5. 다시 하기 / 설정으로
  await clickButton('다시 하기');
  await waitFor(`!!(document.querySelector('.command')?.textContent.includes('진행 중') || document.querySelector('.command h3')?.textContent.includes('전투 종료'))`, 10000);
  check('다시 하기가 전투를 새로 시작한다', true);
  await clickButton('설정으로');
  await waitFor(`!!document.querySelector('.setup')`, 5000);
  check('설정으로 돌아가면 설정 화면이 나온다', true);

  // 6. First art scene: same engine, real texture loads, battlefield hit target.
  await goto('?artTrial=1&control=attacker&speed=0&autostart=1');
  await waitFor(`!!document.querySelector('.command h3')?.textContent.includes('유비')`, 20000, '유비 시험 전투');
  await evalJs(`document.querySelector('.card-action-trigger[data-side="defender"]').click()`);
  await waitFor(`!!document.querySelector('.card-action-option')`, 5000);
  await shot('art-trial-targets');
  const dockClear = await evalJs(`(() => {
    const stage = document.querySelector('.stage').getBoundingClientRect();
    const dock = document.querySelector('.command-dock').getBoundingClientRect();
    return dock.left >= stage.left + stage.width * 470 / 1280 &&
      dock.right <= stage.left + stage.width * 810 / 1280 &&
      dock.bottom <= stage.bottom;
  })()`);
  check('중앙 지휘 패널이 양쪽 군단 카드를 가리지 않는다', dockClear);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  await evalJs(`document.querySelector('[aria-label="행동 메뉴 닫기"]')?.click()`);
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const touchPoint = await evalJs(`(() => { const r = document.querySelector('.card-action-trigger[data-side="defender"]').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchPoint] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await waitFor(`!!document.querySelector('.card-action-option')`, 3000);
  check('터치로 카드 메뉴를 열고 화면 안에서 행동을 고를 수 있다', await evalJs(`(() => { const r=document.querySelector('.card-action-menu').getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth && r.top>=0; })()`));
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  const mobileClear = await evalJs(`(() => {
    const stage = document.querySelector('.stage').getBoundingClientRect();
    const dock = document.querySelector('.command-dock').getBoundingClientRect();
    return dock.top >= stage.bottom && document.documentElement.scrollWidth <= innerWidth;
  })()`);
  check('좁은 화면은 지휘 패널을 전장 아래에 놓고 가로 넘침이 없다', mobileClear);
  await shot('art-trial-mobile');
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(400);
  const artLoads = await evalJs(`document.querySelector('.stage').dataset.artLoaded.split(',')`);
  check('전투 배경과 캐릭터 텍스처를 읽는다', ['field', 'liuBei', 'yellowSoldier', 'yellowCaptain', 'liuPortrait', 'yellowPortrait'].every(n => artLoads.includes(n)));
  await evalJs(`document.querySelector('.card-action-trigger[data-side="defender"]').click(); document.querySelector('.card-action-option').click()`);
  const armyClick = await waitFor(`!!document.querySelector('.log')?.textContent.includes('→ 방:황건 보병A')`, 8000).catch(() => false);
  check('황건 카드의 행동 메뉴에서 공격한다', !!armyClick);
  await shot('art-trial-after-hit');

  // Renderer fixture: replay explicit events without modifying game data or balancing outcomes.
  await goto('?autostart=0');
  await waitFor(`!!document.querySelector('.setup')`, 20000);
  await evalJs(`(async () => {
    const { BattleScene } = await import('/src/render/BattleScene.ts');
    document.querySelector('.app').style.display = 'none';
    const wrapper = document.createElement('div');
    wrapper.className = 'app';
    wrapper.innerHTML = '<h2>원거리 연출 검토</h2><div class="stage"></div>';
    document.body.appendChild(wrapper);
    const ids = ['archer-shot', 'geomancer-shot', 'stratagem', 'poison-smoke'];
    const names = ['화살 공격', '활 공격', '책략', '도술'];
    const scene = await BattleScene.create(wrapper.querySelector('.stage'), {
      data: { skills: Object.fromEntries(ids.map((id, i) => [id, { name: names[i] }])) }, maxTurns: 40,
    });
    const unit = (uid, name, side, family, row, slot) => ({
      uid, name, side, family, unitType: family, row, slot, level: 1,
      maxTroops: 1000, troops: 1000, ap: 4, maxAp: 4, guardRate: 0,
      buffs: { attack: 0, defense: 0, intellect: 0, speed: 0 }, barrier: 0, dead: false,
    });
    const view = { round: 1, defenderMorale: 50, outcome: null, units: [
      unit('left', '공격 군단', 'attacker', 'archer', 'back', 0),
      unit('right', '원래 대상', 'defender', 'taoist', 'back', 0),
      unit('guard', '대신 맞는 군단', 'defender', 'shield', 'back', 1),
    ] };
    window.effectReview = { scene, view, wrapper };
  })()`);
  const labelsOk = await evalJs(`(async () => {
    const {scene, view} = window.effectReview;
    scene.setState(view); scene.setSpeed(0);
    const army = scene.sprites.get('guard').army;
    army.setStatus(50, 0);
    const active = army.guardLabel.text === '가드 50%' && army.shieldToken.context.instructions.length > 0;
    army.setStatus(0, 0);
    const released = army.guardLabel.text === '가드 해제';
    await army.moveToSlot('front', 0);
    const aligned = army.annotation.x === army.root.x - 125 && army.annotation.y === army.root.y - 40;
    const above = scene.world.getChildIndex(scene.armyLabels) > scene.world.getChildIndex(scene.armyLayer) && army.annotation.eventMode === 'none';
    army.setDead(true);
    const dead = !army.guardLabel.visible && army.label.text.includes('격파');
    scene.setState(view);
    return active && released && aligned && above && dead && scene.armyLabels.children.length === view.units.length;
  })()`);
  check('방패 표식·가드 해제·격파·열 이동 이름표와 재시작 정리가 정상이다', labelsOk);
  for (const [skillId, kind, source, target] of [
    ['archer-shot', 'arrow', 'left', 'guard'],
    ['geomancer-shot', 'arrow', 'right', 'left'],
    ['stratagem', 'sigil', 'left', 'right'],
    ['poison-smoke', 'smoke', 'right', 'left'],
  ]) {
    await evalJs(`(async () => {
      const review = window.effectReview, scene = review.scene;
      scene.setState(review.view);
      scene.setSpeed(0);
      await scene.playEvent({ type: 'action', round: 1, actor: '${source}', skillId: '${skillId}', target: '${target === 'guard' ? 'right' : target}', apAfter: 3 });
      ${target === 'guard' ? "await scene.playEvent({ type: 'intercept', round: 1, attacker: 'left', target: 'right', guardian: 'guard' });" : ''}
      scene.setSpeed(0.25);
      review.start = { ...scene.sprites.get('${source}').center };
      review.playing = scene.playEvent({ type: 'damage', round: 1, kind: 'attack', source: '${source}', target: '${target}', amount: 100, troopsAfter: 900 });
    })()`);
    await sleep(600);
    const flight = await evalJs(`(() => {
      const { scene, start } = window.effectReview;
      const effect = scene.effectsLayer.children.find(c => c.label === 'projectile-${kind}');
      const source = scene.sprites.get('${source}').center;
      const target = scene.sprites.get('${target}').center;
      return !!effect && effect.alpha > 0 && source.x === start.x && source.y === start.y &&
        effect.x > Math.min(start.x, target.x) && effect.x < Math.max(start.x, target.x);
    })()`);
    await shot(`effect-${skillId}`);
    const applied = await evalJs(`(async () => {
      const { scene, playing } = window.effectReview;
      scene.setSpeed(0);
      await playing;
      return scene.sprites.get('${target}').troops === 900 &&
        !scene.effectsLayer.children.some(c => c.label?.startsWith('projectile-') || c.label?.startsWith('impact-'));
    })()`);
    check(`${skillId}: 제자리 발사·비행·실제 피해 대상·즉시 모드 정리`, flight && applied);
  }
  const counterOk = await evalJs(`(async () => {
    const { scene } = window.effectReview;
    scene.setSpeed(0.25);
    const playing = scene.playEvent({ type: 'damage', round: 1, kind: 'counter', source: 'right', target: 'left', amount: 25, troopsAfter: 875 });
    const noProjectile = !scene.effectsLayer.children.some(c => c.label?.startsWith('projectile-'));
    scene.setSpeed(0);
    await playing;
    return noProjectile && scene.sprites.get('left').troops === 875;
  })()`);
  check('원거리 공격 뒤 반격은 투사체 연출을 재사용하지 않는다', counterOk);
  await evalJs(`(async () => {
    const review = window.effectReview, scene = review.scene;
    scene.setState(review.view);
    scene.setSpeed(0);
    await scene.playEvent({ type: 'action', round: 1, actor: 'left', skillId: 'archer-shot', target: 'right', apAfter: 3 });
    await scene.playEvent({ type: 'barrier', round: 1, unit: 'right', charges: 0, reason: 'block' });
    scene.setSpeed(0.5);
    review.playing = scene.playEvent({ type: 'damage', round: 1, kind: 'attack', source: 'left', target: 'right', amount: 0, troopsAfter: 1000 });
  })()`);
  await waitFor(`window.effectReview.scene.effectsLayer.children.some(c => c.label === 'impact-arrow')`, 4000);
  const blockedOk = await evalJs(`(async () => {
    const { scene, playing } = window.effectReview;
    const target = scene.sprites.get('right');
    const unchanged = target.troops === 1000 && target.flashOverlay.alpha === 0;
    scene.setSpeed(0);
    await playing;
    return unchanged;
  })()`);
  check('결계가 막은 화살은 병력 감소와 붉은 피격 점멸을 만들지 않는다', blockedOk);
  const disposed = await evalJs(`(async () => {
    const { scene, wrapper } = window.effectReview;
    scene.setSpeed(0);
    await scene.playEvent({ type: 'action', round: 1, actor: 'left', skillId: 'archer-shot', target: 'right', apAfter: 2 });
    scene.setSpeed(1);
    const playing = scene.playEvent({ type: 'damage', round: 1, kind: 'attack', source: 'left', target: 'right', amount: 0, troopsAfter: 875 });
    scene.destroy();
    await playing;
    wrapper.remove();
    delete window.effectReview;
    return true;
  })()`);
  check('투사체 비행 중 화면 종료가 안전하게 완료된다', disposed);
  // Mounted art in a real 6v6 lineup, including the mirrored defender side.
  for (const reversed of [false, true]) {
    await goto(`?a=${reversed ? 'wei' : 'shu'}&d=${reversed ? 'shu' : 'wei'}&control=${reversed ? 'defender' : 'attacker'}&speed=0&autostart=1`);
    await waitFor(`!!document.querySelector('.command h3')?.textContent.includes('의 차례')`, 20000, '기병 포함 실제 편성');
    // 그림은 관우가 기병 계열일 때만 붙는다 (관우의 병종은 Lab에서 바꾸는 값이라 데이터에서 읽는다)
    const dataFile = (name) => JSON.parse(readFileSync(resolve('packages/game-data/data', `${name}.json`), 'utf-8'));
    const guanYuType = dataFile('characters').find((c) => c.id === 'guanYu')?.unitType;
    const guanYuIsCavalry = dataFile('unitTypes').find((t) => t.id === guanYuType)?.family === 'cavalry';
    if (!guanYuIsCavalry) {
      check(`관우와 공용 기병 텍스처 로드 (${reversed ? '방어측' : '공격측'}) — 관우가 기병 계열이 아니라 건너뜀`, true, guanYuType);
      continue;
    }
    check(`관우와 공용 기병 텍스처 로드 (${reversed ? '방어측' : '공격측'})`, await evalJs(`['guanYu','shuCavalry'].every(k => document.querySelector('.stage').dataset.artLoaded.split(',').includes(k))`));
    await shot(reversed ? 'cavalry-runtime-defender' : 'cavalry-runtime-attacker');
  }
  await goto('?a=shuStart&d=yellowNormal&control=attacker&speed=0&autostart=1');
  await waitFor(`!!document.querySelector('.command h3')?.textContent.includes('의 차례')`, 20000, '유관장 대 황건적');
  await shot('shu-start-shield-labels');
  // Optional local art-review page; no changes to runtime data or assets.
  if (process.env.ART_REVIEW_PATH) {
    await send('Page.navigate', { url: pathToFileURL(resolve(process.env.ART_REVIEW_PATH)).href });
    await waitFor(`document.body.dataset.ready === 'true'`, 15000, '기마 아트 검토 이미지 로드');
    check('기마 원본과 보병·배경을 비교 화면에 불러온다', await evalJs(`Object.keys(images).length === 5 && [...document.images].every(i => i.complete && i.naturalWidth > 0)`));
    await shot('cavalry-review-116');
    for (const height of [108, 124]) {
      await evalJs(`document.querySelector('#scale').value = '${height}'; document.querySelector('#scale').dispatchEvent(new Event('change'))`);
      check(`기마 검토 크기를 ${height}px로 바꾼다`, await evalJs(`document.body.dataset.scale === '${height}'`));
      await shot(`cavalry-review-${height}`);
    }
    await evalJs(`document.querySelector('#flip').click(); document.querySelector('#background').value = '#ece2cf'; document.querySelector('#background').dispatchEvent(new Event('change'))`);
    check('좌우 반전과 밝은 배경으로 외곽을 검토한다', await evalJs(`document.body.dataset.flipped === 'true' && getComputedStyle(document.documentElement).getPropertyValue('--review-bg').trim() === '#ece2cf'`));
    await shot('cavalry-review-flipped');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    await sleep(300);
    check('기마 검토 페이지가 좁은 화면에서 가로로 넘치지 않는다', await evalJs(`document.documentElement.scrollWidth <= innerWidth`));
    await shot('cavalry-review-mobile');
    await send('Emulation.clearDeviceMetricsOverride');
  }
} catch (e) {
  check('스크립트 실행', false, String(e.message ?? e));
} finally {
  const unexpected = errors.filter((e) => !/favicon/i.test(e));
  check('브라우저 콘솔에 오류가 없다', unexpected.length === 0, unexpected.slice(0, 3).join(' | '));
  try { ws?.close(); } catch {}
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
  else proc.kill('SIGKILL');
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} 통과 (스크린샷: ${OUT})`);
  process.exit(failed ? 1 : 0);
}
