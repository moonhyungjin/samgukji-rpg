import { Application, Container, Graphics, Text } from 'pixi.js';
import type { BattleEvent, GameData } from '@samgukji/battle-engine';
import type { SceneLike } from '../battle/controller';
import type { BattleOutcome, ViewState } from '../battle/viewState';
import { DECIDED_BY_LABEL, END_CAUSE_LABEL, SIDE_LABEL, STAT_SHORT } from '../lib/labels';
import { UnitSprite } from './UnitSprite';
import { CARD_H, CARD_W, columnX, FONT, SIDE_COLOR, WORLD_H, WORLD_W } from './theme';
import { delay, easeOut, tween } from './tween';
import type { Clock } from './tween';

export interface SceneOptions {
  data: GameData;
  maxTurns: number;
}

const MORALE_BAR = { x: 390, y: 16, w: 500, h: 18 };

/**
 * PixiJS로 전투를 그린다. 규칙은 계산하지 않고, 컨트롤러가 넘겨 주는 엔진 이벤트를 재생하기만 한다.
 */
export class BattleScene implements SceneLike {
  private readonly world = new Container();
  private readonly unitsLayer = new Container();
  private readonly effectsLayer = new Container();
  private readonly overlayLayer = new Container();
  private readonly moraleBar = new Graphics();
  private readonly roundText: Text;
  private readonly attackerMoraleText: Text;
  private readonly defenderMoraleText: Text;
  private readonly sprites = new Map<string, UnitSprite>();

  private speed = 1;
  private instant = false;
  private destroyed = false;
  private morale = 50;

  private readonly clock: Clock = { scale: () => (this.instant || this.speed <= 0 ? Infinity : this.speed) };

  static async create(host: HTMLElement, options: SceneOptions): Promise<BattleScene> {
    const app = new Application();
    await app.init({
      background: 0x12151c,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      resizeTo: host,
    });
    host.appendChild(app.canvas);
    return new BattleScene(app, options);
  }

  private constructor(
    private readonly app: Application,
    private readonly options: SceneOptions,
  ) {
    this.app.stage.addChild(this.world);

    this.world.addChild(this.drawBackground(), this.unitsLayer, this.effectsLayer, this.moraleBar, this.overlayLayer);

    this.roundText = new Text({ text: '', style: { fontFamily: FONT, fontSize: 20, fill: 0xe4e8f0, fontWeight: 'bold' } });
    this.roundText.position.set(24, 14);
    this.attackerMoraleText = new Text({ text: '', style: { fontFamily: FONT, fontSize: 15, fill: SIDE_COLOR.attacker, fontWeight: 'bold' } });
    this.attackerMoraleText.anchor.set(1, 0.5);
    this.attackerMoraleText.position.set(MORALE_BAR.x - 12, MORALE_BAR.y + MORALE_BAR.h / 2);
    this.defenderMoraleText = new Text({ text: '', style: { fontFamily: FONT, fontSize: 15, fill: SIDE_COLOR.defender, fontWeight: 'bold' } });
    this.defenderMoraleText.anchor.set(0, 0.5);
    this.defenderMoraleText.position.set(MORALE_BAR.x + MORALE_BAR.w + 12, MORALE_BAR.y + MORALE_BAR.h / 2);
    this.world.addChild(this.roundText, this.attackerMoraleText, this.defenderMoraleText);

    this.app.renderer.on('resize', () => this.fit());
    this.fit();
    this.updateRound(0);
    this.drawMorale(50);
  }

  // ---------- SceneLike ----------

  setState(state: ViewState): void {
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.sprites.clear();
    this.clearLayer(this.effectsLayer);
    this.clearLayer(this.overlayLayer);

    for (const unit of state.units) {
      const sprite = new UnitSprite(unit, this.clock);
      this.sprites.set(unit.uid, sprite);
      this.unitsLayer.addChild(sprite.root);
    }
    this.updateRound(state.round);
    this.morale = state.defenderMorale;
    this.drawMorale(state.defenderMorale);
    if (state.outcome) this.showOutcome(state.outcome, true);
  }

