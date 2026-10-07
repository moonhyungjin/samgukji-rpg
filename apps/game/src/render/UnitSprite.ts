import { Container, Graphics, Text } from 'pixi.js';
import type { Row } from '@samgukji/battle-engine';
import type { ViewUnit } from '../battle/viewState';
import { FAMILY_LABEL } from '../lib/labels';
import { CARD_H, CARD_W, FAMILY_COLOR, FAMILY_GLYPH, FONT, SIDE_COLOR, slotPosition } from './theme';
import { easeOut, tween } from './tween';
import type { Clock } from './tween';

const DEAD_ALPHA = 0.32;

/** 군단 카드 하나. 이름, 병종, 병력 바, AP 칸을 그리고 연출(돌진, 흔들림, 사라짐)을 담당한다. */
export class UnitSprite {
  readonly root = new Container();
  readonly uid: string;
  readonly side: ViewUnit['side'];

  private readonly maxTroops: number;
  private readonly maxAp: number;
  private troops: number;
  private ap: number;
  private gone = false;
  private pickHandler: (() => void) | null = null;
  private targetable = false;
  private acting = false;

  private readonly hpBar = new Graphics();
  private readonly pips = new Graphics();
  private readonly ring = new Graphics();
  private readonly flashOverlay = new Graphics();
  private readonly guardBadge = new Graphics();
  private readonly troopsText: Text;
  private readonly deadText: Text;
  private readonly guardText: Text;
  private guardRate = 0;
  private readonly buffText: Text;
  private buffs = { attack: 0, defense: 0 };
  private dead = false;

  constructor(
    unit: ViewUnit,
    private readonly clock: Clock,
  ) {
    this.uid = unit.uid;
    this.side = unit.side;
    this.maxTroops = unit.maxTroops;
    this.maxAp = unit.maxAp;
    this.troops = unit.troops;
    this.ap = unit.ap;

    const bg = new Graphics().roundRect(0, 0, CARD_W, CARD_H, 10).fill(0x1c2230).stroke({ width: 2, color: SIDE_COLOR[unit.side] });
    const portrait = new Graphics().roundRect(10, 10, 56, 56, 8).fill(FAMILY_COLOR[unit.family]);
    const glyph = new Text({ text: FAMILY_GLYPH[unit.family], style: { fontFamily: FONT, fontSize: 30, fill: 0xffffff, fontWeight: 'bold' } });
    glyph.anchor.set(0.5);
    glyph.position.set(38, 38);

    const name = new Text({ text: unit.name, style: { fontFamily: FONT, fontSize: 18, fill: 0xffffff, fontWeight: 'bold' } });
    name.position.set(76, 10);
    const subtitle = new Text({
      text: `${FAMILY_LABEL[unit.family]} · Lv${unit.level}`,
      style: { fontFamily: FONT, fontSize: 12, fill: 0x9aa4b8 },
    });
    subtitle.position.set(76, 34);
    this.troopsText = new Text({ text: '', style: { fontFamily: FONT, fontSize: 13, fill: 0xe4e8f0 } });
    this.troopsText.position.set(76, 52);

    // 전멸하면 병력 글자와 바를 숨기고 그 자리에 "전멸"을 보여 준다 (이름과 겹치지 않게)
    this.deadText = new Text({ text: '전멸', style: { fontFamily: FONT, fontSize: 24, fill: 0xff6b6b, fontWeight: 'bold' } });
    this.deadText.anchor.set(0, 0.5);
    this.deadText.position.set(76, 66);
    this.deadText.visible = false;

    this.flashOverlay.roundRect(0, 0, CARD_W, CARD_H, 10).fill(0xff3b3b);
    this.flashOverlay.alpha = 0;

    // 가드 확률 배지 (AP 칸 오른쪽). 확률이 0이면 숨긴다
    this.guardText = new Text({ text: '', style: { fontFamily: FONT, fontSize: 12, fill: 0xbfd6ff, fontWeight: 'bold' } });
    this.guardText.anchor.set(1, 0.5);
    this.guardText.position.set(CARD_W - 17, 100);

    // 버프 표시 (이름 줄 오른쪽). 올라간 스탯이 없으면 비어 있다
    this.buffText = new Text({ text: '', style: { fontFamily: FONT, fontSize: 12, fill: 0xffd166, fontWeight: 'bold' } });
    this.buffText.anchor.set(1, 0);
    this.buffText.position.set(CARD_W - 10, 13);
    this.buffs = { ...unit.buffs };

    this.root.addChild(
      bg, portrait, glyph, name, subtitle, this.troopsText, this.hpBar, this.pips,
      this.guardBadge, this.guardText, this.buffText, this.flashOverlay, this.ring, this.deadText,
    );
    this.root.pivot.set(CARD_W / 2, CARD_H / 2);
    const { x, y } = slotPosition(unit.side, unit.row, unit.slot);
    this.root.position.set(x + CARD_W / 2, y + CARD_H / 2);

    this.drawHp(this.troops);
    this.drawPips();
    this.setGuard(unit.guardRate);
    this.drawBuffs();
    this.setDead(unit.dead);
  }

