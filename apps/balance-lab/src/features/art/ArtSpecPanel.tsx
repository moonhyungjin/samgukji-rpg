import { useState } from 'react';
import type { ArtSlot } from './artReview';
import { hasSpec, specMarkdown } from './artSpec';

/** 슬롯의 제작 명세서: Codex/Gemini에 그대로 붙여 넣는 글. 슬롯 크기를 고치면 같이 바뀐다 */
export function ArtSpecPanel({ slot, slots }: { slot: ArtSlot; slots: readonly ArtSlot[] }) {
  const [copied, setCopied] = useState(false);
  if (!hasSpec(slot)) return null;
  const text = specMarkdown(slot, slots);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };
  return (
    <details className="art-spec" data-section="art-spec">
      <summary>
        <strong>제작 명세서</strong> <small>{slot.id} · Codex/Gemini에 그대로 전달하는 글</small>
      </summary>
      <div className="art-spec-bar">
        <button type="button" data-action="spec-copy" onClick={() => void copy()}>
          {copied ? '복사했습니다' : '명세서 복사'}
        </button>
        <span className="note">받은 그림은 아래 후보 목록에서 비율, 크기, 투명 여부가 자동으로 검사됩니다.</span>
      </div>
      <pre className="art-spec-text">{text}</pre>
    </details>
  );
}
