import type { BattleEvent } from '@samgukji/battle-engine';
import { gameData, presets } from '@samgukji/game-data';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, parseConfig } from './config';
import { buildNameMap, formatEvent } from './eventText';

const names = new Map([
  ['attacker:0', '공:관우'],
  ['defender:0', '방:하후돈'],
]);
const fmt = (e: BattleEvent) => formatEvent(e, names, gameData);

describe('formatEvent', () => {
  it('이벤트마다 읽을 수 있는 한 줄을 만든다', () => {
    expect(fmt({ type: 'roundStart', round: 3, order: [] })).toBe('── 라운드 3 ──');
    expect(fmt({ type: 'action', round: 1, actor: 'attacker:0', skillId: 'cavalry-charge', target: 'defender:0', apAfter: 3 })).toBe('공:관우 · 돌격 → 방:하후돈');
    expect(fmt({ type: 'action', round: 1, actor: 'attacker:0', skillId: 'wait', apAfter: 3 })).toBe('공:관우 대기');
    expect(fmt({ type: 'damage', round: 1, kind: 'attack', source: 'attacker:0', target: 'defender:0', amount: 291, troopsAfter: 709 })).toContain('피해 291');
    expect(fmt({ type: 'damage', round: 1, kind: 'counter', source: 'defender:0', target: 'attacker:0', amount: 97, troopsAfter: 903 })).toContain('반격 97');
    expect(fmt({ type: 'heal', round: 1, source: 'attacker:0', target: 'attacker:0', amount: 50, troopsAfter: 950 })).toContain('회복 50');
    expect(fmt({ type: 'unitDestroyed', round: 2, unit: 'defender:0', by: 'attacker:0' })).toContain('방:하후돈 전멸');
    expect(fmt({ type: 'rowAdvance', round: 2, side: 'defender', units: ['defender:0'] })).toContain('방어측 후열이 전열로');
    expect(fmt({ type: 'battleEnd', winner: 'attacker', endCause: 'no-ap', decidedBy: 'destroyed', rounds: 4 })).toBe('══ 공격측 승리 (AP 소진 · 판정 전멸 군단 수) — 4라운드');
  });

  it('가드: 자기 자신에게 쓰는 스킬은 대상을 적지 않고, 확률 변화와 대신 맞기를 보여 준다', () => {
    expect(fmt({ type: 'action', round: 1, actor: 'attacker:0', skillId: 'guard', target: 'attacker:0', apAfter: 3 })).toBe('공:관우 · 가드');
    expect(fmt({ type: 'guardChange', round: 1, unit: 'attacker:0', rate: 120, reason: 'raise' })).toContain('가드 확률 120%');
    expect(fmt({ type: 'guardChange', round: 1, unit: 'attacker:0', rate: 80, reason: 'block' })).toContain('가드 확률 80%');
    expect(fmt({ type: 'guardChange', round: 1, unit: 'attacker:0', rate: 0, reason: 'reset' })).toContain('가드 해제');
    expect(fmt({ type: 'intercept', round: 1, attacker: 'defender:0', target: 'attacker:0', guardian: 'attacker:0' })).toContain('대신 맞음');
  });

  it('사기 변동은 로그에 남기지 않는다', () => {
    expect(fmt({ type: 'morale', round: 1, defenderMorale: 49 })).toBeNull();
  });

  it('모르는 uid나 스킬도 오류 없이 그대로 보여 준다', () => {
    expect(fmt({ type: 'action', round: 1, actor: 'ghost', skillId: 'mystery', target: 'ghost2', apAfter: 1 })).toBe('ghost · mystery → ghost2');
  });
});

describe('buildNameMap', () => {
  it('진영 표시와 이름을 붙인다', () => {
    const map = buildNameMap([
      { uid: 'attacker:0', side: 'attacker', name: '관우' },
      { uid: 'defender:0', side: 'defender', name: '하후돈' },
    ] as never);
    expect(map.get('attacker:0')).toBe('공:관우');
    expect(map.get('defender:0')).toBe('방:하후돈');
  });
});

describe('parseConfig', () => {
  const presetNames = Object.keys(presets);

  it('쿼리가 없으면 기본값이다', () => {
    expect(parseConfig('', presetNames)).toEqual({ config: DEFAULT_CONFIG, autostart: false });
  });

  it('유효한 값은 그대로 읽는다', () => {
    const { config, autostart } = parseConfig('?a=wei&d=shu&control=defender&seed=42&speed=0&autostart=1', presetNames);
    expect(config).toEqual({ attackerPreset: 'wei', defenderPreset: 'shu', control: 'defender', seed: 42, speed: 0 });
    expect(autostart).toBe(true);
  });

  it('관전 모드를 읽는다', () => {
    expect(parseConfig('?control=watch', presetNames).config.control).toBe('watch');
  });

  it('잘못된 값은 기본값으로 대신한다', () => {
    const { config } = parseConfig('?a=nobody&control=hack&seed=abc&speed=-3', presetNames);
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('시드는 정수로 내리고, 빈 값은 기본값이다', () => {
    expect(parseConfig('?seed=7.9', presetNames).config.seed).toBe(7);
    expect(parseConfig('?seed=', presetNames).config.seed).toBe(DEFAULT_CONFIG.seed);
  });

  it('autostart는 1일 때만 켜진다', () => {
    expect(parseConfig('?autostart=true', presetNames).autostart).toBe(false);
    expect(parseConfig('?autostart=1', presetNames).autostart).toBe(true);
  });
});
