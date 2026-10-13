import type { ArtSlot } from './artReview';
import { DEFAULT_GAME_URL, slotColor, viewerSrc } from './artViewer';
import type { ArtViewerState } from './useArtViewer';

interface Props {
  v: ArtViewerState;
  slot: ArtSlot | undefined;
  /** 슬롯별 보기일 때만 슬롯 안내와 구조 보기를 쓴다 */
  slotView: boolean;
}

/** "게임 화면에서 보기": 실제 전투 화면(iframe) + 슬롯 영역 표시, 그림 끼우기, 구조 보기 칩 */
export function ArtViewerPanel({ v, slot, slotView }: Props) {
  return (
    <details className="art-viewer-panel" open={v.open} onToggle={(e) => v.setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>
        <strong>게임 화면에서 보기</strong>{' '}
        <small>{v.ready ? '연결됨' : '연결 대기'} · 슬롯을 고르면 그 자리가 점선으로 표시되고, 후보 그림은 "화면에 적용"으로 그 자리에 끼워 볼 수 있습니다 (파일은 바뀌지 않습니다)</small>
      </summary>
      <div className="art-viewer-bar">
        <label>
          게임 서버 주소 <input type="text" aria-label="게임 서버 주소" value={v.gameUrl} onChange={(e) => v.changeGameUrl(e.target.value)} />
        </label>
        <button type="button" data-action="viewer-reopen" onClick={() => v.reopen(viewerSrc(v.gameUrl))}>
          다시 열기
        </button>
        {v.keys.length > 0 ? (
          <label>
            끼워 볼 자리{' '}
            <select aria-label="끼워 볼 텍스처" value={v.targetKey} onChange={(e) => v.setTargetKey(e.target.value)}>
              {v.keys.map((k) => (
                <option key={k} value={k}>
                  {k}
                  {v.applied[k] ? ' (적용 중)' : ''}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="note">{slotView && slot ? (slot.codeDrawn ? '이 슬롯은 코드/CSS로 그려서 그림을 끼워 볼 수 없습니다.' : '이 슬롯은 지금 화면에서 그림을 쓰지 않아 끼워 볼 수 없습니다.') : ''}</span>
        )}
        <label className="check">
          <input type="checkbox" data-action="viewer-group" checked={v.showGroup} onChange={(e) => v.setShowGroup(e.target.checked)} />
          <span>{slot ? `${slot.group} 전체 구조 보기` : '그룹 전체 보기'}</span>
        </label>
        <button type="button" data-action="viewer-reset" disabled={Object.keys(v.applied).length === 0} onClick={v.reset}>
          원래대로
        </button>
      </div>
      {v.showGroup && slotView && v.members.length > 0 && (
        <div className="art-group-chips" role="group" aria-label="구조 보기 슬롯">
          <span className="note">겹쳐 보이면 칩을 눌러 켜고 끄세요:</span>
          {v.members.map((m, i) => (
            <button
              key={m.id}
              type="button"
              data-chip={m.id}
              aria-pressed={!v.hidden.has(m.id)}
              className={v.hidden.has(m.id) ? 'art-chip off' : 'art-chip'}
              style={{ ['--chip' as string]: slotColor(i) }}
              title={m.name}
              onClick={() => v.toggleSlot(m.id)}
            >
              {m.id} {m.name}
            </button>
          ))}
          <button type="button" data-action="chips-only" onClick={() => v.setHidden(new Set(v.members.filter((m) => m.id !== slot?.id).map((m) => m.id)))}>
            지금 슬롯만
          </button>
          <button type="button" data-action="chips-all" onClick={() => v.setHidden(new Set())}>
            모두 켜기
          </button>
        </div>
      )}
      {Object.keys(v.applied).length > 0 && <p className="note">적용 중: {Object.entries(v.applied).map(([k, p]) => `${k} ← ${p.split('/').pop()}`).join(', ')}</p>}
      <iframe ref={v.frameRef} className="art-viewer-iframe" title="게임 화면 Viewer" src={viewerSrc(v.gameUrl)} data-viewer-ready={v.ready ? 'true' : 'false'} />
      {!v.ready && (
        <p className="note">
          게임 화면이 안 보이면 다른 터미널에서 <code>npm run game</code>으로 게임 서버(기본 {DEFAULT_GAME_URL})를 켜고 "다시 열기"를 누르세요.
        </p>
      )}
    </details>
  );
}
