import type { Command, CommandPreview } from '@samgukji/battle-engine';
import type { CommandOption, ControllerSnapshot } from '../battle/controller';
import { DECIDED_BY_LABEL, END_CAUSE_LABEL, FAMILY_LABEL, SIDE_LABEL, STAT_LABEL } from '../lib/labels';

/** 대상 버튼에 보여 줄 예상 결과 */
export function previewText(preview: CommandPreview): string {
  if (preview.kind === 'heal') return `회복 +${preview.amount}`;
  if (preview.kind === 'buff') {
    const e = preview.effect;
    if (e.type === 'barrier') return `다음 피해 ${e.charges}회 무시`;
    const stats = e.pool.map((k) => STAT_LABEL[k]).join('/');
    return `${stats} 중 무작위 ${e.minCount}~${e.maxCount}가지 +${e.amount}`;
  }
  if (preview.kind === 'guard') return `막을 확률 ${preview.rateAfter}%`;
  const parts = [preview.targetBarrier ? '결계로 피해 무시' : `피해 ${preview.damage}`];
  if (preview.targetTroopsAfter === 0) parts.push('격파');
  if (preview.counter > 0) parts.push(`반격 ${preview.counter}`);
  // 같은 열 가드 유닛이 대신 맞을 수 있으면 알려 준다 (피해와 반격은 가드가 없을 때의 값이다)
  if (preview.interceptChance > 0) parts.push(`가드가 막을 확률 ${Math.round(preview.interceptChance * 100)}%`);
  return parts.join(' · ');
}

interface Props {
  snapshot: ControllerSnapshot;
  onSelectSkill: (skillId: string | null) => void;
  onSubmit: (command: Command) => void;
  onAutoplay: () => void;
  onSkip: () => void;
  onRestart: () => void;
  onExit: () => void;
}

function targetList(command: CommandOption, onSubmit: Props['onSubmit']) {
  // 회복은 병력 비율이 낮은 아군을 앞에 둔다
  const targets =
    command.kind === 'heal'
      ? [...command.targets].sort((a, b) => a.troops / a.maxTroops - b.troops / b.maxTroops)
      : command.targets;
  return (
    <ul className="targets">
      {targets.map((t) => (
        <li key={t.uid}>
          <button type="button" onClick={() => onSubmit({ kind: 'skill', skillId: command.skillId, targetUid: t.uid })}>
            <span className="target-name">{t.name}</span>
            <span className="target-troops">
              병력 {t.troops}/{t.maxTroops}
            </span>
            <span className="target-preview">{previewText(t.preview)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** 플레이어 차례의 커맨드 선택과 전투 결과를 보여 준다. */
export function CommandPanel({ snapshot, onSelectSkill, onSubmit, onAutoplay, onSkip, onRestart, onExit }: Props) {
  if (snapshot.phase === 'playing') {
    return (
      <section className="panel command">
        <p className="status">진행 중…</p>
        <button type="button" onClick={onSkip}>
          건너뛰기
        </button>
      </section>
    );
  }

  if (snapshot.phase === 'finished') {
    const result = snapshot.result;
    return (
      <section className="panel command">
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
  const selected = waiting.commands.find((c) => c.skillId === snapshot.selectedSkillId) ?? null;

  return (
    <section className="panel command">
      <h3>
        {waiting.name}의 차례 <small>{FAMILY_LABEL[waiting.family]} · AP {waiting.ap}/{waiting.maxAp} · 병력 {waiting.troops}/{waiting.maxTroops}</small>
      </h3>
      <div className="row">
        {waiting.commands.map((c) => (
          <button
            key={c.skillId}
            type="button"
            className={c.skillId === snapshot.selectedSkillId ? 'primary' : ''}
            onClick={() => {
              // 가드는 자기 자신에게만 쓰므로 대상을 고르지 않고 바로 실행한다
              if (c.kind === 'guard') onSubmit({ kind: 'skill', skillId: c.skillId, targetUid: c.targets[0].uid });
              else onSelectSkill(c.skillId === snapshot.selectedSkillId ? null : c.skillId);
            }}
          >
            {c.kind === 'guard' ? `${c.skillName} (AP ${c.apCost}) → ${c.targets[0] ? previewText(c.targets[0].preview) : ''}` : `${c.skillName} (AP ${c.apCost})`}
          </button>
        ))}
        <button type="button" onClick={() => onSubmit({ kind: 'wait' })}>
          대기 (AP 소모 없음)
        </button>
      </div>
      {selected ? (
        <>
          <p className="note">대상을 고르세요. 화면에서 노란 테두리의 군단을 눌러도 됩니다.</p>
          {targetList(selected, onSubmit)}
        </>
      ) : (
        <p className="note">스킬을 고르면 대상과 예상 결과가 나옵니다.</p>
      )}
      {snapshot.error && <p className="error">{snapshot.error}</p>}
      <div className="row">
        <button type="button" onClick={onAutoplay}>
          남은 전투를 AI에게 맡기기
        </button>
      </div>
    </section>
  );
}
