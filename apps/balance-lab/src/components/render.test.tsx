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
import { DamageCalculatorPanel } from './DamageCalculatorPanel';
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

  it('밸런스 수치 탭 맨 위에 지금 값이 들어간 피해 공식이 식의 모양으로 나온다', () => {
    const html = render(<BalanceTab />);
    const { balance } = createDefaultState();
    expect(html).toContain('지금 피해 공식');
    expect(html).toContain('최종 피해');
    expect(html).toContain('병력 보정');
    if (balance.damage.formula === 'gap') {
      expect(html).toContain('격차 배율');
      expect(html).toContain(`<b class="num">${balance.damage.attackScale}</b>`);
      expect(html).toContain(`<b class="num">${balance.damage.gap!.perPoint}</b>`);
    }
    if (balance.critical?.chance) expect(html).toContain('크리티컬');
  });

  it('밸런스 수치 탭: 지금 공식에서 쓰지 않는 칸은 흐리게 표시한다', () => {
    const html = render(<BalanceTab />);
    const state = createDefaultState();
    const labels = [...html.matchAll(/<label class="field unused"[^>]*><span>([^<]*)<\/span>/g)].map((m) => m[1]);
    if (state.balance.damage.formula === 'gap') {
      expect(labels).toContain('[원작식] 공격 1당');
      expect(labels).toContain('[기존] 방어 계수 (defenseScale)');
      expect(labels).not.toContain('[격차식] 격차 1점당 비율');
    }
    if ((state.balance.troopFactor.mode ?? 'absolute') !== 'tiered') expect(labels).toContain('[구간식] 꺾이는 지점');
    // 공식과 무관한 값은 흐리게 하지 않는다
    expect(labels).not.toContain('최소 피해');
    expect(labels).not.toContain('치명타 확률 % (0이면 꺼짐)');
  });

  it('피해 계산기: 병종 중심으로 값의 출처와 계산 과정이 나온다', () => {
    const html = render(<DamageCalculatorPanel />);
    expectClean(html);
    expect(html).toContain('피해 계산기');
    for (const label of ['한 번 맞는 피해', '최종 피해', '병력 보정', '받는 피해 배수', '반격', '공식에 들어가는 값과 출처', '어디서 가져오나', '수정하러 가기', '공격 병종', '방어 병종']) expect(html).toContain(label);
    // 병종 보정/대상 취약의 출처 칸이 보인다
    expect(html).toContain('병종 보정');
    expect(html).toContain('대상 취약');
    expect(html).toContain('병종 · 스킬 탭 &gt;');
  });

  it('병종 · 스킬 탭: 계열 탭과 승급 트리, 선택한 병종의 카드, 카드 안의 스킬이 보인다', () => {
    const html = render(<DataTab />);
    expectClean(html);
    expect(html).toContain('보병');
    // 특성은 나중에 추가하기로 해서 화면에서 뺐다
    expect(html).not.toContain('병종 특성');
    expect(html).not.toContain('근접에 취약');
    // 계열 탭: 승급 트리의 뿌리마다 하나. 트리 그림에는 그 계열의 모든 병종이 있다
    expect(html).toContain('role="tablist"');
    for (const root of ['infantry', 'shield', 'cavalry', 'archer', 'strategist', 'taoist', 'geomancer']) expect(html).toContain(`data-root="${root}"`);
    for (const id of ['infantry', 'light-infantry', 'heavy-infantry', 'assault-infantry', 'royal-guard']) expect(html).toContain(`data-node="${id}"`);
    // 선택한 병종(처음에는 첫 병종)의 카드만 그린다: 기본 AP, 사거리, 스탯 보정, 피해 배수, 가드, 스킬
    expect(html).toContain('data-unittype="infantry"');
    expect(html).not.toContain('data-unittype="light-infantry"');
    for (const label of ['기본 AP', '사거리', '스탯 보정', '보정 합계', '줄 때 전열', '줄 때 후열', '가드 (같은 열 아군을 대신 맞을 확률)', '추가 스킬', '스킬 (이 병종이 쓰는 것)']) expect(html).toContain(label);
    // 카드 안의 스킬 표: 이 병종의 스킬만 있다. 스킬은 공용이라 여러 병종이 같이 쓰면 공유 경고가 나온다
    expect(html).toContain('data-skills-of="infantry"');
    expect(html).toContain('같이 씁니다');
    expect(html).toContain('이 병종 전용으로 복제');
    // 전체 스킬 표(항상 펼쳐짐)에는 모든 스킬과 버프 설정이 있다
    expect(html).toContain('전체 스킬 표');
    for (const id of Object.keys(state.data.skills)) expect(html).toContain(`data-skill="${id}"`);
    for (const label of ['가드로 막힘', '방어 무시', '피해 무시 횟수']) expect(html).toContain(label);
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
    expect(html.match(/class="slot"/g)).toHaveLength(6);
    // 칸마다 지금 맡은 병종(승급 단계)을 고를 수 있다
    expect(html).toContain('장수 병종 (기본)');
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
