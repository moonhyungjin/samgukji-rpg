import type { ControllerSnapshot } from '../battle/controller';

/** 엔진에서 확인된 순서만 표시한다. 수동 대기 이후의 순서는 개발 담당의 공개 API 연결 대기. */
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
