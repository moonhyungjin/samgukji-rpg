import { defaultBalance, gameData, presets } from '@samgukji/game-data';
import { useEffect, useRef, useState } from 'react';
import { BattleController } from '../battle/controller';
import type { ControllerSnapshot } from '../battle/controller';
import { PlaySession } from '../battle/session';
import type { BattleConfig } from '../lib/config';
import { BattleScene } from '../render/BattleScene';
import { CommandPanel } from './CommandPanel';
import { LogPanel } from './LogPanel';

interface Props {
  config: BattleConfig;
  artTrial?: boolean;
  onExit: () => void;
}

const SPEEDS = [
  { value: 0.5, label: '0.5배' },
  { value: 1, label: '1배' },
  { value: 2, label: '2배' },
  { value: 4, label: '4배' },
  { value: 0, label: '즉시' },
];

/** PixiJS 전투 화면과 커맨드/로그 패널. 설정이 바뀌거나 다시 하기를 누르면 전투를 처음부터 새로 만든다. */
export function BattleView({ config, onExit, artTrial = false }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<BattleController | null>(null);
  const [snapshot, setSnapshot] = useState<ControllerSnapshot | null>(null);
  const [speed, setSpeed] = useState(config.speed);
  const [runId, setRunId] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 효과 안에서 최신 속도를 읽기 위한 참조 (속도를 바꿔도 전투를 다시 만들지 않는다)
  const speedRef = useRef(speed);
  speedRef.current = speed;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let scene: BattleScene | null = null;
    let controller: BattleController | null = null;
    setSnapshot(null);
    setLoadError(null);

    (async () => {
      try {
        const session = new PlaySession({
          data: gameData,
          balance: defaultBalance,
          attacker: artTrial
            ? [{ characterId: 'liuBei', row: 'front' }] : presets[config.attackerPreset],
          defender: artTrial
            ? [{ characterId: 'ytInfantryA', row: 'front' }] : presets[config.defenderPreset],
          seed: config.seed,
          playerSide: config.control === 'watch' ? null : config.control,
        });
        scene = await BattleScene.create(host, {
          data: gameData, maxTurns: defaultBalance.maxTurns, artUnits: session.initialUnits,
        });
        if (cancelled) {
          scene.destroy();
          scene = null;
          return;
        }
        controller = new BattleController(session, scene, gameData, setSnapshot);
        controllerRef.current = controller;
        controller.setSpeed(speedRef.current);
        await controller.start();
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      controller?.dispose();
      controllerRef.current = null;
      scene?.destroy();
    };
  }, [config, runId, artTrial]);

  useEffect(() => {
    controllerRef.current?.setSpeed(speed);
  }, [speed]);

  const controller = () => controllerRef.current;

  return (
    <div className="battle">
      {artTrial && <p className="note">아트 시험 전투 · 유비 대 황건 보병 · 기본 편성 데이터와 별도로 실행</p>}
      <div className="toolbar">
        <span className="speed-label">속도</span>
        {SPEEDS.map((s) => (
          <button key={s.value} type="button" className={s.value === speed ? 'primary' : ''} onClick={() => setSpeed(s.value)}>
            {s.label}
          </button>
        ))}
        <span className="spacer" />
        <button type="button" onClick={() => setRunId((n) => n + 1)}>
          처음부터 다시
        </button>
        <button type="button" onClick={onExit}>
          설정으로
        </button>
      </div>

      <div className="battle-board">
        <div ref={hostRef} className="stage" />
        {snapshot && (
          <div className="command-dock">
            <CommandPanel
              snapshot={snapshot}
              onSelectSkill={(id) => controller()?.selectSkill(id)}
              onSubmit={(command) => void controller()?.submit(command)}
              onAutoplay={() => void controller()?.autoplayRest()}
              onSkip={() => controller()?.skip()}
              onRestart={() => setRunId((n) => n + 1)}
              onExit={onExit}
            />
          </div>
        )}
      </div>
      {loadError && <div className="error">화면을 만들지 못했습니다: {loadError}</div>}
      {snapshot && <div className="battle-log"><LogPanel lines={snapshot.log} /></div>}
    </div>
  );
}
