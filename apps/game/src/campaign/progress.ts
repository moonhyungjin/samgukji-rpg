import { startCampaign, unitCap } from '@samgukji/battle-engine';
import type { BattleOutcomeSummary, CampaignState } from '@samgukji/battle-engine';
import { campaign, defaultBalance, gameData } from '@samgukji/game-data';

export const SAVE_KEY = 'samgukji-campaign-v1';
export interface CampaignProgress {
  version: 1;
  state: CampaignState;
  phase: 'prepare' | 'battle' | 'result';
  seed: number;
  summary: BattleOutcomeSummary | null;
}
export const freshProgress = (): CampaignProgress => ({ version: 1, state: startCampaign(campaign, gameData, defaultBalance), phase: 'prepare', seed: 1, summary: null });
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

/** 브라우저 저장값의 구조와 현재 데이터 참조만 확인한다. 캠페인 규칙을 다시 구현하지 않는다. */
export function parseProgress(text: string): CampaignProgress | null {
  try {
    const p: unknown = JSON.parse(text);
    if (!record(p) || p.version !== 1 || !record(p.state) || !integer(p.seed) || !['prepare', 'battle', 'result'].includes(String(p.phase))) return null;
    const s = p.state;
    if (s.campaignId !== campaign.id || !integer(s.battleIndex) || s.battleIndex > campaign.battles.length || !integer(s.gold) || !integer(s.attempt) || s.attempt < 1 || typeof s.finished !== 'boolean') return null;
    if (s.finished !== (s.battleIndex === campaign.battles.length) || (s.finished && p.phase === 'battle')) return null;
    if (!Array.isArray(s.roster) || !s.roster.length || !Array.isArray(s.lineup) || s.lineup.length > 6) return null;
    const ids = new Set<string>();
    for (const u of s.roster) {
      if (!record(u) || typeof u.characterId !== 'string' || !gameData.characters[u.characterId] || ids.has(u.characterId) || typeof u.unitType !== 'string' || !gameData.unitTypes[u.unitType]) return null;
      if (!integer(u.level) || u.level < 1 || !integer(u.exp) || !integer(u.capacity) || !integer(u.troops) || u.capacity < 1 || u.troops > u.capacity || u.capacity > unitCap({ unitType: u.unitType, level: u.level }, gameData, defaultBalance)) return null;
      ids.add(u.characterId);
    }
    const placed = new Set<string>(), slots = new Set<string>();
    for (const slot of s.lineup) {
      if (!record(slot) || typeof slot.characterId !== 'string' || !ids.has(slot.characterId) || placed.has(slot.characterId) || !['front', 'back'].includes(String(slot.row)) || !integer(slot.slot) || slot.slot > 2) return null;
      const key = `${slot.row}:${slot.slot}`;
      if (slots.has(key)) return null;
      placed.add(slot.characterId); slots.add(key);
    }
    if (p.phase === 'result') {
      const r = p.summary;
      if (!record(r) || typeof r.won !== 'boolean' || typeof r.finished !== 'boolean' || !integer(r.goldGained) || !Array.isArray(r.joined) || !r.joined.every(id => typeof id === 'string' && ids.has(id)) || !Array.isArray(r.units)) return null;
      if (!r.units.every(u => record(u) && typeof u.characterId === 'string' && ids.has(u.characterId) && integer(u.expGained) && integer(u.levelsGained) && integer(u.troopsAfter))) return null;
    } else if (p.summary !== null) return null;
    return p as unknown as CampaignProgress;
  } catch { return null; }
}

export function loadProgress(): { progress: CampaignProgress | null; error: string | null } {
  try {
    const text = localStorage.getItem(SAVE_KEY);
    if (!text) return { progress: null, error: null };
    const progress = parseProgress(text);
    return { progress, error: progress ? null : '저장 내용을 현재 게임에서 읽을 수 없습니다. 새로 시작하면 기존 저장을 바꿉니다.' };
  } catch { return { progress: null, error: '브라우저 저장소를 사용할 수 없습니다.' }; }
}
export function saveProgress(progress: CampaignProgress): boolean {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(progress)); return true; } catch { return false; }
}
