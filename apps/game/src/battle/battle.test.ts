import { BattleEngine, createRng, deriveSeed, generateRandomLineup } from '@samgukji/battle-engine';
import type { BattleEvent, Side } from '@samgukji/battle-engine';
import { defaultBalance, gameData, presets } from '@samgukji/game-data';
import { describe, expect, it } from 'vitest';
import { BattleController } from './controller';
import type { ControllerSnapshot, SceneLike } from './controller';
import { PlaySession } from './session';
import { applyEvent, applyEvents, createViewState } from './viewState';
import type { ViewState } from './viewState';

const base = { data: gameData, balance: defaultBalance, attacker: presets.shu, defender: presets.wei, seed: 1 };

describe('viewState: 이벤트만으로 최종 상태를 재구성한다', () => {
  it('엔진의 최종 상태와 같다 (병력, AP, 열, 전멸, 라운드, 사기, 결과)', () => {
    // 기본 수치에서는 전열 3군단이 모두 쓰러지는 일이 거의 없어 열 이동이 일어나지 않는다.
    // 열 이동 이벤트까지 검증하도록 피해를 키운 조건도 함께 돌린다.
    const strong = { ...defaultBalance, damage: { ...defaultBalance.damage, attackScale: defaultBalance.damage.attackScale * 4 } };
    let rowAdvances = 0;
    let guardEvents = 0;
    let intercepts = 0;
    for (let i = 0; i < 150; i++) {
      const rng = createRng(deriveSeed(11, i));
      const engine = new BattleEngine({
        ...base,
        balance: i % 2 === 0 ? defaultBalance : strong,
        attacker: generateRandomLineup(gameData, rng),
        defender: generateRandomLineup(gameData, rng),
        seed: deriveSeed(3, i),
        recordEvents: true,
      });
      const initial = createViewState(engine.state.units, engine.state.defenderMorale);
      const result = engine.run();
      const finalView = applyEvents(initial, engine.events);

      for (const unit of engine.state.units) {
        const view = finalView.units.find((u) => u.uid === unit.uid)!;
        expect(view, `battle ${i} ${unit.uid}`).toMatchObject({
          troops: unit.troops,
          ap: unit.ap,
          row: unit.row,
          slot: unit.slot,
          dead: unit.isDead,
          guardRate: unit.guardRate,
        });
      }
      expect(finalView.round).toBe(engine.state.round);
      expect(finalView.defenderMorale).toBe(engine.state.defenderMorale);
      expect(finalView.outcome).toEqual({ winner: result.winner, endCause: result.endCause, decidedBy: result.decidedBy, rounds: result.rounds });
      rowAdvances += engine.events.filter((e) => e.type === 'rowAdvance').length;
      guardEvents += engine.events.filter((e) => e.type === 'guardChange').length;
      intercepts += engine.events.filter((e) => e.type === 'intercept').length;
    }
    // 열 이동과 가드 이벤트도 실제로 검증 대상에 포함되었는지 확인한다
    expect(rowAdvances).toBeGreaterThan(0);
    expect(guardEvents).toBeGreaterThan(0);
    expect(intercepts).toBeGreaterThan(0);
  });

  it('원본 상태를 바꾸지 않는다', () => {
    const engine = new BattleEngine({ ...base, recordEvents: true });
    const initial = createViewState(engine.state.units, 50);
    const snapshot = JSON.stringify(initial);
    engine.run();
    applyEvents(initial, engine.events);
    expect(JSON.stringify(initial)).toBe(snapshot);
  });

  it('열 이동 이벤트는 순서대로 슬롯을 다시 매긴다', () => {
    const engine = new BattleEngine({ ...base });
    const initial = createViewState(engine.state.units, 50);
    const back = initial.units.filter((u) => u.side === 'defender' && u.row === 'back').map((u) => u.uid);
    const event: BattleEvent = { type: 'rowAdvance', round: 2, side: 'defender', units: back };
    const next = applyEvent(initial, event);
    back.forEach((uid, index) => {
      expect(next.units.find((u) => u.uid === uid)).toMatchObject({ row: 'front', slot: index });
    });
  });
});