  async playEvent(event: BattleEvent): Promise<void> {
    if (this.destroyed) return;
    switch (event.type) {
      case 'roundStart': {
        this.updateRound(event.round);
        await this.banner(`라운드 ${event.round}`);
        return;
      }
      case 'action': {
        const actor = this.sprites.get(event.actor);
        if (!actor) return;
        actor.setAp(event.apAfter);
        // 글자는 기다리지 않고 띄워 두어, 이어지는 공격 연출과 겹치게 한다
        if (event.skillId === 'wait') {
          void this.floatText(actor, '대기', 0x9aa4b8, 18, 450);
          await actor.pulse();
        } else {
          const skillName = this.options.data.skills[event.skillId]?.name ?? event.skillId;
          void this.floatText(actor, skillName, 0xffffff, 20, 600);
          await actor.pulse();
        }
        return;
      }
      case 'damage': {
        const source = this.sprites.get(event.source);
        const target = this.sprites.get(event.target);
        if (!source || !target) return;
        const counter = event.kind === 'counter';
        // 찌르는 순간에 피격 연출을 시작해, 돌아오는 동안 병력 바가 줄어들게 한다
        let impact: Promise<unknown> = Promise.resolve();
        await source.lunge(target.center, counter ? 16 : 26, () => {
          void this.floatText(target, counter ? `반격 -${event.amount}` : `-${event.amount}`, counter ? 0xffa94d : 0xff5a5a, counter ? 22 : 28, 600);
          impact = Promise.all([target.flash(), target.animateTroops(event.troopsAfter)]);
        });
        await impact;
        return;
      }
      case 'heal': {
        const target = this.sprites.get(event.target);
        if (!target) return;
        void this.floatText(target, `+${event.amount}`, 0x59e08a, 28, 600);
        await target.animateTroops(event.troopsAfter);
        return;
      }
      case 'buff': {
        const source = this.sprites.get(event.source);
        const target = this.sprites.get(event.target);
        if (!target) return;
        if (source && source !== target) await source.pulse();
        const text = event.changes.map((c) => `${STAT_SHORT[c.stat]}+${c.amount}`).join(' ');
        void this.floatText(target, text, 0xffd166, 24, 700);
        for (const c of event.changes) target.setBuffs(c.stat, c.amount);
        await target.pulse();
        return;
      }
      case 'barrier': {
        const target = this.sprites.get(event.unit);
        if (!target) return;
        target.setBarrier(event.charges);
        void this.floatText(target, event.reason === 'gain' ? '결계!' : '피해 무시!', 0x9be7ff, 24, 700);
        await target.pulse();
        return;
      }
      case 'unitDestroyed': {
        const sprite = this.sprites.get(event.unit);
        if (sprite) await sprite.fadeOut();
        return;
      }
      case 'rowAdvance': {
        await Promise.all(event.units.map((uid, index) => this.sprites.get(uid)?.moveToSlot('front', index)));
        return;
      }
      case 'intercept': {
        // 가드 유닛이 나서서 대신 맞는다. 이어지는 damage 이벤트가 그 유닛에게 향한다.
        const guardian = this.sprites.get(event.guardian);
        if (!guardian) return;
        void this.floatText(guardian, '가드!', 0x8fb8ff, 22, 600);
        await guardian.pulse();
        return;
      }
      case 'guardChange': {
        this.sprites.get(event.unit)?.setGuard(event.rate);
        return;
      }
      case 'morale': {
        // 피격마다 일어나므로 기다리지 않고 바만 부드럽게 움직인다
        void this.animateMorale(event.defenderMorale);
        return;
      }
      case 'battleEnd': {
        await this.showOutcome(
          { winner: event.winner, endCause: event.endCause, decidedBy: event.decidedBy, rounds: event.rounds },
          false,
        );
        return;
      }
    }
  }

  setTargets(uids: string[], onPick: (uid: string) => void): void {
    this.clearTargets();
    for (const uid of uids) this.sprites.get(uid)?.setTargetable(() => onPick(uid));
  }

  clearTargets(): void {
    for (const sprite of this.sprites.values()) sprite.setTargetable(null);
  }

  setActing(uid: string | null): void {
    for (const sprite of this.sprites.values()) sprite.setActing(sprite.uid === uid);
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }

  setInstant(instant: boolean): void {
    this.instant = instant;
  }

  destroy(): void {
    this.destroyed = true;
    // 진행 중인 애니메이션이 이미 파괴된 객체를 건드리지 않도록 스프라이트를 먼저 정리한다.
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.sprites.clear();
    this.app.destroy({ removeView: true }, { children: true });
  }

  // ---------- 그리기 ----------

  /** 논리 좌표계(1280×600)를 실제 크기에 맞춘다 */
  private fit(): void {
    const { width, height } = this.app.screen;
    const scale = Math.min(width / WORLD_W, height / WORLD_H);
    this.world.scale.set(scale);
    this.world.position.set((width - WORLD_W * scale) / 2, (height - WORLD_H * scale) / 2);
  }

  private drawBackground(): Container {
    const layer = new Container();
    const g = new Graphics();
    // 열마다 어두운 바탕을 깔아 구조(전열/후열)를 보여 준다
    for (const side of ['attacker', 'defender'] as const) {
      for (const row of ['front', 'back'] as const) {
        g.roundRect(columnX(side, row) - 12, 70, CARD_W + 24, 450, 12).fill({ color: 0x171c28 });
        const label = new Text({
          text: row === 'front' ? '전열' : '후열',
          style: { fontFamily: FONT, fontSize: 14, fill: 0x6b7690, fontWeight: 'bold' },
        });
        label.anchor.set(0.5, 0);
        label.position.set(columnX(side, row) + CARD_W / 2, 76);
        layer.addChild(label);
      }
      const title = new Text({
        text: SIDE_LABEL[side],
        style: { fontFamily: FONT, fontSize: 16, fill: SIDE_COLOR[side], fontWeight: 'bold' },
      });
      title.anchor.set(0.5, 0);
      title.position.set(side === 'attacker' ? 270 : 1010, 540);
      layer.addChild(title);
    }
    const versus = new Text({ text: 'VS', style: { fontFamily: FONT, fontSize: 64, fill: 0x232a3a, fontWeight: 'bold' } });
    versus.anchor.set(0.5);
    versus.position.set(WORLD_W / 2, 300);
    layer.addChildAt(g, 0);
    layer.addChild(versus);
    return layer;
  }

