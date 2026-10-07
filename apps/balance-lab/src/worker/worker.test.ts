import { describe, expect, it } from 'vitest';
import { createDefaultState } from '../lab/defaults';
import { lineupFromSlots } from '../lib/slots';
import type { SimRequest, SimResponse } from './protocol';

// 워커 모듈은 전역 self에 onmessage를 등록한다. self를 흉내 내서 요청/응답 프로토콜을 검증한다.
describe('시뮬레이션 워커', () => {
  const posted: SimResponse[] = [];
  const fakeSelf: { postMessage: (m: SimResponse) => void; onmessage?: (e: { data: SimRequest }) => void } = {
    postMessage: (m) => posted.push(m),
  };

  const state = createDefaultState();
  const request = (overrides: Partial<SimRequest> = {}): SimRequest => ({
    id: 1,
    data: state.data,
    balance: state.balance,
    teamA: lineupFromSlots(state.teamA),
    teamB: lineupFromSlots(state.teamB),
    iterations: 50,
    seed: 1,
    roles: 'alternate',
    lineups: 'fixed',
    targetPolicy: 'lowest-troops',
    guardMode: 'protect',
    buffMode: 'first',
    pool: 'elite',
    ...overrides,
  });

  it('요청을 처리해 같은 id로 보고서를 돌려준다', async () => {
    (globalThis as unknown as { self: unknown }).self = fakeSelf;
    await import('./sim.worker');
    fakeSelf.onmessage!({ data: request({ id: 7 }) });
    expect(posted.at(-1)?.id).toBe(7);
    expect(posted.at(-1)?.report?.iterations).toBe(50);
    expect(posted.at(-1)?.error).toBeUndefined();
  });

  it('무작위 편성 요청도 처리한다', () => {
    fakeSelf.onmessage!({ data: request({ id: 8, lineups: 'random', teamA: [], teamB: [] }) });
    expect(posted.at(-1)?.report?.lineups).toBe('random');
  });

  it('잘못된 편성은 오류 메시지로 돌려주고 죽지 않는다', () => {
    fakeSelf.onmessage!({ data: request({ id: 9, teamA: [{ characterId: 'nobody', row: 'front' }] }) });
    expect(posted.at(-1)?.id).toBe(9);
    expect(posted.at(-1)?.report).toBeUndefined();
    expect(posted.at(-1)?.error).toMatch(/Unknown character/);
  });
});
