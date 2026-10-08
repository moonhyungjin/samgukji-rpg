import type { UnitTypeData } from '@samgukji/battle-engine';
import { promotionDepth, rootIdOf, unitTypeTrees } from '../lib/unitTypes';
import type { TreeNode } from '../lib/unitTypes';

interface Props {
  /** 지금 고른 병종 id */
  value: string;
  /** 전체 병종 */
  unitTypes: Readonly<Record<string, UnitTypeData>>;
  /** 이 이름으로 접근성 라벨을 붙인다 (예: "zhangFei 병종") */
  label: string;
  onChange: (unitTypeId: string) => void;
}

/** 트리를 위에서 아래로 펼친 병종 목록 (기본 → 1차 → 2차 순서) */
function flatten(node: TreeNode, out: UnitTypeData[] = []): UnitTypeData[] {
  out.push(node.unit);
  node.children.forEach((c) => flatten(c, out));
  return out;
}

/**
 * 병종 고르기: 계열(승급 트리)을 고르면 그 계열의 병종만 아래 목록에 나온다.
 * 계열을 바꾸면 그 계열의 기본 병종이 선택된다. 장수 탭과 편성 편집에서 같이 쓴다.
 */
export function UnitTypePicker({ value, unitTypes, label, onChange }: Props) {
  const list = Object.values(unitTypes);
  const trees = unitTypeTrees(list);
  const current = unitTypes[value];
  const rootId = current ? rootIdOf(list, value) : '';
  const tree = trees.find((t) => t.unit.id === rootId);
  const members = tree ? [...new Map(flatten(tree).map((u) => [u.id, u])).values()] : [];

  return (
    <span className="unit-picker">
      <select aria-label={`${label} 계열`} title="승급 계열" value={rootId} onChange={(e) => onChange(e.target.value)}>
        {trees.map((t) => (
          <option key={t.unit.id} value={t.unit.id}>
            {t.unit.name} 계열
          </option>
        ))}
        {!current && <option value="">{value} (없음)</option>}
      </select>
      <select aria-label={label} title="이 계열의 병종 (승급 단계)" value={value} onChange={(e) => onChange(e.target.value)}>
        {members.map((u) => (
          <option key={u.id} value={u.id}>
            {promotionDepth(list, u.id) === 0 ? '' : `${promotionDepth(list, u.id)}차 · `}
            {u.name}
          </option>
        ))}
        {!current && <option value={value}>{value} (없음)</option>}
      </select>
    </span>
  );
}
