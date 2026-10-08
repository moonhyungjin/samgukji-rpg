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

function getCharacterSeal(characterId: string | undefined, name: string): string {
  const id = characterId ?? '';
  if (id.includes('liuBei') || name.includes('유비')) return '劉';
  if (id.includes('guanYu') || name.includes('관우')) return '關';
  if (id.includes('zhangFei') || name.includes('장비')) return '張';
  if (id.includes('caoCao') || name.includes('조조')) return '曺';
  if (id.includes('dianWei') || name.includes('전위')) return '典';
  if (id.includes('xuChu') || name.includes('허저')) return '許';
  if (id.includes('xiahou') || name.includes('하후')) return '夏';
  if (id.includes('weiYan') || name.includes('위연')) return '魏';
  if (id.includes('yt') || id.includes('yellow') || name.includes('황건')) return '黃';
  return name.charAt(0) || '將';
}

/** 군단 카드 하나. 이름, 병종, 병력 바, AP 칸을 그리고 연출(돌진, 흔들림, 사라짐)을 담당한다. */
export class UnitSprite {
  readonly root = new Container();
  readonly army: ArmySprite;
  readonly uid: string;
  readonly side: ViewUnit['side'];
  slot: number;
  row: Row;
  get isDead() { return this.dead; }

  private readonly maxTroops: number;
  private readonly maxAp: number;
  private troops: number;
  private ap: number;
  private gone = false;
  private pickHandler: (() => void) | null = null;
  private targetable = false;
  private acting = false;

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
  private debuffs: NonNullable<ViewUnit['debuffs']> = [];
  private dead = false;

