// 캠페인 시뮬레이션 (설계 문서 03): 자동 정비(autoPrepare)로 캠페인을 여러 번 끝까지 돌려 돈·레벨·도전 횟수를 본다.
//   npm run sim:campaign                      (기본 200회)
//   npm run sim:campaign -- --runs 1000 --seed 1 --max-attempts 5
// Balance Lab의 "캠페인" 탭이 같은 계산(summarizeCampaignRuns)을 화면에서 한다.
import { runCampaign, startCampaign, summarizeCampaignRuns } from '@samgukji/battle-engine';
import { campaign, defaultBalance, gameData } from '@samgukji/game-data';

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const runs = Number(opt('runs') ?? 200);
const seed = Number(opt('seed') ?? 1);
const maxAttempts = Number(opt('max-attempts') ?? 5);

const started = performance.now();
const results = Array.from({ length: runs }, (_, r) =>
  runCampaign(campaign, gameData, defaultBalance, startCampaign(campaign, gameData, defaultBalance), seed + r * 1000, maxAttempts),
);
const s = summarizeCampaignRuns(results, campaign, gameData);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

console.log(`${campaign.name}: ${runs}회, 시드 ${seed}, 전투당 최대 ${maxAttempts}번 도전 — ${Math.round(performance.now() - started)} ms`);
console.log(`끝까지 이김 ${pct(s.clearRate)}, 돈이 바닥나 출전할 군단이 없어 멈춤 ${pct(s.stuckRate)}`);
s.battles.forEach((b, i) => {
  console.log(`  ${i + 1}. ${b.name.padEnd(10)} 도달 ${pct(b.reachRate)}, 한 번에 이김 ${pct(b.firstTryRate)}, 평균 도전 ${b.averageAttempts.toFixed(2)}번, 정비 뒤 남은 돈 평균 ${Math.round(b.averageGoldBefore)}`);
});
console.log(`끝난 뒤: 군단 평균 레벨 ${s.averageEndLevel.toFixed(1)} (최고 ${s.maxEndLevel}), 남은 돈 평균 ${Math.round(s.averageEndGold)}, 승급한 군단이 있는 경우 ${pct(s.promotedRate)}`);
