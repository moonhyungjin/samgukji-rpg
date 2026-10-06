import { DamageCalculator } from './damage';
import { judge } from './judgement';
import { buildUnits } from './lineup';
import { defaultCommandPolicy } from './policy';
import type { CommandPolicy } from './policy';
import { createRng } from './rng';
import type { Rng } from './rng';
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
      });
    }
  }

  run(): BattleResult {
    const { maxTurns } = this.input.balance;
    let endCause: EndCause = 'max-turns';

    for (let round = 1; round <= maxTurns; round++) {
      if (!this.state.units.some((u) => !u.isDead && u.ap > 0)) {
        endCause = 'no-ap';
        break;
      }
      this.state.round = round;
      this.emit({ type: 'roundStart', round });

      let acted = false;
      for (const actor of buildTurnOrder(this.state, this.rng)) {
        if (actor.isDead) continue;
        if (this.takeAction(actor)) acted = true;
        if (this.isWiped('attacker') || this.isWiped('defender')) break;
      }

      if (this.isWiped('attacker') || this.isWiped('defender')) {
        endCause = 'wipe';
        break;
      }
      if (!acted) {
        // 한 라운드 동안 아무도 대기 외 행동을 하지 않았다 (교착)
        endCause = 'stall';
        break;
      }
    }

    const { winner, decidedBy } = judge(this.state, this.input.balance.morale.judgement);
    this.emit({ type: 'battleEnd', winner, endCause, decidedBy, rounds: this.state.round });
    return this.buildResult(winner, endCause, decidedBy);
  }

  // ---------- 행동 ----------

  /** 행동했으면 true, 대기면 false */
  private takeAction(actor: CharacterState): boolean {
    const { data, balance } = this.input;
    const command = this.policy({ state: this.state, actor, data, balance, rng: this.rng });

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
    else this.performHeal(actor, target, skill);
    return true;
  }

  private performAttack(actor: CharacterState, target: CharacterState, skill: SkillData): void {
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