describe('PlaySession', () => {
  it('관전(양쪽 AI) 세션은 BattleEngine.run()과 완전히 같은 결과를 낸다', () => {
    const expected = new BattleEngine({ ...base, recordEvents: true }).run();
    const session = new PlaySession({ ...base, playerSide: null });
    session.advance();
    expect(session.finished).toBe(true);
    expect(session.waitingUnit).toBeNull();
    expect(session.result()).toEqual(expected);
  });

  it.each<Side>(['attacker', 'defender'])('%s를 조작하면 그 진영 군단의 차례마다 멈춘다', (side) => {
    const session = new PlaySession({ ...base, playerSide: side });
    session.advance();
    let turns = 0;
    while (session.waitingUnit) {
      const unit = session.waitingUnit;
      expect(unit.side).toBe(side);
      const [command] = session.legalCommands();
      expect(command).toBeDefined();
      session.submit({ kind: 'skill', skillId: command.skillId, targetUid: command.targetUids[0] });
      turns++;
      expect(turns).toBeLessThan(200);
    }
    expect(session.finished).toBe(true);
    expect(turns).toBeGreaterThan(0);
    const result = session.result();
    for (const u of result.units) expect(u.finalTroops).toBeLessThanOrEqual(u.maxTroops);
  });

  it('잘못된 커맨드는 오류를 던지고 차례를 유지한다', () => {
    const session = new PlaySession({ ...base, playerSide: 'attacker' });
    session.advance();
    const unit = session.waitingUnit!;
    expect(() => session.submit({ kind: 'skill', skillId: 'nope', targetUid: 'attacker:0' })).toThrow(/Illegal/);
    expect(session.waitingUnit).toBe(unit);
    expect(() => session.submit({ kind: 'wait' })).not.toThrow();
    expect(session.waitingUnit).not.toBe(unit);
  });

  it('기다리는 군단이 없으면 submit은 오류다', () => {
    const session = new PlaySession({ ...base, playerSide: null });
    session.advance();
    expect(() => session.submit({ kind: 'wait' })).toThrow(/No unit/);
    expect(() => session.preview('x', 'y')).toThrow(/No unit/);
  });

  it('처음 차례에서 autoplay하면 순수 AI 전투와 같은 결과다', () => {
    const expected = new BattleEngine({ ...base, recordEvents: true }).run();
    const session = new PlaySession({ ...base, playerSide: 'attacker' });
    session.advance();
    expect(session.waitingUnit).not.toBeNull();
    session.autoplay();
    expect(session.finished).toBe(true);
    expect(session.result()).toEqual(expected);
  });

  it('drainEvents는 새로 쌓인 이벤트만 돌려준다', () => {
    const session = new PlaySession({ ...base, playerSide: 'attacker' });
    session.advance();
    const first = session.drainEvents();
    expect(first.length).toBeGreaterThan(0);
    expect(session.drainEvents()).toEqual([]);
    session.submit({ kind: 'wait' });
    const second = session.drainEvents();
    expect(second.length).toBeGreaterThan(0);
    expect(second[0]).toMatchObject({ type: expect.any(String) });
  });

  it('미리보기는 대기 중인 군단 기준으로 계산된다', () => {
    const session = new PlaySession({ ...base, playerSide: 'attacker' });
    session.advance();
    const [command] = session.legalCommands();
    const preview = session.preview(command.skillId, command.targetUids[0]);
    expect(preview.kind).toBe(command.skillId === 'heal' ? 'heal' : 'attack');
  });
});

// ---------- BattleController (가짜 화면) ----------

class FakeScene implements SceneLike {
  played: BattleEvent[] = [];
  stateSets = 0;
  targets: string[] = [];
  onPick: ((uid: string) => void) | null = null;
  acting: string | null = null;
  instant = false;
  speed = 1;
  /** true이면 playEvent가 release()될 때까지 멈춘다 (애니메이션 재생 중을 흉내 낸다) */
  gated = false;
  pending: Array<() => void> = [];

  setState(): void {
    this.stateSets++;
  }
  async playEvent(event: BattleEvent): Promise<void> {
    this.played.push(event);
    if (this.gated && !this.instant) await new Promise<void>((resolve) => this.pending.push(resolve));
  }
  release(): void {
    this.pending.shift()?.();
  }
  setTargets(uids: string[], onPick: (uid: string) => void): void {
    this.targets = uids;
    this.onPick = onPick;
  }
  clearTargets(): void {
    this.targets = [];
    this.onPick = null;
  }
  setActing(uid: string | null): void {
    this.acting = uid;
  }
  setSpeed(speed: number): void {
    this.speed = speed;
  }
  setInstant(instant: boolean): void {
    this.instant = instant;
  }
}

function setup(playerSide: Side | null, scene = new FakeScene()) {
  const session = new PlaySession({ ...base, playerSide });
  const snapshots: ControllerSnapshot[] = [];
  const controller = new BattleController(session, scene, gameData, (s) => snapshots.push(s));
  const last = () => snapshots[snapshots.length - 1];
  return { session, scene, controller, snapshots, last };
}

