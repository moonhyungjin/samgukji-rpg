import { describe, expect, it } from 'vitest';
import { gameData, mapFile, presets, resolveMap, strategyMap } from '../src';

// 지도 데이터(data/map.json)가 지켜야 하는 구조 규칙 (설계 문서 04). 지역 구성과 숫자는 Lab에서 바뀌므로 고정하지 않는다.
describe('지도 데이터', () => {
  it('플레이어 세력은 하나이고, 지역의 세력과 목표 지역이 있다', () => {
    expect(strategyMap.factions.filter((f) => f.player)).toHaveLength(1);
    const factions = new Set(strategyMap.factions.map((f) => f.id));
    for (const r of strategyMap.regions) expect(factions.has(r.faction), r.id).toBe(true);
    expect(strategyMap.regions.some((r) => r.id === strategyMap.goalRegion)).toBe(true);
  });

  it('맞닿은 지역은 서로 적혀 있다', () => {
    for (const r of strategyMap.regions)
      for (const n of r.neighbors) expect(strategyMap.regions.find((x) => x.id === n)?.neighbors, `${r.id} ↔ ${n}`).toContain(r.id);
  });

  it('지역마다 성이 1~4개이고, 플레이어 세력이 아닌 성의 수비 부대는 실제 장수와 그 레벨로 풀린다', () => {
    const player = strategyMap.factions.find((f) => f.player)!.id;
    for (const r of strategyMap.regions) {
      expect(r.castles.length, r.id).toBeGreaterThanOrEqual(1);
      expect(r.castles.length, r.id).toBeLessThanOrEqual(4);
      for (const c of r.castles) {
        if (r.faction === player) continue;
        expect(c.garrison, c.id).not.toBeNull();
        for (const e of c.garrison!.lineup) {
          expect(gameData.characters[e.characterId], `${c.id} ${e.characterId}`).toBeDefined();
          expect(e.level).toBe(c.garrison!.level);
        }
      }
    }
  });

  it('없는 편성 이름이면 알려 준다', () => {
    const broken = JSON.parse(JSON.stringify(mapFile));
    const castle = broken.regions.find((r: { castles: { garrison: unknown }[] }) => r.castles.some((c) => c.garrison)).castles.find((c: { garrison: unknown }) => c.garrison);
    castle.garrison.preset = 'nothing';
    expect(() => resolveMap(broken, presets)).toThrow('nothing');
  });
});
