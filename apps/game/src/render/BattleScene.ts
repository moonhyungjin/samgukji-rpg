import { Application, Container, Graphics, Sprite, Text } from 'pixi.js';
import { loadBattleArt } from './battleArt';
import type { BattleTextures } from './battleArt';
import type { BattleEvent, GameData } from '@samgukji/battle-engine';
import type { SceneLike } from '../battle/controller';
import type { BattleOutcome, ViewState, ViewUnit } from '../battle/viewState';
import { DECIDED_BY_LABEL, END_CAUSE_LABEL, SIDE_LABEL, STAT_SHORT } from '../lib/labels';
import { UnitSprite } from './UnitSprite';
import { CARD_H, FONT, SIDE_COLOR, WORLD_H, WORLD_W, cardLayout } from './theme';
import { delay, easeOut, tween } from './tween';
import type { Clock } from './tween';
import { playRangedEffect, rangedEffectFor, rangedImpact } from './rangedEffects';

export interface SceneOptions {
  data: GameData;
  maxTurns: number;
  artUnits?: readonly Pick<ViewUnit, 'characterId' | 'family'>[];
}

const MORALE_BAR = { x: 420, y: 44, w: 440, h: 14 };

function inferFactionName(units: readonly ViewUnit[], side: 'attacker' | 'defender'): string {
  const sideUnits = units.filter(u => u.side === side);
  if (sideUnits.length === 0) return side === 'attacker' ? '공격군' : '방어군';
  const text = sideUnits.map(u => `${u.name} ${u.characterId}`).join(' ');
  if (text.includes('황건') || text.includes('yt')) return '황건군';
  if (text.includes('유비') || text.includes('관우') || text.includes('장비') || text.includes('촉') || text.includes('shu')) return '촉  군';
  if (text.includes('조조') || text.includes('하후') || text.includes('허저') || text.includes('위') || text.includes('wei')) return '위  군';
  if (text.includes('손') || text.includes('주유') || text.includes('오') || text.includes('wu')) return '오  군';
  return side === 'attacker' ? '공격군' : '방어군';
}

/**
 * PixiJS로 전투를 그린다. 규칙은 계산하지 않고, 컨트롤러가 넘겨 주는 엔진 이벤트를 재생하기만 한다.
 */
export class BattleScene implements SceneLike {
  private readonly world = new Container();
  private readonly unitsLayer = new Container({ sortableChildren: true });
  private readonly armyLayer = new Container({ sortableChildren: true });
  private readonly armyLabels = new Container({ eventMode: 'none' });
  private readonly effectsLayer = new Container();
  private readonly overlayLayer = new Container();
  private readonly moraleBar = new Graphics();
  private readonly moraleCenterLabel: Text;
  private readonly roundText: Text;
  private readonly attackerTitle: Text;
  private readonly defenderTitle: Text;
  private readonly attackerMoraleText: Text;
  private readonly defenderMoraleText: Text;
  private readonly sprites = new Map<string, UnitSprite>();

  private speed = 1;
  private instant = false;
  private destroyed = false;
  private morale = 50;
  private lastAction: Extract<BattleEvent, { type: 'action' }> | null = null;
  private readonly pendingDefeat = new Set<string>();

  private readonly clock: Clock = { scale: () => (this.instant || this.speed <= 0 ? Infinity : this.speed) };

  static async create(host: HTMLElement, options: SceneOptions): Promise<BattleScene> {
    const textures = await loadBattleArt(options.artUnits);
    host.dataset.artLoaded = Object.entries(textures).filter(([, texture]) => !!texture).map(([key]) => key).join(',');
    const app = new Application();
    await app.init({
      background: 0x12151c,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      resizeTo: host,
    });
    host.appendChild(app.canvas);
    return new BattleScene(app, options, textures);
  }

