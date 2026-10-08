import type { CommandPreview } from '@samgukji/battle-engine';
import type { ControllerSnapshot } from '../battle/controller';
import { DECIDED_BY_LABEL, END_CAUSE_LABEL, FAMILY_LABEL, SIDE_LABEL, STAT_LABEL } from '../lib/labels';

/** 대상 버튼에 보여 줄 예상 결과 */
export function previewText(preview: CommandPreview): string {
  if (preview.kind === 'revive') return `부활 (병력 ${preview.troops})`;
  if (preview.kind === 'heal') {
    const others = preview.alsoHealed ?? [];
    return others.length > 0 ? `회복 +${preview.amount} (외 ${others.length}명 +${others.reduce((sum, h) => sum + h.amount, 0)})` : `회복 +${preview.amount}`;
  }
  if (preview.kind === 'buff') {
    const e = preview.effect;
    const also = preview.alsoBuffed && preview.alsoBuffed.length > 0 ? ` (외 ${preview.alsoBuffed.length}명)` : '';
    if (e.type === 'barrier') return `다음 피해 ${e.charges}회 무시${also}`;
    const stats = e.pool.map((k) => STAT_LABEL[k]).join('/');
    return `${stats} 중 무작위 ${e.minCount}~${e.maxCount}가지 +${e.amount}${also}`;
  }
  if (preview.kind === 'guard') return `막을 확률 ${preview.rateAfter}%`;
  const parts = [preview.targetBarrier ? '결계로 피해 무시' : `피해 ${preview.damage}`];
  if (preview.targetTroopsAfter === 0) parts.push('격파');
  if (preview.rowHits && preview.rowHits.length > 0) parts.push(`열 전체 ${preview.rowHits.length + 1}명 (함께 ${preview.rowHits.reduce((sum, h) => sum + h.damage, 0)})`);
  if (preview.alsoHit) parts.push(`뒤열 관통 ${preview.alsoHit.damage}`);
  if (preview.counter > 0) parts.push(`반격 ${preview.counter}`);
  if (preview.criticalChance) parts.push(`치명타 ${preview.criticalChance}% (${preview.criticalDamage})`);
  // 같은 열 가드 유닛이 대신 맞을 수 있으면 알려 준다 (피해와 반격은 가드가 없을 때의 값이다)
  if (preview.interceptChance > 0) parts.push(`가드가 막을 확률 ${Math.round(preview.interceptChance * 100)}%`);
  return parts.join(' · ');
}

interface Props {
  snapshot: ControllerSnapshot;
  onAutoplay: () => void;
  onSkip: () => void;
  onRestart: () => void;
  onExit: () => void;
}

/** 플레이어 차례의 커맨드 선택과 전투 결과를 보여 준다. */
export function CommandPanel({ snapshot, onAutoplay, onSkip, onRestart, onExit }: Props) {
  if (snapshot.phase === 'playing') {
    return (
      <section className="panel command" aria-label="전투 지휘">
        <p className="command-eyebrow">전투 지휘</p>
        <p className="status" role="status">진행 중…</p>
        <button type="button" onClick={onSkip}>
          건너뛰기
        </button>
      </section>
    );
  }

  if (snapshot.phase === 'finished') {
    const result = snapshot.result;
    return (
      <section className="panel command" aria-label="전투 결과">
        <h3>전투 종료</h3>
        {result && (
          <>
            <p>
              <strong className={result.winner}>{SIDE_LABEL[result.winner]} 승리</strong> — {END_CAUSE_LABEL[result.endCause]} · 판정 {DECIDED_BY_LABEL[result.decidedBy]} · {result.rounds}라운드
            </p>
            <p className="note">
              전멸한 군단: 공격측 {result.destroyed.attacker} / 방어측 {result.destroyed.defender} · 잔여 병력: 공격측 {result.remainingTroops.attacker} / 방어측 {result.remainingTroops.defender}
            </p>
          </>
        )}
        <div className="row">
          <button type="button" className="primary" onClick={onRestart}>
            다시 하기
          </button>
          <button type="button" onClick={onExit}>
            설정으로
          </button>
        </div>
      </section>
    );
  }

  const waiting = snapshot.waiting;
  if (!waiting) return null;

  return (
    <section className="panel command" aria-label="전투 지휘">
      <p className="command-eyebrow">전투 지휘</p>
      <h3>
        {waiting.name}의 차례 <small>{FAMILY_LABEL[waiting.family]} · AP {waiting.ap}/{waiting.maxAp} · 병력 {waiting.troops}/{waiting.maxTroops}</small>
      </h3>
      <p className="note">군단 카드에 마우스를 올리거나 카드를 누르세요. 그 대상에게 가능한 행동만 표시됩니다.<br />가드·대기는 행동 중인 장수 카드에서 선택하세요.</p>
      {snapshot.error && <p className="error" role="alert">{snapshot.error}</p>}
      <div className="row">
        <button type="button" onClick={onAutoplay}>
          남은 전투를 AI에게 맡기기
        </button>
      </div>
    </section>
  );
}
