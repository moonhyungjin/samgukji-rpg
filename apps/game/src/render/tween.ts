/** 애니메이션 시간 배율. Infinity이면 즉시 끝낸다 (건너뛰기, 즉시 모드). */
export interface Clock {
  scale(): number;
}

export const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);

/**
 * durationMs 동안 update(0~1)를 매 프레임 호출하고 끝나면 resolve한다.
 * 도중에 배율이 바뀌어도 이어서 진행하고, Infinity로 바뀌면 즉시 끝낸다.
 */
export function tween(clock: Clock, durationMs: number, update: (t: number) => void): Promise<void> {
  return new Promise((resolve) => {
    if (durationMs <= 0 || clock.scale() === Infinity) {
      update(1);
      resolve();
      return;
    }
    let last = performance.now();
    let progressed = 0;
    const frame = (now: number) => {
      const scale = clock.scale();
      if (scale === Infinity) {
        update(1);
        resolve();
        return;
      }
      progressed += (now - last) * scale;
      last = now;
      const t = Math.min(1, progressed / durationMs);
      update(t);
      if (t >= 1) resolve();
      else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

export const delay = (clock: Clock, ms: number): Promise<void> => tween(clock, ms, () => {});