  private constructor(
    private readonly app: Application,
    private readonly options: SceneOptions,
    private readonly textures: BattleTextures,
  ) {
    this.app.stage.addChild(this.world);

    this.roundText = new Text({ text: '', style: { fontFamily: FONT, fontSize: 15, fill: 0xf5eedb, fontWeight: 'bold' } });
    this.roundText.anchor.set(.5, 0.5);
    this.roundText.position.set(640, 22);

    this.attackerTitle = new Text({ text: '공격군', style: { fontFamily: FONT, fontSize: 20, fill: 0xf5eedb, fontWeight: 'bold' } });
    this.attackerTitle.anchor.set(0.5, 0.5);
    this.attackerTitle.position.set(220, 35);

    this.defenderTitle = new Text({ text: '방어군', style: { fontFamily: FONT, fontSize: 20, fill: 0xf5eedb, fontWeight: 'bold' } });
    this.defenderTitle.anchor.set(0.5, 0.5);
    this.defenderTitle.position.set(1060, 35);

    this.moraleCenterLabel = new Text({ text: '사기', style: { fontFamily: FONT, fontSize: 10, fill: 0xe5d8b8, fontWeight: 'bold' } });
    this.moraleCenterLabel.anchor.set(0.5, 0.5);
    this.moraleCenterLabel.position.set(640, MORALE_BAR.y + MORALE_BAR.h / 2);

    this.attackerMoraleText = new Text({ text: '', style: { fontFamily: FONT, fontSize: 13, fill: 0x60a5fa, fontWeight: 'bold' } });
    this.attackerMoraleText.anchor.set(1, 0.5);
    this.attackerMoraleText.position.set(MORALE_BAR.x - 10, MORALE_BAR.y + MORALE_BAR.h / 2);

    this.defenderMoraleText = new Text({ text: '', style: { fontFamily: FONT, fontSize: 13, fill: 0xf87171, fontWeight: 'bold' } });
    this.defenderMoraleText.anchor.set(0, 0.5);
    this.defenderMoraleText.position.set(MORALE_BAR.x + MORALE_BAR.w + 10, MORALE_BAR.y + MORALE_BAR.h / 2);

    this.world.addChild(
      this.drawBackground(), this.armyLayer, this.armyLabels, this.unitsLayer,
      this.effectsLayer, this.moraleBar, this.moraleCenterLabel, this.overlayLayer,
      this.roundText, this.attackerTitle, this.defenderTitle,
      this.attackerMoraleText, this.defenderMoraleText,
    );

    this.app.renderer.on('resize', () => this.fit());
    this.fit();
    this.updateRound(0);
    this.drawMorale(50);
  }

  // ---------- SceneLike ----------

  setState(state: ViewState): void {
    this.lastAction = null;
    this.pendingDefeat.clear();
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.sprites.clear();
    this.clearLayer(this.effectsLayer);
    this.clearLayer(this.overlayLayer);

    for (const unit of state.units) {
      const sprite = new UnitSprite(unit, this.clock, this.textures);
      this.sprites.set(unit.uid, sprite);
      this.unitsLayer.addChild(sprite.root);
      this.armyLayer.addChild(sprite.army.root);
      this.armyLabels.addChild(sprite.army.annotation);
    }
    this.attackerTitle.text = inferFactionName(state.units, 'attacker');
    this.refreshOccupiedSlots();
    this.defenderTitle.text = inferFactionName(state.units, 'defender');
    this.updateRound(state.round);
    this.morale = state.defenderMorale;
    this.drawMorale(state.defenderMorale);
    if (state.outcome) this.showOutcome(state.outcome, true);
  }

