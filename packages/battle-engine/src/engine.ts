import { DamageCalculator } from './damage';
import { judge } from './judgement';
import { buildUnits } from './lineup';
import { defaultCommandPolicy } from './policy';
import type { Command, CommandPolicy } from './policy';
import { createRng } from './rng';
import type { Rng } from './rng';
import { TargetSelector } from './targeting';
import { buildTurnOrder } from './turnOrder';
import type {
  BalanceConfig,
  BattleEvent,
  BattleResult,
  BattleState,
  CharacterState,
  EndCause,
  GameData,
  LineupEntry,
  SkillData,
  SkillStat,
  Side,
  UnitReport,
} from './types';

export interface BattleInput {
  data: GameData;
  balance: BalanceConfig;
  attacker: LineupEntry[];
  defender: LineupEntry[];
  seed: number;
  /** true이면 result.events에 전투 이벤트를 모두 담는다 (시뮬레이션에서는 끈다) */
  recordEvents?: boolean;
  policy?: CommandPolicy;
}

/** 지금 쓸 수 있는 스킬과 그 대상 (대기는 항상 가능하므로 포함하지 않는다) */
export interface LegalCommand {
  skillId: string;
  targetUids: string[];
}

/** 커맨드 미리보기. 값은 실제로 적용되는 양이다 (남은 병력으로 잘린 값). */
export type CommandPreview =
  | {
      kind: 'attack';
      damage: number;
      counter: number;
      targetTroopsAfter: number;
      actorTroopsAfter: number;
      /** 같은 열 가드 유닛이 대신 맞을 확률 (0~1). damage/counter는 가드가 없을 때(원래 대상이 맞을 때)의 값이다 */
      interceptChance: number;
    }
  | { kind: 'heal'; amount: number }
  | { kind: 'guard'; rateAfter: number };

/**
 * 라운드제 + AP 총량 전투 엔진.
 *
 * 라운드마다 속도순으로 AP가 남은 군단이 1회 행동한다 (일반공격 / 치유 / 대기).
 * 일반공격은 상호 피해(반격)를 낳는다. 규칙은 docs/design/02-battle-rules.md 참고.
 */
export class BattleEngine {
  readonly state: BattleState;
  readonly events: BattleEvent[] = [];

  private readonly rng: Rng;
  private readonly calc: DamageCalculator;
  private readonly policy: CommandPolicy;
  private readonly record: boolean;
  private readonly reports = new Map<string, UnitReport>();
  private readonly skillStats: Record<string, SkillStat> = {};

  // 라운드 진행 상태 (nextActor가 관리한다)
  private queue: CharacterState[] = [];
  private queueIndex = 0;
  private roundActed = false;
  private endCause: EndCause | null = null;
  private cachedResult: BattleResult | null = null;

  constructor(private readonly input: BattleInput) {
    const { data, balance } = input;
    const attacker = buildUnits('attacker', input.attacker, data, balance);
    const defender = buildUnits('defender', input.defender, data, balance);
    this.state = {
      round: 0,
      units: [...attacker, ...defender],
      defenderMorale: balance.morale.defenderStart,
      initialCount: { attacker: attacker.length, defender: defender.length },
    };
    this.rng = createRng(input.seed);
    this.calc = new DamageCalculator(balance, data);
    this.policy = input.policy ?? defaultCommandPolicy;
    this.record = input.recordEvents ?? false;

    for (const u of this.state.units) {
      this.reports.set(u.uid, {
        uid: u.uid,
        characterId: u.characterId,
        name: u.name,
        side: u.side,
        family: u.family,
        unitType: u.unitType,
        level: u.level,
        maxTroops: u.maxTroops,
        finalTroops: u.troops,
        survived: true,
        damageDealt: 0,
        damageTaken: 0,
        kills: 0,
        healing: 0,
        actions: 0,
        blocks: 0,
      });
    }
  }

  get finished(): boolean {
    return this.endCause !== null;
  }

