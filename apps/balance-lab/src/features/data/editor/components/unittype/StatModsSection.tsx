import { MOD_FIELDS } from '../../lib/unitTypes';
import { field, num } from './shared';
import type { SectionProps } from './shared';

/** 스탯 보정: 승급 길의 앞 병종 보정에 더해진다 */
export function StatModsSection({ u, onEdit }: SectionProps) {
  const mods = { attack: 0, defense: 0, intellect: 0, speed: 0, action: 0, ...u.statMods };
  return (
    <>
        <div className="usection">스탯 보정 (앞 병종의 보정에 더해짐)</div>
        <div className="ugrid">
          {MOD_FIELDS.map((f) =>
            field(
              f.label,
              <input type="number" step={1} aria-label={`${u.id} 보정 ${f.label}`} value={mods[f.key]} onChange={(e) => onEdit(u.id, { statMods: { [f.key]: num(e.target.value) } })} />,
            ),
          )}
        </div>
    </>
  );
}
