import type { BattleEvent, BattleResult, Command, CommandPreview, Family, GameData, SkillKind } from '@samgukji/battle-engine';
import { buildNameMap, formatEvent } from '../lib/eventText';
import type { PlaySession } from './session';
import { applyEvent, createViewState } from './viewState';
import type { ViewState } from './viewState';

/** 컨트롤러가 화면(PixiJS)에 요구하는 것. 테스트에서는 가짜로 바꿀 수 있다. */
export interface SceneLike {
  /** 상태를 애니메이션 없이 즉시 맞춘다 */
  setState(state: ViewState): void;
  /** 이벤트 하나를 재생한다. 재생이 끝나면 resolve */
  playEvent(event: BattleEvent): Promise<void>;
  /** 클릭할 수 있는 대상을 표시한다 */
  setTargets(uids: string[], onPick: (uid: string) => void): void;
  clearTargets(): void;
  /** 지금 행동하는 군단 강조 (null이면 해제) */
  setActing(uid: string | null): void;
  /** 0이면 즉시 */
  setSpeed(speed: number): void;
  setInstant(instant: boolean): void;
}

export interface TargetOption {
  uid: string;
  name: string;
  troops: number;
  maxTroops: number;
  preview: CommandPreview;
}

export interface CommandOption {
  skillId: string;
  skillName: string;
  apCost: number;
  kind: SkillKind;
  targets: TargetOption[];
}

export interface WaitingInfo {
  uid: string;
  name: string;
  family: Family;
  ap: number;
  maxAp: number;
  troops: number;
  maxTroops: number;
  commands: CommandOption[];
}

export type Phase = 'playing' | 'awaiting' | 'finished';

export interface ControllerSnapshot {
  /** 현재 행동자와 엔진이 이미 확정한 같은 라운드의 재생 순서. 미공개 순서는 추측하지 않는다. */
  turnOrder?: { uid: string; current: boolean }[];
  phase: Phase;
  view: ViewState;
  log: string[];
  waiting: WaitingInfo | null;
  /** 지금 고른 스킬 (대상 선택 중) */
  selectedSkillId: string | null;
  result: BattleResult | null;
  error: string | null;
}

/**
 * 세션(규칙)과 씬(화면)을 이어 준다.
 * 이벤트를 하나씩 재생하면서 화면용 상태와 로그를 쌓고, 플레이어 차례가 오면 선택지를 만든다.
 */
export class BattleController {
  private view: ViewState;
  private log: string[] = [];
  private phase: Phase = 'playing';
  private busy = false;
  private skipping = false;
  private disposed = false;
  private selectedSkillId: string | null = null;
  private error: string | null = null;
  private turnOrder: { uid: string; current: boolean }[] = [];
  private readonly names: Map<string, string>;

  constructor(
    private readonly session: PlaySession,
    private readonly scene: SceneLike,
    private readonly data: GameData,
    private readonly onChange: (snapshot: ControllerSnapshot) => void,
  ) {
    this.names = buildNameMap(session.initialUnits);
    this.view = createViewState(session.initialUnits, session.engine.state.defenderMorale);
  }

  /** 전투를 시작한다. 첫 플레이어 차례(또는 종료)까지 재생한다. */
  async start(): Promise<void> {
    this.scene.setState(this.view);
    this.emit();
    this.session.advance();
    await this.settle();
  }

  /** 대상을 고르기 전에 스킬을 고른다. 대상은 화면에서 클릭하거나 submit으로 보낸다. */
  selectSkill(skillId: string | null): void {
    if (this.phase !== 'awaiting') return;
    this.selectedSkillId = skillId;
    this.scene.clearTargets();
    const waiting = this.describeWaiting();
    const command = waiting?.commands.find((c) => c.skillId === skillId);
    if (command) {
      this.scene.setTargets(
        command.targets.map((t) => t.uid),
        (uid) => void this.submit({ kind: 'skill', skillId: command.skillId, targetUid: uid }),
      );
    }
    this.emit();
  }

  /** 플레이어의 커맨드를 실행한다. 진행 중이면 무시한다. 규칙에 맞지 않으면 오류 메시지만 남기고 차례는 그대로다. */
  async submit(command: Command): Promise<void> {
    if (this.phase !== 'awaiting' || this.busy) return;
    try {
      this.session.submit(command);
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      this.emit();
      return;
    }
    this.error = null;
    await this.settle();
  }

