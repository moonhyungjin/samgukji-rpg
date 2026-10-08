import { Container, Graphics, Rectangle, Sprite, Text } from 'pixi.js';
import type { Row } from '@samgukji/battle-engine';
import type { ViewUnit } from '../battle/viewState';
import { unitArt } from './battleArt';
import type { BattleTextures, SpriteSpec } from './battleArt';
import { FAMILY_GLYPH, FONT, SIDE_COLOR } from './theme';
import { easeOut, tween } from './tween';
import type { Clock } from './tween';

export function fieldPosition(side: ViewUnit['side'], row: Row, slot: number, lanes = 3) {
  const x = side === 'attacker' ? (row === 'front' ? 410 : 175) : (row === 'front' ? 870 : 1105);
  return { x, y: 190 + (3 - lanes) * 48 + Math.min(2, Math.max(0, slot)) * 96 };
}

/** One engine unit represented by a commander and decorative soldiers. No battle rules here. */
export class ArmySprite {
  readonly root = new Container();
  /** Non-interactive labels render above every army, not inside depth-sorted figures. */
  readonly annotation = new Container({ eventMode: 'none' });
  private readonly nameplate = new Graphics();
  private readonly guardLabel = new Text({ text: '', style: { fontFamily: FONT, fontSize: 11, fill: 0xa9d4ff } });
  private readonly shieldToken = new Graphics();
  private readonly figures = new Container();
  private readonly selection = new Graphics();
  private readonly shield = new Graphics();
  private readonly label: Text;
  private acting = false;
  private targetable = false;
  private dead = false;
  private guard = 0;
  private barrier = 0;
  private gone = false;
  private pick: (() => void) | null = null;

  constructor(private readonly unit: ViewUnit, textures: BattleTextures, private readonly clock: Clock, private readonly lanes = 3) {
    const at = fieldPosition(unit.side, unit.row, unit.slot, lanes);
    this.root.position.set(at.x, at.y);
    this.root.zIndex = at.y;
    this.root.hitArea = new Rectangle(-108, -100, 216, 120);
    this.root.addChild(new Graphics().ellipse(0, -2, 85, 13).fill({ color: 0x152018, alpha: .25 }), this.selection, this.figures, this.shield);
    const art = unitArt(unit);
    if (art && textures[art.commander.texture] && textures[art.soldier.texture]) {
      const direction = unit.side === 'attacker' ? 1 : -1;
      for (const [x, y] of [[-70, -24], [-42, -14], [-78, 0]]) {
        this.addFigure(art.soldier, textures, x * direction, y, lanes === 1 ? 96 : 68);
      }
      this.addFigure(art.commander, textures, 8 * direction, 0, lanes === 1 ? 116 : 86);
    } else {
      // Unproduced classes retain explicit tokens rather than showing the wrong weapon/commander.
      if (unit.family === 'shield') {
        this.figures.addChild(this.shieldToken);
        this.drawShieldToken();
      } else {
        this.figures.addChild(this.drawFamilyToken());
      }
      const glyph = new Text({ text: FAMILY_GLYPH[unit.family], style: { fontFamily: FONT, fontSize: 30, fill: SIDE_COLOR[unit.side] } });
      glyph.anchor.set(.5); glyph.position.set(0, -44); this.figures.addChild(glyph);
    }
    this.label = new Text({ text: unit.name, style: { fontFamily: FONT, fontSize: 13, fill: 0xfff1d5, stroke: { color: 0x152023, width: 4 } } });
    this.label.anchor.set(.5, 0); this.label.y = 4;
    this.guardLabel.anchor.set(.5, 0); this.guardLabel.y = 22;
    this.annotation.addChild(this.nameplate, this.label, this.guardLabel);
    this.positionAnnotation(unit.row);
    this.drawNameplate();
  }