  private updateRound(round: number): void {
    this.roundText.text = round === 0 ? '전투 준비' : `라운드 ${round} / ${this.options.maxTurns}`;
  }

  /** 사기 바: 공격측(파랑)이 왼쪽, 방어측(빨강)이 오른쪽. 합이 항상 100인 제로섬 막대 */
  private drawMorale(defenderMorale: number): void {
    const { x, y, w, h } = MORALE_BAR;
    const attacker = 100 - defenderMorale;
    const g = this.moraleBar;
    g.clear();
    g.roundRect(x, y, w, h, 6).fill(0x232a3a);
    const split = (w * attacker) / 100;
    if (split > 0) g.roundRect(x, y, Math.max(split, 6), h, 6).fill(SIDE_COLOR.attacker);
    if (split < w) g.roundRect(x + split, y, Math.max(w - split, 6), h, 6).fill(SIDE_COLOR.defender);
    g.rect(x + split - 1.5, y - 3, 3, h + 6).fill(0xffffff);
    this.attackerMoraleText.text = `사기 ${attacker.toFixed(0)}`;
    this.defenderMoraleText.text = `${defenderMorale.toFixed(0)} 사기`;
  }

  private async animateMorale(to: number): Promise<void> {
    const from = this.morale;
    this.morale = to;
    await tween(this.clock, 250, (t) => {
      if (!this.destroyed) this.drawMorale(from + (to - from) * easeOut(t));
    });
  }

  // ---------- 연출 ----------

  private async floatText(sprite: UnitSprite, text: string, color: number, size: number, ms: number): Promise<void> {
    const label = new Text({
      text,
      style: { fontFamily: FONT, fontSize: size, fill: color, fontWeight: 'bold', stroke: { color: 0x000000, width: 4 } },
    });
    label.anchor.set(0.5, 1);
    const { x, y } = sprite.center;
    const top = y - CARD_H / 2;
    label.position.set(x, top);
    this.effectsLayer.addChild(label);
    await tween(this.clock, ms, (t) => {
      if (label.destroyed) return;
      label.y = top - 44 * easeOut(t);
      label.alpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
    });
    if (!label.destroyed) label.destroy();
  }

  private async banner(text: string): Promise<void> {
    const label = new Text({
      text,
      style: { fontFamily: FONT, fontSize: 44, fill: 0xffffff, fontWeight: 'bold', stroke: { color: 0x000000, width: 6 } },
    });
    label.anchor.set(0.5);
    label.position.set(WORLD_W / 2, 200);
    label.alpha = 0;
    this.effectsLayer.addChild(label);
    await tween(this.clock, 130, (t) => {
      if (!label.destroyed) label.alpha = t;
    });
    await delay(this.clock, 160);
    await tween(this.clock, 130, (t) => {
      if (!label.destroyed) label.alpha = 1 - t;
    });
    if (!label.destroyed) label.destroy();
  }

  private async showOutcome(outcome: BattleOutcome, instant: boolean): Promise<void> {
    this.clearLayer(this.overlayLayer);
    // 가운데 빈 공간(전열 카드 사이)에 맞춰 카드를 가리지 않게 한다
    const dim = new Graphics().roundRect(WORLD_W / 2 - 160, 200, 320, 160, 16).fill({ color: 0x000000, alpha: 0.78 });
    const title = new Text({
      text: `${SIDE_LABEL[outcome.winner]} 승리`,
      style: { fontFamily: FONT, fontSize: 40, fill: SIDE_COLOR[outcome.winner], fontWeight: 'bold' },
    });
    title.anchor.set(0.5);
    title.position.set(WORLD_W / 2, 245);
    const detail = new Text({
      text: `${END_CAUSE_LABEL[outcome.endCause]} · 판정 ${DECIDED_BY_LABEL[outcome.decidedBy]}\n${outcome.rounds}라운드`,
      style: { fontFamily: FONT, fontSize: 16, fill: 0xe4e8f0, align: 'center', lineHeight: 24 },
    });
    detail.anchor.set(0.5);
    detail.position.set(WORLD_W / 2, 310);
    this.overlayLayer.addChild(dim, title, detail);
    if (instant) return;
    this.overlayLayer.alpha = 0;
    await tween(this.clock, 400, (t) => {
      if (!this.overlayLayer.destroyed) this.overlayLayer.alpha = t;
    });
  }

  private clearLayer(layer: Container): void {
    for (const child of layer.removeChildren()) child.destroy({ children: true });
    layer.alpha = 1;
  }
}
