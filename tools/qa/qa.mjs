// npm run qa — 바뀐 파일을 보고 필요한 검사만 골라 돌린다. 규칙표는 tools/qa/rules.mjs (사람이 읽는 표: docs/QA.md).
//
//   npm run qa                 바뀐 파일(작업 트리)에 맞는 검사를 계획대로 돌린다
//   npm run qa -- --plan       무엇을 왜 돌릴지 보여 주기만 한다
//   npm run qa -- --commit     커밋 직전: 이미 통과한 파일은 건너뛰고(몇 초), 아직 확인 안 된 것만 돌린다
//   npm run qa -- --all        전부 돌린다 (큰 변경 뒤, 가끔). 통과 기록은 무시한다
//   npm run qa -- --since REF  REF부터 HEAD까지 바뀐 파일 기준 (커밋한 뒤)
//   npm run qa -- --rules      규칙표 보기 (--write 를 붙이면 docs/QA.md의 표를 갱신)
//   npm run qa -- --shots      브라우저 검사의 스크린샷을 out/qa에 남긴다 (기본은 남기지 않는다)
//   npm run qa -- --keep-going 브라우저 검사가 실패해도 끝까지 돈다 (기본은 첫 실패에서 멈춘다)
//
// 통과 기록: 검사가 모두 통과하면 그때의 파일 내용(해시)을 out/qa-green.json에 적는다. 다음에는 내용이 바뀐 파일만 계획에 넣는다.
// 그래서 작업하며 그때그때 돌려 두면 커밋 직전의 `--commit`은 거의 즉시 끝난다.
//   npm run qa -- --files a,b  파일 목록을 직접 준다 (계획 시험용)
//
// 출력은 짧게: 계획, 단계별 통과/실패, 실패한 줄만. 브라우저 검사는 자기 서버(5183, 5185)를 띄웠다 끄고,
// 사용자의 개발 서버(5173, 5174)는 건드리지 않는다. 데이터 파일은 검사 전 상태로 되돌린다.

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { GAME_SECTIONS, LAB_SECTIONS, RULES, plan, rulesTable } from './rules.mjs';

