import { useCallback, useEffect, useMemo, useState } from 'react';
import { changedRegions, setRegion } from './artRegions';
import type { Region } from './artRegions';
import type { ArtSlot } from './artReview';

/**
 * 슬롯 영역 편집 상태. 고친 값은 "저장"을 누를 때까지 화면(Viewer의 점선과 숫자 칸)에만 반영되고,
 * 저장하면 docs/art/battle-slots.json이 바뀌어 게임 화면이 그 좌표로 다시 그려진다.
 */
export function useSlotRegions(loaded: readonly ArtSlot[], reload: () => Promise<void>) {
  const [draft, setDraft] = useState<ArtSlot[] | null>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [linked, setLinked] = useState(true); // 좌우 대칭 슬롯을 한쪽만 고치면 반대쪽이 따라온다

  // 파일에서 다시 읽으면 편집 중인 값은 버린다
  useEffect(() => {
    setDraft(null);
  }, [loaded]);

  const slots = draft ?? loaded;
  const changed = useMemo(() => (draft ? Object.keys(changedRegions(loaded, draft)) : []), [loaded, draft]);

  const edit = useCallback(
    (slotId: string, index: number, region: Region) => {
      setMessage('');
      setDraft((cur) => setRegion(cur ?? loaded, slotId, index, region, linked));
    },
    [loaded, linked],
  );

  const save = async () => {
    if (!draft || changed.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch('/api/art/slots', { method: 'POST', body: JSON.stringify(changedRegions(loaded, draft)) });
      const out = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(out.error ?? `${res.status}`);
      setMessage(`${changed.join(', ')} 영역을 저장했습니다. 게임 화면이 새 좌표로 다시 그려집니다.`);
      await reload();
    } catch (e) {
      setMessage(`저장하지 못했습니다: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  return {
    slots,
    changed,
    dirty: changed.length > 0,
    message,
    saving,
    linked,
    setLinked,
    edit,
    revert: () => {
      setDraft(null);
      setMessage('');
    },
    save,
  };
}

export type SlotRegionsState = ReturnType<typeof useSlotRegions>;
