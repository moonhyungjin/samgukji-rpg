import { Container, Graphics } from 'pixi.js';
import { tween } from './tween';
import type { Clock } from './tween';

export type RangedEffect = 'arrow' | 'sigil' | 'smoke';
type Point = { x: number; y: number };

/** Visual mapping only. Unknown attacks retain the existing melee presentation. */
export function rangedEffectFor(skillId: string): RangedEffect | null {
  switch (skillId) {
    case 'archer-shot':
    case 'geomancer-shot': return 'arrow';
    case 'stratagem': return 'sigil';
    case 'poison-smoke': return 'smoke';
    default: return null;
  }
}

/** One decorative projectile, independent of damage and hit decisions. */
export async function playRangedEffect(layer: Container, clock: Clock, kind: RangedEffect, from: Point, to: Point): Promise<void> {
  if (layer.destroyed || clock.scale() === Infinity) return;
  const effect = new Container({ label: `projectile-${kind}`, eventMode: 'none' });
  const body = new Graphics();
  const trail = new Graphics();
  effect.addChild(trail, body);
  layer.addChild(effect);
  const color = kind === 'sigil' ? 0xd9c48d : kind === 'smoke' ? 0xa6bba0 : 0xf0d9a0;

  if (kind === 'arrow') {
    // Dark outline keeps the small shaft legible against pale ground.
    body.moveTo(-34, 0).lineTo(8, 0).stroke({ color: 0x27342e, width: 5 });
    body.moveTo(-34, 0).lineTo(8, 0).stroke({ color, width: 2 });
    body.poly([12, 0, 1, -5, 3, 0, 1, 5]).fill(0xe6e9dd).stroke({ color: 0x27342e, width: 1 });
    body.moveTo(-28, 0).lineTo(-35, -5).moveTo(-28, 0).lineTo(-35, 5).stroke({ color: 0xd7c29a, width: 2 });
  } else if (kind === 'sigil') {
    body.circle(0, 0, 13).fill({ color: 0x28392e, alpha: 0.7 }).stroke({ color, width: 2 });
    body.poly([0, -9, 8, 0, 0, 9, -8, 0]).stroke({ color: 0xffe8b0, width: 1.5 });
    body.circle(0, 0, 3).fill(color);
  } else {
    for (let i = 0; i < 5; i++) {
      body.circle(-i * 8, Math.sin(i * 2) * 6, 10 + i * 2).fill({ color, alpha: 0.24 - i * 0.035 });
    }
  }

  const dx = to.x - from.x, dy = to.y - from.y;
  const arc = kind === 'arrow' ? Math.min(54, Math.abs(dx) * 0.08) : 16;
  effect.position.set(from.x, from.y);
  try {
    await tween(clock, 380, t => {
      if (effect.destroyed) return;
      effect.position.set(from.x + dx * t, from.y + dy * t - 4 * arc * t * (1 - t));
      effect.rotation = Math.atan2(dy - 4 * arc * (1 - 2 * t), dx);
      effect.alpha = Math.min(1, t * 8);
      trail.clear().moveTo(-40, 0).lineTo(-8, 0).stroke({ color, alpha: 0.35, width: kind === 'arrow' ? 2 : 4 });
      if (kind === 'sigil') body.rotation = t * Math.PI;
      if (kind === 'smoke') body.scale.set(0.8 + t * 0.45);
    });
  } finally {
    if (!effect.destroyed) effect.destroy({ children: true });
  }
}

/** Brief contact mark; no lingering status effect is implied. */
export async function rangedImpact(layer: Container, clock: Clock, kind: RangedEffect, at: Point, blocked: boolean): Promise<void> {
  if (layer.destroyed || clock.scale() === Infinity) return;
  const color = blocked ? 0x9be7ff : kind === 'smoke' ? 0xa6bba0 : 0xe5cb8b;
  const mark = new Graphics({ label: `impact-${kind}`, eventMode: 'none' });
  mark.position.set(at.x, at.y);
  if (kind === 'arrow' && !blocked) {
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5;
      mark.moveTo(Math.cos(angle) * 6, Math.sin(angle) * 6)
        .lineTo(Math.cos(angle) * 18, Math.sin(angle) * 18).stroke({ color, width: 2 });
    }
  } else {
    mark.circle(0, 0, 24).stroke({ color, width: 2, alpha: 0.8 });
    if (kind === 'sigil' && !blocked) mark.poly([0, -18, 18, 0, 0, 18, -18, 0]).stroke({ color, width: 1.5 });
  }
  layer.addChild(mark);
  try {
    await tween(clock, 220, t => {
      if (mark.destroyed) return;
      mark.scale.set(0.6 + t * 0.8);
      mark.alpha = 1 - t;
    });
  } finally {
    if (!mark.destroyed) mark.destroy();
  }
}