  /** 정책(AI)이 양쪽을 모두 조작해 전투를 끝까지 진행한다. */
  run(): BattleResult {
    for (let actor = this.nextActor(); actor; actor = this.nextActor()) {
      this.execute(actor, this.decide(actor));
    }
    return this.result();
  }

  // ---------- 단계별 진행 (수동 플레이용) ----------
  //
  // for (let a = engine.nextActor(); a; a = engine.nextActor()) {
  //   engine.perform(a, a.side === me ? 플레이어가_고른_커맨드 : engine.decide(a));
  // }
  // const result = engine.result();

  /**
   * 다음에 행동할 군단. 필요하면 다음 라운드를 시작한다. 전투가 끝났으면 null.
   * 돌려받은 군단은 반드시 perform()(또는 run 내부의 execute)으로 행동시켜야 한다.
   */
  nextActor(): CharacterState | null {
    const { maxTurns } = this.input.balance;
    while (this.endCause === null) {
      while (this.queueIndex < this.queue.length) {
        const actor = this.queue[this.queueIndex++];
        if (!actor.isDead && actor.ap > 0) return actor;
      }

      // 라운드 끝. 한 라운드 동안 아무도 대기 외 행동을 하지 않았으면 교착이다.
      if (this.state.round > 0 && !this.roundActed) {
        this.endCause = 'stall';
        break;
      }
      const next = this.state.round + 1;
      if (next > maxTurns) {
        this.endCause = 'max-turns';
        break;
      }
      if (!this.state.units.some((u) => !u.isDead && u.ap > 0)) {
        this.endCause = 'no-ap';
        break;
      }
      this.state.round = next;
      this.emit({ type: 'roundStart', round: next });
      this.queue = buildTurnOrder(this.state, this.rng);
      this.queueIndex = 0;
      this.roundActed = false;
    }
    return null;
  }

  /** 정책(AI)이 고르는 커맨드 */
  decide(actor: CharacterState): Command {
    const { data, balance } = this.input;
    return this.policy({ state: this.state, actor, data, balance, rng: this.rng });
  }

  /** actor가 지금 쓸 수 있는 커맨드와 대상. 대기는 항상 가능하므로 목록에 없다. */
  getLegalCommands(actor: CharacterState): LegalCommand[] {
    const { data } = this.input;
    const unitType = data.unitTypes[actor.unitType];
    const commands: LegalCommand[] = [];
    for (const id of [unitType.basicSkillId, ...unitType.extraSkillIds]) {
      const skill = data.skills[id];
      if (!skill || skill.apCost > actor.ap) continue;
      let targets: CharacterState[];
      if (skill.kind === 'heal') targets = TargetSelector.getAllies(actor, this.state);
      else if (skill.kind === 'guard') targets = unitType.guard ? [actor] : []; // 가드는 자기 자신에게 쓴다
      else targets = TargetSelector.getValidTargets(actor, this.state, unitType.targetRule);
      if (targets.length > 0) commands.push({ skillId: id, targetUids: targets.map((t) => t.uid) });
    }
    return commands;
  }