  async playEvent(event: BattleEvent, nextEvent?: BattleEvent): Promise<void> {
    if (this.destroyed) return;
    switch (event.type) {
      case 'roundStart': {
        this.updateRound(event.round);
        await this.banner(`라운드 ${event.round}`);
        return;
      }
      case 'action': {
        this.lastAction = event;
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
        // 동시 타격으로 함께 맞은 군단: 돌진 연출 없이 피격만 보여 준다
        if (event.splash) {
          void this.floatText(target, `관통 -${event.amount}`, 0xffa94d, 22, 600);
          await Promise.all([event.amount > 0 ? target.flash() : Promise.resolve(), target.animateTroops(event.troopsAfter)]);
          return;
        }
        const counter = event.kind === 'counter';
        // Damage carries the actual recipient (including guard interception).
        // The preceding action supplies only the visual skill, never the hit result.
        const ranged = !counter && this.lastAction?.actor === event.source
          ? rangedEffectFor(this.lastAction.skillId) : null;
        if (ranged) {
          await playRangedEffect(this.effectsLayer, this.clock, ranged, source.center, target.center);
          if (this.destroyed) return;
          void this.floatText(target, event.critical ? `치명타! -${event.amount}` : `-${event.amount}`, event.amount === 0 ? 0x9be7ff : event.critical ? 0xffd166 : 0xff5a5a, event.critical ? 34 : 28, event.critical ? 800 : 600);
          await Promise.all([
            rangedImpact(this.effectsLayer, this.clock, ranged, target.center, event.amount === 0),
            event.amount > 0 ? target.flash() : Promise.resolve(),
            target.animateTroops(event.troopsAfter),
          ]);
          return;
        }
        // 찌르는 순간에 피격 연출을 시작해, 돌아오는 동안 병력 바가 줄어들게 한다
        let impact: Promise<unknown> = Promise.resolve();
        await source.lunge(target.center, counter ? 16 : 26, () => {
          void this.slash(target.center, counter);
          void this.floatText(target, counter ? `반격 -${event.amount}` : event.critical ? `치명타! -${event.amount}` : `-${event.amount}`, counter ? 0xffa94d : event.critical ? 0xffd166 : 0xff5a5a, counter ? 22 : event.critical ? 34 : 28, event.critical ? 800 : 600);
          impact = Promise.all([target.flash(), target.animateTroops(event.troopsAfter)]);
        });
        await impact;
        if (counter && this.pendingDefeat.delete(event.source)) {
          await source.fadeOut();
          this.refreshOccupiedSlots();
        }
        return;
      }
      case 'debuffApply': {
        this.sprites.get(event.unit)?.updateDebuff(event.debuffId, event.name, event.rounds);
        return;
      }
      case 'debuffEnd': {
        this.sprites.get(event.unit)?.updateDebuff(event.debuffId, event.name);
        return;
      }
      case 'debuffTick': {
        const target = this.sprites.get(event.unit);
        if (!target) return;
        target.tickDebuff(event.debuffId);
        void this.floatText(target, `${event.name} −${event.amount}`, 0xffb179, 24, 600);
        await Promise.all([target.animateTroops(event.troopsAfter), event.amount > 0 ? target.flash() : Promise.resolve()]);
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
        // 엔진 상태는 이미 전멸이다. 이어지는 확정 반격이 끝날 때까지 외형만 유지한다.
        if (nextEvent?.type === 'damage' && nextEvent.kind === 'counter' && nextEvent.source === event.unit) {
          this.pendingDefeat.add(event.unit);
          return;
        }
        const sprite = this.sprites.get(event.unit);
        if (sprite) await sprite.fadeOut();
        this.refreshOccupiedSlots();
        return;
      }
      case 'revive': {
        const sprite = this.sprites.get(event.target);
        const source = this.sprites.get(event.source);
        if (!sprite) return;
        if (source) await source.pulse();
        void this.floatText(sprite, `부활 ${event.troopsAfter}`, 0x59e08a, 26, 800);
        await Promise.all([sprite.fadeIn(), sprite.animateTroops(event.troopsAfter), sprite.moveToSlot(event.row, event.slot)]);
        this.refreshOccupiedSlots();
        return;
      }
      case 'rowAdvance': {
        await Promise.all(event.units.map(uid => {
          const sprite = this.sprites.get(uid);
          return sprite?.moveToSlot('front', sprite.slot);
        }));
        this.refreshOccupiedSlots();
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

  private refreshOccupiedSlots(): void {
    const sprites = [...this.sprites.values()];
    for (const sprite of sprites) {
      const covered = sprite.isDead && sprites.some(other => !other.isDead && other.side === sprite.side && other.row === sprite.row && other.slot === sprite.slot);
      sprite.root.visible = !covered;
      sprite.army.root.visible = !covered;
      sprite.army.annotation.visible = !covered;
    }
  }

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
    if (this.textures.field) {
      const field = new Sprite(this.textures.field);
      field.position.set(0, -84);
      field.scale.set(Math.max(WORLD_W / field.texture.width, 425 / field.texture.height));
      const mask = new Graphics().rect(0, 70, WORLD_W, 425).fill(0xffffff);
      const view = new Container(); view.addChild(field, mask); view.mask = mask;
      layer.addChild(view);
    } else {
      layer.addChild(new Graphics().rect(0, 70, WORLD_W, 425).fill(0x626953));
    }

    // 최상단 헤더 배경 (Y: 0~70)
    g.rect(0, 0, WORLD_W, 70).fill(0x0a0e14);
    g.moveTo(0, 70).lineTo(WORLD_W, 70).stroke({ width: 2, color: 0xc8a96e });

    // 좌측 진영 현판 (W: 160, H: 46, center: 220, 35)
    g.roundRect(140, 12, 160, 46, 6).fill(0x0d1f1c).stroke({ width: 2, color: 0xc8a96e });
    g.roundRect(144, 16, 152, 38, 4).stroke({ width: 1, color: 0x5a482b });
    g.circle(146, 18, 1.5).fill(0xf5eedb);
    g.circle(294, 18, 1.5).fill(0xf5eedb);
    g.circle(146, 52, 1.5).fill(0xf5eedb);
    g.circle(294, 52, 1.5).fill(0xf5eedb);

    // 우측 진영 현판 (W: 160, H: 46, center: 1060, 35)
    g.roundRect(980, 12, 160, 46, 6).fill(0x1f1214).stroke({ width: 2, color: 0xc8a96e });
    g.roundRect(984, 16, 152, 38, 4).stroke({ width: 1, color: 0x5a482b });
    g.circle(986, 18, 1.5).fill(0xf5eedb);
    g.circle(1134, 18, 1.5).fill(0xf5eedb);
    g.circle(986, 52, 1.5).fill(0xf5eedb);
    g.circle(1134, 52, 1.5).fill(0xf5eedb);

    // 중앙 라운드 현판 (center: 640, 22)
    g.roundRect(550, 8, 180, 28, 4).fill(0x10151c).stroke({ width: 1.5, color: 0xc8a96e });
    g.roundRect(553, 11, 174, 22, 2).stroke({ width: 1, color: 0x4a3d24 });

    // 하단 전체 배경
    g.rect(0, 495, WORLD_W, WORLD_H - 495).fill(0x0a0e13);

    // 전장-하단 분리 프레임 (Y: 493~499)
    g.rect(0, 493, WORLD_W, 6).fill(0x181c24);
    g.moveTo(0, 493).lineTo(WORLD_W, 493).stroke({ width: 1.5, color: 0xc8a96e });
    g.moveTo(0, 499).lineTo(WORLD_W, 499).stroke({ width: 1.5, color: 0x6e5c38 });
    // 중앙 브라켓 장식
    g.roundRect(WORLD_W / 2 - 45, 490, 90, 12, 2).fill(0x10151c).stroke({ width: 1.5, color: 0xc8a96e });

    // 하단 카드 베이스 영역 (좌/우)
    for (const x of [24, 798]) {
      g.roundRect(x, 499, 458, 390, 4).fill(0x0e1217).stroke({ width: 2, color: 0x6e5c38 });
      g.roundRect(x + 4, 503, 450, 382, 2).stroke({ width: 1, color: 0x2e271a });
      // 모서리 L자 금속 브라켓
      const w = 458, h = 390, b = 14;
      g.moveTo(x + b, 499).lineTo(x, 499).lineTo(x, 499 + b).stroke({ width: 2, color: 0xc8a96e });
      g.moveTo(x + w - b, 499).lineTo(x + w, 499).lineTo(x + w, 499 + b).stroke({ width: 2, color: 0xc8a96e });
      g.moveTo(x + b, 499 + h).lineTo(x, 499 + h).lineTo(x, 499 + h - b).stroke({ width: 2, color: 0xc8a96e });
      g.moveTo(x + w - b, 499 + h).lineTo(x + w, 499 + h).lineTo(x + w, 499 + h - b).stroke({ width: 2, color: 0xc8a96e });
    }

    // 군단 수와 무관하게 각 진영의 여섯 자리를 유지한다.
    for (const side of ['attacker', 'defender'] as const) {
      for (const row of ['front', 'back'] as const) {
        for (let slot = 0; slot < 3; slot++) {
          const box = cardLayout(side, row, slot);
          const number = slot + (row === 'front' ? 1 : 4);
          g.roundRect(box.x, box.y, box.width, box.height, 4).fill(0x10151c).stroke({ width: 1, color: 0x3c3940 });
          const label = new Text({ text: `${number} · ${row === 'front' ? '전열' : '후열'}\n빈 슬롯`, style: { fontFamily: FONT, fontSize: 14, fill: 0x657184, align: 'center', lineHeight: 24 } });
          label.label = `slot-${side}-${number}`;
          label.anchor.set(0.5);
          label.position.set(box.x + box.width / 2, box.y + box.height / 2);
          layer.addChild(label);
        }
      }
    }
    const versus = new Text({ text: '군단 지휘\n\n아래에서 행동 선택', style: { fontFamily: FONT, fontSize: 18, fill: 0xbfa879, align: 'center', fontWeight: 'bold' } });
    versus.anchor.set(0.5);
    versus.position.set(WORLD_W / 2, 670);
    layer.addChildAt(g, 1);
    layer.addChild(versus);
    return layer;
  }

  private updateRound(round: number): void {
    this.roundText.text = round === 0 ? '전투 준비' : `${round} 라운드`;
  }

  /** 사기 바: 공격측(파랑)이 왼쪽, 방어측(빨강)이 오른쪽. 합이 항상 100인 제로섬 막대 */
  private drawMorale(defenderMorale: number): void {
    const { x, y, w, h } = MORALE_BAR;
    const attacker = 100 - defenderMorale;
    const g = this.moraleBar;
    g.clear();
    // 트랙 배경
    g.roundRect(x, y, w, h, 3).fill(0x12171e).stroke({ width: 1.5, color: 0x7a6948 });
    const split = (w * attacker) / 100;
    if (split > 0) g.roundRect(x, y, Math.max(split, 3), h, 3).fill(0x2563eb);
    if (split < w) g.roundRect(x + split, y, Math.max(w - split, 3), h, 3).fill(0xdc2626);
    // 중앙 분할선
    g.rect(x + split - 1, y - 2, 2, h + 4).fill(0xffffff);

    // 중앙 "사기" 배지
    g.roundRect(640 - 18, y - 1, 36, h + 2, 3).fill(0x0a0e14).stroke({ width: 1, color: 0xc8a96e });

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

  private async slash(at: { x: number; y: number }, counter: boolean): Promise<void> {
    const effect = new Graphics().moveTo(-24, 30).lineTo(27, -34).stroke({ width: 7, color: counter ? 0xffbb77 : 0xfff0b5 });
    effect.moveTo(-19, 32).lineTo(32, -32).stroke({ width: 2, color: 0xffffff });
    effect.position.set(at.x, at.y); this.effectsLayer.addChild(effect);
    await tween(this.clock, 200, t => { if (!effect.destroyed) { effect.alpha = 1 - t; effect.scale.set(.7 + t * .6); } });
    if (!effect.destroyed) effect.destroy();
  }

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
