import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { ArmySprite } from './ArmySprite';
import { unitArt } from './battleArt';
import type { BattleTextures } from './battleArt';
import type { BuffStat, Row } from '@samgukji/battle-engine';
import type { ViewUnit } from '../battle/viewState';
import { FAMILY_LABEL, STAT_SHORT } from '../lib/labels';
import { CARD_H, CARD_W, FAMILY_COLOR, FAMILY_GLYPH, FONT, cardLayout } from './theme';
import { easeOut, tween } from './tween';
import type { Clock } from './tween';

const DEAD_ALPHA = 0.32;

/** 군단 카드 하나. 이름, 병종, 병력 바, AP 칸을 그리고 연출(돌진, 흔들림, 사라짐)을 담당한다. */
export class UnitSprite {
  readonly root = new Container();
  readonly army: ArmySprite;
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
  private readonly apText = new Text({ text: '', style: { fontFamily: FONT, fontSize: 10, fill: 0xe9d6a4 } });
  private readonly ring = new Graphics();
  private readonly flashOverlay = new Graphics();
  private readonly guardBadge = new Graphics();
  private readonly troopsText: Text;
  private readonly subtitle: Text;
  private readonly deadText: Text;
  private readonly guardText: Text;
  private guardRate = 0;
  private readonly buffText: Text;
  private buffs: Record<BuffStat, number> = { attack: 0, defense: 0, intellect: 0, speed: 0 };
  private barrier = 0;
  private dead = false;

  constructor(
    unit: ViewUnit,
    private readonly clock: Clock,
    textures: BattleTextures = {},
    lanes = 3,
    private readonly wideSlot?: number,
  ) {
    this.army = new ArmySprite(unit, textures, clock, lanes);
    this.uid = unit.uid;
    this.side = unit.side;
    this.maxTroops = unit.maxTroops;
    this.maxAp = unit.maxAp;
    this.troops = unit.troops;
    this.ap = unit.ap;

    const bg = new Graphics().rect(0, 0, this.cardWidth, CARD_H).fill(0x10191b).stroke({ width: 2, color: 0x9b8150 });
    bg.rect(4, 4, this.cardWidth - 8, CARD_H - 8).stroke({ width: 1, color: 0x4e4938 });
    const faceSize = this.wideSlot === undefined ? 60 : 100;
    const portrait = new Graphics().rect(6, 6, faceSize, faceSize).fill(0x203030).stroke({ width: 1, color: 0xb69a60 });
    portrait.rect(6, 6, 3, faceSize).fill(FAMILY_COLOR[unit.family]);
    const glyph = new Text({ text: FAMILY_GLYPH[unit.family], style: { fontFamily: FONT, fontSize: 30, fill: 0xffffff, fontWeight: 'bold' } });
    glyph.anchor.set(0.5);
    glyph.position.set(6 + faceSize / 2, 6 + faceSize / 2);

    const name = new Text({ text: unit.name, style: { fontFamily: FONT, fontSize: 18, fill: 0xffffff, fontWeight: 'bold' } });
    name.position.set(76, 8);
    const subtitle = this.subtitle = new Text({
      text: `${FAMILY_LABEL[unit.family]} · ${unit.row === 'front' ? '전열' : '후열'}`,
      style: { fontFamily: FONT, fontSize: 12, fill: 0x9aa4b8 },
    });
    subtitle.position.set(76, 30);
    this.troopsText = new Text({ text: '', style: { fontFamily: FONT, fontSize: 13, fill: 0xe4e8f0 } });
    this.troopsText.position.set(this.cardWidth - 10, 49);
    this.troopsText.anchor.set(1, 0);
    this.troopsText.style.fontSize = 11;

    // 전멸하면 병력 글자와 바를 숨기고 그 자리에 "전멸"을 보여 준다 (이름과 겹치지 않게)
    this.deadText = new Text({ text: '전멸', style: { fontFamily: FONT, fontSize: 24, fill: 0xff6b6b, fontWeight: 'bold' } });
    this.deadText.anchor.set(0, 0.5);
    this.deadText.position.set(76, 66);
    this.deadText.visible = false;

    this.flashOverlay.roundRect(0, 0, this.cardWidth, CARD_H, 10).fill(0xff3b3b);
    this.flashOverlay.alpha = 0;

    // AP와 분리한 맨 아래 상태 줄. 가드 확률이 0이면 숨긴다.
    this.guardText = new Text({ text: '', style: { fontFamily: FONT, fontSize: 12, fill: 0xbfd6ff, fontWeight: 'bold' } });
    this.guardText.anchor.set(0, 0.5);
    this.guardText.position.set(this.infoLeft + 4, 102);
    this.guardText.style.fontSize = 10;

    // 가드 배지 뒤에 버프/결계를 놓고 카드 너비 안으로 맞춘다.
    this.buffText = new Text({ text: '', style: { fontFamily: FONT, fontSize: 11, fill: 0xffd166, fontWeight: 'bold' } });
    this.buffText.anchor.set(0, 0);
    this.buffText.position.set(this.infoLeft, 96);
    this.buffs = { ...unit.buffs };
    this.barrier = unit.barrier;

    this.root.addChild(
      bg, portrait, glyph, name, subtitle, this.troopsText, this.hpBar, this.pips, this.apText,
      this.guardBadge, this.guardText, this.buffText, this.flashOverlay, this.ring, this.deadText,
    );
    if (this.wideSlot !== undefined) {
      name.position.set(120, 10); name.style.fontSize = 24;
      subtitle.position.set(120, 40);
      this.troopsText.y = 40; this.troopsText.style.fontSize = 13;
      this.deadText.position.set(120, 66);
    }
    name.scale.x = Math.min(1, (this.cardWidth - name.x - 12) / Math.max(1, name.width));
    const art = unitArt(unit);
    if (art?.portrait && textures[art.portrait]) {
      const frame = new Container();
      const mask = new Graphics().rect(7, 7, faceSize - 2, faceSize - 2).fill(0xffffff);
      const face = new Sprite(textures[art.portrait]!);
      const crop = art.portrait === 'liuPortrait' ? { x: 287, y: 0, size: 512 } : { x: 310, y: 30, size: 710 };
      face.scale.set(faceSize / crop.size);
      face.position.set(6 - crop.x * face.scale.x, 6 - crop.y * face.scale.y);
      frame.addChild(face, mask); frame.mask = mask;
      this.root.addChildAt(frame, this.root.getChildIndex(this.flashOverlay));
      glyph.visible = false;
    }
    this.root.pivot.set(this.cardWidth / 2, CARD_H / 2);
    const { x, y } = this.cardPosition(unit.row, unit.slot);
    this.root.position.set(x + this.cardWidth / 2, y + CARD_H / 2);

    this.drawHp(this.troops);
    this.drawPips();
    this.setGuard(unit.guardRate);
    this.drawBuffs();
    this.setDead(unit.dead);
  }