  /** 커맨드를 실행하기 전에 결과를 미리 계산한다 (상태를 바꾸지 않는다). 값은 실제로 적용되는 양이다. */
  preview(actor: CharacterState, skillId: string, targetUid: string): CommandPreview {
    const { data, balance } = this.input;
    const skill = data.skills[skillId];
    const target = this.state.units.find((u) => u.uid === targetUid);
    if (!skill || !target) throw new Error(`Unknown skill or target: ${skillId} ${targetUid}`);

    if (skill.kind === 'heal') {
      return { kind: 'heal', amount: Math.min(this.calc.heal(actor, skill), target.maxTroops - target.troops) };
    }
    if (skill.kind === 'guard') {
      return { kind: 'guard', rateAfter: actor.guardRate + (data.unitTypes[actor.unitType].guard?.gain ?? 0) };
    }

    // 가드 유닛이 순서대로 판정하므로, 아무도 막지 못할 확률은 각자 못 막을 확률의 곱이다.
    let noIntercept = 1;
    if (skill.guardable) {
      for (const guardian of this.guardiansFor(target)) noIntercept *= 1 - Math.min(guardian.guardRate, 100) / 100;
    }

    const damage = Math.min(this.calc.damage(actor, target, skill, this.moraleShare(actor.side)), target.troops);
    const remaining = target.troops - damage;
    let counter = 0;
    const targetType = data.unitTypes[target.unitType];
    if (skill.counterable && remaining > 0 && targetType.canCounter && balance.counter.rate > 0) {
      const counterSkill = data.skills[targetType.basicSkillId];
      if (counterSkill.kind === 'attack') {
        // 실제 처리에서는 피격으로 사기가 먼저 움직인 뒤 반격하므로, 같은 값으로 계산한다.
        const share = Math.max(0, this.moraleShare(target.side) - (damage > 0 ? balance.morale.onHit : 0));
        const wounded = { ...target, troops: remaining };
        counter = Math.min(this.calc.counterDamage(wounded, actor, counterSkill, share), actor.troops);
      }
    }
    return {
      kind: 'attack',
      damage,
      counter,
      targetTroopsAfter: remaining,
      actorTroopsAfter: actor.troops - counter,
      interceptChance: 1 - noIntercept,
    };
  }

  /** 플레이어가 고른 커맨드를 실행한다. 규칙에 맞지 않으면 오류를 던진다. */
  perform(actor: CharacterState, command: Command): void {
    if (this.endCause !== null) throw new Error('Battle is already finished');
    if (actor.isDead) throw new Error(`${actor.name} is destroyed`);
    if (command.kind === 'skill') {
      const legal = this.getLegalCommands(actor).find((c) => c.skillId === command.skillId);
      if (!legal || !legal.targetUids.includes(command.targetUid)) {
        throw new Error(`Illegal command for ${actor.name}: ${JSON.stringify(command)}`);
      }
    }
    this.execute(actor, command);
  }

  /** 전투가 끝난 뒤 최종 판정과 결과를 돌려준다. 여러 번 불러도 같은 결과다. */
  result(): BattleResult {
    if (this.endCause === null) throw new Error('Battle is not finished yet');
    if (!this.cachedResult) {
      const { winner, decidedBy } = judge(this.state, this.input.balance.morale.judgement);
      this.emit({ type: 'battleEnd', winner, endCause: this.endCause, decidedBy, rounds: this.state.round });
      this.cachedResult = this.buildResult(winner, this.endCause, decidedBy);
    }
    return this.cachedResult;
  }

  // ---------- 행동 ----------

  /** 커맨드를 실행하고 라운드 진행 상태(교착 판정, 전멸 종료)를 갱신한다. */
  private execute(actor: CharacterState, command: Command): void {
    if (this.runCommand(actor, command)) this.roundActed = true;
    if (this.isWiped('attacker') || this.isWiped('defender')) this.endCause = 'wipe';
  }

  /** 행동했으면 true, 대기면 false */
  private runCommand(actor: CharacterState, command: Command): boolean {
    const { data } = this.input;

    if (command.kind === 'wait') {
      this.emit({ type: 'action', round: this.state.round, actor: actor.uid, skillId: 'wait', apAfter: actor.ap });
      return false;
    }

    const skill = data.skills[command.skillId];
    const target = this.state.units.find((u) => u.uid === command.targetUid);
    if (!skill || !target) throw new Error(`Invalid command from policy: ${JSON.stringify(command)}`);
    if (skill.apCost > actor.ap) throw new Error(`${actor.name} cannot afford ${skill.id}`);

    actor.ap -= skill.apCost;
    this.report(actor).actions++;
    this.skillStat(skill.id).uses++;
    this.emit({
      type: 'action',
      round: this.state.round,
      actor: actor.uid,
      skillId: skill.id,
      target: target.uid,
      apAfter: actor.ap,
    });

    if (skill.kind === 'attack') this.performAttack(actor, target, skill);
    else if (skill.kind === 'guard') this.performGuard(actor);
    else this.performHeal(actor, target, skill);
    return true;
  }

