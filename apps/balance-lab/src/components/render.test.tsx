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
import { PresetsTab } from './PresetsTab';
import { SaveBar } from './SaveBar';
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
    // 행동력 → AP 설정
    expect(html).toContain('행동력 → AP');
    expect(html).toContain('행동력 몇 마다 AP 1');
    // 병력 보정 방식 선택과 상대 비교 설정
    for (const label of ['병력 보정 방식', '[상대 비교] 하한', '[상대 비교] 상한', '[상대 비교] 지수', '[지력 기반] 하한', '[지력 기반] 상한']) expect(html).toContain(label);
  });

  it('병종 · 스킬 탭에 병종 카드와 스킬 표가 보인다', () => {
    const html = render(<DataTab />);
    expectClean(html);
    expect(html).toContain('보병');
    // 특성은 나중에 추가하기로 해서 화면에서 뺐다
    expect(html).not.toContain('병종 특성');
    expect(html).not.toContain('근접에 취약');
    expect(html).toContain('책략');
    // 병종 카드: 기본 AP, 사거리, 반격 비율, 받는 피해 배수, 스탯 보정, 가드 설정
    for (const label of ['기본 AP', '사거리', '반격 비율', '받는 피해 배수', '스탯 보정', '줄 때 전열', '줄 때 후열', '가드 (같은 열 아군을 대신 맞을 확률)', '추가 스킬']) expect(html).toContain(label);
    for (const id of Object.keys(state.data.unitTypes)) expect(html).toContain(`data-unittype="${id}"`);
    // 스킬 표: 가드로 막힘, 방어 무시, 버프 설정
    expect(html).toContain('가드로 막힘');
    expect(html).toContain('방어 무시');
    expect(html).toContain('피해 무시 횟수');
    expect(html).toContain('>가드<');
  });

  it('캐릭터 탭에 모든 캐릭터가 보인다', () => {
    const html = render(<CharactersTab />);
    expectClean(html);
    for (const c of Object.values(state.data.characters)) expect(html).toContain(`value="${c.name}"`);
    // 계산값(실제 공/방/지/속, 총 AP, 병력, 1회 피해)과 편집 도구
    for (const label of ['실제 공/방/지/속', '총 AP', '병력', '1회 피해', '+ 새 장수', '이름/id 검색']) expect(html).toContain(label);
    // 서버 렌더링은 인접한 텍스트 사이에 <!-- --> 를 끼워 넣으므로 지우고 비교한다
    const plain = html.replace(/<!-- -->/g, '');
    expect(plain).toContain(`${Object.keys(state.data.characters).length} / ${Object.keys(state.data.characters).length}명`);
  });

  it('기본 편성 탭에 편성 카드가 모두 나온다', () => {
    const html = render(<PresetsTab />);
    expectClean(html);
    for (const p of state.presets) expect(html).toContain(`data-preset="${p.id}"`);
    for (const label of ['전열', '후열', '+ 새 편성', '(비움)']) expect(html).toContain(label);
  });

  it('파일 저장 줄: 처음에는 프로젝트 파일과 같고 저장 버튼이 꺼져 있다', () => {
    const html = render(<SaveBar />);
    expectClean(html);
    expect(html).toContain('프로젝트 파일과 같음');
    expect(html).toMatch(/<button[^>]*class="primary"[^>]*disabled=""[^>]*>파일에 저장<\/button>/);
    expect(html).toContain('파일 값으로 되돌리기');
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
