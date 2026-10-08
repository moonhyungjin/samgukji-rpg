import { describe, expect, it } from 'vitest';
import { rangedEffectFor } from './rangedEffects';

describe('원거리 연출 매칭', () => {
  it('기본 스킬 id는 그대로 연출을 고른다', () => {
    expect(rangedEffectFor('archer-shot')).toBe('arrow');
    expect(rangedEffectFor('stratagem')).toBe('sigil');
    expect(rangedEffectFor('poison-smoke')).toBe('smoke');
    expect(rangedEffectFor('infantry-attack')).toBeNull();
  });

  it('Lab에서 병종 전용으로 복제한 스킬(<병종 id>-<스킬 id>)도 같은 연출을 쓴다', () => {
    expect(rangedEffectFor('strong-bow-archer-shot')).toBe('arrow');
    expect(rangedEffectFor('light-cavalry-geomancer-shot')).toBe('arrow');
    expect(rangedEffectFor('royal-guard-infantry-attack')).toBeNull();
  });
});