  /** 카드 중심의 월드 좌표 */
  get center(): { x: number; y: number } {
    return { x: this.root.x, y: this.root.y };
  }

  // ---------- 상태 갱신 ----------

  setAp(ap: number): void {
    this.ap = ap;
    if (!this.gone) this.drawPips();
  }

  /** 가드 확률 배지를 갱신한다 (0이면 숨김) */
  setGuard(rate: number): void {
    this.guardRate = rate;
    if (this.gone) return;
    this.guardBadge.clear();
    if (rate > 0) {
      this.guardText.text = `가드 ${Math.round(rate)}%`;
      const w = this.guardText.width + 14;
      this.guardBadge.roundRect(CARD_W - 10 - w, 91, w, 18, 6).fill(0x23406e).stroke({ width: 1, color: 0x5b8cff });
    }
    this.updateGuardVisibility();
  }

  /** 버프로 올라간 스탯 표시를 갱신한다 */
  setBuffs(stat: 'attack' | 'defense', amount: number): void {
    this.buffs[stat] += amount;
    if (!this.gone) this.drawBuffs();
  }

  private drawBuffs(): void {
    const parts: string[] = [];
    if (this.buffs.attack > 0) parts.push(`공+${this.buffs.attack}`);
    if (this.buffs.defense > 0) parts.push(`방+${this.buffs.defense}`);
    this.buffText.text = parts.join(' ');
  }

  /** 병력 바와 숫자를 부드럽게 바꾼다 */
  async animateTroops(to: number): Promise<void> {
    const from = this.troops;
    this.troops = to;
    await tween(this.clock, 280, (t) => {
      if (!this.gone) this.drawHp(from + (to - from) * easeOut(t));
    });
  }

  setDead(dead: boolean): void {
    this.root.alpha = dead ? DEAD_ALPHA : 1;
    this.showDeadLabel(dead);
  }

  async fadeOut(): Promise<void> {
    this.showDeadLabel(true);
    await tween(this.clock, 350, (t) => {
      if (!this.gone) this.root.alpha = 1 - (1 - DEAD_ALPHA) * easeOut(t);
    });
  }

  async moveToSlot(row: Row, slot: number): Promise<void> {
    const { x, y } = slotPosition(this.side, row, slot);
    const fromX = this.root.x;
    const fromY = this.root.y;
    const toX = x + CARD_W / 2;
    const toY = y + CARD_H / 2;
    await tween(this.clock, 450, (t) => {
      if (this.gone) return;
      const e = easeOut(t);
      this.root.position.set(fromX + (toX - fromX) * e, fromY + (toY - fromY) * e);
    });
  }

  // ---------- 상호작용 표시 ----------

