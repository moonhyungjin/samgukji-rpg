import { defaultBalance, gameData, presets } from '@samgukji/game-data';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BattleController } from '../battle/controller';
import type { ControllerSnapshot, SceneLike } from '../battle/controller';
import { PlaySession } from '../battle/session';
import { DEFAULT_CONFIG } from '../lib/config';
import { CommandPanel, previewText } from './CommandPanel';
import { LogPanel } from './LogPanel';
import { SetupPanel } from './SetupPanel';

// PixiJS를 쓰지 않는 패널만 서버 렌더링으로 확인한다 (캔버스는 브라우저 검증 스크립트가 맡는다).
const scene: SceneLike = {
  setState: () => {},
  playEvent: async () => {},
  setTargets: () => {},
  clearTargets: () => {},
  setActing: () => {},
  setSpeed: () => {},
  setInstant: () => {},
};

async function snapshotOf(playerSide: 'attacker' | null, select = false): Promise<ControllerSnapshot> {
  const session = new PlaySession({ data: gameData, balance: defaultBalance, attacker: presets.shu, defender: presets.wei, seed: 1, playerSide });
  let last!: ControllerSnapshot;
  const controller = new BattleController(session, scene, gameData, (s) => (last = s));
  await controller.start();
  if (select) controller.selectSkill(last.waiting!.commands[0].skillId);
  return last;
}

const noop = () => {};
// 서버 렌더링은 인접한 텍스트 사이에 <!-- --> 를 끼워 넣는다. 브라우저의 textContent에는 없으므로 비교 전에 지운다.
const html = (node: React.ReactElement) => renderToString(node).replace(/<!-- -->/g, '');
const panel = (snapshot: ControllerSnapshot) =>
  html(<CommandPanel snapshot={snapshot} onSelectSkill={noop} onSubmit={noop} onAutoplay={noop} onSkip={noop} onRestart={noop} onExit={noop} />);

describe('previewText', () => {
  it('공격: 피해, 격파, 반격을 보여 준다', () => {
    const base = { kind: 'attack' as const, interceptChance: 0, targetBarrier: false };
    expect(previewText({ ...base, damage: 218, counter: 87, targetTroopsAfter: 782, actorTroopsAfter: 913 })).toBe('피해 218 · 반격 87');
    expect(previewText({ ...base, damage: 500, counter: 0, targetTroopsAfter: 0, actorTroopsAfter: 1000 })).toBe('피해 500 · 격파');
    expect(previewText({ ...base, damage: 100, counter: 0, targetTroopsAfter: 900, actorTroopsAfter: 1000 })).toBe('피해 100');
  });

  it('같은 열 가드가 막을 수 있으면 확률을 알려 준다', () => {
    const preview = { kind: 'attack' as const, targetBarrier: false, damage: 218, counter: 87, targetTroopsAfter: 782, actorTroopsAfter: 913 };
    expect(previewText({ ...preview, interceptChance: 0.75 })).toBe('피해 218 · 반격 87 · 가드가 막을 확률 75%');
    expect(previewText({ ...preview, interceptChance: 1 })).toContain('가드가 막을 확률 100%');
  });

  it('버프: 스탯형과 피해 무시형을 설명한다', () => {
    expect(previewText({ kind: 'buff', effect: { type: 'stats', pool: ['attack', 'defense', 'intellect', 'speed'], minCount: 1, maxCount: 3, amount: 1 } })).toBe('공격/방어/지력/속도 중 무작위 1~3가지 +1');
    expect(previewText({ kind: 'buff', effect: { type: 'barrier', charges: 1 } })).toBe('다음 피해 1회 무시');
  });

  it('대상에게 결계가 남아 있으면 피해 대신 알려 준다', () => {
    const preview = { kind: 'attack' as const, interceptChance: 0, damage: 218, counter: 0, targetTroopsAfter: 782, actorTroopsAfter: 1000 };
    expect(previewText({ ...preview, targetBarrier: true })).toBe('결계로 피해 무시');
  });

  it('가드: 올린 뒤의 확률을 보여 준다', () => {
    expect(previewText({ kind: 'guard', rateAfter: 120 })).toBe('막을 확률 120%');
  });

  it('회복: 회복량을 보여 준다', () => {
    expect(previewText({ kind: 'heal', amount: 230 })).toBe('회복 +230');
  });
});

describe('CommandPanel', () => {
  it('내 차례: 군단 정보, 스킬, 대기, AI 위임 버튼이 나온다', async () => {
    const html = panel(await snapshotOf('attacker'));
    expect(html).toContain('의 차례');
    expect(html).toContain('AP 4/4');
    expect(html).toContain('돌격 (AP 1)');
    expect(html).toContain('대기 (AP 소모 없음)');
    expect(html).toContain('AI에게 맡기기');
    expect(html).toContain('스킬을 고르면 대상과 예상 결과가 나옵니다');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('undefined');
  });

  it('스킬을 고르면 대상별 병력과 예상 결과가 나온다', async () => {
    const html = panel(await snapshotOf('attacker', true));
    expect(html).toContain('대상을 고르세요');
    expect(html).toContain('허저');
    expect(html).toMatch(/피해 \d+/);
    // 최대 병력은 병종 병력 배율과 밸런스 수치에 따라 Lab에서 바뀐다
    expect(html).toMatch(/병력 \d+\/\d+/);
  });

  it('진행 중: 건너뛰기만 보인다', async () => {
    const snap = { ...(await snapshotOf('attacker')), phase: 'playing' as const, waiting: null };
    const html = panel(snap);
    expect(html).toContain('진행 중');
    expect(html).toContain('건너뛰기');
    expect(html).not.toContain('의 차례');
  });

  it('종료: 결과 요약과 다시 하기/설정으로가 나온다', async () => {
    const html = panel(await snapshotOf(null));
    expect(html).toContain('전투 종료');
    expect(html).toMatch(/(공격측|방어측) 승리/);
    expect(html).toContain('다시 하기');
    expect(html).toContain('설정으로');
    expect(html).toContain('전멸한 군단');
  });

  it('오류 메시지가 있으면 보여 준다', async () => {
    const html = panel({ ...(await snapshotOf('attacker')), error: 'Illegal command for 조운' });
    expect(html).toContain('Illegal command for 조운');
  });
});

describe('SetupPanel', () => {
  const render = (config = DEFAULT_CONFIG) =>
    html(<SetupPanel config={config} presetNames={Object.keys(presets)} onChange={noop} onStart={noop} />);

  it('편성, 조작, 시드, 속도, 시작 버튼이 있다', () => {
    const out = render();
    expect(out).toContain('공격측 편성');
    expect(out).toContain('방어측 편성');
    expect(out).toContain('촉');
    expect(out).toContain('위');
    expect(out).toContain('공격측을 조작');
    expect(out).toContain('관전');
    expect(out).toContain('전투 시작');
  });

  it('조작 선택에 따라 안내 문구가 바뀐다', () => {
    expect(render({ ...DEFAULT_CONFIG, control: 'watch' })).toContain('양쪽 모두 AI가 조작합니다');
    expect(render({ ...DEFAULT_CONFIG, control: 'defender' })).toContain('공격측은 AI가 조작합니다');
  });
});

describe('LogPanel', () => {
  it('줄을 보여 주고, 비어 있으면 안내한다', () => {
    expect(html(<LogPanel lines={['── 라운드 1 ──', '공:관우 대기']} />)).toContain('공:관우 대기');
    expect(html(<LogPanel lines={[]} />)).toContain('(아직 없음)');
  });
});
