import type { ControllerSnapshot } from '../battle/controller';

/** 엔진에서 확정한 순서를 그대로 표시한다. */
export function TurnOrder({ snapshot }: { snapshot: ControllerSnapshot }) {
  const turns = snapshot.turnOrder ?? (snapshot.waiting ? [{ uid: snapshot.waiting.uid, current: true }] : []);
  return <div className="turn-order-layer"><div className="turn-order" aria-label="행동 순서">
    <span className="turn-order-label">행동 순서</span>
    {turns.map(({ uid, current }, index) => {
      const unit = snapshot.view.units.find(u => u.uid === uid);
      return unit && <span key={`${uid}:${index}`} className={`turn-badge ${unit.side}`} data-unit={uid}
        aria-current={current ? 'step' : undefined} title={`${current ? '현재' : '다음'} · ${unit.name}`}>
        <small>{current ? '현재' : '›'}</small>{unit.name}
      </span>;
    })}
    {snapshot.phase === 'finished' && <span className="turn-order-note">전투 종료</span>}
  </div></div>;
}