  private get cardWidth() { return this.wideSlot === undefined ? CARD_W : 430; }
  private get infoLeft() { return this.wideSlot === undefined ? 10 : 120; }

  private cardPosition(row: Row, slot: number) {
    return cardLayout(this.side, row, slot, this.wideSlot);
  }

  /** 카드 중심의 월드 좌표 */
  get center(): { x: number; y: number } {
    return this.army.center;
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
    this.army.setStatus(rate, this.barrier);
    this.guardBadge.clear();
    if (rate > 0) {
      this.guardText.text = `가드 ${Math.round(rate)}%`;
      const w = this.guardText.width + 14;
      this.guardBadge.rect(this.infoLeft, 94, w, 16).fill(0x26302b).stroke({ width: 1, color: 0xb39a65 });
    }
    this.drawBuffs();
    this.updateGuardVisibility();
  }

  /** 버프로 올라간 스탯 표시를 갱신한다 */
  setBuffs(stat: BuffStat, amount: number): void {
    this.buffs[stat] += amount;
    if (!this.gone) this.drawBuffs();
  }

  /** 남은 피해 무시(결계) 횟수 표시를 갱신한다 */
  setBarrier(charges: number): void {
    this.barrier = charges;
    if (!this.gone) this.army.setStatus(this.guardRate, charges);
    if (!this.gone) this.drawBuffs();
  }

  private drawBuffs(): void {
    const parts: string[] = [];
    if (this.barrier > 0) parts.push(`결계${this.barrier}`);
    for (const key of ['attack', 'defense', 'intellect', 'speed'] as const) {
      if (this.buffs[key] > 0) parts.push(`${STAT_SHORT[key]}+${this.buffs[key]}`);
    }
    this.buffText.text = parts.join(' ');
    this.buffText.x = this.infoLeft + (this.guardRate > 0 ? this.guardText.width + 20 : 0);
    this.buffText.scale.x = 1;
    this.buffText.scale.x = Math.min(1, (this.cardWidth - 10 - this.buffText.x) / Math.max(1, this.buffText.width));
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
    this.army.setDead(dead);
    this.root.alpha = dead ? DEAD_ALPHA : 1;
    this.showDeadLabel(dead);
  }