  constructor(
    unit: ViewUnit,
    private readonly clock: Clock,
    textures: BattleTextures = {},
  ) {
    this.army = new ArmySprite(unit, textures, clock);
    this.slot = unit.slot;
    this.row = unit.row;
    this.uid = unit.uid;
    this.side = unit.side;
    this.maxTroops = unit.maxTroops;
    this.maxAp = unit.maxAp;
    this.troops = unit.troops;
    this.ap = unit.ap;

    // 어두운 흑철/먹색 카드 배경 및 엔틱 골드 이중 테두리
    const bg = new Graphics().roundRect(0, 0, this.cardWidth, CARD_H, 4).fill(0x10151c).stroke({ width: 2, color: 0x6e5c38 });
    bg.roundRect(3, 3, this.cardWidth - 6, CARD_H - 6, 2).stroke({ width: 1, color: 0x2e271a });
    const cw = this.cardWidth, ch = CARD_H, cb = 8;
    bg.moveTo(cb, 0).lineTo(0, 0).lineTo(0, cb).stroke({ width: 1.5, color: 0xc8a96e });
    bg.moveTo(cw - cb, 0).lineTo(cw, 0).lineTo(cw, cb).stroke({ width: 1.5, color: 0xc8a96e });
    bg.moveTo(cb, ch).lineTo(0, ch).lineTo(0, ch - cb).stroke({ width: 1.5, color: 0xc8a96e });
    bg.moveTo(cw - cb, ch).lineTo(cw, ch).lineTo(cw, ch - cb).stroke({ width: 1.5, color: 0xc8a96e });

    const faceSize = 60;
    const portrait = new Graphics().roundRect(6, 6, faceSize, faceSize, 3).fill(0x182026).stroke({ width: 1.5, color: 0x8a7243 });
    portrait.rect(6, 6, 3, faceSize).fill(FAMILY_COLOR[unit.family]);
    const glyph = new Text({ text: FAMILY_GLYPH[unit.family], style: { fontFamily: FONT, fontSize: 30, fill: 0xffffff, fontWeight: 'bold' } });
    glyph.anchor.set(0.5);
    glyph.position.set(6 + faceSize / 2, 6 + faceSize / 2);

    const nameX = 74;
    const nameY = 7;
    const name = new Text({ text: unit.name, style: { fontFamily: FONT, fontSize: 18, fill: 0xffffff, fontWeight: 'bold' } });
    name.position.set(nameX, nameY);

    // 성씨/진영 한자 인장 배지
    const sealText = getCharacterSeal(unit.characterId, unit.name);
    const sealBadge = new Graphics();
    const sealX = nameX;
    const sealY = 30;
    const sealSize = 17;
    const sealColor = unit.side === 'attacker' ? 0x133826 : 0x4a1818;
    sealBadge.roundRect(sealX, sealY, sealSize, sealSize, 3).fill(sealColor).stroke({ width: 1, color: 0xc8a96e });
    const sealLabel = new Text({
      text: sealText,
      style: { fontFamily: FONT, fontSize: 10, fill: 0xf5eedb, fontWeight: 'bold' },
    });
    sealLabel.anchor.set(0.5);
    sealLabel.position.set(sealX + sealSize / 2, sealY + sealSize / 2);

    const subtitle = this.subtitle = new Text({
      text: `${FAMILY_LABEL[unit.family]} · ${unit.slot + (unit.row === 'front' ? 1 : 4)}번`,
      style: { fontFamily: FONT, fontSize: 11, fill: 0xa0aec0 },
    });
    subtitle.position.set(sealX + sealSize + 6, sealY + 1);

    this.troopsText = new Text({ text: '', style: { fontFamily: FONT, fontSize: 18, fill: 0xf1f5f9, fontWeight: 'bold' } });
    this.troopsText.position.set(this.cardWidth - 10, 57);
    this.troopsText.anchor.set(1, 0);

    // 전멸하면 병력 글자와 바를 숨기고 그 자리에 "전멸"을 보여 준다 (이름과 겹치지 않게)
    this.deadText = new Text({ text: '전멸', style: { fontFamily: FONT, fontSize: 24, fill: 0xff6b6b, fontWeight: 'bold' } });
    this.deadText.anchor.set(0, 0.5);
    this.deadText.position.set(nameX, 66);
    this.deadText.visible = false;

    this.flashOverlay.roundRect(0, 0, this.cardWidth, CARD_H, 10).fill(0xff3b3b);
    this.flashOverlay.alpha = 0;

    // AP와 분리한 맨 아래 상태 줄. 가드 확률이 0이면 숨긴다.
    this.guardText = new Text({ text: '', style: { fontFamily: FONT, fontSize: 10, fill: 0x93c5fd, fontWeight: 'bold' } });
    this.guardText.anchor.set(0, 0.5);
    this.guardText.position.set(this.infoLeft + 4, 102);

    // 가드 배지 뒤에 버프/결계를 놓고 카드 너비 안으로 맞춘다.
    this.buffText = new Text({ text: '', style: { fontFamily: FONT, fontSize: 11, fill: 0xffd166, fontWeight: 'bold' } });
    this.buffText.anchor.set(0, 0);
    this.buffText.position.set(this.infoLeft, 96);
    this.buffs = { ...unit.buffs };
    this.barrier = unit.barrier;
    this.debuffs = unit.debuffs?.map(d => ({ ...d })) ?? [];

    this.root.addChild(
      bg, portrait, glyph, sealBadge, sealLabel, name, subtitle, this.troopsText, this.pips, this.apText,
      this.guardBadge, this.guardText, this.buffText, this.flashOverlay, this.ring, this.deadText,
    );
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

  private get cardWidth() { return CARD_W; }
  private get infoLeft() { return 10; }

  private cardPosition(row: Row, slot: number) {
    return cardLayout(this.side, row, slot);
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
      this.guardBadge.roundRect(this.infoLeft, 94, w, 16, 3).fill(0x182422).stroke({ width: 1, color: 0xc8a96e });
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
    for (const d of this.debuffs) parts.push(`◆${d.name} ${d.roundsLeft}`);
    if (this.barrier > 0) parts.push(`결계${this.barrier}`);
    for (const key of ['attack', 'defense', 'intellect', 'speed'] as const) {
      if (this.buffs[key] > 0) parts.push(`${STAT_SHORT[key]}+${this.buffs[key]}`);
    }
    this.buffText.text = parts.join(' ');
    this.buffText.x = this.infoLeft + (this.guardRate > 0 ? this.guardText.width + 20 : 0);
    this.buffText.scale.x = 1;
    this.buffText.scale.x = Math.min(1, (this.cardWidth - 10 - this.buffText.x) / Math.max(1, this.buffText.width));
  }

  updateDebuff(id: string, name: string, rounds?: number): void {
    this.debuffs = this.debuffs.filter(d => d.id !== id);
    if (rounds !== undefined) this.debuffs.push({ id, name, roundsLeft: rounds });
    this.drawBuffs();
  }

  tickDebuff(id: string): void {
    this.debuffs = this.debuffs.map(d => d.id === id ? { ...d, roundsLeft: Math.max(0, d.roundsLeft - 1) } : d);
    this.drawBuffs();
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
    this.slot = slot;
    this.row = row;
    this.subtitle.text = this.subtitle.text.replace(/\d번/, `${slot + (row === 'front' ? 1 : 4)}번`);
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
    this.root.zIndex = dead ? 0 : 1;
    this.deadText.visible = dead;
    this.troopsText.visible = !dead;
    this.buffText.visible = !dead;
    this.updateGuardVisibility();
  }

  private updateGuardVisibility(): void {
    const show = !this.dead && this.guardRate > 0;
    this.guardBadge.visible = show;
    this.guardText.visible = show;
  }

  private drawHp(value: number): void {
    this.troopsText.text = `${Math.round(value)} / ${this.maxTroops}`;
  }

  private drawPips(): void {
    const g = this.pips;
    g.clear();
    this.apText.text = 'AP';
    this.apText.style.fontSize = 10;
    this.apText.style.fill = 0xd1d5db;
    this.apText.style.fontWeight = 'bold';
    const py = 81;
    this.apText.position.set(this.infoLeft, py + 1);
    const start = this.infoLeft + this.apText.width + 8;
    const step = Math.min(18, (this.cardWidth - 10 - start) / Math.max(1, this.maxAp));
    // Large edited AP totals retain an exact number instead of unreadable tiny squares.
    if (step < 5) return;
    for (let i = 0; i < this.maxAp; i++) {
      const x = start + i * step;
      const filled = i < this.ap;
      g.roundRect(x, py, step - 3, 11, 2)
        .fill(filled ? 0xf5c842 : 0x1e2530)
        .stroke({ width: 1, color: filled ? 0xffea85 : 0x3b4554 });
    }
  }

  private drawRing(): void {
    this.ring.clear();
    if (this.targetable || this.acting) {
      const color = this.targetable ? 0xffa94d : 0xf5c842;
      this.ring.roundRect(-2, -2, this.cardWidth + 4, CARD_H + 4, 4).stroke({ width: this.acting ? 2.5 : 2, color });
      if (this.acting) {
        this.ring.roundRect(1, 1, this.cardWidth - 2, CARD_H - 2, 2).stroke({ width: 1, color: 0xfff0b5, alpha: 0.75 });
      }
      for (const x of [0, this.cardWidth]) {
        const dir = x === 0 ? 1 : -1;
        this.ring.moveTo(x, 14).lineTo(x, 0).lineTo(x + dir * 16, 0)
          .moveTo(x, CARD_H - 14).lineTo(x, CARD_H).lineTo(x + dir * 16, CARD_H)
          .stroke({ width: 3, color });
      }
    }
  }
}
