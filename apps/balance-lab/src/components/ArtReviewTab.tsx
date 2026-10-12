import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatBytes, matchesFilter, slotSummary, slotsFor, splitDeletable, statusOf } from '../lib/artReview';
import { DEFAULT_GAME_URL, applicableKeys, highlightMessage, viewerImageUrl, viewerSrc } from '../lib/artViewer';
import type { ArtImage, ArtSlot, ReviewMap, ReviewStatus, StatusFilter } from '../lib/artReview';

type View = 'slots' | 'unassigned' | 'all';
interface Payload {
  slots: ArtSlot[];
  images: ArtImage[];
  review: ReviewMap;
}

const FILTER_LABEL: Record<StatusFilter, string> = { all: '전체', pending: '대기', ok: 'OK', no: 'NO' };
const imageUrl = (path: string) => `/api/art/file?path=${encodeURIComponent(path)}`;

/**
 * 에셋 검수: 이미지마다 OK / NO / 대기를 표시한다. NO는 "NO 정리"를 눌러야 파일을 지운다.
 * 슬롯(전투 화면의 자리)별로 후보를 보거나, 어느 슬롯에도 안 들어가는 그림만 볼 수 있다. 상태는 docs/art/review.json에 저장된다.
 */
export function ArtReviewTab() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('slots');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [slotId, setSlotId] = useState('');
  const [zoom, setZoom] = useState<ArtImage | null>(null);
  const [message, setMessage] = useState('');
  // 게임 화면 Viewer
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [gameUrl, setGameUrl] = useState(() => {
    try {
      return window.localStorage.getItem('art-viewer-game-url') || DEFAULT_GAME_URL;
    } catch {
      return DEFAULT_GAME_URL;
    }
  });
  const [viewerReady, setViewerReady] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(true);
  const [applied, setApplied] = useState<Record<string, string>>({}); // 텍스처 키 → 끼워 본 그림 경로
  const [targetKey, setTargetKey] = useState('');

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

  const { slots = [], images = [], review = {} } = data ?? {};
  const slot = slots.find((x) => x.id === slotId);
  const keys = applicableKeys(slot);

  const post = useCallback((message: object) => frameRef.current?.contentWindow?.postMessage(message, '*'), []);

  // 게임 화면이 준비되면 알려 준다
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data && typeof event.data === 'object' && event.data.type === 'art-viewer:ready') setViewerReady(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // 슬롯을 고르면 그 영역을 게임 화면에 표시한다 (화면이 새로 그려질 때마다 다시 보낸다)
  useEffect(() => {
    if (!viewerReady) return;
    post(highlightMessage(view === 'slots' ? slot : undefined));
  }, [viewerReady, slot, view, post]);

  // 슬롯이 바뀌면 끼워 볼 대상 텍스처를 첫 번째로
  useEffect(() => {
    setTargetKey(keys[0] ?? '');
  }, [slotId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendOverrides = (next: Record<string, string>) => {
    setApplied(next);
    setViewerReady(false); // 화면이 다시 그려지면 ready가 다시 온다
    post({ type: 'art-viewer:overrides', overrides: Object.fromEntries(Object.entries(next).map(([k, p]) => [k, viewerImageUrl(window.location.origin, p)])) });
  };
  const applyToViewer = (path: string) => {
    if (!targetKey) return;
    sendOverrides({ ...applied, [targetKey]: path });
  };
  const changeGameUrl = (value: string) => {
    setGameUrl(value);
    setViewerReady(false);
    try {
      window.localStorage.setItem('art-viewer-game-url', value);
    } catch {
      // 저장하지 못해도 이번 화면에서는 쓸 수 있다
    }
  };

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

  const apply = async () => {
    if (deletable.length === 0) return;
    const total = deletable.reduce((n, i) => n + i.bytes, 0);
    if (!window.confirm(`NO로 표시한 ${deletable.length}개(${formatBytes(total)})를 지웁니다. git에는 남아 있어서 되돌릴 수 있습니다. 진행할까요?`)) return;
    const res = await fetch('/api/art/apply', { method: 'POST', body: '{}' });
    const out = (await res.json()) as { deleted: string[]; blocked: string[]; missing: string[] };
    setMessage(`${out.deleted.length}개를 지웠습니다.${out.blocked.length ? ` 게임이 쓰는 ${out.blocked.length}개는 지우지 않았습니다.` : ''}`);
    await load();
  };

  const shown = useMemo(() => {
    const base =
      view === 'all'
        ? images
        : view === 'unassigned'
          ? images.filter((i) => slotsFor(i.path, slots).length === 0)
          : slot
            ? images.filter((i) => slotsFor(i.path, [slot]).length > 0)
            : [];
    return base.filter((i) => matchesFilter(i.path, review, filter));
  }, [view, images, slots, slot, review, filter]);

  const groups = useMemo(() => {
    const out: { group: string; items: ArtSlot[] }[] = [];
    for (const s of slots) {
      const last = out[out.length - 1];
      if (last && last.group === s.group) last.items.push(s);
      else out.push({ group: s.group, items: [s] });
    }
    return out;
  }, [slots]);

  if (error) {
    return (
      <section className="panel">
        <h3>에셋 검수</h3>
        <p className="note">{error}</p>
      </section>
    );
  }
  if (!data) return <section className="panel">불러오는 중…</section>;

  return (
    <section className="panel art-review" data-section="art-review">
      <h3>에셋 검수</h3>
      <p className="note">
        그림마다 OK / NO를 누릅니다. 아무것도 안 누르면 대기입니다. NO는 표시만 되고, "NO 정리"를 눌러야 파일이 지워집니다 (게임이 쓰는 파일은 지워지지 않습니다). 슬롯은{' '}
        <code>docs/art/battle-slots.json</code>, 검수 결과는 <code>docs/art/review.json</code>에 저장됩니다.
      </p>

      <div className="filters art-bar">
        <span className="badge">대기 {counts.pending}</span>
        <span className="badge art-ok">OK {counts.ok}</span>
        <span className="badge art-no">NO {counts.no}</span>
        <span className="spacer" />
        {(['slots', 'unassigned', 'all'] as View[]).map((v) => (
          <button key={v} type="button" className={view === v ? 'tab sub active' : 'tab sub'} data-view={v} onClick={() => setView(v)}>
            {v === 'slots' ? '슬롯별' : v === 'unassigned' ? '미배정' : '전체'}
          </button>
        ))}
        <select aria-label="상태 필터" value={filter} onChange={(e) => setFilter(e.target.value as StatusFilter)}>
          {(Object.keys(FILTER_LABEL) as StatusFilter[]).map((f) => (
            <option key={f} value={f}>
              {FILTER_LABEL[f]}
            </option>
          ))}
        </select>
        <button type="button" data-action="apply" onClick={apply} disabled={deletable.length === 0} title="NO로 표시한 그림 파일을 지웁니다">
          NO 정리 ({deletable.length}개, {formatBytes(deletable.reduce((n, i) => n + i.bytes, 0))})
        </button>
        <button type="button" onClick={() => void load()}>
          새로 읽기
        </button>
      </div>
      {blocked.length > 0 && <p className="note shared">⚠ NO로 표시했지만 게임이 쓰는 파일 {blocked.length}개는 지울 수 없습니다: {blocked.map((i) => i.path.split('/').pop()).join(', ')}</p>}
      {message && <p className="note">{message}</p>}

      <details className="art-viewer-panel" open={viewerOpen} onToggle={(e) => setViewerOpen((e.target as HTMLDetailsElement).open)}>
        <summary>
          <strong>게임 화면에서 보기</strong>{' '}
          <small>{viewerReady ? '연결됨' : '연결 대기'} · 슬롯을 고르면 그 자리가 점선으로 표시되고, 후보 그림은 "화면에 적용"으로 그 자리에 끼워 볼 수 있습니다 (파일은 바뀌지 않습니다)</small>
        </summary>
        <div className="art-viewer-bar">
          <label>
            게임 서버 주소 <input type="text" aria-label="게임 서버 주소" value={gameUrl} onChange={(e) => changeGameUrl(e.target.value)} />
          </label>
          <button
            type="button"
            data-action="viewer-reopen"
            onClick={() => {
              setViewerReady(false);
              setApplied({});
              if (frameRef.current) frameRef.current.src = viewerSrc(gameUrl);
            }}
          >
            다시 열기
          </button>
          {keys.length > 0 ? (
            <label>
              끼워 볼 자리{' '}
              <select aria-label="끼워 볼 텍스처" value={targetKey} onChange={(e) => setTargetKey(e.target.value)}>
                {keys.map((k) => (
                  <option key={k} value={k}>
                    {k}
                    {applied[k] ? ' (적용 중)' : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span className="note">{view === 'slots' && slot ? (slot.codeDrawn ? '이 슬롯은 코드/CSS로 그려서 그림을 끼워 볼 수 없습니다.' : '이 슬롯은 지금 화면에서 그림을 쓰지 않아 끼워 볼 수 없습니다.') : ''}</span>
          )}
          <button type="button" data-action="viewer-reset" disabled={Object.keys(applied).length === 0} onClick={() => sendOverrides({})}>
            원래대로
          </button>
        </div>
        {Object.keys(applied).length > 0 && <p className="note">적용 중: {Object.entries(applied).map(([k, p]) => `${k} ← ${p.split('/').pop()}`).join(', ')}</p>}
        <iframe ref={frameRef} className="art-viewer-iframe" title="게임 화면 Viewer" src={viewerSrc(gameUrl)} data-viewer-ready={viewerReady ? 'true' : 'false'} />
        {!viewerReady && (
          <p className="note">
            게임 화면이 안 보이면 다른 터미널에서 <code>npm run game</code>으로 게임 서버(기본 {DEFAULT_GAME_URL})를 켜고 "다시 열기"를 누르세요.
          </p>
        )}
      </details>

      <div className={view === 'slots' ? 'art-layout slots' : 'art-layout'}>
        {view === 'slots' && (
          <nav className="art-slots" aria-label="슬롯">
            {groups.map((g) => (
              <div key={g.group}>
                <div className="art-group">{g.group}</div>
                {g.items.map((s) => {
                  const sum = slotSummary(s, images, review);
                  return (
                    <button key={s.id} type="button" data-slot={s.id} className={s.id === slotId ? 'art-slot active' : 'art-slot'} onClick={() => setSlotId(s.id)}>
                      <strong>{s.id}</strong> {s.name}
                      <small>
                        {s.codeDrawn && !s.match ? '코드로 그림' : `후보 ${sum.total} · OK ${sum.ok} · NO ${sum.no}`}
                      </small>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        )}

        <div className="art-main">
          {view === 'slots' && slot && (
            <div className="art-slot-info">
              <h4>
                {slot.id} · {slot.name}
              </h4>
              <p className="note">
                크기 {slot.size} · 상태 {slot.states.join(' / ')}
                {slot.codeDrawn ? ' · 지금은 코드/CSS로 그립니다' : ''}
                {slot.note ? ` · ${slot.note}` : ''}
              </p>
            </div>
          )}
          {shown.length === 0 ? (
            <p className="note">{view === 'slots' && slot && !slot.match ? '이 슬롯에 연결된 그림이 없습니다. 새로 만들 자리입니다.' : '조건에 맞는 그림이 없습니다.'}</p>
          ) : (
            <div className="art-grid">
              {shown.map((img) => {
                const status = statusOf(img.path, review);
                const owners = slotsFor(img.path, slots).map((s) => s.id);
                return (
                  <figure key={img.path} className={`art-card ${status}`} data-path={img.path} data-status={status}>
                    <button type="button" className="art-thumb" onClick={() => setZoom(img)} aria-label={`${img.path} 크게 보기`}>
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
                      <span className="art-badges">
                        {img.usedByGame && <span className="badge art-used">게임이 씀</span>}
                        {!img.usedByGame && img.usedByDocs && <span className="badge">문서가 씀</span>}
                      </span>
                      <span className="art-actions">
                        <button type="button" className={status === 'ok' ? 'art-btn ok on' : 'art-btn ok'} data-act="ok" onClick={() => void mark(img.path, status === 'ok' ? null : 'ok')}>
                          OK
                        </button>
                        <button type="button" className={status === 'no' ? 'art-btn no on' : 'art-btn no'} data-act="no" onClick={() => void mark(img.path, status === 'no' ? null : 'no')}>
                          NO
                        </button>
                        {view === 'slots' && keys.length > 0 && (
                          <button type="button" className="art-btn view" data-act="view" title={`${targetKey} 자리에 끼워서 게임 화면에서 봅니다`} onClick={() => applyToViewer(img.path)}>
                            화면에 적용
                          </button>
                        )}
                      </span>
                    </figcaption>
                  </figure>
                );
              })}
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
