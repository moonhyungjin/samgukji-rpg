import { useEffect, useRef, useState } from 'react';
import { defaultBalance, gameData } from '@samgukji/game-data';
import type { LineupEntry } from '@samgukji/battle-engine';
import { PlaySession } from '../battle/session';
import { createViewState } from '../battle/viewState';
import { ART_URLS, setArtOverrides } from '../render/battleArt';
import { BattleScene } from '../render/BattleScene';
import { WORLD_H, WORLD_W } from '../render/theme';

/** 화면 위에 표시할 영역 (논리 화면 1280×900 좌표) */
export interface ViewerRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 이 상자의 이름표 (없으면 전체 label의 첫 상자에만 붙는다) */
  label?: string;
  /** 상자와 이름표 색 (CSS 색) */
  color?: string;
}

/** Lab(에셋 검수 탭)이 보내는 메시지 */
type ViewerMessage =
  | { type: 'art-viewer:highlight'; rects: ViewerRect[]; label?: string }
  | { type: 'art-viewer:overrides'; overrides: Record<string, string> };

// 슬롯마다 그림이 보이도록 6대6 편성을 쓴다 (그림이 있는 장수를 앞에 둔다). 전투는 진행하지 않고 시작 상태만 보여 준다.
const ATTACKER: LineupEntry[] = [
  { characterId: 'liuBei', row: 'front' },
  { characterId: 'guanYu', row: 'front', unitType: 'cavalry' },
  { characterId: 'zhangFei', row: 'front' },
  { characterId: 'huangZhong', row: 'back' },
  { characterId: 'zhugeLiang', row: 'back' },
  { characterId: 'pangTong', row: 'back' },
];
const DEFENDER: LineupEntry[] = [
  { characterId: 'ytInfantryA', row: 'front' },
  { characterId: 'ytInfantryB', row: 'front' },
  { characterId: 'ytShieldA', row: 'front' },
  { characterId: 'ytArcherA', row: 'back' },
  { characterId: 'ytStrategistA', row: 'back' },
  { characterId: 'ytTaoistA', row: 'back' },
];

/**
 * 에셋 검수 Viewer (?viewer=1). 실제 전투 화면의 시작 상태를 그대로 그리고,
 * Lab에서 보낸 슬롯 영역을 금색 점선으로 표시하거나, 후보 그림을 해당 자리에 끼워서 다시 그린다.
 * 규칙/데이터는 건드리지 않는다. Lab과는 postMessage로만 대화한다.
 */
export function ArtViewer() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [rects, setRects] = useState<ViewerRect[]>([]);
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const onMessage = (event: MessageEvent<ViewerMessage>) => {
      const m = event.data;
      if (!m || typeof m !== 'object') return;
      if (m.type === 'art-viewer:highlight') {
        setRects(Array.isArray(m.rects) ? m.rects : []);
        setLabel(m.label ?? '');
      } else if (m.type === 'art-viewer:overrides') {
        setOverrides(m.overrides ?? {});
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // 교체 목록이 바뀔 때마다 화면을 새로 만든다
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let scene: BattleScene | null = null;
    setError('');
    (async () => {
      try {
        setArtOverrides(overrides as never);
        const session = new PlaySession({ data: gameData, balance: defaultBalance, attacker: ATTACKER, defender: DEFENDER, seed: 1, playerSide: null });
        scene = await BattleScene.create(host, { data: gameData, maxTurns: defaultBalance.maxTurns, artUnits: session.initialUnits });
        if (cancelled) {
          scene.destroy();
          scene = null;
          return;
        }
        scene.setState(createViewState(session.initialUnits, session.engine.state.defenderMorale));
        host.dataset.artOverrides = Object.keys(overrides).join(',');
        window.parent?.postMessage({ type: 'art-viewer:ready', keys: Object.keys(ART_URLS), loaded: host.dataset.artLoaded ?? '', overrides: Object.keys(overrides) }, '*');
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      scene?.destroy();
      setArtOverrides({});
    };
  }, [overrides]);

  const pct = (value: number, total: number) => `${(value / total) * 100}%`;
  // 색은 Lab이 정해 보낸다. 없으면 상자가 여럿일 때만 돌려 쓰고, 하나면 금색이다
  const colorOf = (r: ViewerRect, i: number) => r.color ?? (rects.length > 1 ? `hsl(${(i * 47 + 40) % 360} 95% 60%)` : 'hsl(42 95% 60%)');
  return (
    <div className="art-viewer" data-viewer-ready="true">
      <div className="art-viewer-frame">
        <div ref={hostRef} className="stage" data-art-viewer-stage />
        {rects.map((r, i) => (
          <div key={i} className="art-viewer-highlight" style={{ left: pct(r.x, WORLD_W), top: pct(r.y, WORLD_H), width: pct(r.w, WORLD_W), height: pct(r.h, WORLD_H), ['--hl' as string]: colorOf(r, i) }}>
            {r.label ?? (i === 0 && label ? label : null) ? <span>{r.label ?? label}</span> : null}
          </div>
        ))}
      </div>
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}
