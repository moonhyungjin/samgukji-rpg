// QA 규칙표: "무엇이 바뀌었을 때 어떤 검사를 돌리는가"의 단 하나의 원본.
// `npm run qa -- --rules` 가 이 표를 사람이 읽는 표로 보여 주고, `--write`는 docs/QA.md에 옮겨 적는다.
// 파일이 여러 규칙에 걸리면 검사를 합친다 (같은 검사는 한 번만 돈다). 위에서부터 보지만 첫 규칙에서 멈추지 않는다.
//
// 검사 종류
//   typecheck : 전체 tsc (약 4초). 코드가 바뀌었으면 항상 돈다.
//   vitest    : 경로를 주면 그 폴더의 테스트만, 'all'이면 전부 (약 14초)
//   lab       : Lab 브라우저 검사 구간 (tools/e2e/lab-e2e.mjs, LAB_E2E_SECTION)
//   game      : 게임 화면 브라우저 검사 구간 (tools/e2e/game-e2e.mjs, GAME_E2E_SECTION)
//   sim       : 수치/규칙 변경이라 같은 시드로 전후 비교가 필요하다는 안내 (자동으로 돌리지 않는다)

export const LAB_SECTIONS = ['screens', 'art', 'characters', 'unittypes', 'presets', 'external'];
export const GAME_SECTIONS = ['battle', 'campaign', 'strategy', 'viewer'];

/** @typedef {{ id: string, when: string, test: RegExp, typecheck?: boolean, vitest?: string[] | 'all', lab?: string[] | 'all', game?: string[] | 'all', sim?: string, note?: string }} Rule */

