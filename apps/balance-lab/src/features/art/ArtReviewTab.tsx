import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArtCard, imageUrl } from './ArtCard';
import { ArtRegionEditor } from './ArtRegionEditor';
import { ArtSlotNav } from './ArtSlotNav';
import { ArtViewerPanel } from './ArtViewerPanel';
import { formatBytes, matchesFilter, slotsFor, splitDeletable, statusOf } from './artReview';
import type { ArtImage, ArtSlot, ReviewMap, ReviewStatus, StatusFilter } from './artReview';
import { editModeOf } from './artRegions';
import { useArtViewer } from './useArtViewer';
import { useSlotRegions } from './useSlotRegions';

type View = 'slots' | 'unassigned' | 'all';
interface Payload {
  slots: ArtSlot[];
  images: ArtImage[];
  review: ReviewMap;
}

const NO_SLOTS: ArtSlot[] = [];
const FILTER_LABEL: Record<StatusFilter, string> = { all: '전체', pending: '대기', ok: 'OK', no: 'NO' };

/**
 * 에셋 검수: 이미지마다 OK / NO / 대기를 표시한다. NO는 "NO 정리"를 눌러야 파일을 지운다.
 * 슬롯(전투 화면의 자리)별로 후보를 보거나, 어느 슬롯에도 안 들어가는 그림만 볼 수 있다. 상태는 docs/art/review.json에 저장된다.
 * 실제 게임 화면에서 보는 부분은 useArtViewer / ArtViewerPanel.
 */
