import { useEffect, useRef, useState } from 'react';
import type { Command } from '@samgukji/battle-engine';
import type { ControllerSnapshot, WaitingInfo } from '../battle/controller';
import { cardLayout, WORLD_H, WORLD_W } from '../render/theme';

/** Legal targets come from the engine; the UI does not infer skill rules from sides. */
export function actionsForTarget(waiting: WaitingInfo, uid: string) {
  return waiting.commands.flatMap(command => {
    const target = command.targets.find(t => t.uid === uid);
    return target ? [{ command, target }] : [];
  });
}

export function CardActions({ snapshot, onSubmit }: {
  snapshot: ControllerSnapshot;
  onSubmit: (command: Command) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const returningFocus = useRef(false);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Element && !event.target.closest('.card-action-anchor')) setOpen(null);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);
  const waiting = snapshot.waiting;
  if (snapshot.phase !== 'awaiting' || !waiting) return null;
  const submit = (command: Command) => { setOpen(null); onSubmit(command); };
  const close = (anchor: HTMLElement) => {
    returningFocus.current = true;
    anchor.querySelector<HTMLButtonElement>('.card-action-trigger')?.focus({ preventScroll: true });
    returningFocus.current = false;
    setOpen(null);
  };
  return <div className="card-actions" aria-label="군단별 행동 선택">
    {snapshot.view.units.filter(unit => !unit.dead || actionsForTarget(waiting, unit.uid).length > 0).map(unit => {
      const box = cardLayout(unit.side, unit.row, unit.slot);
      const actions = actionsForTarget(waiting, unit.uid);
      const self = waiting.uid === unit.uid;
      const expanded = open === unit.uid;
      return <div key={unit.uid} className={`card-action-anchor ${unit.side}`} data-unit={unit.uid}
        style={{ left: `${box.x / WORLD_W * 100}%`, top: `${box.y / WORLD_H * 100}%`, width: `${box.width / WORLD_W * 100}%`, height: `${box.height / WORLD_H * 100}%`, zIndex: expanded ? 2 : 1 }}
        onPointerEnter={e => { if (e.pointerType === 'mouse') setOpen(unit.uid); }}
        onPointerLeave={e => { if (e.pointerType === 'mouse') setOpen(null); }}
        onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(null); }}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(e.currentTarget); }
          if (e.key === 'ArrowDown' && expanded) {
            e.preventDefault();
            const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('.card-action-option')];
            buttons[(buttons.indexOf(document.activeElement as HTMLButtonElement) + 1) % buttons.length]?.focus();
          }
        }}>
        <button type="button" className="card-action-trigger" aria-label={`${unit.name} 행동 보기`} aria-expanded={expanded}
          data-self={self} data-side={unit.side} data-actions={actions.length}
          onFocus={() => { if (!returningFocus.current) setOpen(unit.uid); }} onClick={() => setOpen(unit.uid)} />
        {expanded && <div className="card-action-menu" role="group" aria-label={`${unit.name}에게 할 행동`}>
          {actions.map(({ command }) => <button key={command.skillId} type="button" className="card-action-option"
            data-kind={command.kind} onClick={() => submit({ kind: 'skill', skillId: command.skillId, targetUid: unit.uid })}>
            <strong>{command.skillName}</strong>
          </button>)}
          {self && <button type="button" className="card-action-option" data-kind="wait" onClick={() => submit({ kind: 'wait' })}><strong>대기</strong></button>}
          {!self && actions.length === 0 && <span className="card-action-unavailable">행동 불가</span>}
        </div>}
      </div>;
    })}
  </div>;
}
