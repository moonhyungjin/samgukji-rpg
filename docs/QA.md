# QA: 어떤 변경에 어떤 검사를 돌리나

한 줄로 말하면: **`npm run qa` 가 바뀐 파일을 보고 필요한 검사만 골라 돌린다.** 무엇을 돌릴지는 아래 표(원본: `tools/qa/rules.mjs`)가 정한다. 돌리기 전에 계획을 먼저 보고 싶으면 `npm run qa -- --plan`.

## 한눈에 보기

| 내가 한 일 | 돌아가는 검사 | 걸리는 시간 |
|---|---|---|
| 문서만 고침 (`.md`) | 없음 | 0초 |
| 그림 파일이나 에셋 스크립트만 바꿈 | 없음. Lab **에셋 검수 → 게임 화면에서 보기**로 눈으로 확인 | 0초 |
| 수치 데이터만 바꿈 (balance, skills, unitTypes, characters) | typecheck + vitest 전체. **수치를 바꿨다면 `npm run sim` 전후 비교**는 손으로 | 약 20초 |
| 캠페인/편성/지도 데이터를 바꿈 | typecheck + vitest 전체 + 게임 캠페인 브라우저 구간. `npm run sim:campaign`으로 난이도 | 약 1분 |
| 엔진 규칙을 바꿈 | typecheck + vitest 전체 + 게임 전투 브라우저 구간. 규칙/공식이면 sim 전후 비교 | 약 1분 |
| Lab 한 탭을 고침 | typecheck + Lab vitest + **그 탭의 Lab 브라우저 구간만** | 약 30초~1분 |
| 게임 전투/캠페인/전략 화면을 고침 | typecheck + 게임 vitest + **그 화면의 브라우저 구간만** | 약 30초~1분 |
| 에셋 검수/Viewer를 고침 | Lab `art` 구간 + 게임 `viewer` 구간 | 약 1분 |
| 브라우저 검사 스크립트 자체를 고침 | 그 스크립트 전체 | 약 2분 |
| 커밋/푸시 전, 큰 변경 뒤 | `npm run qa -- --all` (전부) | 약 3~4분 |

## 단계 (커밋이 오래 걸리지 않게)

| 단계 | 언제 | 명령 | 시간 |
|---|---|---|---|
| 0 | 고치는 도중 | `npx vitest run <고친 폴더>` | 몇 초 |
| 1 | 한 덩어리 끝났을 때 | `npm run qa` (바뀐 것에 맞춰 자동. **통과하면 기록**이 남는다) | 파일 종류에 따라 10초~2분 |
| 2 | 커밋 직전 | `npm run qa -- --commit` (**이미 통과한 파일은 건너뛴다**. 싼 검사 typecheck와 vitest는 항상) | 이미 확인했다면 **약 13초** |
| 3 | 큰 변경 뒤, 가끔 | `npm run qa -- --all` (통과 기록을 무시하고 전부) | 약 4~5분 |
| 수치/규칙 | 수치나 규칙을 바꿨을 때 | 위에 더해 `npm run sim` 같은 시드 전후 비교 | 수 초 |

핵심은 **작업하면서 1단계를 그때그때 돌려 두는 것**이다. 그러면 커밋할 때 2단계는 거의 바로 끝난다. 통과 기록은 `out/qa-green.json`에 파일 내용(해시) 기준으로 남고, 파일이 바뀌면 그 파일만 다시 본다.

## 출력과 안전장치

- 브라우저 검사는 **첫 실패에서 멈춘다** (`--keep-going`이면 끝까지). 단계마다 시간 제한이 있다 (typecheck 2분, vitest 3분, 브라우저 4분). Lab과 게임 브라우저 검사는 서로 다른 브라우저 프로필을 쓴다 (같이 쓰면 앞 검사의 창이 되살아나 뒤 검사를 방해한다).
- 출력은 **계획 → 단계별 ✔/✘ → 실패한 줄만**이다. 스크린샷은 `--shots`를 줄 때만 `out/qa`에 남긴다.
- 브라우저 검사는 자기 서버(Lab 5183, 게임 5185)를 띄웠다 끈다. **사용자의 개발 서버(5173, 5174)는 건드리지 않는다.**
- 검사가 `packages/game-data/data`나 `docs/art/review.json`을 바꾸면 검사 전 상태로 되돌린다.
- 규칙표에 없는 파일이 바뀌면 "규칙에 없는 파일"이라고 알려 준다. 그때 `tools/qa/rules.mjs`에 규칙을 추가하고 `npm run qa -- --rules --write`로 이 표를 갱신한다 (표가 규칙과 다르면 `vitest`가 실패한다).
- 브라우저 구간: Lab = `screens`(탭 훑기와 스킬 저장), `art`(에셋 검수와 Viewer), `characters`, `unittypes`, `presets`, `external`(파일이 밖에서 바뀔 때). 게임 = `battle`, `campaign`, `strategy`, `viewer`. 직접 고르려면 `LAB_E2E_SECTION=art,characters npm run e2e:lab`, `GAME_E2E_SECTION=campaign npm run e2e`.