describe('BattleController', () => {
  it('관전: 끝까지 재생하고 화면 상태가 엔진의 최종 상태와 같다', async () => {
    const { controller, scene, last, session } = setup(null);
    await controller.start();
    const snap = last();
    expect(snap.phase).toBe('finished');
    expect(snap.result).not.toBeNull();
    // 종료 이벤트(battleEnd)까지 화면이 재생해야 결과 배너를 보여 줄 수 있다
    expect(scene.played).toEqual(session.engine.events);
    expect(scene.played.at(-1)?.type).toBe('battleEnd');
    expect(snap.view.outcome).toEqual({
      winner: snap.result!.winner,
      endCause: snap.result!.endCause,
      decidedBy: snap.result!.decidedBy,
      rounds: snap.result!.rounds,
    });
    expect(snap.log.length).toBeGreaterThan(10);
    expect(snap.log[0]).toContain('라운드 1');
    expect(snap.log.at(-1)).toContain('승리');
    for (const unit of session.engine.state.units) {
      expect(snap.view.units.find((u) => u.uid === unit.uid)).toMatchObject({ troops: unit.troops, ap: unit.ap, dead: unit.isDead });
    }
  });

  it('수동: 내 차례마다 멈추고 선택지와 미리보기를 만든다', async () => {
    const { controller, scene, last } = setup('attacker');
    await controller.start();
    const snap = last();
    expect(snap.phase).toBe('awaiting');
    expect(snap.waiting).not.toBeNull();
    expect(scene.acting).toBe(snap.waiting!.uid);
    const command = snap.waiting!.commands[0];
    expect(command.skillName).toBeTruthy();
    expect(command.targets.length).toBeGreaterThan(0);
    expect(command.targets[0].preview.kind).toBe(command.kind);
  });

  it('수동: 끝날 때까지 첫 선택지를 고르면 전투가 정상 종료된다', async () => {
    const { controller, last } = setup('defender');
    await controller.start();
    let guard = 0;
    while (last().phase === 'awaiting') {
      const c = last().waiting!.commands[0];
      await controller.submit({ kind: 'skill', skillId: c.skillId, targetUid: c.targets[0].uid });
      expect(++guard).toBeLessThan(200);
    }
    expect(last().phase).toBe('finished');
    expect(last().result).not.toBeNull();
    expect(last().waiting).toBeNull();
  });

  it('스킬을 고르면 화면에 대상이 표시되고, 대상을 클릭하면 실행된다', async () => {
    const { controller, scene, last } = setup('attacker');
    await controller.start();
    const waiting = last().waiting!;
    const command = waiting.commands[0];
    controller.selectSkill(command.skillId);
    expect(last().selectedSkillId).toBe(command.skillId);
    expect(scene.targets).toEqual(command.targets.map((t) => t.uid));

    const before = scene.played.length;
    scene.onPick!(command.targets[0].uid);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(scene.played.length).toBeGreaterThan(before);
    // 한 번 실행하면 선택이 해제된다
    expect(last().selectedSkillId).toBeNull();
  });

  it('규칙에 맞지 않는 커맨드는 오류 메시지만 남기고 차례를 유지한다', async () => {
    const { controller, last } = setup('attacker');
    await controller.start();
    const uid = last().waiting!.uid;
    await controller.submit({ kind: 'skill', skillId: 'nope', targetUid: 'x' });
    expect(last().phase).toBe('awaiting');
    expect(last().waiting!.uid).toBe(uid);
    expect(last().error).toMatch(/Illegal/);
  });

  it('AI에게 맡기면 남은 전투가 끝까지 진행된다', async () => {
    const { controller, last } = setup('attacker');
    await controller.start();
    await controller.autoplayRest();
    expect(last().phase).toBe('finished');
  });

  it('건너뛰기는 재생 중에만 동작하고, 끝나면 화면을 최종 상태로 맞춘다', async () => {
    const scene = new FakeScene();
    scene.gated = true;
    const { controller, last } = setup(null, scene);
    const started = controller.start();
    // 첫 이벤트 재생 중이다
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(last().phase).toBe('playing');
    const setsBefore = scene.stateSets;

    controller.skip();
    expect(scene.instant).toBe(true);
    scene.release(); // 멈춰 있던 첫 이벤트를 풀어 준다. 나머지는 즉시 재생된다
    await started;

    expect(last().phase).toBe('finished');
    expect(scene.instant).toBe(false);
    expect(scene.stateSets).toBe(setsBefore + 1);
  });

  it('내 차례(awaiting)에는 skip이 아무 일도 하지 않는다', async () => {
    const { controller, scene } = setup('attacker');
    await controller.start();
    controller.skip();
    expect(scene.instant).toBe(false);
  });

  it('속도 설정은 화면에 그대로 전달된다', async () => {
    const { controller, scene } = setup(null);
    controller.setSpeed(4);
    expect(scene.speed).toBe(4);
  });

  it('dispose 뒤에는 더 이상 상태를 알리지 않는다', async () => {
    const scene = new FakeScene();
    scene.gated = true;
    const { controller, snapshots } = setup(null, scene);
    const started = controller.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.dispose();
    const count = snapshots.length;
    scene.release();
    await started;
    expect(snapshots.length).toBe(count);
  });
});

// ViewState 타입이 외부에서 쓰이는지 확인용 (미사용 import 방지)
export type { ViewState };