/** @type {Rule[]} */
export const RULES = [
  {
    id: 'docs',
    when: '문서만 (docs/**.md, README, TODO, CLAUDE, 변경 기록)',
    test: /^(docs\/(?!art\/(battle-slots|review)\.json$).*\.(md|json)$|[^/]+\.md$|packages\/game-data\/data\/changelog\.md$)/,
    note: '실행하지 않는다 (문서는 읽어서 확인)',
  },
  {
    id: 'art-files',
    when: '그림 파일, 미리보기 페이지, 에셋 만드는 스크립트',
    test: /^(apps\/game\/public\/art\/|docs\/art\/(?!battle-slots\.json$|review\.json$)|scripts\/|tools\/art\/)/,
    note: '실행하지 않는다 (Lab의 에셋 검수 탭 → 게임 화면에서 보기로 눈으로 확인)',
  },
  {
    id: 'art-slots',
    when: '에셋 슬롯 정의/검수 결과 (docs/art/battle-slots.json, review.json)',
    test: /^docs\/art\/(battle-slots|review)\.json$/,
    vitest: ['apps/balance-lab/src/lib'],
    lab: ['art'],
  },
  {
    id: 'engine',
    when: '전투 엔진 (packages/battle-engine/src)',
    test: /^packages\/battle-engine\/src\/(?!campaign\/|strategy\/)/,
    typecheck: true,
    vitest: 'all',
    game: ['battle'],
    sim: '규칙/공식을 바꿨다면 `npm run sim` 전후 비교 (같은 시드)',
  },
  {
    id: 'engine-campaign',
    when: '캠페인 규칙 (packages/battle-engine/src/campaign)',
    test: /^packages\/battle-engine\/src\/campaign\//,
    typecheck: true,
    vitest: 'all',
    game: ['campaign'],
    sim: '`npm run sim:campaign` 전후 비교',
  },
  {
    id: 'engine-strategy',
    when: '전략 규칙 (packages/battle-engine/src/strategy)',
    test: /^packages\/battle-engine\/src\/strategy\//,
    typecheck: true,
    vitest: 'all',
    game: ['strategy'],
  },
  {
    id: 'game-data-code',
    when: '데이터 읽는 코드 (packages/game-data/src)',
    test: /^packages\/game-data\/src\//,
    typecheck: true,
    vitest: 'all',
  },
  {
    id: 'data-numbers',
    when: '수치 데이터 (balance, skills, unitTypes, traits, characters)',
    test: /^packages\/game-data\/data\/(balance|skills|unitTypes|traits|characters)\.json$/,
    typecheck: true,
    vitest: 'all',
    sim: '수치를 바꿨다면 `npm run sim` 전후 비교 (같은 시드)',
    note: '브라우저 검사 없음 (Lab 저장 검사는 데이터를 직접 바꾸므로 Lab 코드가 바뀔 때만)',
  },
  {
    id: 'data-campaign',
    when: '캠페인/편성/지도 데이터 (campaign, presets, map)',
    test: /^packages\/game-data\/data\/(campaign|presets|map)\.json$/,
    typecheck: true,
    vitest: 'all',
    game: ['campaign'],
    sim: '`npm run sim:campaign`으로 난이도 확인',
  },
  {
    id: 'lab-art',
    when: 'Lab 에셋 검수 (features/art, artApi, vite.config)',
    test: /^apps\/balance-lab\/(src\/features\/art\/|artApi|vite\.config)/,
    typecheck: true,
    vitest: ['apps/balance-lab'],
    lab: ['art'],
  },
  {
    id: 'lab-characters',
    when: 'Lab 장수 탭 (CharactersTab, CharacterTable, UnitTypePicker)',
    test: /^apps\/balance-lab\/src\/features\/data\/(CharactersTab|editor\/components\/(CharacterTable|UnitTypePicker)|editor\/lib\/editor)/,
    typecheck: true,
    vitest: ['apps/balance-lab'],
    lab: ['characters'],
  },
  {
    id: 'lab-unittypes',
    when: 'Lab 병종/스킬 (UnitType*, SkillTable, DataTab, 스킬 소유)',
    test: /^apps\/balance-lab\/src\/features\/data\/(UnitType|SkillTable|DataTab|skillOwnership|editor\/components\/(UnitTypeEditor|unittype\/)|editor\/lib\/unitTypes)/,
    typecheck: true,
    vitest: ['apps/balance-lab'],
    lab: ['unittypes'],
  },
  {
    id: 'lab-presets',
    when: 'Lab 기본 편성 (PresetsTab, PresetEditor, LineupEditor)',
    test: /^apps\/balance-lab\/src\/features\/data\/(PresetsTab|LineupEditor|editor\/components\/PresetEditor|editor\/lib\/presets)/,
    typecheck: true,
    vitest: ['apps/balance-lab'],
    lab: ['presets'],
  },
  {
    id: 'lab-data',
    when: 'Lab 데이터 편집의 공통 부분 (features/data 안의 그 밖의 파일, editor 공통)',
    test: /^apps\/balance-lab\/src\/features\/data\//,
    typecheck: true,
    vitest: ['apps/balance-lab'],
    lab: ['unittypes', 'characters', 'presets'],
  },
  {
    id: 'lab-other',
    when: 'Lab 그 밖의 화면과 계산 (시뮬레이션, 밸런스, 캠페인, 지도, 저장 등)',
    test: /^apps\/balance-lab\//,
    typecheck: true,
    vitest: ['apps/balance-lab'],
    lab: ['screens'],
  },
  {
    id: 'game-viewer',
    when: '게임 Viewer (ArtViewer, App.tsx)',
    test: /^apps\/game\/src\/(components\/ArtViewer|App\.tsx)/,
    typecheck: true,
    vitest: ['apps/game'],
    game: ['viewer'],
    lab: ['art'],
  },
  {
    id: 'game-campaign',
    when: '게임 캠페인 화면 (CampaignView, campaign/)',
    test: /^apps\/game\/src\/(components\/CampaignView|campaign\/)/,
    typecheck: true,
    vitest: ['apps/game'],
    game: ['campaign'],
  },
  {
    id: 'game-strategy',
    when: '게임 전략 지도 화면 (StrategyPreview, strategy.css)',
    test: /^apps\/game\/src\/(components\/StrategyPreview|strategy\.css)/,
    typecheck: true,
    vitest: ['apps/game'],
    game: ['strategy'],
  },
  {
    id: 'game-battle',
    when: '게임 전투 화면 (render/, battle/, 그 밖의 apps/game)',
    test: /^apps\/game\//,
    typecheck: true,
    vitest: ['apps/game'],
    game: ['battle'],
  },
  {
    id: 'sim-tools',
    when: '시뮬레이터 (tools/sim)',
    test: /^tools\/sim\//,
    typecheck: true,
    sim: '`npm run sim -- --iterations 300`으로 오류 없이 도는지 확인',
  },
  {
    id: 'e2e-lab',
    when: 'Lab 브라우저 검사 스크립트 (tools/e2e/lab-e2e.mjs)',
    test: /^tools\/e2e\/lab-e2e\.mjs$/,
    lab: 'all',
  },
  {
    id: 'e2e-game',
    when: '게임 브라우저 검사 스크립트 (tools/e2e/game-e2e.mjs)',
    test: /^tools\/e2e\/game-e2e\.mjs$/,
    game: 'all',
  },
  {
    id: 'qa-tool',
    when: 'QA 도구 자체 (tools/qa)',
    test: /^tools\/qa\//,
    vitest: ['tools/qa'],
    note: '`npm run qa -- --plan`으로 계획 출력 확인',
  },
  {
    id: 'config',
    when: '설정 (package.json, tsconfig, .gitignore)',
    test: /^(package\.json|tsconfig[^/]*\.json|\.gitignore|apps\/[^/]+\/(package|tsconfig)[^/]*\.json|packages\/[^/]+\/(package|tsconfig)[^/]*\.json)$/,
    typecheck: true,
    vitest: 'all',
  },
];

