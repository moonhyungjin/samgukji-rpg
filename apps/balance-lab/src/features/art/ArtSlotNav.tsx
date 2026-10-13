import { useMemo } from 'react';
import { slotSummary } from './artReview';
import type { ArtImage, ArtSlot, ReviewMap } from './artReview';

interface Props {
  slots: readonly ArtSlot[];
  images: readonly ArtImage[];
  review: ReviewMap;
  slotId: string;
  onSelect: (id: string) => void;
}

/** 슬롯 목록 (그룹별): 후보 수와 OK/NO 수를 함께 보여 준다 */
export function ArtSlotNav({ slots, images, review, slotId, onSelect }: Props) {
  const groups = useMemo(() => {
    const out: { group: string; items: ArtSlot[] }[] = [];
    for (const s of slots) {
      const last = out[out.length - 1];
      if (last && last.group === s.group) last.items.push(s);
      else out.push({ group: s.group, items: [s] });
    }
    return out;
  }, [slots]);

  return (
    <nav className="art-slots" aria-label="슬롯">
      {groups.map((g) => (
        <div key={g.group}>
          <div className="art-group">{g.group}</div>
          {g.items.map((s) => {
            const sum = slotSummary(s, images, review);
            return (
              <button key={s.id} type="button" data-slot={s.id} className={s.id === slotId ? 'art-slot active' : 'art-slot'} onClick={() => onSelect(s.id)}>
                <strong>{s.id}</strong> {s.name}
                <small>{s.codeDrawn && !s.match ? '코드로 그림' : `후보 ${sum.total} · OK ${sum.ok} · NO ${sum.no}`}</small>
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