const ROOT = resolve(new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
process.chdir(ROOT);
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const DOC = 'docs/QA.md';
const BEGIN = '<!-- qa-table:begin -->';
const END = '<!-- qa-table:end -->';

if (flag('rules')) {
  const table = rulesTable();
  if (flag('write')) {
    const text = readFileSync(DOC, 'utf-8');
    const a = text.indexOf(BEGIN);
    const b = text.indexOf(END);
    if (a < 0 || b < 0) throw new Error(`${DOC}에 ${BEGIN} ... ${END} 표시가 없습니다.`);
    writeFileSync(DOC, text.slice(0, a + BEGIN.length) + '\n' + table + '\n' + text.slice(b));
    console.log(`${DOC}의 규칙표를 갱신했습니다 (${RULES.length}개 규칙).`);
  } else console.log(table);
  process.exit(0);
}

// ---------- 바뀐 파일 ----------
function changedFiles() {
  const given = opt('files');
  if (given) return given.split(',').filter(Boolean);
  const since = opt('since');
  const git = (a) => spawnSync('git', a, { encoding: 'utf-8' }).stdout.split('\n').filter(Boolean);
  const files = since
    ? git(['diff', '--name-only', since, 'HEAD'])
    : git(['status', '--porcelain', '-uall']).map((l) => l.slice(3).replace(/^"|"$/g, '').replace(/.* -> /, ''));
  return [...new Set(files)].filter((f) => !/^(out|art-inbox|node_modules)\//.test(f));
}

const files = changedFiles();
const everything = flag('all');

// ---------- 통과 기록 ----------
const GREEN = 'out/qa-green.json';
const hashOf = (f) => (existsSync(f) ? createHash('sha1').update(readFileSync(f)).digest('hex') : 'deleted');
const readGreen = () => {
  try {
    return JSON.parse(readFileSync(GREEN, 'utf-8'));
  } catch {
    return {};
  }
};
const green = everything || flag('files-fresh') || opt('files') ? {} : readGreen();
const hashes = Object.fromEntries(files.map((f) => [f, hashOf(f)]));
const pending = files.filter((f) => green[f] !== hashes[f]);
const skipped = files.length - pending.length;

const p = everything
  ? { typecheck: true, vitestAll: true, vitest: new Set(), lab: new Set(LAB_SECTIONS), game: new Set(GAME_SECTIONS), sim: new Set(), notes: new Set(), matched: new Map(), unmatched: [] }
  : plan(pending);
if (flag('commit') && !everything) {
  // 커밋 직전에는 싼 검사(typecheck, vitest 전체, 약 12초)는 코드가 바뀌었다면 항상 돌린다
  const codeChanged = files.some((f) => !/\.md$|^docs\/(?!art\/(battle-slots|review)\.json)/.test(f));
  if (codeChanged) {
    p.typecheck = true;
    p.vitestAll = true;
  }
}

// ---------- 계획 출력 ----------
const list = (s) => [...s].join(', ');
console.log(everything ? 'QA 계획: 전부 (--all)' : `QA 계획: 바뀐 파일 ${files.length}개${skipped > 0 ? ` (이미 통과한 ${skipped}개는 건너뜀, 새로 볼 것 ${pending.length}개)` : ''}`);
if (!everything) {
  const byRule = new Map();
  for (const [file, ids] of p.matched) byRule.set(ids.join('+'), [...(byRule.get(ids.join('+')) ?? []), file]);
  for (const [ids, fs] of byRule) console.log(`  · ${ids}: ${fs.length}개 (${fs.slice(0, 2).map((f) => f.split('/').pop()).join(', ')}${fs.length > 2 ? ' …' : ''})`);
  if (p.unmatched.length) console.log(`  ⚠ 규칙에 없는 파일 ${p.unmatched.length}개: ${p.unmatched.slice(0, 3).join(', ')} → tools/qa/rules.mjs에 규칙을 추가하세요`);
}
const steps = [];
if (p.typecheck) steps.push('typecheck');
if (p.vitestAll) steps.push('vitest 전체');
else if (p.vitest.size) steps.push(`vitest ${list(p.vitest)}`);
if (p.lab.size) steps.push(`Lab 브라우저 [${list(p.lab)}]`);
if (p.game.size) steps.push(`게임 브라우저 [${list(p.game)}]`);
console.log(steps.length ? `  → 돌릴 것: ${steps.join(' / ')}` : '  → 돌릴 검사 없음');
for (const n of p.notes) console.log(`  · ${n}`);
for (const s of p.sim) console.log(`  · 손으로 확인: ${s}`);
if (flag('plan')) process.exit(0);
if (steps.length === 0) process.exit(0);

// ---------- 실행 ----------
// 단계별 시간 제한: 정상일 때 typecheck 4초, vitest 15초, 브라우저 검사 2분 안팎이다. 멈춘 것을 오래 기다리지 않는다
const TIMEOUT_MS = { typecheck: 2 * 60 * 1000, vitest: 3 * 60 * 1000, browser: 4 * 60 * 1000 };
let STEP_TIMEOUT_MS = TIMEOUT_MS.vitest;
const failures = [];

/** 이전 검사가 남긴 시험용 브라우저(이 저장소의 out/ 폴더 프로필을 쓰는 것)만 닫는다. 사용자의 브라우저는 건드리지 않는다 */
function killTestBrowsers() {
  const script = `Get-CimInstance Win32_Process -Filter "Name='msedge.exe' or Name='chrome.exe'" | Where-Object { $_.CommandLine -match 'remote-debugging-port' -and $_.CommandLine -match 'samgukji-rpg' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  spawnSync('powershell', ['-NoProfile', '-Command', script], { stdio: 'ignore' });
}
const run = (label, cmd, cmdArgs, env = {}, pick) => {
  STEP_TIMEOUT_MS = /브라우저/.test(label) ? TIMEOUT_MS.browser : /typecheck/.test(label) ? TIMEOUT_MS.typecheck : TIMEOUT_MS.vitest;
  const t0 = performance.now();
  const r = spawnSync(cmd, cmdArgs, { encoding: 'utf-8', shell: true, env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024, timeout: STEP_TIMEOUT_MS, killSignal: 'SIGKILL' });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  const lines = out.split('\n');
  // 통과 여부는 종료 코드로 정한다. 줄 고르기는 실패했을 때 보여 줄 줄을 찾는 용도일 뿐이다 (PASS 줄의 '×' 같은 글자에 속지 않는다)
  const bad = lines.filter((l) => !/^\s*PASS/.test(l) && /FAIL|^\s*ERROR|✗|^\s*×\s|error TS|AssertionError|timeout/.test(l)).slice(0, 12);
  const summary = (pick ? pick(lines) : '') || '';
  const timedOut = r.error?.code === 'ETIMEDOUT';
  if (timedOut) bad.unshift(`시간 초과 (${STEP_TIMEOUT_MS / 60000}분). 이전 검사가 남긴 브라우저나 서버가 있는지 확인하세요`);
  const ok = r.status === 0 && !timedOut;
  console.log(`${ok ? '✔' : '✘'} ${label} (${secs}s)${summary ? ` — ${summary}` : ''}`);
  if (!ok) {
    for (const l of bad.length ? bad : lines.filter(Boolean).slice(-8)) console.log(`    ${l.trim().slice(0, 220)}`);
    failures.push(label);
  }
  return ok;
};
const pickVitest = (lines) => lines.find((l) => /Tests\s/.test(l))?.trim() ?? '';
const pickE2e = (lines) => [...lines].reverse().find((l) => /\d+\/\d+ 통과/.test(l))?.replace(/\s*\(스크린샷.*$/, '').replace(/ — 데이터.*$/, '').trim() ?? '';

if (p.typecheck) run('typecheck', 'npm', ['run', 'typecheck']);
if (p.vitestAll) run('vitest 전체', 'npx', ['vitest', 'run'], {}, pickVitest);
else if (p.vitest.size) run(`vitest ${list(p.vitest)}`, 'npx', ['vitest', 'run', ...p.vitest], {}, pickVitest);

if (p.lab.size || p.game.size) {
  const DATA = 'packages/game-data/data';
  const snapshot = join('out', 'qa-data-snapshot');
  rmSync(snapshot, { recursive: true, force: true });
  mkdirSync('out', { recursive: true });
  cpSync(DATA, snapshot, { recursive: true });
  const REVIEW = 'docs/art/review.json';
  const reviewBefore = existsSync(REVIEW) ? readFileSync(REVIEW, 'utf-8') : null;
  killTestBrowsers(); // 이전 검사가 비정상으로 끝나 남은 브라우저가 새 검사를 가로채지 못하게 한다
  const servers = [];
  const portFree = (port) => spawnSync('netstat', ['-ano'], { encoding: 'utf-8' }).stdout.split('\n').every((l) => !(l.includes(`:${port} `) && l.includes('LISTENING')));
  const start = async (name, app, port) => {
    if (!portFree(port)) throw new Error(`${port}번 포트를 이미 쓰고 있습니다 (${name} 검사용 서버). 먼저 닫아 주세요.`);
    const child = spawn('npx', ['vite', app, '--port', String(port), '--strictPort'], { shell: true, stdio: 'ignore' });
    servers.push(child);
    for (let i = 0; i < 90; i++) {
      try {
        if ((await fetch(`http://localhost:${port}/`)).ok) return;
      } catch {
        /* 아직 */
      }
      await new Promise((r) => setTimeout(r, 700));
    }
    throw new Error(`${name} 서버가 ${port}번에서 켜지지 않았습니다.`);
  };
  const stopAll = () => servers.forEach((s) => spawnSync('taskkill', ['/F', '/T', '/PID', String(s.pid)], { stdio: 'ignore' }));
  const outDir = flag('shots') ? 'out/qa' : 'out/qa-tmp';
  const env = { E2E_OUT: outDir, ...(flag('shots') ? {} : { E2E_NO_SHOTS: '1' }), ...(flag('keep-going') ? {} : { E2E_FAIL_FAST: '1' }) };
  try {
    // Lab의 에셋 검수는 게임 화면(Viewer)도 필요하다
    const needGame = p.game.size > 0 || p.lab.has('art');
    if (p.lab.size) await start('Lab', 'apps/balance-lab', 5183);
    if (needGame) await start('게임', 'apps/game', 5185);
    if (p.lab.size) {
      const all = p.lab.size === LAB_SECTIONS.length;
      run(`Lab 브라우저 [${all ? '전부' : list(p.lab)}]`, 'node', ['tools/e2e/lab-e2e.mjs'], { ...env, E2E_OUT: `${outDir}/lab`, LAB_URL: 'http://localhost:5183', GAME_URL: 'http://localhost:5185', ...(all ? {} : { LAB_E2E_SECTION: [...p.lab].join(',') }) }, pickE2e);
    }
    if (p.game.size) {
      const all = p.game.size === GAME_SECTIONS.length;
      for (const section of all ? [null] : [...p.game]) run(`게임 브라우저 [${section ?? '전부'}]`, 'node', ['tools/e2e/game-e2e.mjs'], { ...env, E2E_OUT: `${outDir}/game`, GAME_URL: 'http://localhost:5185', ...(section ? { GAME_E2E_SECTION: section } : {}) }, pickE2e);
    }
  } catch (e) {
    console.log(`✘ 브라우저 검사를 시작하지 못했습니다: ${e.message}`);
    failures.push('브라우저 검사 시작');
  } finally {
    stopAll();
    killTestBrowsers();
    // 검사가 데이터를 바꿨다면 되돌린다
    const names = readdirSync(snapshot);
    const changed = names.filter((n) => readFileSync(join(snapshot, n), 'utf-8') !== readFileSync(join(DATA, n), 'utf-8'));
    if (changed.length) {
      for (const n of changed) cpSync(join(snapshot, n), join(DATA, n));
      console.log(`⚠ 검사가 바꾼 데이터 파일을 되돌렸습니다: ${changed.join(', ')}`);
    }
    if (reviewBefore === null) rmSync(REVIEW, { force: true });
    else if (readFileSync(REVIEW, 'utf-8') !== reviewBefore) writeFileSync(REVIEW, reviewBefore);
    rmSync(snapshot, { recursive: true, force: true });
    // 브라우저가 프로필 폴더를 막 놓은 직후라 잠겨 있을 수 있다 (Windows). 몇 번 다시 시도하고, 안 되면 두고 간다 (out/은 git에 없다)
    if (!flag('shots')) {
      try {
        rmSync(outDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 500 });
      } catch {
        console.log(`(임시 폴더 ${outDir}를 지우지 못했습니다. 나중에 지워도 됩니다)`);
      }
    }
  }
}

if (failures.length === 0 && !flag('plan') && !opt('files')) {
  // 이번에 본 파일들의 내용을 통과 기록에 적는다 (--all이면 바뀐 파일 전부)
  mkdirSync('out', { recursive: true });
  writeFileSync(GREEN, JSON.stringify({ ...readGreen(), ...hashes }, null, 1));
}
console.log(failures.length ? `\n실패 ${failures.length}개: ${failures.join(', ')}` : pending.length === 0 && steps.length === 0 ? '\n새로 확인할 것이 없습니다' : '\n모두 통과');
process.exit(failures.length ? 1 : 0);