/** 변경된 파일 목록 → 돌릴 검사 계획. 어느 규칙에도 안 걸린 파일은 `unmatched`에 모은다. */
export function plan(files) {
  const out = { typecheck: false, vitest: new Set(), vitestAll: false, lab: new Set(), game: new Set(), sim: new Set(), notes: new Set(), matched: new Map(), unmatched: [] };
  const labAll = () => LAB_SECTIONS.forEach((s) => out.lab.add(s));
  const gameAll = () => GAME_SECTIONS.forEach((s) => out.game.add(s));
  for (const file of files) {
    const hits = [];
    let stop = false;
    for (const rule of RULES) {
      if (!rule.test.test(file)) continue;
      hits.push(rule.id);
      if (rule.typecheck) out.typecheck = true;
      if (rule.vitest === 'all') out.vitestAll = true;
      else for (const p of rule.vitest ?? []) out.vitest.add(p);
      if (rule.lab === 'all') labAll();
      else for (const s of rule.lab ?? []) out.lab.add(s);
      if (rule.game === 'all') gameAll();
      else for (const s of rule.game ?? []) out.game.add(s);
      if (rule.sim) out.sim.add(rule.sim);
      if (rule.note) out.notes.add(rule.note);
      // 문서/그림은 다른 규칙과 겹치지 않는다. 코드 규칙은 첫 규칙에서 멈춰 같은 파일이 여러 구간을 부르지 않게 한다
      if (['docs', 'art-files'].includes(rule.id) || rule.id.startsWith('lab-') || rule.id.startsWith('game-') || rule.id.startsWith('engine') || rule.id.startsWith('data-')) stop = true;
      if (stop) break;
    }
    if (hits.length === 0) out.unmatched.push(file);
    else out.matched.set(file, hits);
  }
  return out;
}

/** 규칙표를 사람이 읽는 마크다운 표로 */
export function rulesTable() {
  const cell = (v) => (v === undefined ? '' : v === 'all' ? '전부' : Array.isArray(v) ? v.join(', ') : String(v));
  const rows = RULES.map((r) => `| ${r.when} | ${r.typecheck ? '전체' : ''} | ${cell(r.vitest)} | ${cell(r.lab)} | ${cell(r.game)} | ${[r.sim, r.note].filter(Boolean).join(' / ')} |`);
  return ['| 바뀐 것 | typecheck | vitest | Lab 브라우저 구간 | 게임 브라우저 구간 | 안내 |', '|---|---|---|---|---|---|', ...rows].join('\n');
}
