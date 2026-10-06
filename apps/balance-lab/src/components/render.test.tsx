import { BattleSimulator } from '@samgukji/battle-engine';
import { renderToString } from 'react-dom/server';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { createDefaultState } from '../lab/defaults';
import { LabProvider } from '../lab/LabContext';
import type { SimulationHook } from '../lab/useSimulation';
import { BalanceTab } from './BalanceTab';
import { BattleTab } from './BattleTab';
import { CharactersTab } from './CharactersTab';
import { DataTab } from './DataTab';
import { LineupEditor } from './LineupEditor';
import { SettingsTab } from './SettingsTab';
import { SimulationTab } from './SimulationTab';

// 브라우저 없이 모든 화면이 오류 없이 그려지고, NaN/undefined가 새지 않는지 확인하는 스모크 테스트.
const render = (node: ReactNode) => renderToString(<LabProvider>{node}</LabProvider>);
const expectClean = (html: string) => {
  expect(html).not.toContain('NaN');
  expect(html).not.toContain('undefined');
  expect(html.length).toBeGreaterThan(200);
};

const state = createDefaultState();
const idle: SimulationHook = { report: null, previous: null, running: false, error: null, elapsedMs: 0, run: () => {} };

describe('Balance Lab 화면 렌더링', () => {
  it('밸런스 수치 탭', () => {
    const html = render(<BalanceTab />);
    expectClean(html);
    expect(html).toContain('피해 공식');
    expect(html).toContain('사기');
  });

  it('병종 · 특성 · 스킬 탭에 기본 병종과 예시 특성이 보인다', () => {
    const html = render(<DataTab />);
    expectClean(html);
    expect(html).toContain('보병');
    expect(html).toContain('대기병');
    expect(html).toContain('근접에 취약');
    expect(html).toContain('책략');
  });

  it('캐릭터 탭에 모든 캐릭터가 보인다', () => {
    const html = render(<CharactersTab />);
    expectClean(html);
    for (const c of Object.values(state.data.characters)) expect(html).toContain(c.name);
  });

  it('목표 · 가져오기 탭', () => {
    const html = render(<SettingsTab />);
    expectClean(html);
    expect(html).toContain('목표 지표');
    expect(html).toContain('궁병');
  });

  it('편성 편집기는 전열/후열 6칸을 그린다', () => {
    const html = render(<LineupEditor teamKey="teamA" title="팀 A" />);
    expectClean(html);
    expect(html).toContain('전열');
    expect(html).toContain('후열');
    expect(html.match(/<select/g)).toHaveLength(6);
  });

  it('전투 1회 탭', () => {
    const html = render(<BattleTab />);
    expectClean(html);
    expect(html).toContain('전투 1회 실행');
  });

  it('시뮬레이션 탭: 결과가 없을 때', () => {
    const html = render(<SimulationTab sim={idle} pinned={null} setPinned={() => {}} />);
    expectClean(html);
    expect(html).toContain('1,000회 실행');
    expect(html).toContain('아직 실행 결과가 없습니다');
  });

  it.each(['random', 'fixed'] as const)('시뮬레이션 탭: %s 편성 결과와 목표 점검', (lineups) => {
    const report = BattleSimulator.run({
      data: state.data,
      balance: state.balance,
      teamA: [{ characterId: 'guanYu', row: 'front' }, { characterId: 'zhugeLiang', row: 'back' }],
      teamB: [{ characterId: 'xuChu', row: 'front' }, { characterId: 'guoJia', row: 'back' }],
      iterations: 200,
      seed: 2,
      lineups,
    });
    const html = render(<SimulationTab sim={{ ...idle, report, previous: report, elapsedMs: 12 }} pinned={report} setPinned={() => {}} />);
    expectClean(html);
    expect(html).toContain('목표 지표 점검');
    expect(html).toContain('병종 계열별');
    expect(html).toContain('관우');
    expect(html).toContain('종료 원인');
  });
});
