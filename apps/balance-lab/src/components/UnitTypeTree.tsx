import type { UnitTypeData } from '@samgukji/battle-engine';
import { rootIdOf, unitTypeTrees } from '../editor/lib/unitTypes';
import type { TreeNode } from '../editor/lib/unitTypes';

interface Props {
  list: readonly UnitTypeData[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** 저장본과 달라진 / 새로 만든 / 오류가 있는 병종 */
  changed: ReadonlySet<string>;
  added: ReadonlySet<string>;
  invalid: ReadonlySet<string>;
}

/** 승급 트리별 탭(계열) + 트리 그림. 노드를 누르면 그 병종의 카드를 편집한다. */
export function UnitTypeTree({ list, selectedId, onSelect, changed, added, invalid }: Props) {
  const trees = unitTypeTrees(list);
  const activeRoot = rootIdOf(list, selectedId);
  const tree = trees.find((t) => t.unit.id === activeRoot) ?? trees[0];

  const mark = (id: string) => [changed.has(id) ? 'changed' : '', added.has(id) ? 'added' : '', invalid.has(id) ? 'invalid' : ''].filter(Boolean).join(' ');
  const treeMark = (n: TreeNode): string => [mark(n.unit.id), ...n.children.map(treeMark)].filter(Boolean).join(' ');

  const renderNode = (n: TreeNode, depth: number) => (
    <li key={n.unit.id}>
      <button
        type="button"
        className={['tree-node', n.unit.id === selectedId ? 'active' : '', mark(n.unit.id)].filter(Boolean).join(' ')}
        data-node={n.unit.id}
        aria-pressed={n.unit.id === selectedId}
        onClick={() => onSelect(n.unit.id)}
        title={n.unit.id}
      >
        <span className="tier">{depth === 0 ? '기본' : `${depth}차`}</span> {n.unit.name}
      </button>
      {n.children.length > 0 && <ul>{n.children.map((c) => renderNode(c, depth + 1))}</ul>}
    </li>
  );

  return (
    <div className="unit-tree">
      <div className="family-tabs" role="tablist" aria-label="병종 계열">
        {trees.map((t) => (
          <button
            key={t.unit.id}
            type="button"
            role="tab"
            aria-selected={t.unit.id === tree?.unit.id}
            className={['family-tab', t.unit.id === tree?.unit.id ? 'active' : '', treeMark(t).includes('invalid') ? 'invalid' : ''].filter(Boolean).join(' ')}
            data-root={t.unit.id}
            onClick={() => onSelect(t.unit.id)}
          >
            {t.unit.name}
            {t.children.length > 0 ? ' 계열' : ''}
            {treeMark(t).includes('changed') || treeMark(t).includes('added') ? <span className="dot" title="저장하지 않은 변경이 있습니다" /> : null}
          </button>
        ))}
      </div>
      {tree && (
        <ul className="tree-root" aria-label={`${tree.unit.name} 승급 트리`}>
          {renderNode(tree, 0)}
        </ul>
      )}
    </div>
  );
}
