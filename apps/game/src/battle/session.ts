import { BattleEngine } from '@samgukji/battle-engine';
import type { BattleEvent, BattleInput, BattleResult, CharacterState, Command, CommandPreview, LegalCommand, Side } from '@samgukji/battle-engine';

export interface SessionOptions extends Omit<BattleInput, 'recordEvents'> {
  /** 플레이어가 조작하는 진영. null이면 양쪽 모두 AI(관전) */
  playerSide: Side | null;
}

/**
 * 엔진을 "플레이어 차례까지 AI가 대신 진행"하는 흐름으로 감싼다.
 * 화면과 무관한 순수 로직이라 테스트할 수 있다.
 */
export class PlaySession {
  readonly engine: BattleEngine;
  readonly playerSide: Side | null;
  /** 전투 시작 시점의 유닛 상태 (화면 초기화용) */
  readonly initialUnits: CharacterState[];

  private cursor = 0;
  private waiting: CharacterState | null = null;
  private aiTakeover = false;

  constructor(options: SessionOptions) {
    const { playerSide, ...input } = options;
    this.playerSide = playerSide;
    this.engine = new BattleEngine({ ...input, recordEvents: true });
    this.initialUnits = this.engine.state.units.map((u) => ({ ...u, stats: { ...u.stats }, traitIds: [...u.traitIds] }));
  }

  /** 지금 커맨드를 기다리는 플레이어 군단 */
  get waitingUnit(): CharacterState | null {
    return this.waiting;
  }

  get finished(): boolean {
    return this.engine.finished;
  }

  /** AI 차례를 진행해 플레이어 차례(또는 전투 종료)까지 간다. 이미 기다리는 중이면 아무것도 하지 않는다. */
  advance(): void {
    if (this.waiting) return;
    for (let actor = this.engine.nextActor(); actor; actor = this.engine.nextActor()) {
      if (!this.aiTakeover && this.playerSide !== null && actor.side === this.playerSide) {
        this.waiting = actor;
        return;
      }
      this.engine.perform(actor, this.engine.decide(actor));
    }
    // 전투가 끝났다. 마지막 battleEnd 이벤트는 결과를 확정할 때 만들어지므로, 화면이 재생할 수 있도록 지금 확정한다.
    this.engine.result();
  }

  /** 기다리는 군단의 현재 선택지 */
  legalCommands(): LegalCommand[] {
    return this.waiting ? this.engine.getLegalCommands(this.waiting) : [];
  }

  preview(skillId: string, targetUid: string): CommandPreview {
    if (!this.waiting) throw new Error('No unit is waiting for a command');
    return this.engine.preview(this.waiting, skillId, targetUid);
  }

  /** 플레이어의 커맨드를 실행하고 다음 플레이어 차례까지 진행한다. 규칙에 맞지 않으면 오류를 던지고 상태는 그대로다. */
  submit(command: Command): void {
    const actor = this.waiting;
    if (!actor) throw new Error('No unit is waiting for a command');
    this.engine.perform(actor, command);
    this.waiting = null;
    this.advance();
  }

  /** 남은 전투를 플레이어 군단까지 AI가 대신 진행한다. */
  autoplay(): void {
    this.aiTakeover = true;
    const actor = this.waiting;
    if (actor) {
      this.waiting = null;
      this.engine.perform(actor, this.engine.decide(actor));
    }
    this.advance();
  }

  /** 마지막으로 가져간 이후 쌓인 이벤트 */
  drainEvents(): BattleEvent[] {
    const fresh = this.engine.events.slice(this.cursor);
    this.cursor = this.engine.events.length;
    return fresh;
  }

  result(): BattleResult {
    return this.engine.result();
  }
}
