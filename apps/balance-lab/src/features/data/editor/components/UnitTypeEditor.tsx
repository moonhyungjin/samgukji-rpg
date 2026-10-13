import type { BalanceConfig, GameData, UnitTypeData } from '@samgukji/battle-engine';
import type { Issue } from '../lib/editor';
import { groupByPromotion } from '../lib/unitTypes';
import { UnitTypeCard } from './unittype/UnitTypeCard';
import type { Patch } from './unittype/shared';

interface Props {
  /** 그릴 병종들 */
  unitTypes: readonly UnitTypeData[];
  /** 승급 길과 승급 대상 이름을 찾을 전체 병종 (생략하면 unitTypes) */
  all?: readonly UnitTypeData[];
  /** 병종 카드 안에 넣을 스킬 영역 (Lab 상태가 필요해서 바깥에서 주입한다) */
  renderSkills?: (unit: UnitTypeData) => React.ReactNode;
  savedIds: ReadonlySet<string>;
  changed: ReadonlySet<string>;
  issues: readonly Issue[];
  /** 병종을 쓰는 장수 이름을 알려 주기 위해 */
  characters: GameData['characters'];
  /** 스킬/특성 목록 */
  data: GameData;
  balance: BalanceConfig;
  onEdit: (id: string, patch: Patch) => void;
  onDuplicate: (id: string) => void;
  onRevert: (id: string) => void;
  onRemove: (id: string) => void;
}

/** 병종 목록: 승급 차수별로 묶어 카드(UnitTypeCard)를 그린다. 카드의 각 섹션은 ./unittype/ 에 있다. */
export function UnitTypeEditor({ unitTypes, all, renderSkills, savedIds, changed, issues, characters, data, balance, onEdit, onDuplicate, onRevert, onRemove }: Props) {
  const bad = new Set(issues.filter((i) => i.level === 'error' && i.id !== undefined).map((i) => i.id));
  const every = all ?? unitTypes;
  return (
    <div className="unittypes">
      {groupByPromotion(unitTypes).map((group) => (
        <div className="tier-group" key={group.depth} data-tier={group.depth}>
          <h4 className="sub tier-title">
            {group.label} <span className="badge">{group.items.length}종</span>
          </h4>
          {group.items.map((u) => (
            <UnitTypeCard
              key={u.id}
              u={u}
              every={every}
              data={data}
              balance={balance}
              characters={characters}
              issues={issues}
              isSaved={savedIds.has(u.id)}
              isChanged={changed.has(u.id)}
              isBad={bad.has(u.id)}
              renderSkills={renderSkills}
              onEdit={onEdit}
              onDuplicate={onDuplicate}
              onRevert={onRevert}
              onRemove={onRemove}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