## 전체 규칙표 (자동 생성: `npm run qa -- --rules --write`)

<!-- qa-table:begin -->
| 바뀐 것 | typecheck | vitest | Lab 브라우저 구간 | 게임 브라우저 구간 | 안내 |
|---|---|---|---|---|---|
| 문서만 (docs/**.md, README, TODO, CLAUDE, 변경 기록) |  |  |  |  | 실행하지 않는다 (문서는 읽어서 확인) |
| 그림 파일, 미리보기 페이지, 에셋 만드는 스크립트 |  |  |  |  | 실행하지 않는다 (Lab의 에셋 검수 탭 → 게임 화면에서 보기로 눈으로 확인) |
| 에셋 슬롯 정의/검수 결과 (docs/art/battle-slots.json, review.json) |  | apps/balance-lab/src/lib | art |  |  |
| 엔진 테스트 파일 (packages/battle-engine/test) | 전체 | 전부 |  |  |  |
| 전투 엔진 (packages/battle-engine/src) | 전체 | 전부 |  | battle | 규칙/공식을 바꿨다면 `npm run sim` 전후 비교 (같은 시드) |
| 캠페인 규칙 (packages/battle-engine/src/campaign) | 전체 | 전부 |  | campaign | `npm run sim:campaign` 전후 비교 |
| 전략 규칙 (packages/battle-engine/src/strategy) | 전체 | 전부 |  | strategy |  |
| 데이터 읽는 코드 (packages/game-data/src) | 전체 | 전부 |  |  |  |
| 수치 데이터 (balance, skills, unitTypes, traits, characters) | 전체 | 전부 |  |  | 수치를 바꿨다면 `npm run sim` 전후 비교 (같은 시드) / 브라우저 검사 없음 (Lab 저장 검사는 데이터를 직접 바꾸므로 Lab 코드가 바뀔 때만) |
| 캠페인/편성/지도 데이터 (campaign, presets, map) | 전체 | 전부 |  | campaign | `npm run sim:campaign`으로 난이도 확인 |
| Lab 에셋 검수 (features/art, artApi, vite.config) | 전체 | apps/balance-lab | art |  |  |
| Lab 장수 탭 (CharactersTab, CharacterTable, UnitTypePicker) | 전체 | apps/balance-lab | characters |  |  |
| Lab 병종/스킬 (UnitType*, SkillTable, DataTab, 스킬 소유) | 전체 | apps/balance-lab | unittypes |  |  |
| Lab 기본 편성 (PresetsTab, PresetEditor, LineupEditor) | 전체 | apps/balance-lab | presets |  |  |
| Lab 데이터 편집의 공통 부분 (features/data 안의 그 밖의 파일, editor 공통) | 전체 | apps/balance-lab | unittypes, characters, presets |  |  |
| Lab 그 밖의 화면과 계산 (시뮬레이션, 밸런스, 캠페인, 지도, 저장 등) | 전체 | apps/balance-lab | screens |  |  |
| 게임 Viewer (ArtViewer, App.tsx) | 전체 | apps/game | art | viewer |  |
| 게임 캠페인 화면 (CampaignView, campaign/) | 전체 | apps/game |  | campaign |  |
| 게임 전략 지도 화면 (StrategyPreview, strategy.css) | 전체 | apps/game |  | strategy |  |
| 게임 전투 화면 (render/, battle/, 그 밖의 apps/game) | 전체 | apps/game |  | battle |  |
| 시뮬레이터 (tools/sim) | 전체 |  |  |  | `npm run sim -- --iterations 300`으로 오류 없이 도는지 확인 |
| Lab 브라우저 검사 스크립트 (tools/e2e/lab-e2e.mjs) |  |  | 전부 |  |  |
| 게임 브라우저 검사 스크립트 (tools/e2e/game-e2e.mjs) |  |  |  | 전부 |  |
| QA 도구 자체 (tools/qa) |  | tools/qa |  |  | `npm run qa -- --plan`으로 계획 출력 확인 |
| 설정 (package.json, tsconfig, .gitignore) | 전체 | 전부 |  |  |  |
<!-- qa-table:end -->
