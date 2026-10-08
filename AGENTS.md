# 에이전트 안내

이 저장소의 개발 규칙은 **`CLAUDE.md`** 에 있다. 작업 전에 `CLAUDE.md`, `docs/HANDOFF.md`를 읽는다. 무엇을 만드는지는 `GAME_DESIGN.md`, 지금 할 일은 `TODO.md`다.

특히 지킬 것:

- 게임 디자인(규칙, 수치, 병종 개성)은 사용자가 정한다. 임의로 정하지 않고, 해석이 들어가면 밝힌다.
- 작게 만들고 실행해서 확인한다. 요청과 무관한 파일과 리팩터링은 건드리지 않는다.
- `packages/battle-engine`은 순수 TypeScript다 (React/PixiJS/DOM 금지). 화면은 엔진의 이벤트를 재생만 한다. 애니메이션이 결과를 정하지 않는다.
- 게임 데이터는 `packages/game-data/data/*.json`이고 Balance Lab(`npm run lab`)에서 고치고 저장한다. 손으로 고치지 않는다.
- 확인: `npm run typecheck`, `npm test`. 화면 변경은 `npm run e2e`(게임), `npm run e2e:lab`(Lab).
- 커밋과 푸시는 사용자가 요청했을 때만 한다. 내가 만들지 않은 변경을 커밋에 섞지 않는다.
- 아트 에셋은 `apps/game/public/art/battle/`(실행용)과 `docs/art/`(원본, 프롬프트, 검토 자료)에 둔다. 연결 방식은 `docs/art/battle-integration.md`.
- **디자인 담당은 `docs/art/WORKFLOW.md`의 분업 규칙을 따른다.** 기존 데이터를 사용해 에셋·게임 UI를 맡고, 엔진·데이터·Lab은 수정/검사하지 않는다. 공통 검증을 일괄 실행하지 않고 변경한 게임 화면만 필요한 만큼 확인한다. 전투 애니메이션은 추후 요청 시 맡는다.
- **엔진·데이터·Lab의 변경이나 검토가 필요하면 직접 하지 않고 개발 담당에게 넘긴다:** `TODO.md`의 "담당 간 요청"에 한 줄로 남기고 사용자에게 알린다. 담당 영역 표는 `CLAUDE.md` 1장.
