import { formatBytes, slotsFor, statusOf } from './artReview';
import type { ArtImage, ArtSlot, ReviewMap, ReviewStatus } from './artReview';
import type { FitCheck } from './artSpec';

export const imageUrl = (path: string) => `/api/art/file?path=${encodeURIComponent(path)}`;

interface Props {
  img: ArtImage;
  slots: readonly ArtSlot[];
  review: ReviewMap;
  onMark: (path: string, value: ReviewStatus | null) => void;
  onZoom: (img: ArtImage) => void;
  /** "화면에 적용" 버튼 (끼울 수 있는 슬롯을 보고 있을 때만 넘긴다) */
  onApply?: (path: string) => void;
  applyTitle?: string;
  /** 보고 있는 슬롯의 조건(비율, 크기, 투명)에 맞는지 */
  fit?: FitCheck[];
}

/** 그림 한 장: 미리보기, 정보, OK/NO(+화면에 적용) */
export function ArtCard({ img, slots, review, onMark, onZoom, onApply, applyTitle, fit }: Props) {
  const status = statusOf(img.path, review);
  const owners = slotsFor(img.path, slots).map((s) => s.id);
  return (
    <figure className={`art-card ${status}`} data-path={img.path} data-status={status}>
      <button type="button" className="art-thumb" onClick={() => onZoom(img)} aria-label={`${img.path} 크게 보기`}>
        <img src={imageUrl(img.path)} alt={img.path} loading="lazy" />
      </button>
      <figcaption>
        <span className="art-name" title={img.path}>
          {img.path.split('/').pop()}
        </span>
        <small>{img.path.split('/').slice(0, -1).join('/')}</small>
        <small>
          {img.width ? `${img.width}×${img.height} · ` : ''}
          {formatBytes(img.bytes)}
          {owners.length > 0 ? ` · ${owners.join(', ')}` : ' · 미배정'}
        </small>
        {fit && fit.length > 0 && (
          <span className="art-fit" data-fit={fit.every((c) => c.ok) ? 'ok' : 'bad'}>
            {fit.map((c) => (
              <span key={c.key} className={c.ok ? 'fit ok' : 'fit bad'} data-fit-check={c.key}>
                {c.ok ? '✓' : '✗'} {c.text}
              </span>
            ))}
          </span>
        )}
        <span className="art-badges">
          {img.usedByGame && <span className="badge art-used">게임이 씀</span>}
          {!img.usedByGame && img.usedByDocs && <span className="badge">문서가 씀</span>}
        </span>
        <span className="art-actions">
          <button type="button" className={status === 'ok' ? 'art-btn ok on' : 'art-btn ok'} data-act="ok" onClick={() => onMark(img.path, status === 'ok' ? null : 'ok')}>
            OK
          </button>
          <button type="button" className={status === 'no' ? 'art-btn no on' : 'art-btn no'} data-act="no" onClick={() => onMark(img.path, status === 'no' ? null : 'no')}>
            NO
          </button>
          {onApply && (
            <button type="button" className="art-btn view" data-act="view" title={applyTitle} onClick={() => onApply(img.path)}>
              화면에 적용
            </button>
          )}
        </span>
      </figcaption>
    </figure>
  );
}