  private positionAnnotation(row: Row) {
    const direction = this.unit.side === 'attacker' ? 1 : -1;
    const x = this.root.x + direction * (row === 'front' ? 125 : -110);
    this.annotation.position.set(Math.max(95, Math.min(1185, x)), this.root.y - 40);
  }

  /** Equipment silhouettes for unproduced art; the class glyph remains visible. */
  private drawFamilyToken() {
    const g = new Graphics();
    const outline = { color: 0xb39a65, width: 2 };
    switch (this.unit.family) {
      case 'archer':
        g.moveTo(-24, -82).quadraticCurveTo(48, -44, -24, -6).stroke({ ...outline, width: 4 });
        g.moveTo(-24, -82).lineTo(-24, -6).stroke(outline);
        g.moveTo(-37, -18).lineTo(37, -75).lineTo(27, -73).moveTo(37, -75).lineTo(33, -65).stroke(outline);
        break;
      case 'strategist':
        g.rect(-28, -75, 56, 62).fill(0x172728).stroke(outline);
        g.roundRect(-34, -82, 68, 10, 4).fill(0x39423b).stroke(outline);
        g.roundRect(-34, -16, 68, 10, 4).fill(0x39423b).stroke(outline);
        break;
      case 'taoist':
        g.poly([-23, -82, 23, -82, 23, -5, 0, -15, -23, -5]).fill(0x172728).stroke(outline);
        g.moveTo(-12, -72).lineTo(12, -72).moveTo(-12, -24).lineTo(12, -24).stroke({ color: 0x71c9c5, width: 2 });
        break;
      case 'geomancer':
        g.circle(0, -44, 36).fill(0x172728).stroke(outline);
        g.poly([0, -86, 7, -73, -7, -73]).fill(0xb39a65);
        g.moveTo(-30, -44).lineTo(-24, -44).moveTo(24, -44).lineTo(30, -44)
          .moveTo(0, -74).lineTo(0, -68).moveTo(0, -20).lineTo(0, -14).stroke(outline);
        break;
      default:
        g.roundRect(-28, -76, 56, 65, 4).fill(0x172728).stroke(outline);
    }
    return g;
  }

  private drawShieldToken() {
    if (this.unit.family !== 'shield') return;
    const active = !this.dead && this.guard > 0;
    this.shieldToken.clear().poly([-30,-78, 0,-87, 30,-78, 27,-39, 0,-12, -27,-39])
      .fill(active ? 0x284b62 : 0x172728).stroke({ color: active ? 0xa9d4ff : 0xb39a65, width: active ? 3 : 2 });
    this.shieldToken.moveTo(-20,-70).lineTo(0,-76).lineTo(20,-70).stroke({ color: 0xb39a65, width: 1 });
  }

  private drawNameplate() {
    const status = this.dead ? '' : [
      this.guard > 0 ? `가드 ${Math.round(this.guard)}%` : this.unit.family === 'shield' ? '가드 해제' : '',
      this.barrier > 0 ? `결계 ${this.barrier}` : '',
    ].filter(Boolean).join(' · ');
    this.guardLabel.text = status;
    this.guardLabel.visible = !!status;
    const width = Math.max(76, Math.min(190, Math.max(this.label.width, this.guardLabel.width) + 16));
    // Limit unusually long edited names without changing the actual name in the card.
    this.label.scale.x = Math.min(1, 174 / Math.max(1, this.label.getLocalBounds().width));
    this.nameplate.clear().roundRect(-width / 2, 0, width, status ? 38 : 24, 3)
      .fill({ color: 0x102023, alpha: .94 }).stroke({ color: this.targetable ? 0xffd46c : this.acting ? 0xf5c842 : 0x86764e, width: 1 });
  }

