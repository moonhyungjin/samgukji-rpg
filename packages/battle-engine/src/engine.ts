import { DamageCalculator } from './damage';
import { judge } from './judgement';
import { buildUnits } from './lineup';
import { defaultCommandPolicy } from './policy';
import type { Command, CommandPolicy } from './policy';
import { createRng } from './rng';
import type { Rng } from './rng';
import { canBuff, reviveRow, reviveTargets, TargetSelector } from './targeting';
import { buildTurnOrder } from './turnOrder';
import type {
  BalanceConfig,
  BattleEvent,
  BattleResult,
  BattleState,
  BuffEffect,
  BuffStat,
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
      /** 원래 대상에게 피해 무시(결계)가 남아 있는가. true면 이 공격은 피해가 0이 된다 */
      targetBarrier: boolean;
      /** 동시 타격: 함께 맞는 후열 군단과 그 피해 (남은 병력으로 잘린 값) */
      alsoHit?: { uid: string; damage: number };
      /** 열 공격: 조준한 대상 말고 같은 열에서 함께 맞는 군단들과 그 피해 (남은 병력으로 잘린 값) */
      rowHits?: { uid: string; damage: number }[];
      /** 크리티컬이 켜져 있을 때만: 확률(%)과 크리티컬이 났을 때의 피해 (남은 병력으로 잘린 값) */
      criticalChance?: number;
      criticalDamage?: number;
    }
  | { kind: 'revive'; troops: number }
  | { kind: 'heal'; amount: number; /** 범위 치유: 함께 회복하는 아군들 */ alsoHealed?: { uid: string; amount: number }[] }
  | { kind: 'buff'; effect: BuffEffect; /** 범위 버프: 함께 받는 아군들 */ alsoBuffed?: string[] }
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

    // 시작할 때 전열이 비어 있는 진영은 후열이 전열이 된다 (사거리 1 병종이 칠 상대가 항상 있도록)
    this.advanceRows('attacker');
    this.advanceRows('defender');
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
      if (skill.kind !== 'revive' && skill.maxUses !== undefined && (actor.skillUses?.[skill.id] ?? 0) >= skill.maxUses) continue;
      let targets: CharacterState[];
      if (skill.kind === 'heal') targets = TargetSelector.getAllies(actor, this.state);
      else if (skill.kind === 'buff') targets = TargetSelector.getAllies(actor, this.state).filter((u) => canBuff(u, skill));
      else if (skill.kind === 'revive') targets = reviveTargets(actor, this.state, skill);
      else if (skill.kind === 'guard') targets = unitType.guard ? [actor] : []; // 가드는 자기 자신에게 쓴다
      else targets = TargetSelector.getValidTargets(actor, this.state, unitType.range);
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
      const amountFor = (u: CharacterState) => Math.min(this.calc.heal(actor, skill), u.maxTroops - u.troops);
      const others = this.areaRecipients(actor, target, skill).filter((u) => u.uid !== target.uid).map((u) => ({ uid: u.uid, amount: amountFor(u) }));
      return { kind: 'heal', amount: amountFor(target), ...(others.length > 0 ? { alsoHealed: others } : {}) };
    }
    if (skill.kind === 'revive') return { kind: 'revive', troops: this.reviveTroops(target, skill) };
    if (skill.kind === 'buff' && skill.buff) {
      const others = this.areaRecipients(actor, target, skill).filter((u) => u.uid !== target.uid).map((u) => u.uid);
      return { kind: 'buff', effect: skill.buff, ...(others.length > 0 ? { alsoBuffed: others } : {}) };
    }
    if (skill.kind === 'guard') {
      return { kind: 'guard', rateAfter: actor.guardRate + this.guardGain(actor) };
    }

    // 가드 유닛이 순서대로 판정하므로, 아무도 막지 못할 확률은 각자 못 막을 확률의 곱이다.
    let noIntercept = 1;
    for (const guardian of this.guardiansFor(target, skill)) noIntercept *= 1 - Math.min(guardian.guardRate, 100) / 100;

    const damage = Math.min(this.victimAmount(actor, target, skill), target.troops);
    const remaining = target.troops - damage;
    let counter = 0;
    const targetType = data.unitTypes[target.unitType];
    if (skill.counterable && remaining > 0 && targetType.canCounter && this.calc.counterRate(skill) > 0) {
      const counterSkill = data.skills[targetType.basicSkillId];
      if (counterSkill.kind === 'attack') {
        // 실제 처리에서는 피격으로 사기가 먼저 움직인 뒤 반격하므로, 같은 값으로 계산한다. 병력은 맞기 전 병력이다.
        const share = Math.max(0, this.moraleShare(target.side) - (damage > 0 ? balance.morale.onHit : 0));
        counter = Math.min(this.calc.counterDamage(target, actor, counterSkill, skill, share), actor.troops);
      }
    }
    return {
      kind: 'attack',
      damage,
      counter,
      targetTroopsAfter: remaining,
      actorTroopsAfter: actor.troops - counter,
      interceptChance: 1 - noIntercept,
      targetBarrier: target.barrier > 0,
      ...(this.behindTarget(target, skill) ? { alsoHit: { uid: this.behindTarget(target, skill)!.uid, damage: Math.min(this.behindAmount(actor, this.behindTarget(target, skill)!, skill), this.behindTarget(target, skill)!.troops) } } : {}),
      ...(this.rowVictims(target, skill).length > 1 ? { rowHits: this.rowVictims(target, skill).slice(1).map((u) => ({ uid: u.uid, damage: Math.min(this.victimAmount(actor, u, skill), u.troops) })) } : {}),
      ...(this.criticalOn() && damage > 0 ? { criticalChance: balance.critical!.chance, criticalDamage: Math.min(this.criticalAmount(this.calc.damage(actor, target, skill, this.moraleShare(actor.side))), target.troops) } : {}),
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

    if (skill.maxUses !== undefined && skill.kind !== 'revive') actor.skillUses = { ...(actor.skillUses ?? {}), [skill.id]: (actor.skillUses?.[skill.id] ?? 0) + 1 };
    if (skill.kind === 'attack') this.performAttack(actor, target, skill);
    else if (skill.kind === 'guard') this.performGuard(actor);
    else if (skill.kind === 'buff') this.performBuff(actor, target, skill);
    else if (skill.kind === 'revive') this.performRevive(actor, target, skill);
    else this.performHeal(actor, target, skill);
    return true;
  }

  private performAttack(actor: CharacterState, originalTarget: CharacterState, skill: SkillData): void {
    // 막기만 하거나 공격만 해야 한다: 공격하는 순간 가드 확률이 모두 사라진다 (공격해도 가드를 유지하는 병종은 예외).
    if (!this.input.data.unitTypes[actor.unitType].guard?.keepOnAttack) this.setGuardRate(actor, 0, 'reset');

    // 같은 열의 가드 유닛이 대신 맞을 수 있다. 이후의 피해와 반격은 실제로 맞는 쪽(target) 기준이다.
    let target = originalTarget;
    const rowHit = (skill.rowAttack ?? 0) > 0;
    const guardian = rowHit ? null : this.rollIntercept(originalTarget, skill); // 열 공격은 대신 맞기가 없다
    if (guardian) {
      // 순서: 가드 발동 → 확률 감소 → 피해 (화면 연출이 이 순서로 재생된다)
      this.emit({ type: 'intercept', round: this.state.round, attacker: actor.uid, target: originalTarget.uid, guardian: guardian.uid });
      this.report(guardian).blocks++;
      target = guardian;
    }

    // 피해는 가드 상태(받는 피해 감소)로 먼저 계산하고, 가드 중에 맞으면 확률이 준다 (대신 맞든 직접 맞든, 원작 규칙).
    // 열 공격은 같은 열 전체(조준한 대상이 첫 번째)가 각자 기준으로 맞는다.
    const victims = this.rowVictims(target, skill);
    let amount = this.victimAmount(actor, target, skill);
    // 크리티컬: 확률이 켜져 있고 맞을 때만 난수를 쓴다 (꺼져 있으면 기존 시드 결과가 그대로다). 열 공격도 한 번만 굴린다.
    const critical = this.criticalOn() && amount > 0 && this.rng() * 100 < this.input.balance.critical!.chance;
    if (critical) amount = this.criticalAmount(amount);
    const troopsBeforeHit = target.troops;
    victims.forEach((victim, index) => {
      let hit = index === 0 ? amount : this.victimAmount(actor, victim, skill);
      if (index > 0 && critical) hit = this.criticalAmount(hit);
      const guard = this.input.data.unitTypes[victim.unitType].guard;
      if (guard && victim.guardRate > 0 && victim.barrier === 0) this.setGuardRate(victim, Math.max(0, victim.guardRate - guard.decay), 'block');
      this.skillStat(skill.id).damage += this.inflict(actor, victim, hit, 'attack', critical, index > 0);
    });
    this.hitBehind(actor, originalTarget, skill, critical);

    // 상호 피해: 근접 공격을 받은 대상이 살아 있으면 반격한다. 반격의 세기는 맞기 전 병력으로 계산한다 (원작 규칙).
    const { data } = this.input;
    const targetType = data.unitTypes[target.unitType];
    if (skill.counterable && !target.isDead && !actor.isDead && targetType.canCounter) {
      const counterSkill = data.skills[targetType.basicSkillId];
      if (counterSkill.kind === 'attack' && this.calc.counterRate(skill) > 0) {
        const counterer = { ...target, troops: troopsBeforeHit };
        const counter = this.calc.counterDamage(counterer, actor, counterSkill, skill, this.moraleShare(target.side));
        if (counter > 0) this.inflict(target, actor, counter, 'counter');
      }
    }
  }

  private performGuard(actor: CharacterState): void {
    const guard = this.input.data.unitTypes[actor.unitType].guard;
    if (!guard) throw new Error(`${actor.name} cannot guard`);
    this.setGuardRate(actor, actor.guardRate + this.guardGain(actor), 'raise');
  }

  /** 가드 커맨드 한 번에 오르는 확률 = gain + 지력 × gainPerIntellect (버프로 오른 지력 포함) */
  private guardGain(unit: CharacterState): number {
    const guard = this.input.data.unitTypes[unit.unitType].guard;
    if (!guard) return 0;
    return Math.round(guard.gain + unit.stats.intellect * (guard.gainPerIntellect ?? 0));
  }

  /** 버프/치유를 받는 아군들: 범위가 없으면 대상 하나, row면 대상이 있는 열 전체, all이면 아군 전체. 대상이 맨 앞에 온다 */
  private areaRecipients(actor: CharacterState, target: CharacterState, skill: SkillData): CharacterState[] {
    if (!skill.area) return [target];
    const allies = this.state.units.filter((u) => u.side === actor.side && !u.isDead && u.uid !== target.uid && (skill.area === 'all' || u.row === target.row));
    const eligible = skill.kind === 'buff' ? allies.filter((u) => canBuff(u, skill)) : allies;
    return [target, ...eligible.sort((x, y) => (x.row === y.row ? x.slot - y.slot : x.row === 'front' ? -1 : 1))];
  }

  private reviveTroops(target: CharacterState, skill: SkillData): number {
    return Math.max(1, Math.round(target.maxTroops * (skill.reviveRatio ?? 0.2)));
  }

  /** 부활: 전멸한 아군을 적은 병력으로 되살린다. 결계는 사라지고 가드는 시작값으로 돌아오며, 남은 AP는 그대로다. */
  private performRevive(actor: CharacterState, target: CharacterState, skill: SkillData): void {
    const row = reviveRow(target, this.state);
    if (!row) throw new Error(`No room to revive ${target.name}`);
    actor.skillUses = { ...(actor.skillUses ?? {}), [skill.id]: (actor.skillUses?.[skill.id] ?? 0) + 1 };
    const troops = this.reviveTroops(target, skill);
    const slot = this.state.units.filter((u) => u.side === target.side && !u.isDead && u.row === row).length;
    target.isDead = false;
    target.troops = troops;
    target.row = row;
    target.slot = slot;
    target.barrier = 0;
    target.guardRate = this.input.data.unitTypes[target.unitType].guard?.start ?? 0;
    this.report(actor).healing += troops;
    this.skillStat(skill.id).healing += troops;
    this.emit({ type: 'revive', round: this.state.round, source: actor.uid, target: target.uid, troopsAfter: troops, row, slot });
  }

  private performBuff(actor: CharacterState, target: CharacterState, skill: SkillData): void {
    const buff = skill.buff;
    if (!buff) throw new Error(`Skill ${skill.id} has no buff effect`);
    for (const unit of this.areaRecipients(actor, target, skill)) this.applyBuff(actor, unit, skill);
  }

  private applyBuff(actor: CharacterState, target: CharacterState, skill: SkillData): void {
    const buff = skill.buff!;
    target.buffUses[skill.id] = (target.buffUses[skill.id] ?? 0) + 1;

    if (buff.type === 'barrier') {
      target.barrier += buff.charges;
      this.emit({ type: 'barrier', round: this.state.round, unit: target.uid, charges: target.barrier, reason: 'gain' });
      return;
    }

    // 스탯 버프: pool에서 무작위로 minCount~maxCount가지를 고른다 (중복 없음)
    const count = Math.min(buff.pool.length, buff.minCount + Math.floor(this.rng() * (buff.maxCount - buff.minCount + 1)));
    const pool = [...buff.pool];
    const changes: { stat: BuffStat; amount: number; value: number }[] = [];
    for (let i = 0; i < count; i++) {
      const stat = pool.splice(Math.floor(this.rng() * pool.length), 1)[0];
      target.stats[stat] += buff.amount;
      target.buffs[stat] += buff.amount;
      changes.push({ stat, amount: buff.amount, value: target.stats[stat] });
    }
    this.emit({ type: 'buff', round: this.state.round, source: actor.uid, target: target.uid, changes });
  }

  // ---------- 가드 ----------

  /** target과 같은 열의 다른 아군 중 가드 확률이 있는 유닛. 확률이 높은 순서로 판정한다. */
  /**
   * 이 공격을 대신 맞을 수 있는 가드 군단들 (가드 확률이 높은 순).
   * 같은 열 아군만 지키는 가드(scope row)와 모든 아군을 지키는 가드(scope all)가 있고, 가드로 막을 수 있는 공격(guardable)은 모든 가드가,
   * 지력 기반 공격은 interceptsMagic인 가드만 막는다.
   */
  private guardiansFor(target: CharacterState, skill: SkillData): CharacterState[] {
    if (skill.kind !== 'attack') return [];
    return this.state.units
      .filter((u) => {
        if (u.side !== target.side || u.isDead || u.uid === target.uid || u.guardRate <= 0) return false;
        const guard = this.input.data.unitTypes[u.unitType].guard;
        if (!guard) return false;
        if (guard.scope !== 'all' && u.row !== target.row) return false;
        return skill.guardable === true || (guard.interceptsMagic === true && skill.scalesWith === 'intellect');
      })
      .sort((a, b) => b.guardRate - a.guardRate);
  }

  private rollIntercept(target: CharacterState, skill: SkillData): CharacterState | null {
    for (const guardian of this.guardiansFor(target, skill)) {
      if (this.rng() * 100 < guardian.guardRate) return guardian;
    }
    return null;
  }

  private setGuardRate(unit: CharacterState, rate: number, reason: 'raise' | 'block' | 'reset'): void {
    if (unit.guardRate === rate) return;
    unit.guardRate = rate;
    this.emit({ type: 'guardChange', round: this.state.round, unit: unit.uid, rate, reason });
  }

  private performHeal(actor: CharacterState, target: CharacterState, skill: SkillData): void {
    const amount = this.calc.heal(actor, skill);
    for (const unit of this.areaRecipients(actor, target, skill)) {
      const applied = Math.min(amount, unit.maxTroops - unit.troops);
      // 범위 치유에서 이미 가득 찬 아군은 건너뛴다 (대상 하나를 직접 고른 경우는 0이어도 그대로 기록한다)
      if (applied <= 0 && unit.uid !== target.uid) continue;
      unit.troops += applied;
      this.report(actor).healing += applied;
      this.skillStat(skill.id).healing += applied;
      this.emit({ type: 'heal', round: this.state.round, source: actor.uid, target: unit.uid, amount: applied, troopsAfter: unit.troops });
    }
  }

  /** 동시 타격으로 함께 맞는 후열 군단: 조준한 대상이 전열이고 같은 칸 번호의 후열 군단이 살아 있을 때 */
  private behindTarget(target: CharacterState, skill: SkillData): CharacterState | undefined {
    if (!(skill.behindHit && skill.behindHit > 0) || target.row !== 'front') return undefined;
    return this.state.units.find((u) => u.side === target.side && !u.isDead && u.row === 'back' && u.slot === target.slot);
  }

  private behindAmount(actor: CharacterState, behind: CharacterState, skill: SkillData): number {
    return Math.round(this.calc.damage(actor, behind, skill, this.moraleShare(actor.side)) * (skill.behindHit ?? 0));
  }

  /** 동시 타격의 두 번째 피해. 후열 군단 기준으로 계산하고 가드 대신 맞기와 반격은 없다 (가드 중이면 확률이 준다) */
  private hitBehind(actor: CharacterState, aimed: CharacterState, skill: SkillData, critical: boolean): void {
    const behind = this.behindTarget(aimed, skill);
    if (!behind) return;
    let amount = this.behindAmount(actor, behind, skill);
    if (critical) amount = this.criticalAmount(amount);
    const guard = this.input.data.unitTypes[behind.unitType].guard;
    if (guard && behind.guardRate > 0 && behind.barrier === 0) this.setGuardRate(behind, Math.max(0, behind.guardRate - guard.decay), 'block');
    this.skillStat(skill.id).damage += this.inflict(actor, behind, amount, 'attack', critical, true);
  }

  /** 이 공격으로 맞는 군단들: 열 공격이면 대상이 있는 열의 살아 있는 군단 전체(대상이 첫 번째), 아니면 대상 하나 */
  private rowVictims(target: CharacterState, skill: SkillData): CharacterState[] {
    if (!((skill.rowAttack ?? 0) > 0) || skill.kind !== 'attack') return [target];
    const row = this.state.units.filter((u) => u.side === target.side && !u.isDead && u.row === target.row && u.uid !== target.uid).sort((a, b) => a.slot - b.slot);
    return [target, ...row];
  }

  /** 한 군단이 이 공격으로 받는 피해 (열 공격이면 비율을 곱한다) */
  private victimAmount(actor: CharacterState, victim: CharacterState, skill: SkillData): number {
    const raw = this.calc.damage(actor, victim, skill, this.moraleShare(actor.side));
    return (skill.rowAttack ?? 0) > 0 ? Math.round(raw * skill.rowAttack!) : raw;
  }

  private criticalOn(): boolean {
    const c = this.input.balance.critical;
    return !!c && c.chance > 0;
  }

  private criticalAmount(amount: number): number {
    return Math.round(amount * this.input.balance.critical!.multiplier);
  }

  /** 피해를 적용하고 실제로 깎인 병력을 돌려준다. 사망/사기 변동도 여기서 처리한다. */
  private inflict(source: CharacterState, target: CharacterState, amount: number, kind: 'attack' | 'counter', critical = false, splash = false): number {
    // 피해 무시(결계): 피해 한 번을 통째로 0으로 만든다 (반격 피해도 마찬가지)
    if (amount > 0 && target.barrier > 0) {
      target.barrier--;
      amount = 0;
      this.emit({ type: 'barrier', round: this.state.round, unit: target.uid, charges: target.barrier, reason: 'block' });
    }
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
      ...(critical && applied > 0 ? { critical: true as const } : {}),
      ...(splash ? { splash: true as const } : {}),
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