  async fadeOut(): Promise<void> {
    this.army.setDead(true);
    this.showDeadLabel(true);
    await tween(this.clock, 350, (t) => {
      if (!this.gone) this.root.alpha = 1 - (1 - DEAD_ALPHA) * easeOut(t);
    });
  }

  /** 되살아난다: 전멸 표시를 지우고 서서히 되돌린다 */
  async fadeIn(): Promise<void> {
    this.army.setDead(false);
    this.showDeadLabel(false);
    await tween(this.clock, 400, (t) => {
      if (!this.gone) this.root.alpha = DEAD_ALPHA + (1 - DEAD_ALPHA) * easeOut(t);
    });
  }

  async moveToSlot(row: Row, slot: number): Promise<void> {
    this.subtitle.text = this.subtitle.text.replace(/전열|후열/, row === 'front' ? '전열' : '후열');
    const armyMove = this.army.moveToSlot(row, slot);
    const { x, y } = this.cardPosition(row, slot);
    const fromX = this.root.x;
    const fromY = this.root.y;
    const toX = x + this.cardWidth / 2;
    const toY = y + CARD_H / 2;
    await tween(this.clock, 450, (t) => {
      if (this.gone) return;
      const e = easeOut(t);
      this.root.position.set(fromX + (toX - fromX) * e, fromY + (toY - fromY) * e);
    });
    await armyMove;
  }

  // ---------- 상호작용 표시 ----------

  /** 클릭할 수 있는 대상으로 표시한다. null이면 해제 */
  setTargetable(onPick: (() => void) | null): void {
    this.army.setTargetable(onPick);
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
    this.army.setActing(on);
    this.acting = on;
    this.drawRing();
  }

  // ---------- 연출 ----------

  async flash(): Promise<void> {
    const armyFlash = this.army.flash();
    await tween(this.clock, 300, (t) => {
      if (!this.gone) this.flashOverlay.alpha = 0.55 * (1 - t);
    });
    await armyFlash;
  }

  async pulse(): Promise<void> {
    await this.army.pulse();
  }

  /** 상대 쪽으로 짧게 찌르고 돌아온다. 찌르는 순간(가장 앞으로 나온 때)에 onImpact를 부른다. */
  async lunge(toward: { x: number; y: number }, distance = 26, onImpact?: () => void): Promise<void> {
    await this.army.lunge(toward, distance, onImpact);
  }

  destroy(): void {
    this.gone = true;
    this.setTargetable(null);
    this.army.destroy();
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
    const left = this.infoLeft;
    const width = this.cardWidth - left - 10;
    const y = this.wideSlot === undefined ? 69 : 62;
    g.roundRect(left, y, width, 9, 3).fill(0x080e10).stroke({ width: 1, color: 0x8d998f });
    const ratio = Math.max(0, Math.min(1, value / this.maxTroops));
    if (ratio > 0) g.roundRect(left + 2, y + 2, (width - 4) * ratio, 5, 2).fill(ratio > 0.5 ? 0x70cd74 : ratio > 0.25 ? 0xe0b341 : 0xe05a5a);
    this.troopsText.text = `${Math.round(value)} / ${this.maxTroops}`;
  }

  private drawPips(): void {
    const g = this.pips;
    g.clear();
    this.apText.text = `AP ${this.ap}/${this.maxAp}`;
    this.apText.position.set(this.infoLeft, 81);
    const start = this.infoLeft + this.apText.width + 8;
    const step = Math.min(17, (this.cardWidth - 10 - start) / Math.max(1, this.maxAp));
    // Large edited AP totals retain an exact number instead of unreadable tiny squares.
    if (step < 5) return;
    for (let i = 0; i < this.maxAp; i++) {
      const x = start + i * step;
      g.rect(x, 81, step - 3, 10).fill(i < this.ap ? 0xe6c45a : 0x252c2f)
        .stroke({ width: 1, color: i < this.ap ? 0xffde89 : 0x596269 });
    }
  }

  private drawRing(): void {
    this.ring.clear();
    if (this.targetable || this.acting) {
      const color = this.targetable ? 0xffe4a0 : 0xe6b64e;
      this.ring.rect(-2, -2, this.cardWidth + 4, CARD_H + 4).stroke({ width: this.acting ? 3 : 2, color });
      for (const x of [0, this.cardWidth]) {
        const dir = x === 0 ? 1 : -1;
        this.ring.moveTo(x, 12).lineTo(x, 0).lineTo(x + dir * 14, 0)
          .moveTo(x, CARD_H - 12).lineTo(x, CARD_H).lineTo(x + dir * 14, CARD_H)
          .stroke({ width: 3, color });
      }
    }
  }
}