  /** 클릭할 수 있는 대상으로 표시한다. null이면 해제 */
  setTargetable(onPick: (() => void) | null): void {
    if (this.pickHandler) this.root.off('pointertap', this.pickHandler);
    this.pickHandler = onPick;
    this.targetable = onPick !== null;
    if (onPick) {
      this.root.eventMode = 'static';
      this.root.cursor = 'pointer';
      this.root.on('pointertap', onPick);
    } else {
      this.root.eventMode = 'none';
      this.root.cursor = 'default';
    }
    this.drawRing();
  }

  setActing(on: boolean): void {
    this.acting = on;
    this.drawRing();
  }

  // ---------- 연출 ----------

  async flash(): Promise<void> {
    await tween(this.clock, 300, (t) => {
      if (!this.gone) this.flashOverlay.alpha = 0.55 * (1 - t);
    });
  }

  async pulse(): Promise<void> {
    await tween(this.clock, 220, (t) => {
      if (!this.gone) this.root.scale.set(1 + 0.08 * Math.sin(Math.PI * t));
    });
  }

  /** 상대 쪽으로 짧게 찌르고 돌아온다. 찌르는 순간(가장 앞으로 나온 때)에 onImpact를 부른다. */
  async lunge(toward: { x: number; y: number }, distance = 26, onImpact?: () => void): Promise<void> {
    const bx = this.root.x;
    const by = this.root.y;
    const dx = toward.x - bx;
    const dy = toward.y - by;
    const len = Math.hypot(dx, dy) || 1;
    const ux = (dx / len) * distance;
    const uy = (dy / len) * distance;
    await tween(this.clock, 110, (t) => {
      if (!this.gone) this.root.position.set(bx + ux * easeOut(t), by + uy * easeOut(t));
    });
    onImpact?.();
    await tween(this.clock, 110, (t) => {
      if (!this.gone) this.root.position.set(bx + ux * (1 - easeOut(t)), by + uy * (1 - easeOut(t)));
    });
  }

  destroy(): void {
    this.gone = true;
    this.setTargetable(null);
    this.root.destroy({ children: true });
  }

  // ---------- 그리기 ----------

  private showDeadLabel(dead: boolean): void {
    this.dead = dead;
    this.deadText.visible = dead;
    this.troopsText.visible = !dead;
    this.hpBar.visible = !dead;
    this.buffText.visible = !dead;
    this.updateGuardVisibility();
  }

  private updateGuardVisibility(): void {
    const show = !this.dead && this.guardRate > 0;
    this.guardBadge.visible = show;
    this.guardText.visible = show;
  }

  private drawHp(value: number): void {
    const g = this.hpBar;
    g.clear();
    g.roundRect(10, 76, 180, 10, 4).fill(0x333b4d);
    const ratio = Math.max(0, Math.min(1, value / this.maxTroops));
    if (ratio > 0) g.roundRect(10, 76, 180 * ratio, 10, 4).fill(ratio > 0.5 ? 0x4cc27a : ratio > 0.25 ? 0xe0b341 : 0xe05a5a);
    this.troopsText.text = `병력 ${Math.round(value)} / ${this.maxTroops}`;
  }

  private drawPips(): void {
    const g = this.pips;
    g.clear();
    for (let i = 0; i < this.maxAp; i++) {
      const x = 10 + i * 17;
      if (i < this.ap) g.roundRect(x, 94, 12, 12, 3).fill(0xe6c45a);
      else g.roundRect(x, 94, 12, 12, 3).stroke({ width: 1.5, color: 0x59627a });
    }
  }

  private drawRing(): void {
    this.ring.clear();
    if (this.targetable) this.ring.roundRect(-4, -4, CARD_W + 8, CARD_H + 8, 13).stroke({ width: 4, color: 0xffd84a });
    else if (this.acting) this.ring.roundRect(-4, -4, CARD_W + 8, CARD_H + 8, 13).stroke({ width: 3, color: 0x6fe3ff });
  }
}
