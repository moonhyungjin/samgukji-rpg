import { useCallback, useEffect, useRef, useState } from 'react';
import type { ArtSlot } from './artReview';
import { DEFAULT_GAME_URL, applicableKeys, groupHighlightMessage, groupSlots, highlightMessage, viewerImageUrl } from './artViewer';

type View = 'slots' | 'unassigned' | 'all';

/**
 * 에셋 검수의 "게임 화면에서 보기" 상태: iframe 연결, 슬롯 영역 표시, 후보 그림 끼우기, 구조 보기(그룹 전체/칩).
 * 게임 화면과는 postMessage로만 대화한다 (apps/game의 ArtViewer.tsx).
 */
export function useArtViewer(slots: readonly ArtSlot[], slot: ArtSlot | undefined, view: View) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [gameUrl, setGameUrl] = useState(() => {
    try {
      return window.localStorage.getItem('art-viewer-game-url') || DEFAULT_GAME_URL;
    } catch {
      return DEFAULT_GAME_URL;
    }
  });
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(true);
  const [applied, setApplied] = useState<Record<string, string>>({}); // 텍스처 키 → 끼워 본 그림 경로
  const [targetKey, setTargetKey] = useState('');
  const [showGroup, setShowGroup] = useState(false); // 같은 그룹의 슬롯을 한꺼번에 표시
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set()); // 구조 보기에서 가린 슬롯 (겹쳐 보일 때)

  const keys = applicableKeys(slot);
  const members = slot ? groupSlots(slots, slot.group) : [];
  const post = useCallback((message: object) => frameRef.current?.contentWindow?.postMessage(message, '*'), []);

  // 게임 화면이 준비되면 알려 준다
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data && typeof event.data === 'object' && event.data.type === 'art-viewer:ready') setReady(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // 슬롯을 고르면 그 영역을 게임 화면에 표시한다 (화면이 새로 그려질 때마다 다시 보낸다)
  useEffect(() => {
    if (!ready) return;
    if (view !== 'slots' || !slot) post(highlightMessage(undefined));
    else post(showGroup ? groupHighlightMessage(slots, slot.group, hidden) : highlightMessage(slot));
  }, [ready, slot, slots, view, showGroup, hidden, post]);

  // 슬롯이 바뀌면 끼워 볼 대상 텍스처를 첫 번째로
  const slotId = slot?.id;
  useEffect(() => {
    setTargetKey(keys[0] ?? '');
  }, [slotId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendOverrides = (next: Record<string, string>) => {
    setApplied(next);
    setReady(false); // 화면이 다시 그려지면 ready가 다시 온다
    post({ type: 'art-viewer:overrides', overrides: Object.fromEntries(Object.entries(next).map(([k, p]) => [k, viewerImageUrl(window.location.origin, p)])) });
  };

  return {
    frameRef,
    gameUrl,
    ready,
    open,
    setOpen,
    applied,
    targetKey,
    setTargetKey,
    showGroup,
    setShowGroup,
    hidden,
    setHidden,
    keys,
    members,
    /** 후보 그림을 targetKey 자리에 끼워 본다 */
    apply: (path: string) => {
      if (targetKey) sendOverrides({ ...applied, [targetKey]: path });
    },
    reset: () => sendOverrides({}),
    toggleSlot: (id: string) =>
      setHidden((cur) => {
        const next = new Set(cur);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    changeGameUrl: (value: string) => {
      setGameUrl(value);
      setReady(false);
      try {
        window.localStorage.setItem('art-viewer-game-url', value);
      } catch {
        // 저장하지 못해도 이번 화면에서는 쓸 수 있다
      }
    },
    reopen: (src: string) => {
      setReady(false);
      setApplied({});
      if (frameRef.current) frameRef.current.src = src;
    },
  };
}

export type ArtViewerState = ReturnType<typeof useArtViewer>;