  private performAttack(actor: CharacterState, originalTarget: CharacterState, skill: SkillData): void {
    // 막기만 하거나 공격만 해야 한다: 공격하는 순간 가드 확률이 모두 사라진다.
    this.setGuardRate(actor, 0, 'reset');

    // 같은 열의 가드 유닛이 대신 맞을 수 있다. 이후의 피해와 반격은 실제로 맞는 쪽(target) 기준이다.
    let target = originalTarget;
    if (skill.guardable) {
      const guardian = this.rollIntercept(originalTarget);
      if (guardian) {
        // 순서: 가드 발동 → 확률 감소 → 피해 (화면 연출이 이 순서로 재생된다)
        this.emit({ type: 'intercept', round: this.state.round, attacker: actor.uid, target: originalTarget.uid, guardian: guardian.uid });
        const decay = this.input.data.unitTypes[guardian.unitType].guard?.decay ?? 0;
        this.report(guardian).blocks++;
        this.setGuardRate(guardian, Math.max(0, guardian.guardRate - decay), 'block');
        target = guardian;
      }
    }

    const amount = this.calc.damage(actor, target, skill, this.moraleShare(actor.side));
    this.skillStat(skill.id).damage += this.inflict(actor, target, amount, 'attack');

    // 상호 피해: 근접 공격을 받은 대상이 살아 있으면 반격한다.
    const { data, balance } = this.input;
    const targetType = data.unitTypes[target.unitType];
    if (skill.counterable && !target.isDead && !actor.isDead && targetType.canCounter) {
      const counterSkill = data.skills[targetType.basicSkillId];
      if (counterSkill.kind === 'attack' && balance.counter.rate > 0) {
        const counter = this.calc.counterDamage(target, actor, counterSkill, this.moraleShare(target.side));
        if (counter > 0) this.inflict(target, actor, counter, 'counter');
      }
    }
  }

  private performGuard(actor: CharacterState): void {
    const guard = this.input.data.unitTypes[actor.unitType].guard;
    if (!guard) throw new Error(`${actor.name} cannot guard`);
    this.setGuardRate(actor, actor.guardRate + guard.gain, 'raise');
  }

  // ---------- 가드 ----------

  /** target과 같은 열의 다른 아군 중 가드 확률이 있는 유닛. 확률이 높은 순서로 판정한다. */
  private guardiansFor(target: CharacterState): CharacterState[] {
    return this.state.units
      .filter((u) => u.side === target.side && !u.isDead && u.uid !== target.uid && u.row === target.row && u.guardRate > 0)
      .sort((a, b) => b.guardRate - a.guardRate);
  }

  /** 가드 유닛을 확률이 높은 순서로 판정해 처음 성공한 유닛을 돌려준다 (상태는 바꾸지 않는다). */
  private rollIntercept(target: CharacterState): CharacterState | null {
    for (const guardian of this.guardiansFor(target)) {
      if (this.rng() * 100 < guardian.guardRate) return guardian;
    }
    return null;
  }

  /** 가드 확률을 바꾸고 이벤트를 남긴다. 값이 그대로면 아무것도 하지 않는다. */
  private setGuardRate(unit: CharacterState, rate: number, reason: 'raise' | 'block' | 'reset'): void {
    if (unit.guardRate === rate) return;
    unit.guardRate = rate;
    this.emit({ type: 'guardChange', round: this.state.round, unit: unit.uid, rate, reason });
  }

  private performHeal(actor: CharacterState, target: CharacterState, skill: SkillData): void {
    const amount = this.calc.heal(actor, skill);
    const applied = Math.min(amount, target.maxTroops - target.troops);
    target.troops += applied;
    this.report(actor).healing += applied;
    this.skillStat(skill.id).healing += applied;
    this.emit({
      type: 'heal',
      round: this.state.round,
      source: actor.uid,
      target: target.uid,
      amount: applied,
      troopsAfter: target.troops,
    });
  }

