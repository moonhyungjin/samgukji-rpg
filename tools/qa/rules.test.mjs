import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { GAME_SECTIONS, LAB_SECTIONS, RULES, plan, rulesTable } from './rules.mjs';

describe('QA 규칙표', () => {
  it('문서만 바뀌면 아무것도 돌리지 않는다', () => {
    const p = plan(['docs/design/01-character-and-unit.md', 'TODO.md', 'packages/game-data/data/changelog.md', 'docs/art/battle-slots.md']);
    expect(p.typecheck).toBe(false);
    expect(p.vitestAll).toBe(false);
    expect([p.vitest.size, p.lab.size, p.game.size]).toEqual([0, 0, 0]);
    expect(p.unmatched).toEqual([]);
  });

  it('그림 파일과 에셋 스크립트도 돌리지 않는다 (눈으로 확인)', () => {
    const p = plan(['apps/game/public/art/battle/plain-v1.png', 'docs/art/ui-sheets/catalog.html', 'scripts/generate_ui_assets.py']);
    expect([p.typecheck, p.vitestAll, p.lab.size, p.game.size]).toEqual([false, false, 0, 0]);
  });

  it('엔진을 고치면 전체 typecheck와 vitest, 게임 전투 화면 검사를 돌린다', () => {
    const p = plan(['packages/battle-engine/src/engine.ts']);
    expect(p.typecheck).toBe(true);
    expect(p.vitestAll).toBe(true);
    expect([...p.game]).toEqual(['battle']);
    expect([...p.sim].length).toBe(1); // sim 전후 비교 안내
  });

  it('캠페인 규칙/데이터는 게임 캠페인 구간을 돌린다', () => {
    expect([...plan(['packages/battle-engine/src/campaign/rules.ts']).game]).toEqual(['campaign']);
    expect([...plan(['packages/game-data/data/campaign.json']).game]).toEqual(['campaign']);
  });

  it('수치 데이터만 바뀌면 브라우저 검사 없이 vitest 전체와 sim 안내다', () => {
    const p = plan(['packages/game-data/data/unitTypes.json']);
    expect([p.vitestAll, p.lab.size, p.game.size]).toEqual([true, 0, 0]);
    expect(p.sim.size).toBe(1);
  });

  it('Lab 화면은 고친 탭의 구간만 돌린다', () => {
    expect([...plan(['apps/balance-lab/src/features/art/ArtReviewTab.tsx']).lab]).toEqual(['art']);
    expect([...plan(['apps/balance-lab/src/features/data/CharactersTab.tsx']).lab]).toEqual(['characters']);
    expect([...plan(['apps/balance-lab/src/features/data/editor/components/UnitTypeEditor.tsx']).lab]).toEqual(['unittypes']);
    expect([...plan(['apps/balance-lab/src/features/data/PresetsTab.tsx']).lab]).toEqual(['presets']);
    expect([...plan(['apps/balance-lab/src/features/balance/BalanceTab.tsx']).lab]).toEqual(['screens']);
    expect(plan(['apps/balance-lab/src/features/balance/BalanceTab.tsx']).game.size).toBe(0);
  });

  it('게임 화면은 고친 화면의 구간만 돌린다', () => {
    expect([...plan(['apps/game/src/render/BattleScene.ts']).game]).toEqual(['battle']);
    expect([...plan(['apps/game/src/components/CampaignView.tsx']).game]).toEqual(['campaign']);
    expect([...plan(['apps/game/src/components/StrategyPreview.tsx']).game]).toEqual(['strategy']);
    const viewer = plan(['apps/game/src/components/ArtViewer.tsx']);
    expect([...viewer.game]).toEqual(['viewer']);
    expect([...viewer.lab]).toEqual(['art']); // Lab이 이 화면을 iframe으로 쓴다
  });

  it('Lab 데이터 편집의 공통 파일은 데이터 편집 구간 셋을 모두 돌린다', () => {
    expect([...plan(['apps/balance-lab/src/features/data/editor/lib/presets.ts']).lab]).toEqual(['presets']); // 편성 전용
    expect([...plan(['apps/balance-lab/src/features/data/editor/components/components.test.tsx']).lab].sort()).toEqual(['characters', 'presets', 'unittypes']);
  });

  it('여러 파일이면 검사를 합치고 같은 검사는 한 번만 센다', () => {
    const p = plan(['apps/balance-lab/src/features/data/CharactersTab.tsx', 'apps/balance-lab/src/features/data/PresetsTab.tsx', 'apps/balance-lab/src/features/data/PresetsTab.tsx']);
    expect([...p.lab].sort()).toEqual(['characters', 'presets']);
    expect([...p.vitest]).toEqual(['apps/balance-lab']);
  });

  it('브라우저 검사 스크립트를 고치면 그 스크립트 전체를 돌린다', () => {
    expect(plan(['tools/e2e/lab-e2e.mjs']).lab.size).toBe(LAB_SECTIONS.length);
    expect(plan(['tools/e2e/game-e2e.mjs']).game.size).toBe(GAME_SECTIONS.length);
  });

  it('규칙에 없는 파일은 알려 준다', () => {
    expect(plan(['something/unknown.txt']).unmatched).toEqual(['something/unknown.txt']);
  });

  it('규칙이 부르는 구간은 모두 e2e 스크립트에 있는 구간이다', () => {
    const labText = readFileSync(new URL('../e2e/lab-e2e.mjs', import.meta.url), 'utf-8');
    for (const s of LAB_SECTIONS) expect(labText.includes(`on('${s}')`), `lab ${s}`).toBe(true);
    const gameText = readFileSync(new URL('../e2e/game-e2e.mjs', import.meta.url), 'utf-8');
    for (const s of GAME_SECTIONS) expect(gameText.includes(`'${s}'`), `game ${s}`).toBe(true);
    for (const r of RULES) {
      for (const s of Array.isArray(r.lab) ? r.lab : []) expect(LAB_SECTIONS, `${r.id}`).toContain(s);
      for (const s of Array.isArray(r.game) ? r.game : []) expect(GAME_SECTIONS, `${r.id}`).toContain(s);
    }
  });

  it('docs/QA.md의 표가 규칙표와 같다 (npm run qa -- --rules --write 로 갱신)', () => {
    const doc = readFileSync(new URL('../../docs/QA.md', import.meta.url), 'utf-8').replace(/\r\n/g, '\n');
    const a = doc.indexOf('<!-- qa-table:begin -->');
    const b = doc.indexOf('<!-- qa-table:end -->');
    expect(a).toBeGreaterThan(-1);
    expect(doc.slice(a + '<!-- qa-table:begin -->'.length, b).trim()).toBe(rulesTable().trim());
  });
});