  private addFigure(spec: SpriteSpec, textures: BattleTextures, x: number, y: number, height: number) {
    const sprite = new Sprite(textures[spec.texture]!);
    const scale = (spec.displayHeight ?? height) / (spec.ground[1] - spec.head);
    const direction = this.unit.side === 'attacker' ? 1 : -1;
    sprite.pivot.set(...spec.ground);
    sprite.scale.set(scale * direction * spec.facing, scale);
    sprite.position.set(x, y);
    this.figures.addChild(sprite);
  }
  get center() { return { x: this.root.x, y: this.root.y - 32 }; }
  setActing(value: boolean) { this.acting = value; this.drawSelection(); }
  setTargetable(pick: (() => void) | null) {
    if (this.pick) this.root.off('pointertap', this.pick);
    this.pick = pick; this.targetable = !!pick;
    this.root.eventMode = pick ? 'static' : 'none'; this.root.cursor = pick ? 'pointer' : 'default';
    if (pick) this.root.on('pointertap', pick);
    this.drawSelection();
  }
  private drawSelection() {
    this.selection.clear();
    if (!this.dead && (this.acting || this.targetable)) {
      if (this.acting) {
        this.selection.ellipse(0, 0, 94, 20).fill({ color: 0xf5c842, alpha: 0.2 });
        this.selection.ellipse(0, 0, 94, 20).stroke({ width: 3, color: 0xf5c842 });
        this.selection.ellipse(0, 0, 99, 23).stroke({ width: 1, color: 0xffe680, alpha: 0.65 });
      } else {
        this.selection.ellipse(0, 0, 90, 18).stroke({ width: 2.5, color: 0xffa94d });
      }
    }
    this.drawNameplate();
  }
  setStatus(guard: number, barrier: number) {
    this.guard = guard; this.barrier = barrier; this.shield.clear();
    this.drawShieldToken();
    this.drawNameplate();
    if (this.dead) return;
    if (barrier > 0) this.shield.ellipse(0, -43, 42, 51).stroke({ width: 2, color: 0x9be7ff, alpha: .65 });
    if (guard > 0) this.shield.poly([48, -45, 65, -39, 64, -18, 56, -10, 48, -18]).fill({ color: 0x83b9ec, alpha: .75 });
  }
  setDead(dead: boolean) {
    this.dead = dead; this.root.alpha = dead ? .18 : 1;
    this.annotation.alpha = dead ? .65 : 1;
    this.label.text = dead ? `${this.unit.name} · 격파` : this.unit.name;
    this.drawSelection(); this.setStatus(this.guard, this.barrier);
  }
  async flash() {
    const x = this.figures.x;
    await tween(this.clock, 260, t => {
      if (this.gone) return;
      this.figures.alpha = t < 1 ? .35 + .65 * Math.abs(Math.cos(t * Math.PI * 3)) : 1;
      this.figures.x = x + Math.sin(t * Math.PI * 4) * 5 * (1 - t);
    });
  }
  async pulse() {
    await tween(this.clock, 220, t => { if (!this.gone) this.figures.y = -3 * Math.sin(Math.PI * t); });
  }
  async lunge(toward: { x: number; y: number }, distance: number, impact?: () => void) {
    const x = this.root.x, direction = Math.sign(toward.x - x) || 1;
    await tween(this.clock, 110, t => { if (!this.gone) this.root.x = x + direction * distance * easeOut(t); });
    if (!this.gone) impact?.();
    await tween(this.clock, 110, t => { if (!this.gone) this.root.x = x + direction * distance * (1 - easeOut(t)); });
  }
  async moveToSlot(row: Row, slot: number) {
    const from = { x: this.root.x, y: this.root.y }, to = fieldPosition(this.unit.side, row, slot, this.lanes);
    await tween(this.clock, 450, t => { if (!this.gone) { const e = easeOut(t); this.root.position.set(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e); this.root.zIndex = this.root.y; this.positionAnnotation(row); } });
  }
  destroy() { this.gone = true; this.setTargetable(null); this.annotation.destroy({ children: true }); this.root.destroy({ children: true }); }
}