export function ArtReviewTab() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('slots');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [slotId, setSlotId] = useState('');
  const [zoom, setZoom] = useState<ArtImage | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/art', { cache: 'no-store' });
      if (!res.ok) throw new Error(`${res.status}`);
      const payload = (await res.json()) as Payload;
      setData(payload);
      setError('');
      setSlotId((cur) => cur || payload.slots[0]?.id || '');
    } catch {
      setError('에셋 목록을 불러오지 못했습니다. 이 탭은 개발 서버(npm run lab)에서만 동작합니다.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const { images = [], review = {} } = data ?? {};
  // 영역은 편집 중인 값(저장 전)이 슬롯 목록에 섞여 들어온다
  const regions = useSlotRegions(data?.slots ?? NO_SLOTS, load);
  const slots = regions.slots;
  const slot = slots.find((x) => x.id === slotId);
  const v = useArtViewer(slots, view === 'slots' ? slot : undefined, view, (c) => regions.edit(c.slotId, c.region, { x: c.x, y: c.y, w: c.w, h: c.h }));

  const mark = async (path: string, value: ReviewStatus | null) => {
    if (!data) return;
    const next = { ...data.review };
    if (value === null) delete next[path];
    else next[path] = value;
    setData({ ...data, review: next }); // 먼저 화면에 반영하고 저장한다
    const res = await fetch('/api/art/review', { method: 'POST', body: JSON.stringify({ [path]: value }) });
    if (!res.ok) {
      setMessage('저장하지 못했습니다. 다시 시도하세요.');
      void load();
    }
  };

  const counts = useMemo(() => {
    const c = { pending: 0, ok: 0, no: 0 };
    for (const i of images) c[statusOf(i.path, review)] += 1;
    return c;
  }, [images, review]);
  const { deletable, blocked } = useMemo(() => splitDeletable(images, review), [images, review]);

  const applyDeletions = async () => {
    if (deletable.length === 0) return;
    const total = deletable.reduce((n, i) => n + i.bytes, 0);
    if (!window.confirm(`NO로 표시한 ${deletable.length}개(${formatBytes(total)})를 지웁니다. git에는 남아 있어서 되돌릴 수 있습니다. 진행할까요?`)) return;
    const res = await fetch('/api/art/apply', { method: 'POST', body: '{}' });
    const out = (await res.json()) as { deleted: string[]; blocked: string[]; missing: string[] };
    setMessage(`${out.deleted.length}개를 지웠습니다.${out.blocked.length ? ` 게임이 쓰는 ${out.blocked.length}개는 지우지 않았습니다.` : ''}`);
    await load();
  };

  const shown = useMemo(() => {
    const base = view === 'all' ? images : view === 'unassigned' ? images.filter((i) => slotsFor(i.path, slots).length === 0) : slot ? images.filter((i) => slotsFor(i.path, [slot]).length > 0) : [];
    return base.filter((i) => matchesFilter(i.path, review, filter));
  }, [view, images, slots, slot, review, filter]);

  if (error) {
    return (
      <section className="panel">
        <h3>에셋 검수</h3>
        <p className="note">{error}</p>
      </section>
    );
  }
  if (!data) return <section className="panel">불러오는 중…</section>;

  const canApply = view === 'slots' && v.keys.length > 0;
  return (
    <section className="panel art-review" data-section="art-review">
      <h3>에셋 검수</h3>
      <p className="note">
        그림마다 OK / NO를 누릅니다. 아무것도 안 누르면 대기입니다. NO는 표시만 되고, "NO 정리"를 눌러야 파일이 지워집니다 (게임이 쓰는 파일은 지워지지 않습니다). 슬롯은{' '}
        <code>docs/art/battle-slots.json</code>, 검수 결과는 <code>docs/art/review.json</code>에 저장됩니다.
      </p>

      <div className="art-bar">
        <div className="art-bar-row">
          <span className="badge">대기 {counts.pending}</span>
          <span className="badge art-ok">OK {counts.ok}</span>
          <span className="badge art-no">NO {counts.no}</span>
          <span className="spacer" />
          <div className="seg" role="group" aria-label="보기 방식">
            {(['slots', 'unassigned', 'all'] as View[]).map((x) => (
              <button key={x} type="button" className={view === x ? 'tab sub active' : 'tab sub'} data-view={x} onClick={() => setView(x)}>
                {x === 'slots' ? '슬롯별' : x === 'unassigned' ? '미배정' : '전체'}
              </button>
            ))}
          </div>
        </div>
        <div className="art-bar-row">
          <label className="vc-inline">
            <span>상태</span>
            <select aria-label="상태 필터" value={filter} onChange={(e) => setFilter(e.target.value as StatusFilter)}>
              {(Object.keys(FILTER_LABEL) as StatusFilter[]).map((f) => (
                <option key={f} value={f}>
                  {FILTER_LABEL[f]}
                </option>
              ))}
            </select>
          </label>
          <span className="spacer" />
          <button type="button" data-action="apply" onClick={applyDeletions} disabled={deletable.length === 0} title="NO로 표시한 그림 파일을 지웁니다">
            NO 정리 ({deletable.length}개, {formatBytes(deletable.reduce((n, i) => n + i.bytes, 0))})
          </button>
          <button type="button" onClick={() => void load()}>
            새로 읽기
          </button>
        </div>
      </div>
      {blocked.length > 0 && <p className="note shared">⚠ NO로 표시했지만 게임이 쓰는 파일 {blocked.length}개는 지울 수 없습니다: {blocked.map((i) => i.path.split('/').pop()).join(', ')}</p>}
      {message && <p className="note">{message}</p>}

      <ArtViewerPanel v={v} slot={view === 'slots' ? slot : undefined} slotView={view === 'slots'} editor={view === 'slots' && slot && slot.regions?.length ? <ArtRegionEditor slot={slot} slots={slots} regions={regions} /> : undefined} />

      <div className={view === 'slots' ? 'art-layout slots' : 'art-layout'}>
        {view === 'slots' && <ArtSlotNav slots={slots} images={images} review={review} slotId={slotId} onSelect={setSlotId} />}
        <div className="art-main">
          {view === 'slots' && slot && (
            <div className="art-slot-info">
              <h4>
                {slot.id} · {slot.name}
              </h4>
              <p className="note">
                {slot.regions?.length && editModeOf(slot) !== 'locked' ? `크기 ${slot.regions[0].w}×${slot.regions[0].h} · 위치 (${slot.regions[0].x}, ${slot.regions[0].y})` : `크기 ${slot.size}`} · 상태 {slot.states.join(' / ')}
                {slot.codeDrawn ? ' · 지금은 코드/CSS로 그립니다' : ''}
                {slot.note ? ` · ${slot.note}` : ''}
              </p>
            </div>
          )}
          {shown.length === 0 ? (
            <p className="note">{view === 'slots' && slot && !slot.match ? '이 슬롯에 연결된 그림이 없습니다. 새로 만들 자리입니다.' : '조건에 맞는 그림이 없습니다.'}</p>
          ) : (
            <div className="art-grid">
              {shown.map((img) => (
                <ArtCard
                  key={img.path}
                  img={img}
                  slots={slots}
                  review={review}
                  onMark={(path, value) => void mark(path, value)}
                  onZoom={setZoom}
                  onApply={canApply ? v.apply : undefined}
                  applyTitle={`${v.targetKey} 자리에 끼워서 게임 화면에서 봅니다`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {zoom && (
        <div className="art-lightbox" role="dialog" aria-label={zoom.path} onClick={() => setZoom(null)}>
          <img src={imageUrl(zoom.path)} alt={zoom.path} />
          <p>
            {zoom.path} · {zoom.width ? `${zoom.width}×${zoom.height} · ` : ''}
            {formatBytes(zoom.bytes)} (아무 곳이나 누르면 닫힙니다)
          </p>
        </div>
      )}
    </section>
  );
}