  /** 남은 전투를 AI가 대신 진행한다. */
  async autoplayRest(): Promise<void> {
    if (this.phase !== 'awaiting' || this.busy) return;
    this.session.autoplay();
    await this.settle();
  }

  /** 지금 재생 중인 애니메이션을 건너뛰어 다음 플레이어 차례(또는 종료)로 간다. */
  skip(): void {
    if (this.phase !== 'playing') return;
    this.skipping = true;
    this.scene.setInstant(true);
  }

  setSpeed(speed: number): void {
    this.scene.setSpeed(speed);
  }

  dispose(): void {
    this.disposed = true;
  }

  // ---------- 내부 ----------

  /** 세션이 쌓은 이벤트를 재생하고, 다음 상태(플레이어 차례 / 종료)로 넘어간다. */
  private async settle(): Promise<void> {
    this.busy = true;
    this.phase = 'playing';
    this.selectedSkillId = null;
    this.scene.clearTargets();
    this.scene.setActing(null);
    this.emit();

    const events = this.session.drainEvents();
    let acting: string | null = null;
    for (const [index, event] of events.entries()) {
      if (this.disposed) return;
      const line = formatEvent(event, this.names, this.data);
      if (line !== null) this.log.push(line);
      this.view = applyEvent(this.view, event);
      if (event.type === 'roundStart') acting = null;
      if (event.type === 'action') acting = event.actor;
      const remaining: string[] = [];
      for (const next of events.slice(index + 1)) {
        if (next.type === 'roundStart' || next.type === 'battleEnd') break;
        if (next.type === 'action') remaining.push(next.actor);
      }
      const waiting = this.session.waitingUnit;
      if (waiting && this.session.engine.state.round === this.view.round) remaining.push(waiting.uid);
      this.turnOrder = event.type === 'battleEnd' ? [] : [
        ...(acting ? [{ uid: acting, current: true }] : []),
        ...remaining.filter(uid => uid !== acting && this.view.units.some(u => u.uid === uid && !u.dead && u.ap > 0)).map(uid => ({ uid, current: false })),
      ];
      this.emit();
      await this.scene.playEvent(event);
    }
    if (this.disposed) return;

    if (this.skipping) {
      this.skipping = false;
      this.scene.setInstant(false);
      this.scene.setState(this.view);
    }

    this.busy = false;
    const waiting = this.session.waitingUnit;
    if (waiting) {
      this.phase = 'awaiting';
      this.turnOrder = [{ uid: waiting.uid, current: true }];
      this.scene.setActing(waiting.uid);
    } else {
      this.phase = 'finished';
      this.turnOrder = [];
    }
    this.emit();
  }

  private describeWaiting(): WaitingInfo | null {
    const actor = this.session.waitingUnit;
    if (!actor) return null;
    const { engine } = this.session;
    return {
      uid: actor.uid,
      name: actor.name,
      family: actor.family,
      ap: actor.ap,
      maxAp: actor.maxAp,
      troops: actor.troops,
      maxTroops: actor.maxTroops,
      commands: engine.getLegalCommands(actor).map((c) => {
        const skill = this.data.skills[c.skillId];
        return {
          skillId: c.skillId,
          skillName: skill.name,
          apCost: skill.apCost,
          kind: skill.kind,
          targets: c.targetUids.map((uid) => {
            const target = engine.state.units.find((u) => u.uid === uid)!;
            return {
              uid,
              name: target.name,
              troops: target.troops,
              maxTroops: target.maxTroops,
              preview: engine.preview(actor, c.skillId, uid),
            };
          }),
        };
      }),
    };
  }

  private emit(): void {
    if (this.disposed) return;
    this.onChange({
      turnOrder: this.turnOrder,
      phase: this.phase,
      view: this.view,
      log: [...this.log],
      waiting: this.phase === 'awaiting' ? this.describeWaiting() : null,
      selectedSkillId: this.selectedSkillId,
      result: this.phase === 'finished' ? this.session.result() : null,
      error: this.error,
    });
  }
}