  /** 피해를 적용하고 실제로 깎인 병력을 돌려준다. 사망/사기 변동도 여기서 처리한다. */
  private inflict(source: CharacterState, target: CharacterState, amount: number, kind: 'attack' | 'counter'): number {
    const applied = Math.min(amount, target.troops);
    target.troops -= applied;
    this.report(source).damageDealt += applied;
    this.report(target).damageTaken += applied;
    this.emit({
      type: 'damage',
      round: this.state.round,
      kind,
      source: source.uid,
      target: target.uid,
      amount: applied,
      troopsAfter: target.troops,
    });

    const { morale } = this.input.balance;
    if (applied > 0) this.shiftMorale(target.side, morale.onHit);

    if (target.troops <= 0) {
      target.troops = 0;
      target.isDead = true;
      this.report(source).kills++;
      this.emit({ type: 'unitDestroyed', round: this.state.round, unit: target.uid, by: source.uid });
      this.shiftMorale(target.side, morale.onUnitDestroyed);
      if (target.row === 'front') this.advanceRows(target.side);
    }
    return applied;
  }

  // ---------- 열 이동 ----------

  /** 전열이 전멸하면 같은 진영의 살아 있는 후열이 즉시 전열이 된다. */
  private advanceRows(side: Side): void {
    const alive = this.state.units.filter((u) => u.side === side && !u.isDead);
    if (alive.length === 0 || alive.some((u) => u.row === 'front')) return;
    alive.sort((a, b) => a.slot - b.slot);
    alive.forEach((u, i) => {
      u.row = 'front';
      u.slot = i;
    });
    this.emit({ type: 'rowAdvance', round: this.state.round, side, units: alive.map((u) => u.uid) });
  }

  // ---------- 사기 (제로섬 단일 막대) ----------

  private moraleShare(side: Side): number {
    return side === 'defender' ? this.state.defenderMorale : 100 - this.state.defenderMorale;
  }

  /** losingSide의 사기 비율을 delta만큼 상대편으로 옮긴다 */
  private shiftMorale(losingSide: Side, delta: number): void {
    if (delta === 0) return;
    const next = losingSide === 'defender' ? this.state.defenderMorale - delta : this.state.defenderMorale + delta;
    this.state.defenderMorale = Math.min(100, Math.max(0, next));
    this.emit({ type: 'morale', round: this.state.round, defenderMorale: this.state.defenderMorale });
  }

  // ---------- 보조 ----------

  private isWiped(side: Side): boolean {
    return !this.state.units.some((u) => u.side === side && !u.isDead);
  }

  private report(unit: CharacterState): UnitReport {
    return this.reports.get(unit.uid)!;
  }

  private skillStat(skillId: string): SkillStat {
    return (this.skillStats[skillId] ??= { uses: 0, damage: 0, healing: 0 });
  }

  private emit(event: BattleEvent): void {
    if (this.record) this.events.push(event);
  }

  private buildResult(winner: Side, endCause: EndCause, decidedBy: BattleResult['decidedBy']): BattleResult {
    const alive = (side: Side) => this.state.units.filter((u) => u.side === side && !u.isDead);
    for (const unit of this.state.units) {
      const r = this.report(unit);
      r.finalTroops = unit.troops;
      r.survived = !unit.isDead;
    }
    return {
      winner,
      endCause,
      decidedBy,
      rounds: this.state.round,
      destroyed: {
        attacker: this.state.initialCount.attacker - alive('attacker').length,
        defender: this.state.initialCount.defender - alive('defender').length,
      },
      remainingTroops: {
        attacker: alive('attacker').reduce((s, u) => s + u.troops, 0),
        defender: alive('defender').reduce((s, u) => s + u.troops, 0),
      },
      defenderMorale: this.state.defenderMorale,
      units: [...this.reports.values()],
      skillStats: this.skillStats,
      ...(this.record ? { events: this.events } : {}),
    };
  }
}

export function runBattle(input: BattleInput): BattleResult {
  return new BattleEngine(input).run();
}
