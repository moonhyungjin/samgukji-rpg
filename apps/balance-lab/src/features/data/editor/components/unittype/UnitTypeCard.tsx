import type { BalanceConfig, GameData, UnitTypeData } from '@samgukji/battle-engine';
import type { Issue } from '../../lib/editor';
import { charactersUsing, unitTypeSummary } from '../../lib/unitTypes';
import { BasicsSection } from './BasicsSection';
import { CombatSection } from './CombatSection';
import { GuardSection } from './GuardSection';
import { PromotionSection } from './PromotionSection';
import { SkillsSection } from './SkillsSection';
import { StatModsSection } from './StatModsSection';
import type { Patch } from './shared';

interface Props {
  u: UnitTypeData;
  every: readonly UnitTypeData[];
  data: GameData;
  balance: BalanceConfig;
  characters: GameData['characters'];
  issues: readonly Issue[];
  isSaved: boolean;
  isChanged: boolean;
  isBad: boolean;
  renderSkills?: (unit: UnitTypeData) => React.ReactNode;
  onEdit: (id: string, patch: Patch) => void;
  onDuplicate: (id: string) => void;
  onRevert: (id: string) => void;
  onRemove: (id: string) => void;
}

/** 병종 카드 한 장: 머리(이름, 복제, 삭제) + 섹션들 + 쓰는 장수와 오류 */
export function UnitTypeCard({ u, every, data, balance, characters, issues, isSaved, isChanged, isBad, renderSkills, onEdit, onDuplicate, onRevert, onRemove }: Props) {
  const className = ['unittype', !isSaved ? 'added' : isChanged ? 'changed' : '', isBad ? 'invalid' : ''].filter(Boolean).join(' ');
  const users = charactersUsing(u.id, Object.values(characters));
  const summary = unitTypeSummary(u, balance);
  const own = issues.filter((i) => i.id === u.id);
  return (
    <section key={u.id} className={className} data-unittype={u.id}>
        <header className="preset-head">
          <input className="label-input" aria-label={`${u.id} 이름`} value={u.name} onChange={(e) => onEdit(u.id, { name: e.target.value })} />
          {isSaved ? (
            <code className="preset-id">{u.id}</code>
          ) : (
            <input className="id-input" aria-label="새 병종 id" value={u.id} onChange={(e) => onEdit(u.id, { id: e.target.value })} />
          )}
          <span className="spacer" />
          <span className="badge" title="레벨 15 기준 최대 병력">
            병력 {summary.troops} · {summary.rows}
          </span>
          <button type="button" onClick={() => onDuplicate(u.id)}>
            복제
          </button>
          {isSaved && isChanged && (
            <button type="button" onClick={() => onRevert(u.id)}>
              되돌리기
            </button>
          )}
          <button
            type="button"
            className="danger"
            disabled={users.length > 0}
            title={users.length > 0 ? `장수 ${users.length}명이 쓰고 있어 삭제할 수 없습니다 (${users.slice(0, 4).join(', ')}${users.length > 4 ? ' …' : ''})` : '삭제'}
            onClick={() => onRemove(u.id)}
          >
            삭제
          </button>
        </header>

      <BasicsSection u={u} onEdit={onEdit} />
      <StatModsSection u={u} onEdit={onEdit} />
      <PromotionSection u={u} onEdit={onEdit} every={every} />
      <CombatSection u={u} onEdit={onEdit} />
      <SkillsSection u={u} onEdit={onEdit} data={data} renderSkills={renderSkills} />
      <GuardSection u={u} onEdit={onEdit} />

        {users.length > 0 && <div className="preset-summary">쓰는 장수 {users.length}명: {users.slice(0, 6).join(', ')}{users.length > 6 ? ' …' : ''}</div>}
        {own.length > 0 && (
          <div className="preset-summary">
            {own.map((i, index) => (
              <div key={index} className={i.level}>
                {i.message}
              </div>
            ))}
          </div>
        )}
    </section>
  );
}
